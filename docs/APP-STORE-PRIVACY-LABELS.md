# App Store — Privacy "Nutrition Label" answers (App Store Connect → App Privacy)

**Tracking: NO.** VANO does not track. No ATT prompt, no ad identifiers, no data
shared with data brokers, no cross-app/-site tracking. When ASC asks
"Do you or your third-party partners use data for tracking?" → **No**.

For every item below, choose **"Data Used to Track You": NO**. Link each to the
purpose(s) listed. None is used for Advertising. This mirrors
`ios/App/App/PrivacyInfo.xcprivacy` (which declares no tracking) and the Privacy
Policy.

| Data type | Collected? | Linked to identity | Purposes |
|---|---|---|---|
| **Phone number** | Yes | Yes | App Functionality (booking, updates by SMS/WhatsApp) |
| **Email address** | Yes (students; optional for customers) | Yes | App Functionality (student sign-in, receipts) |
| **Name** | Yes | Yes | App Functionality (who's coming / who to call) |
| **Physical address** | Yes | Yes | App Functionality (send a helper to the house) |
| **Precise location** | Yes (only on tap) | Yes | App Functionality (fill address; live "on the way" tracking) |
| **Audio data** | No | — | Voice is turned to text **on device**; VANO receives text only, never a recording. Declare **No** for audio. |
| **Photos** | Yes (students only) | Yes | App Functionality (profile photo; before/after job photos) |
| **Payment info** | No (not stored by us) | — | Card handled by Stripe; VANO never sees/stores card numbers → do not declare "Payment Info" as collected by the app |
| **Purchase history** | Yes (booking history) | Yes | App Functionality |
| **Product interaction / usage** | Yes | No (can be Not Linked) | Analytics (PostHog, masked replay) · App Functionality |
| **Crash data / diagnostics** | Yes | No | App Functionality (Sentry error monitoring) |
| **Device ID / push token** | Only if native push is enabled later | Yes | App Functionality (send booking notifications). Not in this build — see docs/NATIVE-TODO.md |

Notes for the reviewer form:
- **Precise Location** → tick "Data is only collected when the user grants
  permission / on their action" is not a toggle, but do NOT mark it as used for
  Tracking or Advertising.
- **Third-party processors** (Stripe, Twilio, Supabase, Vercel, PostHog, Sentry,
  map providers) are service providers acting on our instructions, not partners
  who track users — so they do not change the "Tracking: No" answer.
