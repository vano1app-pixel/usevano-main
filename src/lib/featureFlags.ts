// Feature-flag constants. These are compile-time, not runtime —
// flipping one is a code change + redeploy, which is intentional:
// marketing flags and beta gates shouldn't live in user-editable
// settings where a click can silently unbreak-or-break prod.
//
// Keep this file tiny. If you need per-user or per-env flags, move
// to a proper feature-flag service (PostHog, etc.) rather than
// spreading booleans through the codebase.

/**
 * Vano Pay — the escrow/Stripe-Connect payment flow with a 4% / 4%
 * split fee on the agreed price (hirer pays 4% on top, freelancer has
 * 4% deducted, Vano keeps 8% total).
 *
 * ON. The new /vano-pay nav surface, the in-thread Pay button, the
 * setup card on Profile, the trust chip on freelancer cards, and the
 * un-scrubbed hire-flow copy all gate on this constant.
 *
 * If you need to turn it OFF in a hurry (incident, Stripe outage,
 * platform-wide pause):
 *   - flip this back to `false` and ship a hotfix
 *   - the /vano-pay route renders a "coming soon" placeholder under
 *     this flag (defence-in-depth — the nav item also disappears)
 *   - in-thread Pay buttons + the trust chip vanish on the next render
 *   - VanoPaySetupCard stops appearing on Profile
 *
 * If you change the fee rates, edit
 * supabase/functions/_shared/vanoPayConfig.ts (server-authoritative)
 * and src/lib/vanoPayConfig.ts (matching frontend fallback). The
 * vanoPayMath test asserts they stay in sync.
 */
export const VANO_PAY_VISIBLE = true;
