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
(lockbox / be-home / smart-lock) in the booking.
