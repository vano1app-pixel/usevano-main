# CLAUDE.md — Vano

Same-day home help in Galway: book an ID-verified student for cleaning,
laundry, garden, dog walks, moving or tutoring — or put the house on
**autopilot** (a weekly/monthly plan). React + Vite + TypeScript +
Tailwind/shadcn on the front; Supabase (Postgres + Deno edge functions) on
the back; Stripe for payments; hosted on Vercel.

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

## Autopilot (the flagship subscription)
`src/components/household/AutopilotBuilder.tsx` (UI) +
`supabase/functions/create-autopilot-checkout` (Stripe subscription). Ongoing
(weekly/monthly) or away-cover. Client prices are display-only; the function
recomputes server-side. **No automatic per-visit payout** — admin schedules a
student manually after the welcome ping. Each price assumes a capped visit time
so it clears min wage (cleaning = 90-min refresh, dog = 30-min walk); don't
lengthen scope without re-pricing.

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
- **Address friction** — add a prominent one-tap "use my location" to the
  quick-book sheet, **keeping** the Eircode/manual field as the fallback (for
  when the customer isn't home).
- **Legacy plans** — `create-plan-checkout` (Family / Home-Pass, €80–149/mo)
  still advertises a "weekly 2-hour visit" (€80/mo ≈ €9/hr — under min wage if
  still live). Retire or re-scope.
- **Sourceless edge function** — `create-household-booking` was deleted from the
  repo but is still deployed on Supabase; delete it in the dashboard.
- **Lint debt** — a handful of pre-existing eslint errors in active files
  (`any` / `prefer-const` in `HouseholdAdmin`, `useAuthContext`, a few edge
  functions). Not blocking; worth a pass. Run `npm run lint` to see the list.
- **Perf** — already healthy (routes lazy-loaded, analytics deferred). No action
  unless first paint regresses.
