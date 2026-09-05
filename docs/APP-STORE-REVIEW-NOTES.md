# App Store — Review Notes (paste into App Store Connect → App Review Information → Notes)

Fill the `<<…>>` placeholders before submitting. Bundle id **com.vanojobs.app**.

---

## Paste-ready notes

VANO connects households in Galway, Ireland with ID-verified local students for
same-day home help — cleaning, garden, dog walks, laundry and odd jobs.

**No account is required to use the core of the app.** From the home screen you
describe the job (type it, or tap the mic to say it) and tap "Send someone".
VANO is currently in **request mode** while we grow the student supply: instead
of taking a card, the app captures the request and we line a student up and
message you back with a name. **No card is charged and no account is created for
customers.** This is deliberate (see "Why no checkout" below), not missing
functionality.

HOW TO REVIEW (no login needed):
1. On the home screen, type e.g. "clean the kitchen for two hours" (or tap the
   mic and say it) → the app understands the job and asks only what's missing.
2. Tap "Send someone" → the request sheet opens: phone, an optional note, and
   "Send request". Enter a name and any Irish-format mobile (08x xxx xxxx) and
   send — you'll see the confirmation ("We'll ring you back within the hour",
   no card, nothing charged).
3. Browse real ID-verified students under "Meet the helpers".
4. Legal pages are reachable with no login from the footer and from
   Account → Privacy / Support / Terms / Safety.

PERMISSIONS (all optional, all on tap, never on launch):
- **Location (When-In-Use):** only if you tap "use my location" to fill an
  address. Decline and you can type the address instead.
- **Camera / Photos:** only if you (as a student) add a profile or job photo.
- The app does **not** use App Tracking Transparency — VANO does no tracking.

WHY NO CHECKOUT (Guideline 3.1.3(e)): when a job IS booked live, the only card
charge is a small booking fee for a real student coming to a real house — a
physical, in-person service outside the app. Customers pay the student directly
(cash/Revolut). There is no digital content, no IAP, and no credits.

SIGN IN WITH APPLE: not applicable — on iOS the only login is a first-party
email magic link (used by students only). No Google or third-party login is
present in the iOS binary, so Guideline 4.8 does not apply.

DELETE ACCOUNT / DATA: students can delete their account in-app
(Account → "Already a helper? Sign in" → Delete my account). Customers have no account; to erase the phone /
address / booking history they email vano1app@gmail.com or use Support →
"Delete my data".

CONTACT IF ANYTHING IS UNCLEAR: WhatsApp +353 89 981 7111, or vano1app@gmail.com
— same-day response.

---

## Demo login for the student side — DECISION NEEDED before submitting

Guideline 2.1 (App Completeness): *"If your app includes account-based
features, provide a demo account."* The student side (`/student-account`:
profile, payouts, delete account) is behind a texted 6-digit code the reviewer
can't receive. Apple usually asks for it on the first pass. Three options:

1. **Wire a secret-gated demo code (recommended, ~25 lines, server-side).**
   In `supabase/functions/student-account-otp/index.ts`, after the helper is
   resolved by phone: if `APPLE_REVIEW_DEMO_PHONE` matches this helper's phone
   AND `APPLE_REVIEW_DEMO_CODE` is set, `send` returns success without
   texting, and `verify` accepts that fixed code. Both secrets unset ⇒ dead
   code. Needs: one dummy helper row on a number nobody owns, the two secrets in
   Supabase → Edge Functions → Secrets, and a merge (667) — edge functions
   deploy on merge. **Not written in this pass — it is an auth bypass on
   production and the owner decides.**
2. **Submit without it** and hand Apple the customer flow only (the notes above
   already say no login is needed). Risk: a "provide demo credentials" reject
   on the first pass, which costs a day and a resubmit, not a rewrite.
3. **Ask Apple for a live text during review**: put "WhatsApp +353 89 981 7111
   and we'll send you the student code within minutes" in the notes. Works only
   if someone is awake and holding the phone when the reviewer tries (they
   review at US hours; the owner is in India 7–25 Sep 2026).

If you pick 1, hand the reviewer:
- Helper demo phone: `<<DEMO PHONE>>`
- Helper demo code:  `<<6-DIGIT CODE>>`
- Path: Account → "Already a helper? Sign in" → enter the phone → enter the code.
  The reviewer then sees the helper profile, payouts and **Delete my account**
  (Guideline 5.1.1(v)).

## Optional: full book→accept→code demo on TestFlight only

`VITE_APPLE_REVIEW_AUTOACCEPT` is reserved for a TestFlight-only simulation where
a reviewer's booking auto-accepts and shows a 4-digit arrival code after ~10s,
so the whole flow can be seen without a second device or a real student.

- It must be **OFF (unset) on the production web build** and only set on the
  TestFlight/native build.
- It must **never** auto-accept a real customer's booking — gate it on
  `isNativeApp()` AND the flag AND a review-only marker.
- It is **not implemented in this pass**: it touches the live booking/track
  flow, which is one of the never-break flows, and in the current request
  ("waitlist") mode no bookable job is created to accept. Decide with the owner
  whether to (a) flip to live booking for launch, or (b) build the simulation,
  before wiring it. Documented here so the intent isn't lost.
