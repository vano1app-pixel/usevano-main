# VANO — App Store & Google Play submission guide

A practical checklist + ready-to-paste review notes for shipping the Capacitor
build (`appId: com.vanojobs.app`) to the **App Store** and **Google Play**.

> Build/release flow: `npm run build` → `npx cap sync` → open `ios/` in Xcode and
> `android/` in Android Studio → archive/sign → upload. Keep
> `VANO_AUTO_CHARGE` **unset** (off) for launch.

---

## ⚠️ The #1 rejection risk — make the core flow reviewable
Payment is **pay-after-accept**: the customer is only asked to pay once a helper
accepts. A reviewer testing with no live helpers will book, then hit a dead end
and may reject under "app incomplete" (Apple 2.1 / Play). Provide **one** of:

1. **A demo helper account** + steps: sign in, accept the reviewer's test
   booking via the link → that generates the customer pay link.
2. A staging/TestFlight build where dispatched jobs **auto-accept**.
3. A line in review notes: *"Email support@… and we'll accept your test booking
   within minutes during review."*

Don't submit without one of these.

---

## Ready-to-paste App Review Notes (both stores)
> VANO is a marketplace for booking **real-world home help** in Galway, Ireland —
> cleaning, dog walks, garden, moving, errands, and online tutoring for adults.
>
> **Customers book as guests by phone — no account or login required.** To test:
> open the app → type a job in the search bar (e.g. "clean") → pick a result →
> tap **Book** → enter any phone number + address → **Book**. A booking is
> created and you land on the live tracking screen.
>
> **Payment** is for real-world, in-person services performed by a third-party
> student helper, so it uses standard card payment (Stripe), **not** in-app
> purchase — consistent with Apple Guideline 3.1.3(e) and Google Play's
> real-world-services policy (same model as Uber / TaskRabbit).
>
> **Pay-after-accept:** the customer is only asked to pay after a helper accepts.
> To see the payment + tracking flow during review: [demo helper login / "email
> us and we'll accept your test booking"].
>
> **Helper (student) sign-in:** passwordless email magic-link. Demo account:
> [email] — we can supply a current login code on request.
>
> **Account deletion:** Account → "Leave VANO" deletes the account in-app.

---

## iOS — App Store Connect checklist
- [ ] **Add `ios/App/App/PrivacyInfo.xcprivacy` to the App target** (Xcode → select the file → File Inspector → tick the **App** target / Copy Bundle Resources). It's in the repo but won't ship unless it's in the target.
- [ ] Permission strings present (already in `Info.plist`): location, camera, photo library. ✓
- [ ] **Privacy nutrition labels** — declare: Phone number, Coarse + Precise Location, Email, Photos, Payment info (via Stripe), Product Interaction / Analytics. Must match `/privacy`.
- [ ] Privacy Policy URL: `https://vanojobs.com/privacy` · Support URL.
- [ ] **Demo account + the reviewable-flow note** (see top).
- [ ] Screenshots (6.7" / 6.5" / 5.5" / iPad), age rating, export compliance (HTTPS = standard exemption).
- [ ] Login: iOS shows **email magic-link only** (Google hidden), so Sign in with Apple is not required (Guideline 4.8). ✓

## Android — Google Play Console checklist
- [ ] **Data safety form** — same data types as the iOS labels above.
- [ ] Privacy Policy URL · in-app **account deletion** is present; add a web deletion request URL if Play asks.
- [ ] Permissions declared (`AndroidManifest.xml`): Internet, Location (address + live tracking), Camera (profile photo). Justify each in the data-safety form.
- [ ] Target the current required API level · upload a **signed AAB**.
- [ ] Content rating questionnaire.

---

## Backend to deploy alongside the app
- Apply the `household_customers` migration.
- Redeploy changed edge functions: `accept-job` (silent sign-in), `notify-household-accepted` (save-card + auto-charge), `stripe-webhook` (store customer).
- Supabase → Auth → **Redirect URLs**: include `https://vanojobs.com/*` (covers `/accepted`).
- Stripe (live): enable Apple Pay / Google Pay / Link in Payment methods (wallets then appear automatically on hosted Checkout).
- Leave **`VANO_AUTO_CHARGE` off** until verified in Stripe test mode.

## If a reviewer questions payments
VANO facilitates payment for **real-world, in-person services** performed by a
third party (the student helper). Apple 3.1.3(e) and Google Play both allow
standard payment for physical/real-world services — IAP is not required.
