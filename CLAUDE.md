# CLAUDE.md — Vano

Same-day home help in Galway: book an ID-verified student for cleaning,
laundry, garden, dog walks, moving or tutoring. React + Vite + TypeScript +
Tailwind/shadcn on the front; Supabase (Postgres + Deno edge functions) on
the back; Stripe for payments; hosted on Vercel. Also ships as native iOS +
Android apps via Capacitor (see `src/lib/native/`).

## The focus (read this first)
ONE business model: the single quick-book flow for one-off home help. The
whole job right now is to **perfect that one flow to Uber's standard**, make
the site convert, drive traffic to it, and ship it as polished iOS/Android
apps. Do not add a second product or a second booking path. Autopilot (the
old subscription) is **parked** — its code still exists but nothing mounts it
and it is not being sold; don't build on it or cross-sell it. When in doubt,
the tie-breaker is: does this make the one booking flow faster, clearer, or
more trusted? If not, it waits.

## Commands
| | |
|---|---|
| `npm run dev` | local dev server (port 8080) |
| `npm run build` | production build |
| `npm test` | vitest — the pricing + escrow maths is tested here |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | eslint |

Run `typecheck` + `test` before pushing.

## The one booking path (important — don't add a second)
There is exactly ONE customer booking flow:

1. Homepage hero → **`CategoryGrid`** quick-book bottom sheet
   (`src/components/household/CategoryGrid.tsx`).
2. → **`create-household-payment-checkout`** edge function: prices the job
   server-side, inserts the booking, dispatches to helpers. **Pay-after-accept**
   — the customer pays only once a helper accepts (no upfront payment).
3. → `dispatch-household-job` → helpers get SMS/push → `accept-job`.
4. → `notify-household-accepted` emails the Stripe Checkout pay link.
5. → helper completes via **`capture-household-payment`**: marks done, writes
   the payout row, fires the Stripe transfer to the helper.

> A second multi-step `/book/:category` flow used to exist; it was deleted.
> The quick sheet is the only path.

## Pricing — single source of truth + the wage rule
- **Frontend canonical prices:** `src/lib/householdPricing.ts`. `CategoryGrid`
  and `PricingTable` both read it — change a price in ONE place.
- **Server-authoritative re-pricing:** `create-household-payment-checkout` →
  `computePriceCents`. Browser can't import the Deno function, so
  `src/lib/__tests__/householdPayMath.test.ts` asserts the two agree.
- **INVARIANT:** every *time-based* rate must net a student ≥ Ireland's minimum
  wage (€14.15/hr, 2026) after the 15% platform cut. That's why cleaning,
  tutoring, garden and moving are all €18/hr (net €15.30/hr). The test fails if
  a rate drops below the floor. *Job-based* flat prices (laundry, bins,
  errands) price the task, not the hour.
- **Vano's take:** 7.5% customer fee + 15% student-side cut ≈ 22.5% of the
  quoted price (`PLATFORM_FEE_BPS = 1500` in `capture-household-payment`).

## The helper funnel (supply side — how sign-up, verification & the blue tick work)
The booking flow only converts if there are trusted helpers to dispatch to,
so this funnel is the second thing that must stay polished. It was audited
end-to-end in July 2026; the model below is deliberate — don't redesign it,
extend it.

**Sign-up → live (pay-to-join):**
1. `/join` (`JoinAsHelper.tsx`) — 3 short steps, minimal by design. Bio,
   availability and areas are deliberately NOT asked here; the dashboard
   collects them later (that's what its "Finish your profile" nudge is for).
   Submits to `create-helper-application` (dupe-guarded: same phone/email
   updates the pending row, never a second one).
2. `/verify-helper` (`VerifyHelper.tsx`) — three gates:
   - **€2 Stripe checkout** (`create-signup-payment` → `confirm-signup-payment`).
     Paying is THE gate to going live — a DB trigger flips pending→approved on
     `signup_paid`. It's a one-off verification fee. **There is no
     subscription** — never call it a plan/membership anywhere.
   - **College-email OTP** (`send-student-email-otp` / `send-student-sms-otp`
     / `verify-student-email-otp`) → `student_email_verified`. SMS path is the
     spam-folder rescue hatch: SMS first, WhatsApp fallback, and the code only
     ever goes to the phone on the helper's own row (never client-supplied).
     Codes: hashed, 10-min TTL, 30s resend gap, 5 attempts, one live code.
   - **Stripe Identity check** (`create-identity-verification`) →
     `id_verified`. Result lands via `stripe-identity-webhook` AND a polling
     backstop (`check-identity-status`) so it works even if the webhook is
     misconfigured. Verified name + DOB are locked to the ID. Sessions cost
     ~€1 — always reuse an in-flight session, never mint on retry.
3. Approval fires `notify-helper-approved` (WhatsApp + email);
   `nudge-helper-onboarding` (hourly cron) chases stalled applications,
   missing payout details and the unfinished badge — capped + stamped, never
   spammy.

**The ✓ Verified blue tick — the invariants:**
- Blue tick ("VANO Verified") = `student_email_verified` AND `id_verified`.
  The €2 alone puts a helper live but does NOT grant any tick.
- The badge's perk is real and must stay real: `dispatch-household-job`
  orders offers by `id_verified` first. If that ordering ever goes, the
  badge is a lie.
- **Never render an ID/verified claim unless the flag is true.** The public
  profile used to say "ID-verified by VANO" for everyone — a false tick
  poisons every real one. Unverified helpers get honest fallbacks
  ("Student helper" / "New").

**Profile editing — three surfaces, one rule set:**
- `StudentDashboard.tsx` profile sheet (needs an auth session) and
  `StudentAccount.tsx` (phone-gated, no auth needed) are the two live
  editors. `/helper/profile` (`HelperProfile.tsx`) is a legacy orphan —
  nothing links to it; retire/redirect it rather than extending it.
- `update-helper-profile` authenticates by the helper's **phone** form
  field — every call MUST send it (the dashboard photo save once didn't,
  and photos silently never saved while the UI said "Saved!").
- The "Jobs I do" picker must always be the shared `SKILL_GROUPS` +
  `toggleGroup`/`toggleSub` from `src/lib/helperSkills.ts` — never a local
  list. Sub-skills only ever ride with their parent group (dispatch matches
  the parent slug; an orphan sub is invisible).
- Changing the email un-verifies it server-side; the badge is re-earned via
  `/verify-helper`.
- Nudge priority in the dashboard: verification card first, then "Finish
  your profile" (bio/availability) — one card at a time, never a stack.

**Open decisions the owner still needs to make (don't silently pick one):**
- **ID-check policy — the big one.** Pay-to-join means an unverified helper
  can work, but marketing still says "ID-verified students" in places
  (HowItWorks, review copy, service pages). Either make the ID check
  mandatory before the FIRST JOB (preferred — Stripe Identity is already
  wired) or sweep the remaining overclaiming copy. The helper public profile
  is already honest; the rest of the site isn't fully.
- **Phone gate hardening**: anyone who knows a helper's number can edit
  their profile via `/student-account`. An SMS OTP at that gate is the
  cheap fix (`send-student-sms-otp` infra already exists).
- **Twilio env check**: `VANO_SMS_ENABLED=true` + `TWILIO_SMS_FROM` etc.
  must be set in Supabase or the "Prefer a text?" OTP path errors
  (gracefully, but the rescue hatch is then closed).
- Badge visuals differ helper-side (blue `BadgeCheck`, email+ID) vs
  customer-side (sage `ShieldCheck` "ID-verified", ID only) — pick one tick
  identity eventually.

## Autopilot (PARKED — not the focus, don't build on it)
The old weekly/monthly subscription. `AutopilotBuilder.tsx` +
`create-autopilot-checkout` still exist but the builder is **not mounted
anywhere** in the customer app, so customers can't reach it — it's
effectively retired. Leave the code as-is (don't rip it out mid-focus), but
don't extend it, cross-sell it, or route to it. All product energy goes to
the one quick-book flow above.

## Payments & escrow
"Vano Pay" Connect/escrow: `VANO_PAY_ESCROW.md`,
`supabase/functions/_shared/vanoPayConfig.ts`, `stripe-webhook`. Household
payouts go out as Stripe Connect transfers; held `pending` until the helper
finishes onboarding, then swept by `release-household-payouts`.

## Map of the important files
| Area | File |
|---|---|
| Homepage | `src/pages/HouseholdHome.tsx`, `components/household/HeroSection.tsx` |
| Booking sheet | `components/household/CategoryGrid.tsx` |
| Prices (frontend) | `src/lib/householdPricing.ts` |
| Prices (server) | `functions/create-household-payment-checkout` |
| Autopilot | `components/household/AutopilotBuilder.tsx`, `functions/create-autopilot-checkout` |
| Completion + payout | `functions/capture-household-payment` |
| Dispatch / accept | `functions/dispatch-household-job`, `functions/accept-job` |
| Live tracking | `src/pages/TrackBooking.tsx` |
| Admin dispatch | `src/pages/HouseholdAdmin.tsx` |
| Helper sign-up | `src/pages/JoinAsHelper.tsx`, `functions/create-helper-application` |
| Helper verification | `src/pages/VerifyHelper.tsx` + OTP/identity/signup-payment functions |
| Helper dashboard | `src/pages/StudentDashboard.tsx` (jobs, earnings, profile sheet) |
| Helper account | `src/pages/StudentAccount.tsx` (phone-gated editor) |
| Helper public profile | `src/pages/HelperPublicProfile.tsx` (customer-facing, badge rules) |
| Skills model | `src/lib/helperSkills.ts` (`SKILL_GROUPS` — the ONE jobs picker) |
| Routes | `src/App.tsx` (every page lazy-loaded) |

## Conventions / gotchas
- **Prices are always recomputed server-side** — client numbers are display only.
- **Edge-function GitHub auto-deploy is DISABLED** — edit, then redeploy manually.
- `design-references/` (30MB) and `.claude/skills/` are **not app code** — design
  reference material, fenced off from the build/tests. Ignore them when reading.
- Two root lockfiles: `package-lock.json` is authoritative (npm);
  `bun.lock`/`bun.lockb` are stale.

## What needs improving (known — not yet done)
- **Dashboard cleanup** — two orphaned edge functions are still deployed and
  should be deleted in the Supabase dashboard: `create-household-booking` (long
  gone from the repo) and `create-plan-checkout` (now retired to a 410 stub —
  see below; safe to delete once no client points at it).
- **Lint debt** — mostly cleared: `npm run lint` is down from 22 errors to 3,
  all in `auth-email-hook` (`any`s left untouched for now). Worth a final pass.
- **Perf** — already healthy (routes lazy-loaded, analytics deferred). No action
  unless first paint regresses.

Recently shipped: the quick-book sheet already has one-tap "use my location"
(`AddressPicker`, with the Eircode/manual field as fallback); the under-min-wage
legacy monthly plans were retired (`create-plan-checkout` → HTTP 410, superseded
by Autopilot); Autopilot away-cover now records the entry method
(lockbox / be-home / smart-lock) in the booking; the helper-flow audit fixes
(dashboard photo save, shared skills picker everywhere, honest badge rendering
on the public profile, verification + finish-your-profile nudges on the
dashboard, subscription copy purged) — see "The helper funnel" above.
