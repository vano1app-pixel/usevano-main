import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendHouseholdPush } from "../_shared/householdPush.ts";

// Completes a household job and releases the helper's payout. INTERNAL ONLY —
// the customer's "mark done" (complete-household-job), the admin path
// (admin-complete-household-job) and the timed-job sweep all re-enter here over
// the service-role path once completion is confirmed; a helper can never reach
// it directly. Payment was captured upfront at checkout, so this flips status →
// completed, records the payout (and fires the Stripe Connect transfer if the
// helper is onboarded), then notifies the customer (one-tap rating ask), admin
// and WhatsApp.
//
// If you edit this, redeploy — the GitHub auto-deploy is disabled.

const FALLBACK_ORIGINS = ['https://vanojobs.com','https://www.vanojobs.com','http://localhost:5173','http://localhost:4173'];
const NATIVE_APP_ORIGINS = ['capacitor://localhost', 'https://localhost', 'ionic://localhost']; // iOS / Android / legacy shells — always allowed (see capacitor.config.ts)
const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';
function matchOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const n = origin.replace(/\/$/, '');
  const list = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s=>s.trim().replace(/\/$/, '')).filter(Boolean);
  const allowed = [...(list.length ? list : FALLBACK_ORIGINS), ...NATIVE_APP_ORIGINS];
  if (allowed.includes(n)) return n;
  try { if (new URL(n).hostname.endsWith('-vano1app-pixels-projects.vercel.app')) return n; } catch { /* not a valid URL */ }
  return null;
}
function buildCorsHeaders(req: Request) {
  return { 'Access-Control-Allow-Origin': matchOrigin(req) ?? 'null', 'Access-Control-Allow-Headers': ALLOWED_HEADERS, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', Vary: 'Origin' };
}
function isOriginAllowed(req: Request) { return !req.headers.get('Origin') || matchOrigin(req) !== null; }

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    // Completion + payout is INTERNAL ONLY. A helper must NEVER be able to
    // complete their own job and release their own payout, so the only accepted
    // caller is the trusted internal path: the customer's "mark done"
    // (complete-household-job), the admin path (admin-complete-household-job)
    // and the timed-job sweep all confirm completion server-side and re-enter
    // here with the service-role key + the x-internal-complete flag. The
    // assigned helper is read from the booking row. Any other caller (e.g. a
    // helper presenting their own JWT) is refused — completion is the
    // customer's call, not the helper's.
    const isInternal = req.headers.get('x-internal-complete') === '1' &&
      authHeader === `Bearer ${serviceKey}`;
    if (!isInternal) return bad(403, 'Completion is confirmed by the customer, not the helper.');

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id : null;
    if (!bookingId) return bad(400, 'booking_id required');
    // Cooling-off: an AUTO-completed job (48h no customer response) carries
    // dispute risk, so the caller passes hold_hours to defer the transfer — the
    // payout stays 'pending' with hold_until set, and a dispute inside the
    // window cancels+refunds cleanly with no reversal. A customer-confirmed
    // completion omits it and pays out immediately (great for helpers).
    const holdHours = Number(body?.hold_hours) > 0 ? Number(body.hold_hours) : 0;

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: booking, error: fetchError } = await supabase
      .from('household_bookings')
      .select('id, student_id, status, price_estimate_cents, booking_data, customer_name, customer_email, category, city, paid_at, stripe_payment_intent_id, disputed_at, refunded_at, rating_token')
      .eq('id', bookingId).maybeSingle();

    if (fetchError || !booking) return bad(404, 'Booking not found');
    // Never complete + pay out a job the customer disputed / was refunded for —
    // otherwise a money-back refund plus a later auto-confirm would pay both
    // sides. report-household-problem also cancels the booking, but guard here
    // too so no completion path can slip a payout through.
    if (booking.disputed_at || booking.refunded_at) {
      return bad(409, 'This booking is under dispute or refunded — not completing.');
    }
    // The helper to be paid is whoever the booking is assigned to.
    if (!booking.student_id) return bad(409, 'No helper assigned to this job');
    // Direct-pay (July 2026): the customer pays the helper directly — this
    // function no longer moves money for those bookings, it's purely the
    // completion choke-point (status flip + rating token + notifications).
    const directPay = ((booking.booking_data as Record<string, unknown> | null)?.direct_pay) === true;
    if (booking.status === 'completed') {
      return new Response(JSON.stringify({ success: true, already_complete: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!['accepted','on_way','arrived','in_progress'].includes(booking.status)) return bad(409, `Cannot complete in status: ${booking.status}`);
    // Pay-before-payout guard: helpers accept jobs before the customer pays
    // (pay-after-accept), so never complete + auto-release a payout for a job
    // that hasn't been paid. Free/zero-price bookings (none today) are exempt.
    if (((booking.price_estimate_cents as number | null) ?? 0) > 0 && !booking.paid_at) {
      return bad(409, 'Payment not received yet — this job can be completed once the customer has paid.');
    }

    const callerId = booking.student_id as string;
    const priceCents = (booking.price_estimate_cents as number | null) ?? 0; // the job money
    let payoutRow: { id: string } | null = null;
    let holdUntil: string | null = null;
    let studentCents = priceCents; // direct-pay: the helper keeps 100%, paid directly

    if (!directPay) {
      // ── LEGACY escrow bookings (created before the direct-pay deploy) ────
      // Idempotency: if payout already exists this job was already completed.
      const { count: existingPayout } = await supabase
        .from('household_payouts').select('id', { count:'exact', head:true }).eq('booking_id', bookingId);
      if (existingPayout && existingPayout > 0) {
        // Self-heal: if a prior run recorded the payout but its status flip then
        // errored (a DB blip), re-attempt the flip (guarded) before returning.
        if (booking.status !== 'completed') {
          await supabase.from('household_bookings')
            .update({ status: 'completed', ...(booking.rating_token ? {} : { rating_token: crypto.randomUUID() }) })
            .eq('id', bookingId)
            .in('status', ['accepted','on_way','arrived','in_progress']);
        }
        return new Response(JSON.stringify({ success: true, already_complete: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const PLATFORM_FEE_BPS = 1500;
      // Helper pay base: the FULL job price (legacy discounts were
      // platform-funded and never docked the helper below minimum wage).
      const payBaseCents = Math.max(
        priceCents,
        Number((booking.booking_data as Record<string, unknown> | null)?.helper_pay_base_cents) || 0,
      );
      studentCents = Math.floor(payBaseCents * (10000 - PLATFORM_FEE_BPS) / 10000);

      // Record the payout FIRST, and only flip the booking to 'completed' once
      // the helper's pay is durably on the books. UNIQUE(booking_id) makes a
      // concurrent second completion lose the race (23505) → already-complete.
      holdUntil = holdHours > 0 ? new Date(Date.now() + holdHours * 60 * 60 * 1000).toISOString() : null;
      const { data: insertedPayout, error: payoutErr } = await supabase
        .from('household_payouts')
        .insert({ booking_id: bookingId, student_id: callerId, amount_cents: studentCents, status: 'pending', hold_until: holdUntil })
        .select('id')
        .single();

      if (payoutErr) {
        if ((payoutErr as { code?: string }).code === '23505') {
          return new Response(JSON.stringify({ success: true, already_complete: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        console.error('[capture] payout insert failed — not completing so it can retry', payoutErr);
        return bad(500, 'Could not record payout. Please try again.');
      }
      payoutRow = insertedPayout as { id: string };
    }

    // Money side settled (legacy: payout row durable; direct-pay: nothing to
    // move) — now safe to mark completed (atomic status guard).
    // Mint the per-booking rating token here (the completion choke-point): it's
    // delivered to the CUSTOMER via the tracking page and required by
    // rate-household-booking, so a helper can't rate their own job. Preserve an
    // existing token if somehow already set.
    const { error: updateError } = await supabase
      .from('household_bookings')
      .update({ status: 'completed', ...(booking.rating_token ? {} : { rating_token: crypto.randomUUID() }) })
      .eq('id', bookingId).eq('student_id', callerId)
      .in('status', ['accepted','on_way','arrived','in_progress']);

    if (updateError) {
      // Rare (a real DB error, not a 0-row match). The payout row already
      // exists, so the release cron's reconciliation backfill will still pay
      // the helper; log loudly but don't fail the request — the money side is
      // safe, only the booking's display status may lag until re-run.
      console.error('[capture] booking status flip errored AFTER payout was recorded — reconcile will catch it', updateError);
    }
    await supabase.from('household_job_updates').insert({ booking_id: bookingId, status: 'completed', note: 'Job completed.' });

    // Best-effort web push to the customer — single completion choke-point, so
    // this covers both the "mark done" and admin/cron completion paths.
    void sendHouseholdPush(bookingId, 'completed');

    // ── Best-effort automatic payout ─────────────────────────────────────
    // Mirrors release-vano-payment's Stripe Transfer. Wrapped so it can
    // NEVER block job completion: any failure leaves the payout 'pending'
    // for the cron to retry. source_transaction is only valid for a real
    // PaymentIntent (pi_…); for a Checkout Session id (cs_…) or a missing
    // intent we transfer from the platform balance instead.
    try {
      const payoutId = payoutRow?.id as string | undefined;
      // Held payouts (auto-completed jobs in their dispute window) are NOT
      // transferred now — release-household-payouts sweeps them once hold_until
      // elapses, so a dispute meanwhile can cancel + refund with no reversal.
      if (payoutId && !holdUntil && studentCents > 0 && STRIPE_SECRET_KEY) {
        const { data: helperRow } = await supabase
          .from('household_helpers')
          .select('stripe_account_id, stripe_payouts_enabled')
          .eq('user_id', callerId)
          .maybeSingle();
        const destination = helperRow?.stripe_account_id as string | null | undefined;
        const ready = !!helperRow?.stripe_payouts_enabled;

        if (ready && destination) {
          const intentId = (booking as Record<string, unknown>).stripe_payment_intent_id as string | null | undefined;
          const transferParams: Record<string, string> = {
            amount: String(studentCents),
            currency: 'eur',
            destination,
            'metadata[vano_household_payout_id]': payoutId,
          };
          if (intentId && intentId.startsWith('pi_')) transferParams.source_transaction = intentId;

          const transferResp = await fetch('https://api.stripe.com/v1/transfers', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              'Idempotency-Key': `vano_household_payout_${payoutId}`,
            },
            body: formEncode(transferParams),
          });

          if (transferResp.ok) {
            const transfer = await transferResp.json() as { id: string };
            await supabase
              .from('household_payouts')
              .update({ status: 'transferred', stripe_transfer_id: transfer.id, released_at: new Date().toISOString() })
              .eq('id', payoutId);
          } else {
            const text = await transferResp.text().catch(() => '');
            console.error('[capture-household-payment] transfer failed — leaving payout pending', transferResp.status, text.slice(0, 300));
          }
        } else {
          console.log('[capture-household-payment] helper not onboarded — payout held pending', { payoutId, ready, hasDestination: !!destination });
        }
      }
    } catch (payoutErr) {
      console.error('[capture-household-payment] auto-payout errored — payout left pending', payoutErr);
    }

    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
    const from = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
    const catLabels: Record<string,string> = { business:'Business temp staff', shopping:'Laundry','dog-walk':'Dog walk',garden:'Garden help',moving:'Moving help',cleaning:'Cleaning',tutoring:'Tutoring',other:'General help' };
    const catLabel = catLabels[(booking as Record<string,unknown>).category as string] ?? 'job';
    const custName = String((booking as Record<string,unknown>).customer_name ?? 'there');
    const custEmail = (booking as Record<string,unknown>).customer_email as string|null;
    const ref = bookingId.slice(-8).toUpperCase();
    const trackUrl = `${siteUrl}/track/${bookingId}`;

    let helperFirst = 'Your helper';
    const { data: helperRow } = await supabase.from('household_helpers').select('name').eq('user_id', callerId).maybeSingle() as { data: { name?: string }|null };
    if (helperRow?.name) helperFirst = helperRow.name.split(' ')[0];

    // Customer "all done" email — the rating ask. Each star deep-links into
    // the tracking page with that rating pre-selected (?rate=N).
    if (resendKey && custEmail) {
      const stars = [1, 2, 3, 4, 5].map(n =>
        `<a href="${trackUrl}?rate=${n}" style="text-decoration:none;font-size:30px;line-height:1;color:#f5b301;padding:0 3px;">&#9733;</a>`
      ).join('');
      // Revolut-first settle-up (owner's call): request-link shape with the
      // amount appended so the customer's Revolut opens pre-filled. Same
      // conservative tag shape as the tracking page's revolutTag helper — an
      // IBAN or free text never linkifies. If the amount suffix is ever
      // ignored the link still opens the helper's profile.
      const rawHandle = String((booking.booking_data as Record<string, unknown> | null)?.helper_payment_handle ?? '').trim();
      const revTagMatch = rawHandle.match(/^(?:https?:\/\/)?(?:www\.)?revolut\.me\/@?([a-z0-9_]{3,16})\/?(?:[?#].*)?$/i) ?? rawHandle.match(/^@?([a-z0-9_]{3,16})$/i);
      const revAmount = (priceCents / 100).toFixed(2).replace(/\.00$/, '');
      const revolutUrl = directPay && revTagMatch ? `https://revolut.me/${revTagMatch[1]}/${revAmount}` : null;
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">All done! &#10003;</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
      <strong>${helperFirst}</strong> has completed your <strong>${catLabel}</strong>. ${directPay
        ? `If you haven't already, settle up with ${helperFirst} directly — <strong>€${(priceCents / 100).toFixed(2)}</strong>${revolutUrl ? '' : (booking.booking_data as Record<string, unknown> | null)?.helper_payment_handle ? ` (Revolut <strong>${(booking.booking_data as Record<string, unknown>).helper_payment_handle}</strong> or cash)` : ' (Revolut or cash)'} — they keep 100%.`
        : 'Payment was handled upfront — nothing more to do.'}
    </p>
    ${revolutUrl ? `<a href="${revolutUrl}" style="display:block;background:#4a7c59;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 24px;border-radius:100px;text-align:center;margin:0 0 10px;">Pay ${helperFirst} &euro;${revAmount} in Revolut &rarr;</a>
    <p style="margin:0 0 24px;color:#6b7280;font-size:12px;text-align:center;">Opens Revolut with the amount ready &middot; or cash in hand is grand too</p>` : ''}
    <div style="background:#eef3ef;border:1px solid #d5e2d8;border-radius:14px;padding:20px;text-align:center;margin:0 0 24px;">
      <p style="margin:0 0 10px;color:#111827;font-size:15px;font-weight:700;">How was ${helperFirst}?</p>
      <p style="margin:0 0 4px;">${stars}</p>
      <p style="margin:8px 0 0;color:#6b7280;font-size:12px;">Tap a star — takes 10 seconds and helps ${helperFirst} get more work.</p>
    </div>
    <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">
      Questions or need anything else? WhatsApp us:
      <a href="https://wa.me/353899817111" style="color:#4a7c59;">+353 89 981 7111</a>
    </p>
    <p style="margin:0;color:#9ca3af;font-size:12px;">Thanks for using VANO &middot; Ref: ${ref}</p>
  </div>
</div>
</body></html>`;
      fetch('https://api.resend.com/emails', {
        method:'POST',
        headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},
        body: JSON.stringify({
          from,
          to:[custEmail],
          subject:`Your ${catLabel} is complete — how was ${helperFirst}?`,
          html,
          text:`Hi ${custName}, ${helperFirst} has completed your ${catLabel}. ${directPay ? `If you haven't already, settle up with ${helperFirst} directly — €${(priceCents / 100).toFixed(2)}${revolutUrl ? ` (pay in Revolut, amount ready: ${revolutUrl} — or cash)` : ' (Revolut or cash)'}.` : 'Payment was handled upfront.'} How was ${helperFirst}? Rate them here (takes 10 seconds): ${trackUrl}?rate=5 — Questions? WhatsApp +353 89 981 7111. Ref: ${ref}`,
        }),
      }).catch(()=>{});
    }

    const adminEmail = Deno.env.get('ADMIN_EMAIL')?.trim();
    if (resendKey && adminEmail) fetch('https://api.resend.com/emails', { method:'POST', headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'}, body: JSON.stringify({ from, to:[adminEmail], subject:`✅ Job done — ${helperFirst} completed ${catLabel}`, text:`${helperFirst} completed a job.\nJob: ${catLabel}\nCustomer: ${custName}\n${directPay ? `Job money: €${(priceCents/100).toFixed(2)} paid to the student directly (100%)` : `Paid: €${(priceCents/100).toFixed(2)} (student earns €${(studentCents/100).toFixed(2)})`}\nRef: ${ref}\nTrack: ${trackUrl}` }) }).catch(()=>{});

    fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, { method:'POST', headers:{Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'}, body: JSON.stringify({ type:'job_complete', helper_name:helperFirst, customer_name:custName, category:(booking as Record<string,unknown>).category, city:(booking as Record<string,unknown>).city, price_euros:(priceCents/100).toFixed(2), student_earns_euros:(studentCents/100).toFixed(2), booking_id:bookingId }) }).catch(()=>{});

    return new Response(JSON.stringify({ success: true, student_earns_cents: studentCents }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[capture-household-payment] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
