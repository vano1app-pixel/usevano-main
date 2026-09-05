# App Store — Review Notes

Bundle id **com.vanojobs.app**. Two things to do BEFORE you press Submit:

1. **Turn the demo on.** Supabase → Edge Functions → Secrets:
   `REVIEW_DEMO = true` (the demo phone is hard-coded to 089 000 0000; set
   `REVIEW_DEMO_PHONE` only if you need a different one). Turn it OFF the
   day the review is approved.
2. **Create the demo helper row** (once — SQL Editor, see `docs/NATIVE-TODO.md`).

Then paste everything between the lines into App Store Connect → App
Review Information → Notes, and put the phone/code in the Sign-in fields.

---

## Sign-in information (App Review Information → Sign-in required: YES)

- **User name:** `0890000000`
- **Password:** `000000`

(It's a phone number and a one-time code, not a password — the notes below
explain where to type them.)

## Notes

VANO connects households in Galway, Ireland with ID-verified local students
for same-day home help — cleaning, garden, dog walks, laundry and odd jobs.

**No account is needed for the customer side.** VANO is currently in
"request mode" while we grow the student supply: instead of taking a card, the
app captures the request and a real person rings the customer back to confirm
a helper and the price. No card is charged, no account is created, and no
in-app purchase exists. Payment for a completed job is made by the customer
directly to the student (cash / bank app) for an in-person service outside the
app — Guideline 3.1.3(e). Nothing is charged inside the app at any point.

HOW TO TEST — CUSTOMER (no login):
1. Home screen: type "clean the kitchen for two hours" (or tap the mic and say
   it). The app understands the job and shows what it heard.
2. Tap "Send someone". The request sheet opens.
3. Enter any first name and the phone number **0890000000**, then tap
   "Send request".
4. You'll see the confirmed screen: "We'll ring you back within the hour" — no card, nothing charged.
   With this number nothing is sent to anyone — it is the review demo.
5. "Meet the helpers" shows real ID-verified students. Legal pages are in the
   footer and under Account → Privacy / Terms / Safety / Support.

HOW TO TEST — STUDENT (helper) SIDE:
1. Tap the Account tab → "Already a helper? Sign in".
2. Enter the phone number **0890000000** → tap "Text me a code".
3. Enter the code **000000**.
4. You're in the helper's account: profile photo, jobs they do, payouts,
   and at the bottom **"Delete my account"** (Guideline 5.1.1(v) — deletes
   the account in-app, immediately, no email needed).

PERMISSIONS (all optional, all requested on tap, never on launch):
- Location (When In Use): only when you tap "use my location" to fill an
  address. Decline and you can type the address.
- Camera / Photos: only when a student chooses a profile photo.
- No microphone permission is requested. The mic button uses on-device speech
  to text where the system provides it and falls back to typing otherwise.
- No App Tracking Transparency prompt — VANO does no tracking.

SIGN IN WITH APPLE: not applicable. The only login in the iOS binary is a
first-party one-time code sent to the student's phone (Guideline 4.8). No
third-party login is present.

ACCOUNT DELETION: students delete in-app (Account → Already a helper? Sign in
→ Delete my account). Customers have no account; "Delete my data" under
Account explains how to erase request history.

CONTACT DURING REVIEW: WhatsApp +353 89 981 7111 or vano1app@gmail.com —
same-day reply.

---

## After approval
- Set `REVIEW_DEMO` to `false` (or delete it). The demo number then behaves
  like any other number.
- Optionally delete the "Apple Review" helper row.
