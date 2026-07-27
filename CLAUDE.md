# CLAUDE.md — Vano

Same-day home help in Galway: book an ID-verified student for cleaning,
laundry, garden or dog walks. React + Vite + TypeScript +
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

## The flows that must NEVER break (owner rule — read before merging)
A real user losing a signup or a booking is the worst thing this codebase
can do. Any change that touches one of these paths must be **driven
end-to-end in a real browser (Playwright) with assertions before merge** —
typecheck + unit tests alone do NOT count as verification:
1. **Customer quick-book**: tiles → booking sheet → checkout submit →
   /track (incl. the failure path: checkout error → WhatsApp rescue).
2. **Helper signup**: `/join` all 3 steps — **including picking a PHOTO** —
   → email code on `/verify-helper` → ID check start.
3. **Helper job day**: accept → on-way → arrival → finish → the gold
   did-you-get-paid card.
4. **The gates**: `/student-account` SMS-code gate and `/bookings` lookup.

Hard-learned specifics (July 2026 — a real applicant hit a black screen):
- **Photo/file inputs are tested with a ≥30MP image, every time.** iPhones
  shoot 48MP; an unbounded image inside a CSS-transformed layer black-screens
  iOS Safari and can crash the tab (which also wipes fresh localStorage
  writes — "it reset everything"). Never render a user image unbounded:
  BOTH photo surfaces (`/join` and `/student-account`, since 2026-07-21)
  DIRECT-SET the picked photo — small object-cover preview only, NO cropper
  overlay anywhere, `safeImage.ts:prepareJoinPhoto` shrinks off-DOM fail-soft.
  `PhotoCropper` is unmounted everywhere (kept in the repo only); don't
  remount it — it dead-ended two real users' photo changes in one week.
  Both surfaces also run `src/lib/photoQuality.ts` first (owner call: "good
  pics only") — REJECTS only positively-junk picks (tiny/blank frame, with a
  friendly message), WARNS-but-accepts dark/blurry ones (amber note), and is
  fail-soft like everything else here: can't measure ⇒ photo goes through.
  Thresholds are calibrated (see module comment) — don't tighten them
  without re-running the calibration.
- **Full-screen overlays must be impossible to render as a dead black
  screen**: every media/async state needs a visible loading beat, an error
  message with a way out, and Cancel always live.
- Mobile Safari is the primary real-world device — test at phone viewports,
  and treat WebKit limits (canvas/layer size, memory) as hard constraints.

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
There is exactly ONE customer booking flow — **DIRECT-PAY since July 2026**
(`booking_data.direct_pay === true`; bookings without the flag are legacy
escrow and complete under the old rules everywhere):

1. Homepage hero → **`CategoryGrid`** quick-book bottom sheet
   (`src/components/household/CategoryGrid.tsx`). Shows the job price ("paid
   to your helper directly — they keep 100%"), the VANO booking fee, and the
   optional €2 Vano Cover checkbox.
2. → **`create-household-payment-checkout`** edge function: prices the job
   server-side, computes the fee (`_shared/vanoFees.ts` — 15% min €4 + €2
   cover if opted), blocks customers with ≥2 unpaid-job strikes, stamps a
   `customer_rep` snapshot, inserts the booking, dispatches. **Pay-after-
   accept** still holds — but what's charged at accept is ONLY Vano's fee.
   **AUTH-AT-BOOKING (July 2026, behind `VANO_AUTH_AT_BOOKING=1`, read only
   here):** when the flag is on (and fee > 0, and the job isn't scheduled
   >5 days out — card holds die at ~7 days), the booking is instead born
   `awaiting_payment` with a Stripe **manual-capture** Checkout session
   (`booking_data.fee_auth_required`) and is NOT dispatched; the customer's
   card is AUTHORIZED (held) for the fee right after booking, and
   `stripe-webhook`'s `handleHouseholdFeeAuthorized` (keyed on
   `metadata.vano_fee_auth`, branching BEFORE the unpaid-guard) flips it to
   `pending` + dispatches. The promise stays literally true: the CHARGE
   still only happens when a helper accepts. Session-create failure
   fail-opens to the classic flow — a booking never dies for a hold.
3. → `dispatch-household-job` → helpers get SMS/push (offers show 100%
   earnings) → `accept-job`.
4. → `notify-household-accepted` — **auth bookings first try to CAPTURE the
   booking-time hold** (idempotency-keyed; success = `paid_at` stamped, "the
   €X you reserved was charged", no pay link, referrals settle); capture
   failure stamps `fee_capture_failed_at` and falls through to the classic
   path: send the Stripe Checkout link for the **fee only** (fee-free
   loyalty/referral bookings skip Stripe — `paid_at` set directly), then
   cancel the dead hold AFTER the new cs_ overwrites the row. The job price
   is NEVER charged to the card: the customer pays the helper directly
   (Revolut tag / cash) when the job's done.
5. → helper finishes; **`capture-household-payment`** still flips status to
   completed (three doors: customer confirm, admin, 48h auto-confirm) but
   for direct-pay writes NO payout row and fires NO transfer. The helper
   confirms they were paid (or reports unpaid) via `household-arrival`'s
   `confirm_paid`/`report_unpaid` actions → `household_customer_ratings`
   (the two-way review; 2 unpaid strikes = phone blocked at checkout).

> A second multi-step `/book/:category` flow used to exist; it was deleted.
> The quick sheet is the only path.

## The WhatsApp door + home memory (a second DOOR, not a second flow)
Customers can also book by texting the Vano WhatsApp number —
`functions/whatsapp-inbound`, the Twilio inbound-message webhook. It is a
front door into the SAME pipeline above: the confirmed draft is POSTed to
`create-household-payment-checkout` exactly as the web sheet does, so server
pricing, the free-text safety screen, loyalty/referral discounts, the
double-submit dedupe and dispatch are all inherited — and the existing
pipeline then carries the conversation on (pay link on accept, progress
messages) in the same thread. Setup + testing guide: `WHATSAPP_VANO.md`.
- **Intake**: Gemini classifies the FIRST message (fail-soft onto the offline
  keyword matcher — same philosophy as `parse-custom-job`); every follow-up
  is parsed deterministically by the pure helpers in `_shared/waIntake.ts`
  through a tiny step machine (size → address → name → confirm) whose draft
  lives in `wa_threads` (30-min TTL). The AI never sets a price — quotes come
  from the shared server price table and any discount is applied by checkout
  (it can only make the real charge lower than the quote).
- **Home memory**: `household_homes` (one row per E.164 phone, service-role
  only) is written FAIL-SOFT by checkout via the `record_home_booking` RPC on
  every booking — web and WhatsApp alike. It powers "welcome back" greetings,
  one-tap saved-address reuse and the "same again" fast path, and it holds
  the WhatsApp opt-out (`wa_opted_out`; STOP/START honoured, opted-out phones
  get silence). Customers still have NO accounts — the phone is the key.
- **Auth**: `verify_jwt=false` (pinned in config.toml); the X-Twilio-Signature
  HMAC is verified inside the function (same trust model as stripe-webhook).
  Commands: STATUS · CANCEL · HELP · STOP · START. Env: `TWILIO_AUTH_TOKEN`
  (required), `GEMINI_API_KEY` (optional — keyword fallback), optional
  `TWILIO_INBOUND_URL` when the signed webhook URL differs from
  `SUPABASE_URL/functions/v1/whatsapp-inbound`.

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
  Stripe Checkout session — **direct-pay: fee_due_cents only** (booking-fee
  line + optional Vano Cover line; fee-free loyalty/referral bookings skip
  Stripe and set `paid_at` directly). Legacy escrow bookings still get the
  old job + 7.5% service-fee session. The link is stored on the booking and
  sent by WhatsApp/SMS/email; TrackBooking shows a pay card too — the
  reliable path when messages don't land. `remind-unpaid-bookings` chases,
  then releases the helper (2h) and cancels (6h timeout / 24h sweep).
- **The helper cannot start until `paid_at` is set** (gate in
  StudentJobDetail). On "on my way" the helper's GPS streams to
  `worker_lat/lng` every 15s; TrackBooking renders a live Leaflet map + ETA.
- **Arrival code**: `household-arrival` generates a 4-digit code shown ONLY
  on the customer's screen; the helper types it to flip `in_progress`
  (5-attempt lockout; `start_without_code` fallback notifies customer +
  admin). Never put the code in a push/SMS.
- **Helpers never complete a job.** "I've finished" only sets
  `helper_finished_at`. Completion is the single choke-point
  **`capture-household-payment`** (internal-only, refuses helper JWTs),
  reached three ways: the customer's "mark done" (`complete-household-job`),
  admin (`admin-complete-household-job`), or the 48h auto-confirm in
  `remind-confirm-completion`. **Direct-pay: it only flips status** (no
  payout row, no transfer — the customer pays the helper directly; the
  completion email nudges them to settle up). Legacy escrow: writes the
  `household_payouts` row FIRST, then flips; customer-confirmed → immediate
  Stripe transfer, auto-confirmed → payout held with `hold_until` and
  released by the `release-household-payouts` cron.
- **Did-you-get-paid (direct-pay only):** after finishing, StudentJobDetail
  shows the gold "Did {customer} pay you €X?" card → `household-arrival`
  `confirm_paid` (optional 1–5 stars) or `report_unpaid` (two-tap; alerts
  admin). Upserts `household_customer_ratings` (unique per booking,
  service-role only); `paid=false` rows are strikes — **≥2 strikes blocks
  the phone at checkout** (owner can clear rows to unblock). Checkout stamps
  a `customer_rep` snapshot into booking_data so dispatch offers show "Pays
  promptly · N jobs · ★X" / "⚠ N unpaid reports" before a helper accepts.
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

**Gap-recruit nudges (supply follows demand):** when a fresh dispatch lands
in thin city coverage (<5 matching helpers, or zero → platform-wide
expansion), `dispatch-household-job` texts up to 5 available same-city
helpers who *don't* have the category — "a €X job just skipped you, add it
in 10 seconds" — linking `/student-account?add=<cat>`, which pre-ticks the
group behind the phone gate (the helper still taps Save; a URL param never
writes silently). One nudge per helper per 7 days across ALL categories
(`gap_nudged_at`, stamped before sending), never on quiet re-dispatch
rounds or the `custom` catch-all.

## Pricing — single source of truth + the wage rule
- **Frontend canonical prices:** `src/lib/householdPricing.ts`. `CategoryGrid`
  and `PricingTable` both read it — change a price in ONE place.
- **Server-authoritative re-pricing:** `computePriceCents` lives in
  `functions/_shared/householdPricing.ts` (extracted from
  `create-household-payment-checkout`, which imports it — as does
  `whatsapp-inbound`, so the WhatsApp door quotes exactly what checkout
  charges). The module is pure TS, so
  `src/lib/__tests__/homeMemoryWhatsapp.test.ts` imports it DIRECTLY and
  cross-checks it against the frontend table; `householdPayMath.test.ts`
  keeps the hardcoded wage-floor contract.
- **Fee maths (direct-pay):** `functions/_shared/vanoFees.ts` is the single
  source — `VANO_FEE_BPS=1500` (15% of job price), `VANO_FEE_MIN_CENTS=400`
  (€4 floor), `VANO_COVER_CENTS=200` (€2 opt-in),
  `UNPAID_STRIKE_BLOCK_THRESHOLD=2`. Mirrored in `src/lib/householdPricing.ts`
  for sheet display; `householdPayMath.test.ts` locks the two in step.
- **INVARIANT:** every *time-based* rate must net a student ≥ Ireland's minimum
  wage (€14.15/hr, 2026). Direct-pay makes this trivial — helpers keep 100%
  (€18/hr on cleaning, garden, custom; moving/tutoring parked but tabled) — but the test still fails
  if a rate ever drops below the floor. *Job-based* flat prices (laundry,
  bins, errands) price the task, not the hour.
- **`business` (owner test 2026-07-23 → tile PARKED 2026-07-24):** temp
  staff for shops/brands (flyer runs, sampling, busking/live music for pubs,
  events, shop cover — a wide scrollable list, all licence-free work) at a
  PREMIUM **€22/hr, 2-hour minimum** (both tables return null for '1 hour' —
  keep them agreeing). **The NAVY 6th tile is now PARKED** (owner call
  2026-07-24: households only). Like `CUSTOM_TILE`, the machinery
  stays in CategoryGrid (category entry + sub-picker) so old deep links and
  in-flight bookings keep working; both pricing tables keep their `business`
  entries so the lock-step tests hold. Don't remount without the owner.
  Dispatches like `custom` (catch-all to ALL id_verified helpers — not a
  join-form skill; gap nudges auto-skip); the sheet's business sub-picks
  carry their label into note+extra_label (SubService `carry`) so offers/job
  screens name the real task.
- **Laundry prices per BAG since 2026-07-24** — **€30/€50/€65 for 1/2/3
  bags** (`LAUNDRY_BAG_CENTS`, mirrored in the server table; a
  missing/unknown size falls back to the 1-bag €30 so WhatsApp drafts,
  memory rebooks and old links keep pricing).
- **`moving` (PARKED 2026-07-24, same day — liability triage):** heavy items
  + other people's valuables with no goods-in-transit or injury cover is the
  same risk class that retired `midnight-lift` and `plumbing`, and moving is
  the one non-recurring category. **The grid is FOUR white tiles** (Cleaning
  top-left with the crown, then Pets / Garden, Laundry — 2×2 on phones, one
  row of four on desktop; owner call 2026-07-24: most-booked takes the
  strongest slot). All
  machinery kept (CATEGORIES entry, SUB_SERVICES, BUILDER_TASKS.moving, both
  pricing tables) for old deep links + in-flight bookings; the
  `moving-help-galway` service landing + blog post moved to
  PARKED_SERVICE_LANDINGS / PARKED_BLOG_POSTS (out of sitemap/prerender;
  the old service URL redirects home) and every content enumeration swept.
  Small carries still book via the `custom` catalogue at €18/hr (tip runs,
  a few boxes); the WhatsApp doors still accept moving asks — owner policy:
  small carries only, no furniture/full moves. Don't remount without the
  owner.
- **Vano's take (direct-pay):** ONLY the booking fee — 15% of the job price,
  min €4, charged to the customer's card at accept (+ €2 Cover if opted).
  Nothing is taken from the helper. Discounts (loyalty every-3rd = fee
  waived; referral €5) apply to the FEE only — never the job price, which
  isn't Vano's money. The old 10% book-ahead price cut is gone.
- **Legacy escrow take** (bookings without `direct_pay`): 7.5% customer fee
  + 15% student-side cut (`PLATFORM_FEE_BPS = 1500` in
  `capture-household-payment`) — kept only so in-flight bookings complete.

## The helper funnel (supply side — how sign-up, verification & the blue tick work)
The booking flow only converts if there are trusted helpers to dispatch to,
so this funnel is the second thing that must stay polished. It was audited
end-to-end in July 2026; the model below is deliberate — don't redesign it,
extend it.

**Sign-up → live (FREE-to-join, since July 2026):**
1. `/join` (`JoinAsHelper.tsx`) — 3 short steps, minimal by design. Bio,
   availability and areas are deliberately NOT asked here; the dashboard
   collects them later (that's what its "Finish your profile" nudge is for).
   The jobs picker is **opt-OUT**: the no-skill commodity groups (cleaning,
   laundry, errands, moving, dog walks — `defaultOn` in `helperSkills.ts`)
   start ticked; gear/skill-gated ones (garden, handyman, tutoring) stay
   opt-in. Students untick far more readily than they tick, so this keeps
   supply wide where demand is. Join form ONLY — the account/dashboard
   editors always load the helper's saved picks.
   Submits to `create-helper-application` (dupe-guarded: same phone/email
   updates the existing row, never a second one).
2. **Applying = approved; the email code makes you live.** (Spam gate, July
   2026.) `create-helper-application` inserts the row as `status 'approved'`
   but `is_available false` with `application_data.pending_email_verify`;
   the email OTP on `/verify-helper` (its step 1, where the client lands
   right after joining) flips `is_available` true, clears the flag and fires
   `notify-helper-approved` — so welcome messages and the public helper
   count only ever include signups with a real inbox. Job offers are gated
   further behind the free ID check (dispatch only texts `id_verified`
   helpers). There is NO payment gate to join.
   (The old pay-to-join €2 one-off — `create-signup-payment` /
   `confirm-signup-payment` / the `signup_paid` DB trigger — is retired but
   still deployed for stragglers with old links; don't build on it.)
3. `/verify-helper` (`VerifyHelper.tsx`) — earns the ✓ tick, three steps:
   - **College-email OTP** (`send-student-email-otp` / `send-student-sms-otp`
     / `verify-student-email-otp`) → `student_email_verified`. Free. SMS path
     is the spam-folder rescue hatch: SMS first, WhatsApp fallback, code only
     ever goes to the phone on the helper's own row (never client-supplied).
     Codes: hashed, 10-min TTL, 30s resend gap, 5 attempts, one live code.
   - **Stripe Identity check** (`create-identity-verification`) →
     `id_verified`. Free to the helper. Result lands via
     `stripe-identity-webhook` AND a polling backstop
     (`check-identity-status`). Verified name + DOB are locked to the ID.
     Sessions cost ~€1 — always reuse an in-flight session.
   - **€2/month Verified plan** (`create-verified-plan` →
     `confirm-verified-plan`; Stripe subscription) → `verified_plan_active`.
     ONLY offered once both free checks pass (enforced server-side — nobody
     may pay for a tick that can't render). Cancel-anytime is part of the
     deal: `cancel-verified-plan` (phone-authed, cancels at period end);
     `stripe-webhook` handles activation backstop + subscription-deleted.
4. `nudge-helper-onboarding` (hourly cron) chases payout onboarding and the
   two FREE checks — it never SMS-pushes the paid plan (spam smell).

**The ✓ Verified blue tick — the invariants:**
- Blue tick ("VANO Verified") = the DB generated column **`vano_verified`**
  = `student_email_verified` AND `id_verified` AND `verified_plan_active`.
  One definition, in the database — frontends read it or recompute the same
  three flags, never a subset.
- The tick's perk is real and must stay real: `dispatch-household-job`
  orders offers by `vano_verified` first. If that ordering ever goes, the
  €2/month is buying a lie.
- **"ID-verified" claims stay keyed on `id_verified` alone** (they're true
  regardless of payment); the BLUE TICK is the paid thing. Never render
  either unless its flag is true. The hero's live "helpers online" pill
  (`useHelperCount`) counts ONLY the dispatchable pool — approved +
  available + `id_verified` — never raw signups (2026-07-23: raw count
  said 20 while only 8 could take a job).
- NO grandfather: the owner chose one deal for everyone — old one-off-€2
  payers also verify + pay €2/month for the tick (their flags were reset
  2026-07-07). cancel-verified-plan still handles a plan row with no Stripe
  sub (`verified_plan_sub_id` null) by flipping the flag directly — keep
  that as the safety net for manually-comped ticks.
- `household-helper-connect-link` (payout onboarding) has TWO auth paths:
  JWT (dashboard) and helper_id+phone+`account_token` (the /student-account
  page, post-SMS-code); its gateway verify_jwt is false and auth lives in
  the body.

**Profile editing — two surfaces, one rule set:**
- `StudentDashboard.tsx` profile sheet (needs an auth session) and
  `StudentAccount.tsx` (phone+SMS-code gated, no auth needed) are the two
  live editors. `/helper/profile` was the legacy orphan editor — deleted
  July 2026; the route redirects to `/student-account`.
- `update-helper-profile` locates the row by the **phone** form field —
  every call MUST send it (the dashboard photo save once didn't, and
  photos silently never saved while the UI said "Saved!") — and since the
  phone-gate hardening ALSO requires `account_token` (the account page's
  code-verified session) or a linked user JWT (the dashboard path).
- The "Jobs I do" picker must always be the shared `SKILL_GROUPS` +
  `toggleGroup`/`toggleSub` from `src/lib/helperSkills.ts` — never a local
  list. Sub-skills only ever ride with their parent group (dispatch matches
  the parent slug; an orphan sub is invisible).
- Changing the email un-verifies it server-side; the badge is re-earned via
  `/verify-helper`.
- Nudge priority in the dashboard: verification card first, then "Finish
  your profile" (bio/availability) — one card at a time, never a stack.

**Decided + shipped (July 2026) — the former open decisions:**
- ~~ID-check policy~~ — **mandatory before the FIRST JOB, enforced.**
  `dispatch-household-job` only offers to `id_verified` helpers (city pool,
  platform-wide fallback AND the gap-recruit nudge all filter on it),
  `accept-job` re-checks `status='approved' AND id_verified` server-side
  before the atomic claim, and both in-app claim paths
  (`StudentJobDetail.claimJob`, `StudentDashboard.acceptJob`) gate with a
  verify CTA (`=== false` on purpose — null means the row hasn't loaded).
  "ID-verified students" marketing is therefore literally true for anyone
  who can work. `/verify-helper` + `notify-helper-approved` +
  `nudge-helper-onboarding` all frame the ID check as the job unlock.
- ~~Free signup spam filter~~ — **email OTP before going live** (see
  "Sign-up → live" step 2 above): applications are born unavailable with
  `pending_email_verify`; the first verified email code flips them live and
  sends the welcome, so junk signups never inflate the public helper count
  and never get welcome messages.
- ~~Phone gate hardening~~ — **SMS OTP + signed account session.**
  `/student-account` now texts a 6-digit code to the number ON the helper's
  row (`student-account-otp`: send/verify, rate-limited, codes in
  `helper_email_otps` under an `acct:` prefix + distinct hash salt so the
  email-verify flow can't collide) and mints a 30-minute HMAC
  `account_token` (`_shared/accountToken.ts`, same secret as accept links).
  EVERY phone-authed function now requires it: `find-helper-by-phone` (the
  profile read), `update-helper-profile` (which alternatively accepts a
  linked user JWT — the dashboard's photo save sends its session token),
  `household-helper-connect-link` (phone path), `cancel-verified-plan`,
  `cancel-helper-subscription`, `disconnect-helper-payouts`,
  `delete-helper-account`. Knowing a number no longer reads or edits
  anything. **Remember-this-device (2026-07-21):** verify also mints a
  month-long `device_token` (same HMAC family — TTL is baked into the
  token's `e`, `DEVICE_TOKEN_TTL_SECONDS`); the page keeps the session in
  localStorage (`vano_account_gate_v2`) and silently falls from the lapsed
  30-min token to the device token, so one code trusts the phone for a
  month. Any 401 (or the "Log out on this device" link at the page foot)
  clears it back to the code step.

**Open decisions the owner still needs to make (don't silently pick one):**
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
- **DIRECT-PAY (all new bookings, `booking_data.direct_pay`)**: Vano's card
  charge = booking fee (15% min €4) + optional €2 Cover, nothing else. The
  job price moves customer→helper directly (Revolut tag on the helper row —
  `payment_handle`, editable via `update-helper-profile` + both profile
  editors; TrackBooking's pay card + the completion email deep-link the
  Revolut request-link shape `revolut.me/<tag>/<amount>` so the app opens
  with recipient AND amount pre-filled — owner-verify note in the code; the
  tag sanitizer accepts @tag / bare tag / pasted URL, never an IBAN). Helper
  keeps 100%.
- **The shared money-release rule** is `_shared/bookingMoney.ts`
  (`resolveMoneyAction`: paid+pi_→refund · unpaid+pi_→cancel the hold
  (uncaptured PIs cannot be refunded) · cs_→expire session; executor has
  idempotency keys + "already captured"→refund cross-fallback). ALL cancel
  paths use it (customer/admin cancel, no-helper-fallback, the 24h unpaid
  sweep, the webhook's orphan guards). THE ONE EXCEPTION: **helper release
  keeps an uncaptured hold ALIVE** (cs_-expiry only, in
  cancel-household-booking helper_release AND remind-unpaid-bookings' 2h
  release) — the booking returns to `pending` and the NEXT acceptor's
  capture uses the same hold. `booking_data` stamps: `fee_authorized_at`,
  `fee_auth_canceled_at`, `fee_capture_failed_at`/`fee_capture_fail_reason`.
  `payment_requested_at` remains STRICTLY the post-accept pay-link clock —
  never set at booking, or remind-unpaid's 2h/6h clocks misfire.
  NO payout row, NO transfer, NO Stripe Connect requirement for new helpers.
  `household_customer_ratings` is the two-way review + unpaid-strike ledger.
- **Legacy escrow (bookings without the flag)**: customer paid job price +
  7.5% service fee; helper is paid job price − 15% platform cut
  (`PLATFORM_FEE_BPS = 1500` in `capture-household-payment`) → nets 85%.
- **Household payout ledger (legacy only)**: `household_payouts`, unique per
  booking, written before the status flip. Transfers are Stripe Connect
  (Separate Charges & Transfers). Held payouts (`pending` / `hold_until`)
  swept by `release-household-payouts` (retries 6× then `failed` + pages
  owner; also runs a 14-day reconciliation backfill). Direct-pay bookings
  never create rows, so these crons go naturally idle. The dashboard's
  `HouseholdHelperVanoPayCard` hides itself unless legacy traces exist.
- **Refund paths** (refunds always refund whatever WAS charged — under
  direct-pay that's just the fee): customer cancel,
  `report-household-problem` (only while helper unpaid),
  `no-helper-fallback`, and `stripe-webhook`'s orphan-charge guard (payment
  landing on an already-cancelled booking auto-refunds).
- **"Vano Pay" (`vano_payments`) was the LEGACY freelancer escrow — DELETED
  July 2026.** The table was empty, so the whole function fleet
  (checkout/release/refund/auto-release/reminders/config/connect-link) was
  removed from repo + remote and its two crons unscheduled. What remains:
  the empty `vano_payments` table, `stripe-webhook`'s legacy branch (which
  imports `_shared/vanoPayConfig.ts` — kept for that reason), and
  `VANO_PAY_ESCROW.md` for history. Don't rebuild on any of it.
- `stripe-webhook` is the central webhook (booking payments, the
  AUTH-AT-BOOKING flow — `handleHouseholdFeeAuthorized` on
  `checkout.session.completed` with `payment_status:'unpaid'` +
  `metadata.vano_fee_auth`, a `checkout.session.expired` branch that
  quiet-cancels abandoned awaiting_payment rows (the event MUST stay enabled
  on the Stripe endpoint), a `charge.refunded` guard ignoring
  `captured:false` (hold releases must not cancel live bookings) —
  `account.updated` → `stripe_payouts_enabled`, refunds, €2 signup, legacy
  subs). Stripe surface is raw REST everywhere — no SDK; keep it that way.

## The ops layer — crons & notifications
Cadences live in each function's header comment (wired in the Supabase
scheduler, NOT in the repo). The fleet, roughly by frequency:
`dispatch-scheduled-jobs`, `notify-household-no-helpers`,
`remind-unpaid-bookings` (*/5) · `send-household-progress-emails` (*/10) ·
`redispatch-stale-jobs`, `sweep-stalled-jobs`, `release-household-payouts`,
`remind-confirm-completion` (*/15–30) · `no-helper-fallback` (*/30) ·
`nudge-helper-onboarding`, `remind-household-rating`,
`notify-partner-commissions` (hourly) ·
`household-winback` (daily). (The legacy Vano Pay crons and `weekly-digest`
were deleted + unscheduled in the July 2026 cleanup.)
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

## Legacy freelancer marketplace (DELETED backend, dead frontend residue)
Vano used to be a Galway gig/freelancer marketplace (businesses hire
students: AI Find for €1, community listings, direct hire, gig matching,
messaging). **Its frontend is deleted** — no pages, no routes — and in the
**July 2026 cleanup its ~25 orphaned edge functions were deleted too**
(repo + remote: the AI Find cluster, hire cluster, community listings,
gig matching, the `ai-*` freelancer tools, `vano-assistant`,
`weekly-digest`, marketplace messaging — plus the Vano Pay escrow fleet
and the retired pay-to-join/monthly-plan checkouts). The remote deletion
lives in the **RETIRED prune list in `.github/workflows/
supabase-deploy.yml`** — to retire a function: delete its dir AND add its
slug there (the workflow deletes it from Supabase before deploying; the
function cap that once blocked deploys is why). What still remains:
- **Dead src/lib code**: `authSession.ts` legacy branches (`/choose-account-
  type`, `/complete-profile`, `/business-dashboard`, `/list-on-community`,
  `/profile`, `/students`, `/hire`, `/claim/:token`, `/ai-find-return` — all
  404), `communityCategories.ts`, `googleOAuth.ts`'s profile seeding,
  `useAuthContext`'s `hasListing`.
- **Legacy tables** (data kept — never drop without the owner): 
  `community_posts`, `student_profiles`, `jobs`, `job_applications`,
  `hire_requests`, `scouted_freelancers`, `vano_payments` (empty), 
  `reviews`, achievements.
- `stripe-webhook`'s legacy branches (AI-find / Vano Pay / signup-fee
  events) — harmless, only fire on events that can no longer be created.
- `confirm-signup-payment` stays deployed: VerifyHelper still resolves old
  €2 pay-to-join return links through it.

**NOT legacy** despite living near it: `partner-program`,
`get-referral-code`, `attach-referral-code` (live household
referral/partner features on `/account` and `/join`), and `check-loyalty`
(household loyalty — currently computed inline at checkout instead).
**Partner commissions under direct-pay (July 2026):** the original accrual
trigger fired on `household_payouts` inserts, which direct-pay never writes
— migration `20260720120000` added `trg_accrue_referral_commission_direct_pay`
(fires on the booking's completed flip, direct-pay only; both triggers dedup
on a unique `booking_id` index so a booking can never accrue twice).
`partner-program` returns tracker extras (`link_opens`, `this_month_cents`,
`active_helpers`, `recent[]` — first names + categories only) and
`PartnerProgramCard` renders them as a dashboard (code + share up TOP, then
earnings + a funnel: opens → joined → jobs). **Link-open tracking
(2026-07-21):** `/join?ref=CODE` fires `track-referral-open` once per device
(`src/lib/visitorId.ts` key; module-set + localStorage + server unique index
all dedupe), which upserts `referral_code_visits (code_id, visitor_key)` —
so the tracker shows the top of the funnel ("people opened your link"), not
just signups. **The referral hub is a tap-in:** `ReferralEntryCard` (a
compact "Refer & earn 3%" row, like the Helper-account row) sits on `/account`
and on `/student-account` (helper edition passes their email so the hub loads
with zero typing) and opens `/refer` — the focused page that renders the
card + a funnel legend. `/partners` stays the cold recruiter landing.
`notify-partner-commissions` (hourly cron) emails partners a "you just
earned €X" digest, idempotent via `referral_commissions.notified_at`
(stamped BEFORE sending). **Commission accrues only for the referred
helper's FIRST YEAR** (12 months from the attribution's `created_at`,
enforced inside BOTH accrual triggers — migration `20260723100000`; the
attribution itself stays lifetime so the funnel's "Joined" count never
shrinks, and every partner surface says "first year"). The code now rides
IN the `create-helper-application` payload (`referred_by_code`, first code
wins) so attribution lands atomically with the signup;
`attach-referral-code` remains as the awaited post-submit backstop. The
customer `?ref=` capture (Give €5) skips `/join`, where `?ref` is a
partner code. Payouts to partners remain MANUAL — the status
flag is the ledger; there is no automated transfer. The owner settles up
from the admin payouts tab: `admin-partner-payouts` (JWT + `user_roles`
admin check inside, like admin-complete-household-job) lists who's owed
what and "Mark €X paid" flips the pending rows (snapshot-then-update +
an `expected_cents` guard so a stale screen can't over-mark). Commission is 3%
(300 bps, owner call 2026-07-20: at 5% a €36 clean netted Vano under the
€4/job floor). **The customer Give €5 Get €5 loop is PARKED as a
promotion** (owner call, same day — the 3% partner programme is THE
promoted growth loop): `ReferralShareCard` is unmounted from /account
and /track, but the checkout welcome/redeem logic, the hero
`ReferralWelcomeBanner` and `get-referral-code` all stay live so
already-shared links and earned credits keep their promise. Don't
remount the card without the owner.

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
| Job builder | `src/lib/jobBuilder.ts` (tick-tasks → size label; SIZING_QUESTIONS one-tap wizard; display-only market anchor) |
| WhatsApp door | `functions/whatsapp-inbound` + `functions/_shared/waIntake.ts` |
| Server price table | `functions/_shared/householdPricing.ts` (checkout + WhatsApp import it) |
| Home memory | `household_homes` + `record_home_booking` RPC (migration `20260713000000`) |
| Central webhook | `functions/stripe-webhook` |
| Content (SEO) | `src/content/*.ts` + `scripts/prerender-content.ts` |
| Ops health | `functions/admin-health` |
| Routes | `src/App.tsx` (every page lazy-loaded except the homepage) |

## Conventions / gotchas
- **Prices are always recomputed server-side** — client numbers are display only.
- **Edge functions auto-deploy on merge to main** (`.github/workflows/
  supabase-deploy.yml` deploys EVERY function via the CLI; `verify_jwt` is
  pinned per-function in `supabase/config.toml`, so keep new functions
  pinned there or the deploy defaults them to true).
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
- One lockfile: `package-lock.json` (npm). The stale bun locks were deleted
  in the July 2026 cleanup — don't reintroduce them.

## What needs improving (known — not yet done)
- ~~Legacy 404 routing~~ — done July 2026: the post-auth resolvers in
  `authSession.ts` now discard the deleted marketplace's return stashes
  (claim / talent board / AI-Find) instead of routing to their 404 pages;
  every post-auth branch lands on a mounted route.
- ~~Dashboard cleanup~~ — done July 2026: all orphaned/legacy functions are
  deleted remotely by the RETIRED prune list in the deploy workflow.
- ~~Lint debt~~ — cleared: `npm run lint` reports 0 errors (4 benign
  warnings: shadcn fast-refresh notes + a hook-deps note in the legacy
  `useAuthContext`).
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
the hero's transform stacking context let the fixed nav sit over them);
supply-matching round one: the join form's jobs picker went opt-out (the
commodity groups start pre-ticked) and dispatch now sends gap-recruit nudges
when a category is thin in a city — see "The helper funnel" and "Gap-recruit
nudges" above (migration: `gap_nudged_at`); the join form now collects a
**date of birth** (18+ gated client- AND server-side in
`create-helper-application`, which derives `age` from it so the profile age
badge fills); **photo on /join is DIRECT-SET (2026-07-16, don't re-add a
cropper there)** — a real applicant's iPhone 16 black-screened on the
full-screen `PhotoCropper` overlay mid-signup, so the join form went back to
the pre-#324 flow (pick → photo set instantly → small bounded preview) with
`src/lib/safeImage.ts:prepareJoinPhoto` shrinking big shots off-DOM as a
FAIL-SOFT optimisation (any failure = the original file uploads, exactly the
old behaviour — a photo pick can never block a signup; preview `onError`
recovers visibly). **2026-07-21: `StudentAccount` went direct-set too** — a
real helper's account-page photo change silently produced a photo-less save
(200, no storage object) while his signup photo uploaded fine minutes
earlier, so the cropper came off the account page as well; `PhotoCropper`
(hardened: probe-first measure, decode-time resize, no `decode()` — Safari
rejects it for big photos —, visible fail card, 20s watchdog) is now
mounted NOWHERE — kept in the repo but don't remount it; step 2 now also captures a
rough **area** (optional free text → `areas_served`, for nearest-job
matching) and **how they get around** (multi-select → `application_data.
transport`; car = the moving/tip-run/wider-radius signal dispatch can later
weight on) — both wired through the existing `create-helper-application`
fields, no migration; signup smoothness pass: the form **autosaves a draft**
to localStorage (all fields + the cropped photo as a data URL, 7-day TTL,
cleared on submit, "welcome back" note on resume), the two consent boxes
merged into ONE tap (all three consent flags stored from it), a SOFT
personal-email warning (gmail/hotmail/etc can never pass the student check —
flag it at typing time, never block), and a "takes about a minute" hint on
step 1; verification-resume fix: anon was never granted
`student_email_verified`/`identity_status`, so the column-level read that
restores progress on `/verify-helper` (and gates the account page's
Get-Verified card) failed WHOLE-QUERY and every stage looked reset on
return (migration `20260708020000` grants them) — plus VerifyHelper now
caches completed stages per helper in localStorage (upgrade-only, instant
ticks even on a failed fetch) and persists the mid-OTP "code sent" state
(10-min TTL matching the code) so a reload keeps the code box open.

**The DIRECT-PAY pivot (July 2026, the big one — see "The one booking path"
and "Money movement" above):** Vano stopped holding job money entirely to
stay clear of payment-intermediary exposure. Card charge at accept =
booking fee (15% min €4, `_shared/vanoFees.ts`) + optional €2 Vano Cover
(now an opt-in checkbox in the sheet, no longer bundled); customers pay
helpers directly (Revolut `payment_handle` / cash) and helpers keep 100%
(dispatch offers, dashboard earnings, JoinAsHelper, blog/glossary/service
content all updated); two-way reviews via `household_customer_ratings`
(helper confirms paid / reports unpaid on the job screen, optional stars;
≥2 unpaid strikes auto-block the phone at checkout, `customer_rep` snapshot
shown on offers); loyalty (every 3rd fee free) + referral (€5 off the fee)
now discount ONLY the fee, and the 10% book-ahead price cut is gone;
migration `20260715000000` (payment_handle + household_customer_ratings);
everything branches on `booking_data.direct_pay` so in-flight escrow
bookings finish under the old rules, and the payout card/crons go
naturally idle rather than being ripped out.

**Fee AUTH-AT-BOOKING (July 2026, behind `VANO_AUTH_AT_BOOKING=1` — see "The
one booking path" step 2 and "Money movement"):** the fee is now RESERVED
(Stripe manual-capture hold) at booking and CAPTURED at accept, so every
dispatched job is already card-committed and helpers stop being burned by
never-paying customers — while "you're only charged when a helper accepts"
stays literally true. Born `awaiting_payment` → webhook auth → `pending` +
dispatch; capture at accept in `notify-household-accepted` (failure degrades
to the old pay link, never a lost job); every cancel path releases the hold
via `_shared/bookingMoney.ts` EXCEPT helper release, where the hold survives
for the replacement acceptor; `remind-unpaid-bookings` grew a 75-min
abandoned-checkout sweep (webhook-expiry backstop). Frontend: the sheet's
"Securing…" handoff beat + "only charged when a helper accepts" copy,
TrackBooking's `?authorized=true` banner, awaiting_payment "finish securing"
card + free-cancel copy, `bookingLabels` "Securing booking…". The WhatsApp
door sends the secure link and STATUS knows the state. Flag off = classic
flow (data-driven branches keep in-flight holds working). Rollout: enable
`checkout.session.expired` on the Stripe endpoint, then set the flag; test
cards first. Also shipped alongside: the Revolut-first pay-the-helper card
(one-tap `revolut.me/<tag>/<amount>` prefilled link, huge amount, copy
chips, desktop QR via lazy `qrcode` dep, cash as quiet secondary) mirrored
into the completion email.

**The tick-box job builder (2026-07-24, owner pick — "tap the boxes and
watch the price build"):** cleaning / garden's wizard page 1 is now
tick-the-tasks (`src/lib/jobBuilder.ts` + the builder branch in
CategoryGrid's pick page; `BUILDER_TASKS.moving` exists but is unreachable
since the moving tile was parked the same day). Each task carries an honest ~minutes estimate;
ticks sum and round UP in **HALF-HOUR billing steps** (owner call
2026-07-27: with whole-hour rounding, 2 ticks and 3 ticks kept costing the
same — every tick must move the price; floor 1 hour, cap at the category
max) to a computed size label ('1.5 hours'…) that BOTH price tables carry,
and checkout still receives only category + size — the server prices €18/hr
exactly as before. The Change-panel duration chips inject a non-standard
half-hour size so the selection stays visible. **The builder can never
invent a price**: `jobBuilder.test.ts` locks every possible tick
combination to a priceable half-hour label within the category cap and
keeps the display-only "typical Galway rate" anchors above €18/hr so "you
save ~€X" can never read negative. The ticked list rides
note + extra_label (the SubService `carry` contract) so dispatch offers and
the helper job screen name the real tasks, and the form header quotes them.
`builder_continue` is the funnel event between tile tap and submit. Laundry
+ Pets keep the classic picker; the builder categories' SUB_SERVICES rows
are unreachable-but-kept. Shipped the same day: Business tile parked (the
grid is FIVE white tiles — 3+2 centered on phones, one row of five on
desktop) and the "book your usual" card shrunk to a compact one-line chip.
Verified per the owner rule with a real-browser Playwright drive: tiles →
builder ticks → form → submit, with the checkout POST intercepted and its
payload asserted (category/size/note) so no real booking is created.

**The one-tap sizing question (2026-07-27, owner ask — "after they choose
the category, ask one small question so the price is fairest for the
students and the households"):** `SIZING_QUESTIONS` in `src/lib/jobBuilder.ts`
+ the `ask` phase of CategoryGrid's pick page. ONE question per category,
one tap, and the same invariant as the tick boxes — **an answer can never
invent a price** (three shapes only, locked by jobBuilder.test.ts):
- **Cleaning/Garden ask FIRST** ("Roughly how big is your place / the
  garden?"): the answer's `factor` scales the tick-task MINUTES (estimates
  are calibrated to the middle answer, factors ascend small→large), so the
  total still rounds onto an EXISTING half-hour label and the server prices
  it exactly as before — every tick-combo × factor is enumerated priceable
  in the test. The answer stays visible/changeable as a chip above the
  ticks (row estimates re-scale live) and LEADS the note
  ("4+ bed home · Kitchen deep-clean + …") so the helper reads the scope.
  **Cleaning's bookable cap was raised 3h → 5h the same day (the
  suitable-money rule):** a 4+ bed home with everything ticked estimates
  ~4.7h, and billing that at the old 3h cap paid the student under the
  €18/hr promise. Both tables grew the 3.5/4.5 halves, and
  jobBuilder.test's SUITABLE-MONEY INVARIANT now enumerates every
  tick-subset × sizing factor asserting **booked time ≥ estimated
  minutes** — a category cap can never again sit below the biggest honest
  estimate.
- **Dog walks ask AFTER the walk row** ("What kind of dog?") and the answer
  is PRICED (owner call, same day: a bigger/stronger dog or a second lead
  is more work — the walk price must say so). The carry rides note +
  extra_label as before, and the SERVER prices extra_label exactly like
  tutoring's level: Small/Medium = base €15/€20, **Big dog +€3, Two dogs
  +€5** — the map lives in the server dog-walk branch, mirrored for display
  as `DOG_UPCHARGE_CENTS` in src/lib/householdPricing.ts, and
  jobBuilder.test.ts holds carries ↔ display map ↔ server table in
  three-way lock-step. The question rows show the resulting walk price
  BEFORE the tap; the sub-list walk rows say "from €15" for the same
  reason. No/unknown extra (WhatsApp door, memory rebooks, old links)
  prices at base — fail-soft, never a 400. There is deliberately NO
  "aggressive dog" tier: dispatching a known-aggressive dog to a student
  at a premium is the moving-tile class of liability — big/strong is
  priced, dangerous is not a product.
- **Laundry asks the bag ladder UP FRONT** at the real €30/€50/€65 row
  prices (the canonical `LAUNDRY_BAG_CENTS` labels) instead of quietly
  defaulting to 1 bag behind the form's "Change" fold.
Rebooks + deep links that carry a size (`direct`/`initialSize`) never
re-ask; the WhatsApp door is untouched (its step machine already asks
size). Funnel event: `hero_size_pick` { category, answer } between
tile/sub pick and ticks/form. Verified per the owner rule with a 4-flow
real-browser Playwright drive at a phone viewport (cleaning re-price via
Change, pets carry, laundry ladder, garden factor), checkout POST
intercepted + payload asserted, zero page errors.
