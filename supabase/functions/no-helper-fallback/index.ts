import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveMoneyAction, releaseBookingMoney } from "../_shared/bookingMoney.ts";

// Cron: runs every 30 minutes.
// Finds UNPAID bookings stuck in 'pending' for more than 2 hours with no
// helper assigned, releases whatever Stripe artifact they carry (an
// AUTH-AT-BOOKING card hold is CANCELLED — uncaptured intents can't be
// refunded; an open checkout session is expired; under classic
// pay-after-accept there's usually nothing at all), flips them to
// 'cancelled', and emails both the customer and admin.
//
// PAID bookings are deliberately excluded: when a helper releases a job it goes
// back to pending with paid_at kept, and redispatch-stale-jobs keeps re-matching
// it. We must never auto-cancel/refund a customer who has paid and still wants
// the job done — that's handled by admin if it can't be re-matched.

const CATEGORY_LABELS: Record<string, string> = {
  business: 'Business temp staff', shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'General help',
};

serve(async (_req) => {
  const supabaseUrl   = Deno.env.get('SUPABASE_URL')!;
  const serviceKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY');
  const resendKey     = Deno.env.get('RESEND_API_KEY')?.trim();
  const from          = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
  const adminEmail    = Deno.env.get('ADMIN_EMAIL')?.trim();
  const siteUrl       = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');

  const supabase = createClient(supabaseUrl, serviceKey);

  const nowIso = new Date().toISOString();
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data: stuckBookings, error: queryErr } = await supabase
    .from('household_bookings')
    .select('id, customer_name, customer_email, category, city, price_estimate_cents, stripe_payment_intent_id')
    .eq('status', 'pending')
    .is('student_id', null)
    .is('paid_at', null)
    .lt('created_at', cutoff)
    // Never cancel a future-dated booking early — a job scheduled for later is
    // pending only because it hasn't been dispatched yet. It becomes
    // cancel-eligible once its slot time has passed with still no helper.
    .or(`scheduled_at.is.null,scheduled_at.lt.${nowIso}`);

  if (queryErr) {
    console.error('[no-helper-fallback] query error', queryErr);
    return new Response('DB error', { status: 500 });
  }

  if (!stuckBookings || stuckBookings.length === 0) {
    console.log('[no-helper-fallback] nothing to process');
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`[no-helper-fallback] processing ${stuckBookings.length} stuck booking(s)`);
  let processed = 0;

  for (const booking of stuckBookings) {
    const b         = booking as Record<string, unknown>;
    const ref       = (b.id as string).slice(-8).toUpperCase();
    const custName  = String(b.customer_name ?? 'there');
    const custEmail = b.customer_email as string | null;
    const catLabel  = CATEGORY_LABELS[b.category as string] ?? 'job';

    // Compare-and-swap FIRST: only cancel if STILL unclaimed + unpaid. A helper
    // can accept (status→accepted) and notify-household-accepted can capture the
    // fee in the seconds between the SELECT above and here. The Stripe release
    // MUST come after we've durably won this cancel — otherwise a booking that
    // was just accepted+captured would have its live fee cancelled/refunded
    // while the row stays 'accepted' (the exact money-loss the CAS exists to
    // prevent). Mirrors remind-unpaid-bookings' cancel sweep ordering.
    const { data: cancelledRow } = await supabase
      .from('household_bookings')
      .update({ status: 'cancelled' })
      .eq('id', b.id)
      .eq('status', 'pending')
      .is('student_id', null)
      .is('paid_at', null)
      .select('id')
      .maybeSingle();
    if (!cancelledRow) {
      console.log(`[no-helper-fallback] ${b.id} was claimed/paid mid-run — skipping cancel`);
      continue;
    }

    // Now safe to release whatever Stripe artifact this unpaid booking carries
    // (shared rule — the query filters paid_at IS NULL and we just confirmed the
    // cancel, so no accept/capture can be in flight: this is an AUTH-AT-BOOKING
    // hold to cancel, an open session to expire, or nothing). The messaging
    // below says exactly what happened: an auth customer had a HOLD released
    // (never charged); a classic customer was simply never charged at all.
    let refundOk = false;
    let holdReleased = false;
    const piId = b.stripe_payment_intent_id as string | null;
    const moneyAction = resolveMoneyAction(null, piId);
    const nothingCharged = moneyAction !== 'refund'; // paid_at is null — always true here
    if (STRIPE_SECRET && piId && moneyAction !== 'none') {
      const released = await releaseBookingMoney({
        stripeKey: STRIPE_SECRET,
        action: moneyAction,
        stripeId: piId,
        idemSuffix: b.id as string,
        apiBase: Deno.env.get('STRIPE_API_BASE') ?? undefined,
      });
      if (released.ok && released.action === 'cancel_pi') {
        holdReleased = true;
        await supabase.rpc('merge_booking_data', {
          p_id: b.id,
          p_patch: { fee_auth_canceled_at: new Date().toISOString() },
        }).then(() => {}, () => {});
      } else if (released.ok && released.action === 'refund') {
        // Cross-fallback: the hold was captured in a race — real money came
        // back, tell the customer a refund happened.
        refundOk = true;
      } else if (!released.ok) {
        console.error(`[no-helper-fallback] money release failed for ${b.id}`, released.action, released.error);
      }
    }
    await supabase.from('household_job_updates').insert({
      booking_id: b.id,
      status: 'cancelled',
      note: 'No helper available — auto-cancelled after 2 hours.',
    });

    if (resendKey && custEmail) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: [custEmail],
          subject: `Sorry — we couldn't find a helper for your ${catLabel}`,
          html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#374151;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">We couldn't find a helper</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">We're really sorry — we weren't able to find an available helper for your <strong>${catLabel}</strong> in time. Your booking has been cancelled.</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">${refundOk ? '<strong>A full refund has been issued</strong> and should appear on your card within 5–7 business days.' : holdReleased ? '<strong>The hold on your card has been released</strong> — you were never charged.' : "<strong>You haven't been charged anything</strong> — no payment was ever taken for this booking."}</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;">Want to try again? <a href="${siteUrl}" style="color:#4a7c59;font-weight:600;">Book here</a></p>
    <p style="margin:0;color:#374151;font-size:15px;">Or message us on WhatsApp: <a href="https://wa.me/353899817111" style="color:#4a7c59">+353 89 981 7111</a></p>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref}</p>
  </div>
</div>
</body></html>`,
          text: `Hi ${custName}, we're really sorry — no helper was available for your ${catLabel}. ${refundOk ? 'Full refund issued (5–7 days).' : holdReleased ? 'The hold on your card was released — you were never charged.' : "You haven't been charged anything."} Book again at ${siteUrl} or WhatsApp +353 89 981 7111. Ref: ${ref}`,
        }),
      }).catch(() => {});
    }

    if (resendKey && adminEmail) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: [adminEmail],
          subject: `⚠️ No helper found — auto-cancelled ${ref}`,
          text: [
            `Booking ${ref} was auto-cancelled (2h, no helper).`,
            `Job: ${catLabel}`,
            `Customer: ${custName} (${custEmail ?? '—'})`,
            `City: ${b.city ?? '?'}`,
            `Money: ${refundOk ? 'refund issued (hold was captured in a race)' : holdReleased ? 'card hold released (never charged)' : nothingCharged ? 'n/a — never charged' : 'CHECK MANUALLY'}`,
            `ID: ${b.id}`,
          ].join('\n'),
        }),
      }).catch(() => {});
    }

    processed++;
  }

  console.log(`[no-helper-fallback] processed ${processed} booking(s)`);
  return new Response(JSON.stringify({ processed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
