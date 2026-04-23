// Feature-flag constants. These are compile-time, not runtime —
// flipping one is a code change + redeploy, which is intentional:
// marketing flags and beta gates shouldn't live in user-editable
// settings where a click can silently unbreak-or-break prod.
//
// Keep this file tiny. If you need per-user or per-env flags, move
// to a proper feature-flag service (PostHog, etc.) rather than
// spreading booleans through the codebase.

/**
 * Vano Pay — the escrow/Stripe-Connect payment flow.
 *
 * OFF while the implementation is still being stabilised. Flipping
 * this back to `true` re-reveals the setup card on Profile, the
 * "Pay safely" CTA in Messages, the trust chip on freelancer cards,
 * and the Vano-Pay copy across hire flows. The underlying code
 * paths remain intact; they're simply hidden from end users until
 * the feature is ready to be used in anger.
 *
 * When flipping back:
 *   - grep for `VANO_PAY_VISIBLE` to see every gated surface
 *   - smoke-test Stripe Connect onboarding end-to-end
 *   - smoke-test one client-release flow
 *   - un-scrub the copy in hire flow CTAs (some strings were
 *     rewritten to "pay them directly" when the flag was disabled
 *     — the old promises may want to return)
 */
export const VANO_PAY_VISIBLE = false;
