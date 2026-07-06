import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Customer "report a problem / money-back" for a household booking. Puts real
// code behind the money-back guarantee, which until now lived only in email
// copy. Booking-id gated (same trust model as customer_cancel).
//
// Behaviour depends on where the money is:
//   • Not paid            → file the complaint + alert the owner (nothing to refund).
//   • Paid, helper NOT yet paid (payout pending/held or absent) → auto-refund
//     the customer and cancel the held payout ('reversed'). Clean, no reversal.
//     This is the common case for AUTO-completed jobs inside their cooling-off
//     window (the ones a customer never confirmed).
//   • Paid, helper ALREADY paid (payout 'transferred') → do NOT claw a helper's
//     wages back from a public endpoint (griefing risk). File the dispute +
//     page the owner to decide on a reversal from the cockpit.
//
// Idempotent: a booking already disputed returns early.

function formEncode(o: Record<string, string>): string {
  return Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (!isOriginAllowed(req)) return json(403, { error: 'Forbidden origin' });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id : null;
    const reason = (typeof body?.reason === 'string' ? body.reason : '').slice(0, 500);
    if (!bookingId) return json(400, { error: 'booking_id required' });

    const { data: booking } = await supabase
      .from('household_bookings')
      .select('id, status, paid_at, stripe_payment_intent_id, price_estimate_cents, category, customer_name, customer_phone, customer_email, disputed_at')
      .eq('id', bookingId)
      .maybeSingle() as { data: Record<string, unknown> | null };
    if (!booking) return json(404, { error: 'Booking not found' });
    if (booking.disputed_at) return json(200, { ok: true, already: true });

    const ref = bookingId.slice(-8).toUpperCase();
    const cat = String(booking.category ?? 'job');

    // Stamp the dispute immediately (idempotency + audit).
    await supabase.from('household_bookings')
      .update({ disputed_at: new Date().toISOString(), dispute_reason: reason || 'Customer reported a problem' })
      .eq('id', bookingId);
    void supabase.from('household_job_updates').insert({ booking_id: bookingId, status: booking.status as string, note: `Customer reported a problem: ${reason || '(no detail)'}` });

    const pageAdmin = (message: string, subject: string) =>
      fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, subject, contact_phone: booking.customer_phone ?? undefined }),
      }).catch(() => {});

    const contact = `${booking.customer_name ?? '—'}, ${booking.customer_phone ?? '—'}, ${booking.customer_email ?? '—'}`;

    // Not paid → nothing to refund; it's a complaint.
    if (!booking.paid_at) {
      void pageAdmin(`⚠️ *Problem reported* (${ref})\n${cat} — "${reason || 'no detail'}"\nCustomer: ${contact}\nNot paid, so nothing to refund — follow up.`, `⚠️ Problem reported — ${cat} (${ref})`);
      return json(200, { ok: true, filed: true, refunded: false });
    }

    // Paid — where's the payout?
    const { data: payout } = await supabase
      .from('household_payouts')
      .select('id, status')
      .eq('booking_id', bookingId)
      .maybeSingle() as { data: { id: string; status: string } | null };

    const helperPaid = payout?.status === 'transferred';
    const pi = booking.stripe_payment_intent_id as string | null;

    // Atomically claim the payout as 'reversed' BEFORE refunding, so a
    // concurrent release-household-payouts can't transfer the helper in the
    // gap. If a payout row exists and the claim affects 0 rows, a release just
    // beat us (it's now 'transferred') → the helper is paid, so escalate
    // instead of refunding.
    let helperAlreadyPaid = helperPaid;
    if (payout?.id && !helperAlreadyPaid) {
      const { data: reversed } = await supabase
        .from('household_payouts')
        .update({ status: 'reversed', last_transfer_error: 'Cancelled — customer dispute before transfer' })
        .eq('id', payout.id)
        .neq('status', 'transferred')
        .select('id')
        .maybeSingle() as { data: { id: string } | null };
      if (!reversed) helperAlreadyPaid = true;
    }

    if (!helperAlreadyPaid) {
      // Helper hasn't been paid → refund the customer AND cancel the booking so
      // no completion path (auto-confirm, stall-sweep re-dispatch, manual mark-
      // done) can subsequently pay a helper on a refunded job.
      let refunded = false; let refundId: string | null = null;
      if (STRIPE_SECRET_KEY && pi && pi.startsWith('pi_')) {
        try {
          const r = await fetch('https://api.stripe.com/v1/refunds', {
            method: 'POST',
            headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `vano_dispute_refund_${bookingId}` },
            body: formEncode({ payment_intent: pi, reason: 'requested_by_customer' }),
          });
          if (r.ok) { refunded = true; refundId = ((await r.json()) as { id?: string }).id ?? null; }
          else console.error('[report-problem] refund failed', r.status, (await r.text()).slice(0, 200));
        } catch (e) { console.error('[report-problem] refund threw', e); }
      }
      // Terminal the booking regardless of refund success (disputed_at is
      // already set as a second guard) so it's out of every payout path.
      await supabase.from('household_bookings')
        .update({ status: 'cancelled', ...(refunded ? { refunded_at: new Date().toISOString(), stripe_refund_id: refundId } : {}) })
        .eq('id', bookingId)
        .neq('status', 'cancelled');
      void supabase.from('household_job_updates').insert({ booking_id: bookingId, status: 'cancelled', note: 'Cancelled — customer money-back report before the helper was paid.' });
      void pageAdmin(
        `${refunded ? '↩️ *Auto-refunded (money-back)*' : '🚨 *Refund needed — auto-refund failed*'} (${ref})\n${cat} — "${reason || 'no detail'}"\nCustomer: ${contact}\n${refunded ? 'Customer refunded; booking cancelled; any held payout reversed.' : 'Booking cancelled but auto-refund FAILED — refund in Stripe.'}`,
        `${refunded ? '↩️ Auto-refunded' : '🚨 Manual refund'} — ${cat} (${ref})`,
      );
      return json(200, { ok: true, refunded, needs_admin: !refunded });
    }

    // Helper already paid → don't reverse from a public endpoint; escalate.
    void pageAdmin(
      `🚨 *Dispute after payout* (${ref})\n${cat} — "${reason || 'no detail'}"\nCustomer: ${contact}\nThe helper was already paid — decide whether to refund + reverse the transfer from the admin panel.`,
      `🚨 Dispute after payout — ${cat} (${ref})`,
    );
    return json(200, { ok: true, filed: true, refunded: false, needs_admin: true });
  } catch (err) {
    console.error('[report-household-problem] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
