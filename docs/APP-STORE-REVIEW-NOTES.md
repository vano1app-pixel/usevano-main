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
   "Send request". Enter any phone number and send — you'll see the confirmation
   ("you'll get a name when a student says yes; no card, nothing charged").
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
(Account → Delete my account). Customers have no account; to erase the phone /
address / booking history they email vano1app@gmail.com or use Support →
"Delete my data".

CONTACT IF ANYTHING IS UNCLEAR: WhatsApp +353 89 981 7111, or vano1app@gmail.com
— same-day response.

---

## Demo logins to set (only needed if the reviewer wants the STUDENT side)

Customers need no login. The student (helper) side is passwordless (email magic
link), which a reviewer can't receive, so set up ONE of these before submitting:

- **Preferred — a magic-link session the reviewer can't start themselves.**
  Since we can't hand over an inbox, either (a) leave the review to the no-login
  household flow above (recommended — it exercises the app's core), or (b) set a
  temporary review bypass so a named demo email signs in with a fixed code.
  Placeholders to hand the reviewer if you enable a bypass:
  - Helper demo email: `<<HELPER DEMO EMAIL>>`
  - Helper demo code:  `<<6-DIGIT CODE>>`

> A review bypass is NOT wired in this build. If you want the full
> book → accept → 4-digit-code loop demonstrated, see
> `VITE_APPLE_REVIEW_AUTOACCEPT` below and the note in
> `docs/NATIVE-TODO.md`.

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
