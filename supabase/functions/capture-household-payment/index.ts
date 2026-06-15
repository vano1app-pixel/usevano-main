import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Helper marks a job complete. Payment was already captured upfront at
// checkout, so this flips status, records the payout, and notifies the
// customer (with a one-tap rating ask), admin and WhatsApp.
//
// NOTE: kept in sync with the deployed version (CORS inlined, no Stripe
// call). If you edit this, redeploy — the GitHub auto-deploy is disabled.

const FALLBACK_ORIGINS = ['https://vanojobs.com','https://www.vanojobs.com','http://localhost:5173','http://localhost:4173'];
const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';
function matchOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const n = origin.replace(/\/$/, '');
  const list = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s=>s.trim().replace(/\/$/, '')).filter(Boolean);
  const allowed = list.length ? list : FALLBACK_ORIGINS;
  if (allowed.includes(n)) return n;
  try { if (new URL(n).hostname.endsWith('-vano1app-pixels-projects.vercel.app')) return n; } catch {}
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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    // Internal completion: the household "mark done" path and the timed-job
    // cron sweep complete jobs server-side and can't present a helper JWT.
    // Trust it only when the bearer IS the service-role key and it flags
    // itself; the assigned helper is then read from the booking row.
    const isInternal = req.headers.get('x-internal-complete') === '1' &&
      authHeader === `Bearer ${serviceKey}`;

    let authedUserId: string | null = null;
    if (!isInternal) {
      const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: userErr } = await authClient.auth.getUser();
      if (userErr || !user) return bad(401, 'Unauthorized');
      authedUserId = user.id;
    }

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id : null;
    if (!bookingId) return bad(400, 'booking_id required');

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: booking, error: fetchError } = await supabase
      .from('household_bookings')
      .select('id, student_id, status, price_estimate_cents, customer_name, customer_email, category, city, paid_at, stripe_payment_intent_id')
      .eq('id', bookingId).maybeSingle();

    if (fetchError || !booking) return bad(404, 'Booking not found');
    // User path: the caller must be the assigned helper. Internal path: the
    // helper is whoever the booking is assigned to.
    if (!isInternal && booking.student_id !== authedUserId) return bad(403, 'Not the assigned student');
    if (!booking.student_id) return bad(409, 'No helper assigned to this job');
    if (!['accepted','on_way','arrived','in_progress'].includes(booking.status)) return bad(409, `Cannot complete in status: ${booking.status}`);
    // Pay-before-payout guard: helpers accept jobs before the customer pays
    // (pay-after-accept), so never complete + auto-release a payout for a job
    // that hasn't been paid. Free/zero-price bookings (none today) are exempt.
    if (((booking.price_estimate_cents as number | null) ?? 0) > 0 && !booking.paid_at) {
      return bad(409, 'Payment not received yet — this job can be completed once the customer has paid.');
    }

    const callerId = booking.student_id as string;

    // Idempotency: if payout already exists this job was already completed.
    const { count: existingPayout } = await supabase
      .from('household_payouts').select('id', { count:'exact', head:true }).eq('booking_id', bookingId);
    if (existingPayout && existingPayout > 0) {
      return new Response(JSON.stringify({ success: true, already_complete: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Mark completed — atomic status guard
    const { error: updateError } = await supabase
      .from('household_bookings').update({ status: 'completed' })
      .eq('id', bookingId).eq('student_id', callerId)
      .in('status', ['accepted','on_way','arrived','in_progress']);

    if (updateError) { console.error('[capture] booking update failed', updateError); return bad(500, 'Booking status update failed. Contact support.'); }

    const PLATFORM_FEE_BPS = 1500;
    const priceCents = booking.price_estimate_cents ?? 0;
    const studentCents = Math.floor(priceCents * (10000 - PLATFORM_FEE_BPS) / 10000);

    // Record the payout as 'pending'. If the helper has finished Stripe
    // Connect onboarding we fire an automatic Transfer below and flip it
    // to 'transferred'; otherwise it stays 'pending' and the
    // release-household-payouts cron sweeps it once they onboard. Helpers
    // can work with no payout setup — their earnings are simply held.
    const { data: payoutRow } = await supabase
      .from('household_payouts')
      .insert({ booking_id: bookingId, student_id: callerId, amount_cents: studentCents, status: 'pending' })
      .select('id')
      .single();
    await supabase.from('household_job_updates').insert({ booking_id: bookingId, status: 'completed', note: 'Job completed.' });

    // ── Best-effort automatic payout ─────────────────────────────────────
    // Mirrors release-vano-payment's Stripe Transfer. Wrapped so it can
    // NEVER block job completion: any failure leaves the payout 'pending'
    // for the cron to retry. source_transaction is only valid for a real
    // PaymentIntent (pi_…); for a Checkout Session id (cs_…) or a missing
    // intent we transfer from the platform balance instead.
    try {
      const payoutId = payoutRow?.id as string | undefined;
      if (payoutId && studentCents > 0 && STRIPE_SECRET_KEY) {
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
    const catLabels: Record<string,string> = { shopping:'Laundry','dog-walk':'Dog walk',garden:'Garden help',moving:'Moving help',cleaning:'Cleaning',tutoring:'Tutoring',other:'General help' };
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
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">All done! &#10003;</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
      <strong>${helperFirst}</strong> has completed your <strong>${catLabel}</strong>. Payment was handled upfront — nothing more to do.
    </p>
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
          text:`Hi ${custName}, ${helperFirst} has completed your ${catLabel}. Payment was handled upfront. How was ${helperFirst}? Rate them here (takes 10 seconds): ${trackUrl}?rate=5 — Questions? WhatsApp +353 89 981 7111. Ref: ${ref}`,
        }),
      }).catch(()=>{});
    }

    const adminEmail = Deno.env.get('ADMIN_EMAIL')?.trim();
    if (resendKey && adminEmail) fetch('https://api.resend.com/emails', { method:'POST', headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'}, body: JSON.stringify({ from, to:[adminEmail], subject:`✅ Job done — ${helperFirst} completed ${catLabel}`, text:`${helperFirst} completed a job.\nJob: ${catLabel}\nCustomer: ${custName}\nPaid: €${(priceCents/100).toFixed(2)} (student earns €${(studentCents/100).toFixed(2)})\nRef: ${ref}\nTrack: ${trackUrl}` }) }).catch(()=>{});

    fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, { method:'POST', headers:{Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'}, body: JSON.stringify({ type:'job_complete', helper_name:helperFirst, customer_name:custName, category:(booking as Record<string,unknown>).category, city:(booking as Record<string,unknown>).city, price_euros:(priceCents/100).toFixed(2), student_earns_euros:(studentCents/100).toFixed(2), booking_id:bookingId }) }).catch(()=>{});

    return new Response(JSON.stringify({ success: true, student_earns_cents: studentCents }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[capture-household-payment] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
