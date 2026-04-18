// Single source of truth for Vano Pay economics. Imported by
// create-vano-payment-checkout (server-authoritative charge) and
// get-vano-pay-config (public endpoint the frontend preview calls).
// Changing any of these values means redeploying both functions;
// no frontend deploy is needed — the modal fetches the config live.

export const VANO_PAY_FEE_BPS = 300; // 3.00% application fee.
export const VANO_PAY_MIN_CENTS = 100; // €1.00 — Stripe EUR minimum.
export const VANO_PAY_MAX_CENTS = 500000; // €5,000 ceiling for MVP.
export const VANO_PAY_CURRENCY = 'eur';
