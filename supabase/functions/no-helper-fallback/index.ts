import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  renderHouseholdEmail, emailP, escapeHtml, categoryLabel, greetName,
  sendHouseholdEmail,
} from "../_shared/householdEmail.ts";

// Cron: runs every 30 minutes.
// Finds UNPAID bookings stuck in 'pending' for more than 2 hours with no
// helper assigned, issues a full Stripe refund (if any), flips them to
// 'cancelled', and emails both the customer and admin.
//
// PAID bookings are deliberately excluded: when a helper releases a job it goes
// back to pending with paid_at kept, and redispatch-stale-jobs keeps re-matching
// it. We must never auto-cancel/refund a customer who has paid and still wants
// the job done — that's handled by admin if it can't be re-matched.

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

serve(async (_req) => {
  const supabaseUrl   = Deno.env.get('SUPABASE_URL')!;
  const serviceKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY');
  const resendKey     = Deno.env.get('RESEND_API_KEY')?.trim();
  // Admin email only (customer email goes via sendHouseholdEmail). Brand-domain
  // default — Resend's sandbox fallback bounces for anyone but the account owner.
  const from          = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <noreply@vanojobs.com>';
  const adminEmail    = Deno.env.get('ADMIN_EMAIL')?.trim();
  const siteUrl       = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');

  const supabase = createClient(supabaseUrl, serviceKey);

  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data: stuckBookings, error: queryErr } = await supabase
    .from('household_bookings')
    .select('id, customer_name, customer_email, category, city, price_estimate_cents, stripe_payment_intent_id')
    .eq('status', 'pending')
    .is('student_id', null)
    .is('paid_at', null)
    .lt('created_at', cutoff);

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
    const custNameRaw = String(b.customer_name ?? '');
    const custName  = greetName(custNameRaw); // never "Hi Guest"
    const custEmail = b.customer_email as string | null;
    const catLabel  = categoryLabel(b.category as string | null);

    // Stripe refund
    let refundOk = false;
    const piId = b.stripe_payment_intent_id as string | null;
    if (STRIPE_SECRET && piId?.startsWith('pi_')) {
      try {
        const refundResp = await fetch('https://api.stripe.com/v1/refunds', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${STRIPE_SECRET}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formEncode({ payment_intent: piId }),
        });
        refundOk = refundResp.ok;
        if (!refundOk) {
          const txt = await refundResp.text();
          console.error(`[no-helper-fallback] stripe refund error for ${b.id}`, refundResp.status, txt.slice(0, 200));
        }
      } catch (e) {
        console.error(`[no-helper-fallback] refund exception for ${b.id}`, e);
      }
    }

    await supabase.from('household_bookings').update({ status: 'cancelled' }).eq('id', b.id);
    await supabase.from('household_job_updates').insert({
      booking_id: b.id,
      status: 'cancelled',
      note: 'No helper available — auto-cancelled after 2 hours.',
    });

    if (resendKey && custEmail) {
      // HTML-safe variants for interpolation (raw values stay in text/subject).
      const custNameHtml = escapeHtml(custName);
      const catLabelHtml = escapeHtml(catLabel);
      await sendHouseholdEmail({
        to: custEmail,
        subject: `Sorry — we couldn't find a helper for your ${catLabel}`,
        html: renderHouseholdEmail({
          preheader: refundOk
            ? `No helper was free for your ${catLabel} this time — a full refund is on its way to your card.`
            : `No helper was free for your ${catLabel} this time — you haven't been charged a cent.`,
          eyebrow: 'Booking cancelled',
          heading: "We couldn't find a helper",
          bodyHtml: [
            emailP(`Hi ${custNameHtml},`),
            emailP(`We're really sorry — we weren't able to find an available helper for your <strong>${catLabelHtml}</strong> in time. Your booking has been cancelled.`),
            emailP(refundOk
              ? '<strong>A full refund has been issued</strong> and should appear on your card within 5–7 business days.'
              : "<strong>You haven't been charged</strong> — with VANO you only ever pay once a helper is confirmed.",
              { last: true }),
          ].join(''),
          ctas: [
            { label: 'Book again →', url: siteUrl, variant: 'primary' },
            { label: 'WhatsApp us', url: 'https://wa.me/353899817111', variant: 'whatsapp' },
          ],
          footerNote: `Ref: ${ref}`,
          tone: 'slate',
        }),
        text: `Hi ${custName}, we're really sorry — no helper was available for your ${catLabel}. ${refundOk ? 'Full refund issued (5–7 days).' : "You haven't been charged — you only pay once a helper is confirmed."} Book again at ${siteUrl} or WhatsApp +353 89 981 7111. Ref: ${ref}`,
      });
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
            `Customer: ${custNameRaw || '—'} (${custEmail ?? '—'})`,
            `City: ${b.city ?? '?'}`,
            `Refund: ${refundOk ? 'Issued' : 'FAILED — check manually'}`,
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
