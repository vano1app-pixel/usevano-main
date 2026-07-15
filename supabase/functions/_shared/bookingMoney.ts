// AUTH-AT-BOOKING MODEL (July 2026) — the single source of "what do we do
// with the Stripe artifact on this booking" decisions.
//
// The Vano fee is AUTHORIZED (a manual-capture card hold, Apple Pay/Google
// Pay/card) when the booking is placed, and CAPTURED the moment a helper
// accepts. The lifecycle leaves exactly one Stripe artifact on the row at a
// time, and `stripe_payment_intent_id` keeps its long-standing dual meaning:
//   · `cs_…`  = an OPEN Checkout session (auth not completed yet)
//   · `pi_…`  = a real PaymentIntent — a HOLD while `paid_at` is null,
//               CAPTURED money once `paid_at` is set
// Every release path routes through resolveMoneyAction so the three states
// are never confused: captured money is refunded, a hold is cancelled
// (Stripe cannot refund an uncaptured intent), an open session is expired.
//
// Pure TypeScript decision logic + a thin raw-REST executor (house rule: no
// Stripe SDK). The decision half has no Deno APIs, so vitest imports it
// directly (same pattern as vanoFees.ts / householdPricing.ts).

export type MoneyAction = 'refund' | 'cancel_pi' | 'expire_session' | 'none';

/** What should happen to this booking's Stripe artifact when the booking is
 *  being cancelled / failed / refunded.
 *  NOTE: helper_release deliberately does NOT use this — a `pi_` hold must
 *  SURVIVE a helper release so the next acceptor's capture just works. */
export function resolveMoneyAction(
  paidAt: string | null | undefined,
  stripePaymentIntentId: string | null | undefined,
): MoneyAction {
  const id = (stripePaymentIntentId ?? '').trim();
  if (id.startsWith('pi_')) return paidAt ? 'refund' : 'cancel_pi';
  if (id.startsWith('cs_')) return 'expire_session';
  return 'none';
}

// Card auth holds die at ~7 days, so bookings scheduled further out than this
// keep the classic pay-after-accept flow (5 days leaves ~2 days of accept +
// redispatch margin before the hold could lapse).
export const AUTH_MAX_LEAD_MS = 5 * 24 * 60 * 60 * 1000;

/** True when a scheduled slot is too far out to hold a card for. */
export function isFarFuture(scheduledAtIso: string | null | undefined, nowMs: number): boolean {
  if (!scheduledAtIso) return false;
  const t = Date.parse(scheduledAtIso);
  if (!Number.isFinite(t)) return false;
  return t - nowMs > AUTH_MAX_LEAD_MS;
}

/** Execute a MoneyAction against Stripe (raw REST, form-encoded — no SDK).
 *  Fail-soft by design: returns ok=false rather than throwing, and cross-falls
 *  back when Stripe says the state moved under us (a `cancel_pi` losing the
 *  race to a capture becomes a `refund`, and vice versa), so a cancel/accept
 *  race can never strand the customer's money.
 *  STRIPE_API_BASE is only for local verification against a mock Stripe. */
export async function releaseBookingMoney(opts: {
  stripeKey: string;
  action: MoneyAction;
  stripeId: string;
  /** Suffix for the Idempotency-Key so webhook replays / cron overlaps can't
   *  double-fire (e.g. the booking id). */
  idemSuffix: string;
  apiBase?: string;
}): Promise<{ ok: boolean; action: MoneyAction; error?: string }> {
  const { stripeKey, stripeId, idemSuffix } = opts;
  const base = (opts.apiBase ?? 'https://api.stripe.com').replace(/\/$/, '');

  const call = async (action: MoneyAction): Promise<{ ok: boolean; error?: string }> => {
    let url: string;
    let body: string;
    let idem: string;
    if (action === 'refund') {
      url = `${base}/v1/refunds`;
      body = new URLSearchParams({ payment_intent: stripeId }).toString();
      idem = `vano_refund_${idemSuffix}`;
    } else if (action === 'cancel_pi') {
      url = `${base}/v1/payment_intents/${stripeId}/cancel`;
      body = '';
      idem = `vano_hold_cancel_${idemSuffix}`;
    } else if (action === 'expire_session') {
      url = `${base}/v1/checkout/sessions/${stripeId}/expire`;
      body = '';
      idem = `vano_session_expire_${idemSuffix}`;
    } else {
      return { ok: true };
    }
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': idem,
        },
        body,
      });
      if (resp.ok) return { ok: true };
      const text = (await resp.text().catch(() => '')).slice(0, 400);
      return { ok: false, error: text || `HTTP ${resp.status}` };
    } catch (e) {
      return { ok: false, error: String(e).slice(0, 200) };
    }
  };

  const first = await call(opts.action);
  if (first.ok) return { ok: true, action: opts.action };

  // Cross-fallback on state races: Stripe's error text names the real state.
  const err = (first.error ?? '').toLowerCase();
  if (opts.action === 'cancel_pi' && (err.includes('already been captured') || err.includes('succeeded'))) {
    const second = await call('refund');
    if (second.ok) return { ok: true, action: 'refund' };
    return { ok: false, action: 'refund', error: second.error };
  }
  if (opts.action === 'refund' && (err.includes('uncaptured') || err.includes('requires_capture') || err.includes('not been captured'))) {
    const second = await call('cancel_pi');
    if (second.ok) return { ok: true, action: 'cancel_pi' };
    return { ok: false, action: 'cancel_pi', error: second.error };
  }
  // An already-cancelled/expired artifact is a success for our purposes —
  // the money is provably not with us.
  if (err.includes('already') && (err.includes('cancel') || err.includes('expire'))) {
    return { ok: true, action: opts.action };
  }
  return { ok: false, action: opts.action, error: first.error };
}
