# App Store — Privacy "Nutrition Label" answers (App Store Connect → App Privacy)

Reconciled against the code on 2026-09-06 (buy-orders build). Keep this file,
`ios/App/App/Info.plist`, `ios/App/App/PrivacyInfo.xcprivacy` and
`src/pages/Privacy.tsx` saying the same thing — Apple reads all four.

**Tracking: NO.** VANO does not track. No ATT prompt, no ad identifiers, no data
shared with data brokers, no cross-app/-site tracking. When ASC asks
"Do you or your third-party partners use data for tracking?" → **No**.

For every item below, choose **"Data Used to Track You": NO**. Link each to the
purpose(s) listed. None is used for Advertising. This mirrors
`PrivacyInfo.xcprivacy` (which declares no tracking) and the Privacy Policy.

| Data type | Collected? | Linked to identity | Purposes |
|---|---|---|---|
| **Phone number** | Yes | Yes | App Functionality (booking, updates by SMS/WhatsApp). Customers are anonymous: phone + booking UUID is their whole identity. |
| **Email address** | Yes (helpers; optional for customers) | Yes | App Functionality (helper sign-in, receipts) |
| **Name** | Yes | Yes | App Functionality (who's coming / who to call) |
| **Physical address** | Yes | Yes | App Functionality (send a helper to the house; address → map pin via Nominatim) |
| **Precise location** | Yes | Yes | App Functionality. Customer: only on tap ("use my location" fills the address). Helper: while Find jobs is open, to show nearby orders and store the last known position so jobs can be offered; on the way to a job, so the customer sees progress. When-in-use only, never background. |
| **Audio data** | **No** | — | Dictation happens in the iOS keyboard / browser before text reaches VANO. The app requests no microphone or speech permission (no such strings in Info.plist; the Speak button is gated off on native). Declare **No**. |
| **Photos** | Yes (optional) | Yes | App Functionality. Helpers: profile photo, before/after job photos. Customers: one optional photo of the job when posting an order. |
| **Other user content** | Yes | Yes | App Functionality. The free-text job description the customer types or dictates — sent to Google Gemini to classify the job and estimate duration (no name, phone or address goes with it) — plus the optional customer photo and post-claim chat messages. |
| **Payment info** | **No** (not stored by us) | — | The booking-fee card hold is a Stripe Checkout page; VANO never sees or stores card numbers. The job price is paid helper-direct (Revolut). Do not declare "Payment Info" as collected by the app. |
| **Purchase history** | Yes (booking history) | Yes | App Functionality |
| **Product interaction / usage** | Yes, **only if `VITE_POSTHOG_KEY` is in the build env** | No (Not Linked) | Analytics (PostHog, masked session replay). If the key is absent from the Codemagic env, the SDK never loads — declare accordingly. |
| **Crash data / diagnostics** | Yes, **only if `VITE_SENTRY_DSN` is in the build env** | No | App Functionality (Sentry error monitoring). Same rule as PostHog. |
| **Device ID / push token** | No — not in this build | — | Build 1 has no native push (SMS/WhatsApp at each step). Re-answer when APNs lands — see docs/NATIVE-TODO.md |

Notes for the reviewer form:
- **Precise Location** → do NOT mark it as used for Tracking or Advertising.
  Both uses (customer address fill, helper Find jobs / on the way) are
  App Functionality and both are covered by the single
  `NSLocationWhenInUseUsageDescription` string.
- **Google Analytics** loads on the website only; it is not in the app build.
- **Third-party processors** are service providers acting on our instructions,
  not partners who track users, so they do not change the "Tracking: No" answer:
  Stripe (fee hold/capture, helper ID verification) · Twilio (SMS/WhatsApp) ·
  Supabase (database, auth, storage) · Vercel (hosting) · **Google Gemini**
  (job text → job type + duration) · **Project OSRM** public routing server
  (route between the two pins) · **OpenStreetMap Nominatim** (address → pin) ·
  Google Maps (website address lookup) · PostHog and Sentry (only when keyed in).
