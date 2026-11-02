# VANO iOS — App Store review audit (Phase 0)

Date: 2026-09-06 · Branch: `claude/ios-orders` (off main at PR #424) · Bundle: `com.vanojobs.app`
Method: 8 parallel code auditors, one dimension each, every claimed blocker re-checked by a
skeptic against the cited file and line. Eight skeptic passes hit a rate limit and were
re-verified by hand. Anything not confirmed in code is marked **[unverified]**.

---

## 0. The one-paragraph verdict

The binary is **not** a webview of vanojobs.com. It is the bundled Vite build with five
native plugins (app, browser, geolocation, splash, status bar) that are all actually used.
The real 4.2 problem is what the bundle *does*: `WAITLIST_MODE = true` turns the customer
side into a lead form that writes an analytics row and WhatsApps the owner. No booking, no
helper match, no tracking, no payment exists in the binary a reviewer can hold. The order
loop you want is 80% built under that switch (atomic claim, open-jobs board, arrived /
start / done, ratings, cancel modes, re-dispatch sweeps). What's missing is distance,
search, a map on the helper side, a demo path that works natively, and the Stripe return
trip, which today lands in Safari on vanojobs.com and never comes back to the app.

**No hard stop.** Sign in with Apple is not required (no third-party login renders on
iOS). Delete account exists in-app for helpers (two bugs, fixable). Privacy and support
URLs load. The demo seed is doable in code. Two human actions remain and both are
one-click: pick the signing team in Xcode (needs the Apple Developer Program) and set the
`REVIEW_DEMO` secret plus the native redirect URL in Supabase.

---

## 1. Bundle ID and binary facts

| Item | Value | Evidence |
|---|---|---|
| Bundle ID | `com.vanojobs.app` | `capacitor.config.ts:21`, `project.pbxproj` |
| Version / build | 1.0 / 1 | `project.pbxproj:303-332` |
| Device family | iPhone only, portrait only | `TARGETED_DEVICE_FAMILY = 1`, `Info.plist:42-45` |
| Deployment target | iOS 15.0 | `project.pbxproj:305` |
| Icon | 1024×1024, RGB, no alpha, real brand mark | `AppIcon.appiconset/AppIcon-512@2x.png` |
| Privacy manifest | present, in Copy Bundle Resources, tracking = false | `PrivacyInfo.xcprivacy`, `project.pbxproj:148` |
| Export compliance | `ITSAppUsesNonExemptEncryption = false` | `Info.plist:29-30` |
| Signing team | **none set** | no `DEVELOPMENT_TEAM` in pbxproj |
| Entitlements | none (no push, no Apple sign-in, no associated domains) | `find ios -name '*.entitlements'` → empty |
| Xcode on this Mac | 26.6 (17F113), iOS 26.5 simulator, iPhone 17 devices | `xcodebuild -version` |
| Synced web bundle | **stale** — `ios/App/App/public` predates the 5 Sep fixes (no `viewport-fit=cover`) | `public/index.html:5` vs `index.html:5` |

## 2. Wrapper vs real flows

- Bundled build, `server.url` deliberately unset. Loads from `capacitor://localhost`. Not a 4.2 wrapper on structure.
- **Customer side in the binary today:** Home tab = the marketing landing page (hero,
  social proof, FAQ, blog teaser, SEO footer). Only action = `waitlist-request`, which
  stores a lead in `analytics_events` and pages the owner. Bookings tab says requests
  "show here once we've rung you". Account tab is localStorage. `CategoryGrid.tsx:1256-1296`.
- **Helper side is real:** phone-OTP gate → dashboard → job screen with Leaflet map, native
  GPS streaming every 15 s while on the way, arrival code, before/after photos.
- **Under the switch, the order loop exists:** `create-household-payment-checkout` →
  `dispatch-household-job` (offers to up to 50 approved, ID-verified helpers by exact city
  + category) → `accept-job` / in-app `claimJob` (single conditional UPDATE, first claim
  wins) → `household-arrival` (arrived / start / finished) → `complete-household-job` →
  `capture-household-payment` → `rate-household-booking`. Cancel has customer / helper
  release / admin modes. `redispatch-stale-jobs` re-notifies 3 rounds. `sweep-stalled-jobs`
  handles ghosting. No founder assignment path exists in code.
- **Pay to publish already exists** behind the env flag `VANO_AUTH_AT_BOOKING=1`: booking
  born `awaiting_payment`, manual-capture Stripe Checkout holds the fee, webhook flips to
  `pending` and dispatches, capture at accept. `create-household-payment-checkout:364-384`.
- No Buyer/Helper mode switch. Two separate entry points linked from Account.
- Map: react-leaflet + CARTO tiles, used on address pin, customer tracking, helper job screen. No map on the helper's job list.

## 3. Auth providers / Sign in with Apple

- Methods in code: Google OAuth, Supabase email magic link, helper phone OTP (own HMAC
  token, not Supabase auth). No password, no Apple.
- **Google is hidden on iOS** by `getPlatform() !== 'ios'` at `Auth.tsx:296` and `:344`.
  Capacitor reports `ios` on every route in the binary, so it can't be reached by URL.
  Therefore **guideline 4.8 does not apply. Sign in with Apple is not required.** Keep the gate.
- `/auth` (magic link) is reachable on iOS only via one redirect from the job screen when
  there's no session. Its native return trip depends on the Supabase redirect allow-list
  (`com.vanojobs.app://auth-callback`) — **human action, Supabase dashboard**.
- Customers have no accounts. Identity = phone + booking UUID. Recommendation: keep it that
  way, so 5.1.1(v) never applies to buyers.

## 4. Payments path

- **Direct-pay since July 2026:** the card is only ever charged VANO's fee (15%, min €5, +€2
  cover). The job price goes customer → helper directly (Revolut tag / cash). The helper
  keeps 100%. No Stripe Connect needed for new helpers. `_shared/vanoFees.ts`, CLAUDE.md "Money movement".
- A `card_pay` option exists (job + fee in one Checkout at accept, Connect transfer to the
  helper on completion) but is excluded from the hold path and depends on helpers having
  done Stripe Connect Express KYC, which most haven't.
- **No IAP, no StoreKit anywhere.** Booking fees are payment for a real-world service: 3.1.3(e). Review notes must say so.
- **3.1.1 risk: the €2/month "blue tick" badge** (`create-verified-plan`, Stripe
  subscription) is cosmetic, in-app, and reachable on iOS with no native gate.
  `VerifyHelper.tsx:328`. Hide it on native.
- **Stripe return trip is broken on native.** The sheet hands off with
  `window.location.href` (`CategoryGrid.tsx:1379`). Capacitor cancels the navigation and
  opens Safari (`WebViewDelegationHandler.swift:96-114`). `success_url` is built from the
  request Origin, which inside the app is `capacitor://localhost`
  (`create-household-payment-checkout:573-577, 710`). A reviewer who pays lands on the
  website, not the app. Fix: `Browser.open` on native, an https success URL, and poll the
  booking until it flips, then `Browser.close()`. Same problem for Connect onboarding and Stripe Identity.
- Single `STRIPE_SECRET_KEY` (live). A reviewer cannot use a test card. Needs a server-side demo bypass keyed on the demo phones.

## 5. Data collected vs privacy policy

- Usage strings present and honest: location (when in use), camera, photo library. Absent: microphone, speech recognition. No background modes.
- **Mic button** renders whenever `webkitSpeechRecognition` exists, no native gate
  (`useSpeechInput.ts:35-42`, `GeneralHelpField.tsx:255`). WKWebView does not expose it
  [unverified on device], so the button self-hides today. Gate it on `!isNativeApp()`
  anyway so it can never fire a permission prompt the binary has no string for.
- PostHog = session replay only, inputs masked. Sentry = no PII. Both env-gated at build time; whether the keys are in the Codemagic env group is [unverified].
- **Undisclosed processors:** typed/dictated job text goes to Google Gemini
  (`parse-custom-job:69,134`); routes from `router.project-osrm.org` with both parties'
  coordinates (`TrackBooking.tsx:380`); a GA4 loader in `index.html` ships in the binary
  (no hits fire on `localhost`, but the domain is fetched). Privacy page names none of them. Add three lines.
- Policy claims speech is converted "on the device". VANO never receives audio (true), but on-device is the platform's call, not ours. Soften the wording.
- Privacy, Terms, Support are static React pages, render offline, served by the SPA rewrite. They load. Not prerendered (fine for Apple's reviewer).
- Docs disagree on the "Payment info" label. Answer: **No** (Stripe handles the card, VANO never stores it).

## 6. Account deletion (5.1.1(v))

- Exists for helpers: Account → Delete my account → typed `DELETE` → `delete-helper-account`. Anonymises the row, removes photo, Stripe account, auth user (best effort).
- **Bug 1:** both safety guards filter `student_id = helper.id` but that column holds the
  auth user id, so the guards never fire. `delete-helper-account:73-77, 89-93`.
- **Bug 2:** `household_bookings.student_id` and `household_payouts.student_id` reference
  `auth.users` with no `ON DELETE`, so the auth delete fails for any helper who ever took a
  job. The failure is only logged. Migration: `ON DELETE SET NULL`, then make the auth delete fatal.
- **Bug 3 (demo):** the reviewer is told to find Delete my account. Tapping it kills the demo login for the next reviewer. Skip the mutation for the demo phone.

## 7. Placeholder surfaces to remove from the iOS shell

- SEO site inside the app: blog (15), glossary (27), four service landings, partners, referral page, footer with Instagram/Facebook/TikTok/LinkedIn links. 4.0 "website in a box".
- `{city} · soon` pills for non-Galway cities in the sheet (`CategoryGrid.tsx:2131-2141`). Brief says no "coming soon".
- `/household-admin` route in the customer bundle (admin screen, gated by role, still shipped).
- `InAppBrowserBanner` likely fires inside WKWebView (UA lacks `Safari/`) telling users to "open in Safari" [unverified on device].
- Docs describe a mic button and a "Meet the helpers" step the iOS build does not render. Screenshots must come from the iOS build (2.3.3).
- Haptics are a no-op on iOS (`navigator.vibrate`). Cosmetic.

## 8. Data model → orders: what's missing

| Need | Exists | Gap |
|---|---|---|
| Open orders by distance | bookings have `customer_lat/lng` | **helpers have no lat/lng**; matching is exact `city` string. Add `household_helpers.last_lat/last_lng/location_updated_at`, a haversine RPC, update the location usage string |
| Atomic claim | yes, 3 places | client claims rely on an RLS policy that lives only on the live DB. Make the claim a `SECURITY DEFINER` RPC and commit it |
| Search / tags | none | add a `search_tags text[]` derived at checkout (category words, area token from pin, time bucket) + GIN index; prefix + tag match in the RPC |
| Re-notify after N min | `redispatch-stale-jobs` (*/15, 3 rounds, expired offers only) | tighten to N minutes without a claim; already SMS/WhatsApp-bound (no native push) |
| Arrived / start / done | `household-arrival` | works, needs a Supabase session (demo helper has none today) |
| Photo proof | `arrival_photo_url`, `finish_photo_url`, `job-photos` bucket | fine |
| Cancel / no-show | 3 cancel modes, stalled sweep, `arrival_skipped` | no explicit `no_show` state; UI states needed |
| Status feed to buyer | 5 s poll via RPC | fine (anonymous customers can't use realtime) |
| Push at each step | web push only; **no APNs** | needs Push capability + `.p8` key from Apple (human) before it can be wired. SMS/WhatsApp cover every step today |

## 9. Demo account plan

Server-side bypass keyed on two demo phones, alive only while `REVIEW_DEMO=true`:

| Row | Table | Notes |
|---|---|---|
| Demo helper | `auth.users` + `household_helpers` (user_id linked, approved, id_verified, `is_available=false`, `booking_data.demo`) | phone `+353890000000`, code `000000` → must also mint a **Supabase session** so the native job screen works |
| Demo buyer | none needed (anonymous) | phone `+353890000001`; checkout inserts a `pending` booking with `booking_data.demo=true` and **no Stripe call** |
| Open order | `household_bookings` pending, Galway coords, `demo=true`, `created_at` refreshed by the seed | visible only to the demo helper; excluded from real dispatch, sweeps, open board, stats |
| Completed order | `household_bookings` completed + `household_job_updates` + `household_ratings` + `household_customer_ratings` + `household_booking_secrets` | shows the rating and payout state |

Guards to add: `open-jobs`, `accept-job`, `dispatch-*`, `redispatch-stale-jobs`,
`sweep-stalled-jobs`, `remind-*`, `notify-household-accepted` (skip Stripe when `demo`),
`delete-helper-account` (no-op for demo phone), StudentDashboard pending query.
Seed lives in `supabase/seed/review-demo.sql`, idempotent.

## 10. Top 5 rejection risks, ranked

1. **4.2 / 2.1 — the customer side is a lead form.** Waitlist mode means no order can be
   placed, tracked or paid in the binary. Fix: ship the order loop live on iOS.
2. **2.1 — the reviewer cannot complete the loop.** No native session for the demo helper,
   no way to pay without a live charge, demo helper can claim real customers' jobs
   (`open-jobs` and `accept-job` never check `is_available`), Delete kills the demo. Fix: demo seed + bypass above.
3. **3.1.1 — €2/month cosmetic badge sold via Stripe inside the binary.** Fix: hide on native.
4. **2.1 / 4.2 — Stripe hand-off leaves the app and never returns** (`capacitor://localhost`
   success URL, Safari bounce). Fix: `Browser.open` + https success URL + poll-and-close.
5. **5.1.1 — data and purpose-string gaps.** Mic without a usage string (gate it), Gemini /
   OSRM / GA undisclosed in the policy, delete-account guards broken and auth row not
   deletable. Fix: code + three policy lines + one migration.

Also: **4.0 spam** — blog, glossary, SEO landings and social links inside the shell. Hide on native.

## 11. Decisions I need from you (the audit can't make these)

**A. What the card holds.** Two honest options, both build on code that exists:
- **A1 — fee hold (recommended for v1).** Buyer's card is held for VANO's fee (~€5 on a €44
  job) at post time via the existing `VANO_AUTH_AT_BOOKING` path, captured when a helper
  claims. Job price is paid helper-direct (Revolut tag, pre-filled amount) and the helper
  confirms "Did you get paid?" in-app. Zero Stripe KYC for students. Matches the July
  "not a payment intermediary" decision. "Payout status" = the paid-confirmation state.
- **A2 — full hold.** Card held for job + fee at post time, helper paid by Stripe Connect
  transfer on completion. Cleaner for the buyer, but **every helper must complete Stripe
  Connect Express KYC before they can claim**, and it reverses the July decision. Supply is
  13 helpers. This blocks most of them on day one.

**B. Waitlist off where?** The same `dist` ships to web and iOS. I can flip live bookings
on for the native app only (`WAITLIST_MODE = !isNativeApp()`) and leave vanojobs.com in
request mode until you say 667. Or flip everywhere. Default if you don't say: native only.

**C. Push notifications.** Real APNs needs the Push capability in your Apple account and a
`.p8` key. Until you have those, "push at each step" is SMS + WhatsApp, which already fire
at every step. I can wire the client plugin now, untestable until the key exists. Default: leave push out of build 1, document it.

**D. Buyer accounts.** Recommendation: none. Phone + booking UUID, as today. No 5.1.1(v)
exposure, nothing to delete, mode switch still works.

## 12. Human actions (the full list)

| # | Action | When |
|---|---|---|
| 1 | Apple Developer Program enrolment, then Xcode → App target → Signing → pick Team | before archive |
| 2 | Supabase → Auth → Redirect URLs → add `com.vanojobs.app://auth-callback` | before TestFlight |
| 3 | Supabase → Edge Functions → Secrets → `REVIEW_DEMO=true` (and `VANO_AUTH_AT_BOOKING=1` if A1) | before submit; off after approval |
| 4 | Run `supabase/seed/review-demo.sql` in the SQL editor | before submit |
| 5 | App Store Connect: create the app record, paste listing / labels / review notes, screenshots | at submit |
| 6 | Type **667** for the merge and edge-function deploy, **submit vano** for the upload | last |

---

## 13. Decisions taken (2026-09-06, owner)
- **A1** — fee hold at post, captured on claim; job price helper-direct (Revolut). No Stripe Connect requirement.
- **B** — waitlist mode OFF everywhere (web and app). Merge still gated on 667.
- **C** — no push in build 1. SMS + WhatsApp at every step. APNs documented for build 2.
- **D** — buyers stay anonymous (phone + booking UUID). No buyer account, no buyer deletion obligation.
