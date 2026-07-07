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

## The booking lifecycle in detail (status machine + who moves it)
`household_bookings.status`: **pending → accepted → on_way → arrived →
in_progress → completed**, plus `cancelled`. Bookings are born `pending`,
unpaid, `customer_id: null` (customers are anonymous — see auth section) and
dispatch immediately. Three flows can loop a booking back to `pending` with
the helper cleared: helper release ("I can't make it"), the stalled-job
sweep, and the unpaid-release sweep.

- **Accept** is an atomic claim (`update … where student_id IS NULL AND
  status='pending'`) via the signed one-tap link (`accept-job`) or in-app
  (`StudentJobDetail.tsx` `claimJob`).
- **Pay** happens AFTER accept: `notify-household-accepted` creates the
  Stripe Checkout session (job + 7.5% service-fee line, card saved for
  future off-session use), stores the link on the booking and sends it by
  WhatsApp/SMS/email. TrackBooking shows a pay card too — the reliable path
  when messages don't land. `remind-unpaid-bookings` chases, then releases
  the helper (2h) and cancels (6h timeout / 24h sweep).
- **The helper cannot start until `paid_at` is set** (gate in
  StudentJobDetail). On "on my way" the helper's GPS streams to
  `worker_lat/lng` every 15s; TrackBooking renders a live Leaflet map + ETA.
- **Arrival code**: `household-arrival` generates a 4-digit code shown ONLY
  on the customer's screen; the helper types it to flip `in_progress`
  (5-attempt lockout; `start_without_code` fallback notifies customer +
  admin). Never put the code in a push/SMS.
- **Helpers never complete a job.** "I've finished" only sets
  `helper_finished_at`. Completion + payout is the single choke-point
  **`capture-household-payment`** (internal-only, refuses helper JWTs),
  reached three ways: the customer's "mark done" (`complete-household-job`),
  admin (`admin-complete-household-job`), or the 48h auto-confirm in
  `remind-confirm-completion`. It writes the `household_payouts` row FIRST,
  then flips status; customer-confirmed → immediate Stripe transfer,
  auto-confirmed → payout held with `hold_until` (cooling-off) and released
  by the `release-household-payouts` cron.
- **Anonymous customers poll** — TrackBooking refreshes by 5s polling via
  SECURITY-DEFINER RPCs (`get_household_booking`); the realtime
  subscriptions only work for signed-in users. Don't "fix" the polling.
- **Ratings**: `rate-household-booking` (booking-id gated, unique per
  booking, updates the helper's aggregates); `remind-household-rating`
  nudges once at 24h–7d. **Problems**: `report-household-problem` refunds
  automatically only while the helper hasn't been paid; after transfer it
  escalates to admin (no public clawback). **Cancel**: `cancel-household-
  booking` has 3 modes — customer_cancel, helper_release (re-opens +
  re-dispatches), admin_cancel.
- **Custom "name any job"**: `src/lib/customJobs.ts` catalogue + offline
  matcher, optional fail-soft Gemini parse (`parse-custom-job` always
  returns 200; frontend falls back). Priced server-side purely by booked
  time at €18/hr — the AI can never set a price. `custom` dispatches to ALL
  approved helpers.

**Safety nets (don't duplicate — extend these):** `redispatch-stale-jobs`
(expired offers, 3 rounds), `sweep-stalled-jobs` (paid job, helper ghosted:
ping → release+redispatch → escalate), `no-helper-fallback` (unpaid stuck
>2h → refund+cancel), `notify-household-no-helpers` (repeating owner page —
the dead-man's switch), `dispatch-scheduled-jobs` (book-ahead + pre-start
reminder), `remind-confirm-completion` (arrival-stuck alert → confirm nudge
→ admin alert → 48h auto-confirm).

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

## Who has an account (the auth model)
- **Customers have NO accounts — keep it that way.** Booking, tracking,
  finding past bookings and rating are all anonymous: identity is the phone
  number + the booking UUID as capability. "Saved details" is
  `src/lib/bookingMemory.ts` (localStorage, ~6-month TTL). `/bookings` looks
  up by phone via `find-booking-by-phone` (rate-limited); email is optional
  and write-once (`set-booking-email`).
- **Only helpers sign in**, and it's passwordless only: magic link
  (`src/lib/magicLink.ts`) or Google OAuth (hidden on iOS for App Store
  rules; blocked in Instagram/Facebook in-app browsers). `auth-email-hook`
  renders + sends the branded auth emails (Lovable Email API).
- **`link-helper-account`** binds a first-time sign-in to its
  `household_helpers` row by VERIFIED email, race-safely, never reassigning
  a linked row. Called by StudentDashboard on mount. This is the only live
  auth→helper bridge.
- `src/lib/authSession.ts`'s post-login routing tree is mostly LEGACY: only
  the `/student-dashboard` and `/home` branches are mounted; the
  student/business branches route to 404s from the old marketplace (see the
  parked section below). Don't extend that tree — helpers route via
  StudentDashboard/Auth.tsx.

## Money movement & escrow
- **Household fees**: customer pays job price + 7.5% service fee at
  checkout; helper is paid job price − 15% platform cut
  (`PLATFORM_FEE_BPS = 1500` in `capture-household-payment`) → helper nets
  **85%**. ⚠️ Known inconsistency: dispatch offers and the dashboard's
  "you keep" figure still show **95%** — see "needs improving".
- **Household payout ledger**: `household_payouts`, unique per booking,
  written before the status flip. Transfers are Stripe Connect (Separate
  Charges & Transfers). Held payouts (`pending` / `hold_until`) are swept by
  `release-household-payouts` (retries 6× then `failed` + pages owner; also
  runs a 14-day reconciliation backfill for missing payout rows).
- **Refund paths**: customer cancel, `report-household-problem` (only while
  helper unpaid), `no-helper-fallback`, and `stripe-webhook`'s orphan-charge
  guard (payment landing on an already-cancelled booking auto-refunds).
- **"Vano Pay" (`vano_payments`) is the LEGACY freelancer escrow — different
  money, different tables.** 4%/4% fee split, 14-day auto-release
  (`auto-release-held-payments` + `remind-held-payments` crons),
  `VANO_PAY_ESCROW.md` + `_shared/vanoPayConfig.ts` (source of truth — the
  "3%" comment in `release-vano-payment` is stale). Don't conflate it with
  household payouts when editing crons or the webhook.
- `stripe-webhook` is the central webhook (booking payments, `account.
  updated` → `stripe_payouts_enabled`, refunds, €2 signup, legacy subs).
  Stripe surface is raw REST everywhere — no SDK; keep it that way.

## The ops layer — crons & notifications
Cadences live in each function's header comment (wired in the Supabase
scheduler, NOT in the repo). The fleet, roughly by frequency:
`dispatch-scheduled-jobs`, `notify-household-no-helpers`,
`remind-unpaid-bookings` (*/5) · `send-household-progress-emails` (*/10) ·
`redispatch-stale-jobs`, `sweep-stalled-jobs`, `release-household-payouts`,
`remind-confirm-completion` (*/15–30) · `no-helper-fallback` (*/30) ·
`nudge-helper-onboarding`, `remind-household-rating`,
`auto-release-held-payments` (hourly) · `remind-held-payments`,
`household-winback` (daily) · `weekly-digest` (weekly, legacy audience).
All are idempotent via per-row stamps/counters — keep that property when
touching them.

**Channels** (no shared Twilio helper — send logic is inlined per function):
WhatsApp + SMS via Twilio (`TWILIO_WHATSAPP_FROM`; SMS gated on
`VANO_SMS_ENABLED=true` + `TWILIO_SMS_FROM`), email via Resend, web push via
a hand-rolled VAPID/aes128gcm sender (`send-household-push`, service-role
only, keyed to `booking_id` because customers are anonymous). Conventions:
**dispatch hits every pocket channel at once** (push + WhatsApp + SMS,
WhatsApp preferred); **OTPs go SMS-first** (WhatsApp needs opt-in — a cold
number only gets SMS); **admin alerts try WhatsApp and ALWAYS email** (the
"pings silently vanished" lesson). `admin-health` is the owner-only
endpoint that reports channel config + live Twilio/Stripe credential pings
+ funnel gaps — check it before debugging "no notifications".

**`verify_jwt` is false for every function in `supabase/config.toml`** —
auth is enforced INSIDE each function instead (Stripe HMAC signatures,
service-role checks, phone-auth, booking-UUID capability, signed accept
tokens). Never flip `stripe-webhook` to verify_jwt=true; it breaks every
webhook.

## Autopilot (PARKED — not the focus, don't build on it)
The old weekly/monthly subscription. `AutopilotBuilder.tsx` +
`create-autopilot-checkout` still exist but the builder is **not mounted
anywhere** in the customer app, so customers can't reach it — it's
effectively retired. Leave the code as-is (don't rip it out mid-focus), but
don't extend it, cross-sell it, or route to it. All product energy goes to
the one quick-book flow above.

## Legacy freelancer marketplace (PARKED — a whole old product)
Vano used to be a Galway gig/freelancer marketplace (businesses hire
students: AI Find for €1, community listings, direct hire, gig matching,
messaging). **Its frontend is deleted** — no pages, no routes — but the
residue is everywhere and will mislead you:
- **Dead src/lib code**: `authSession.ts` legacy branches (`/choose-account-
  type`, `/complete-profile`, `/business-dashboard`, `/list-on-community`,
  `/profile`, `/students`, `/hire`, `/claim/:token`, `/ai-find-return` — all
  404), `communityCategories.ts`, `googleOAuth.ts`'s profile seeding,
  `useAuthContext`'s `hasListing`.
- **~25 orphaned edge functions** nothing invokes: the AI Find cluster
  (`create-ai-find-checkout`, `ai-find-freelancer`, `ai-find-retry`,
  `notify-scouted-freelancer`), hire cluster (`notify-hire-request`,
  `notify-direct-hire`, `expire-hire-requests`), community listings
  (`notify-community-listing-request`, `send-listing-decision-email`,
  `welcome-freelancer-published`, `improve-community-bio`), gig matching
  (`smart-match-jobs`, `notify-matched-students`, `check-achievements`),
  the `ai-*` freelancer tools, `vano-assistant` (its system prompt still
  describes the old marketplace), `weekly-digest`.
- **Legacy tables**: `community_posts`, `student_profiles`, `jobs`,
  `job_applications`, `hire_requests`, `scouted_freelancers`,
  `vano_payments` (the Vano Pay escrow above), `reviews`, achievements.

Same rule as Autopilot: don't build on any of it, don't rip it out
mid-focus. **NOT legacy** despite living near it: `partner-program`,
`get-referral-code`, `attach-referral-code` (live household
referral/partner features on `/account` and `/join`), and `check-loyalty`
(household loyalty — currently computed inline at checkout instead).

## Platform shell — native apps, PWA, SEO, analytics
- **Native (Capacitor 8)**: `ios/` + `android/` wrap the same `dist/` build
  (`appId com.vanojobs.app`, no remote `server.url` — App Store rule).
  Everything native is additive + dynamically imported:
  `src/lib/native/initNativeApp.ts` (boot: status bar, splash, html
  classes), `initNativeAuth.ts` (deep-link `com.vanojobs.app://auth-callback`
  → PKCE exchange), `src/lib/native/geolocation.ts` (WKWebView can't use
  `navigator.geolocation` — always import THIS bridge, not the browser API).
  `src/lib/platform.ts` `isNativeApp()` is the single gate. Build:
  `npm run native:sync` then Xcode/Studio; store builds via
  `codemagic.yaml`. Docs: `CAPACITOR.md`, `SHIPPING.md`. There is NO native
  push plugin — push is web-push only, and PWA install/update UI is hidden
  inside the native shell.
- **PWA**: `vite-plugin-pwa` injectManifest with `src/sw.ts` (workbox
  precache + web-push handlers; notification URLs are same-origin-forced),
  autoUpdate + `PwaUpdateToast`. Install nudges: `PWAInstallBanner`,
  `IosInstallTip`; `InAppBrowserBanner` + an inline `index.html` script
  handle Instagram/Facebook webviews (OAuth is blocked there).
- **SEO/content**: `npm run build` runs `scripts/prerender-content.ts`
  after Vite — it bakes ~31 static HTML pages (home, /join, services, blog,
  glossary) with JSON-LD + full article text + `dist/llms.txt`, so crawlers
  and AI bots read real content while browsers boot React.
  **Content lives as data** in `src/content/{blog,glossary,services}.ts` —
  one source feeds the React pages, the prerender AND `api/sitemap.xml.ts`.
  Add content there, never as loose pages. Runtime head = `SEOHead`.
  Vercel: prerendered files win over the SPA rewrite (`vercel.json`).
- **Analytics/observability**: PostHog + Sentry are deferred (idle-loaded
  in `src/main.tsx`, env-gated). `src/lib/track.ts` dual-writes events to
  the `analytics_events` table + PostHog — use it, don't call posthog
  directly. Three error-boundary tiers + `lazyWithRetry` (stale-chunk
  auto-recovery; homepage is deliberately eager — keep it that way so the
  prerendered `/` never flashes a fallback).

## Design language (match it, don't fight it)
Warm editorial premium: **cream** background, **navy** hero/footer bands,
**sage** = the one primary action + trust/verified colour, **gold** = the
single accent (ratings, focus halos), `express-orange` for the urgent tier.
Type: Plus Jakarta Sans body, **Bricolage Grotesque only for display
headings** via `.display-xl/.display-lg`. Signature utilities in
`src/index.css`: `.surface-float`/`.tile-float` (edge-lit floating white
cards, navy-tinted shadows), `.eyebrow` (tick + tracked uppercase label
before every section), `.shimmer` skeletons, `.grain`. Motion = Framer
Motion under global `reducedMotion="user"`. New UI should look like it was
always here: navy/cream base, one sage action per card, gold sparingly,
tick-eyebrows, floating cards.

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
| Helper job screen | `src/pages/StudentJobDetail.tsx` (accept→on-way→arrive→finish) |
| Arrival codes | `functions/household-arrival` |
| Customer bookings | `src/pages/MyBookings.tsx` + `functions/find-booking-by-phone` |
| Custom jobs | `src/lib/customJobs.ts` + `functions/parse-custom-job` |
| Central webhook | `functions/stripe-webhook` |
| Content (SEO) | `src/content/*.ts` + `scripts/prerender-content.ts` |
| Ops health | `functions/admin-health` |
| Routes | `src/App.tsx` (every page lazy-loaded except the homepage) |

## Conventions / gotchas
- **Prices are always recomputed server-side** — client numbers are display only.
- **Edge-function GitHub auto-deploy is DISABLED** — edit, then redeploy manually.
- **Customers are anonymous** — no `auth.users` row, no realtime; tracking
  polls. Identity = phone + booking UUID. Don't add an account requirement.
- **Two marketplaces, two pots of money**: household (`household_bookings`/
  `household_payouts`, 7.5%+15% fees) vs legacy Vano Pay (`vano_payments`,
  4%/4%). Similar-sounding functions operate on different tables.
- **Crons are idempotent by per-row stamps** — preserve that when editing.
- All functions run `verify_jwt=false`; auth lives inside each function.
- Stripe is raw REST (no SDK) in every function — match that style.
- `design-references/` (30MB) and `.claude/skills/` are **not app code** — design
  reference material, fenced off from the build/tests. Ignore them when reading.
- Two root lockfiles: `package-lock.json` is authoritative (npm);
  `bun.lock`/`bun.lockb` are stale.

## What needs improving (known — not yet done)
- **Legacy 404 routing**: `authSession.ts` can still route old
  student/business accounts to unmounted routes via Auth.tsx's "Continue
  as" button. Harmless for helpers/customers; tidy when touching auth.
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
dashboard, subscription copy purged) — see "The helper funnel" above; helper
earnings now show the real 85% everywhere (dispatch offers + dashboard were
overpromising 95%); both in-app claim paths (`StudentJobDetail.claimJob`,
`StudentDashboard.acceptJob`) now stamp `accepted_at` so `sweep-stalled-jobs`
catches a ghosting helper regardless of how they accepted; the hero search
bar's pick-a-job moment was de-janked (the price card floats like the
dropdown, so the justify-center hero no longer re-centers and throws the bar
off-screen when it mounts; keyboard drops on pick; the bar always reopens
the list; explicit Change link; calmer one-panel price card; combobox a11y);
phones now get a full-screen search takeover (Uber pattern — the hero bar is
just the door, the input pins above the keyboard, list → price card → the
booking sheet opens over it), suggestion rows show ballpark prices, and both
the takeover AND the booking sheet are portaled to <body> (rendered in place,
the hero's transform stacking context let the fixed nav sit over them).
