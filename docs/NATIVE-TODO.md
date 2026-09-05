# Native iOS — remaining setup (human + owner steps)

Everything in `apple/review-pack` is code + docs. These are the steps that need
your Apple account, the Xcode UI, or an owner decision. Nothing here blocks a
TestFlight build except where noted.

---

## 1. Privacy manifest — DONE (2026-09-05)
`ios/App/App/PrivacyInfo.xcprivacy` is now a member of the **App** target
(added to `project.pbxproj` by hand — Copy Bundle Resources). Verified by an
`xcodebuild` simulator build: the file lands in `App.app/PrivacyInfo.xcprivacy`.
Nothing to click in Xcode.

Also done the same day, both in the repo:
- **iPhone-only, portrait-only** (`TARGETED_DEVICE_FAMILY = 1`, one
  orientation in `Info.plist`). No iPad screenshots, no landscape review.
- **`viewport-fit=cover`** on the viewport meta in `index.html`. Without it
  every `env(safe-area-inset-*)` in the CSS is 0 inside WKWebView, so the
  header sat under the notch and the bottom tab bar under the home indicator.

## 2. Native push notifications (NOT wired — deliberate)
The web push (VAPID) prompt is correctly hidden inside the native app, so iOS
currently has **no** push. Wiring APNs is a real setup + backend task, so it's
documented, not invented:

**What's needed (your side):**
- Enable the **Push Notifications** capability on the App target in Xcode.
- Create an **APNs Auth Key** (.p8) in the Apple Developer portal.
- Add `@capacitor/push-notifications` (`npm i @capacitor/push-notifications`
  then `npm run native:sync`).

**Client hook (drop-in, gate it correctly):** request permission only AFTER the
first booking or from a Settings row — never on first launch — then register and
send the APNs token to the backend:
```ts
// src/lib/native/push.ts (sketch — do not call on first launch)
import { isNativeApp } from '@/lib/platform';
export async function enableNativePush() {
  if (!isNativeApp()) return;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;            // fail-soft, never block
  await PushNotifications.register();
  PushNotifications.addListener('registration', (t) => {
    // POST t.value (the APNs token) to a store-token endpoint. Reuse the
    // existing `push_subscriptions` table with a `platform:'ios'` column, or a
    // sibling `device_tokens` table — do NOT invent a new notification product.
  });
}
```
**Backend hook (do not build a new product):** the existing dispatch path
(`dispatch-household-job` / `send-household-push`) already sends web push; add an
APNs branch keyed on the stored iOS token. This is an edge change — leave it for
a dedicated PR with the owner's 667.

## 2b. Student demo login for App Review — DECISION NEEDED
See `docs/APP-STORE-REVIEW-NOTES.md` → "Demo login for the student side". If
you choose to wire it: secrets `APPLE_REVIEW_DEMO_PHONE` (E.164, a number no
student owns) and `APPLE_REVIEW_DEMO_CODE` (6 digits) in Supabase → Edge
Functions → Secrets, plus one helper row on that phone. Rotate the code after
the review.

## 3. Reviewer "auto-accept" env (optional, TestFlight only) — NOT wired
`VITE_APPLE_REVIEW_AUTOACCEPT` is reserved but unimplemented. See
`docs/APP-STORE-REVIEW-NOTES.md` → "Optional: full book→accept→code demo". It
must stay OFF on production web and can never auto-accept a real customer.

## 4. Icon
`assets/icon.png` is already 1024×1024 opaque — no action. If you rebrand, keep
it 1024 opaque (no alpha) and re-run
`npx @capacitor/assets generate --ios --iconBackgroundColor '#1a2340'`.

## 5. Supabase redirect URL (REQUIRED for magic-link sign-in in the app)
In Supabase → Authentication → URL Configuration → **Redirect URLs**, add:
```
com.vanojobs.app://auth-callback
```
Without it, a student tapping the magic link won't be returned into the app.

---

## The human clicks to ship (in order)
1. **Apple Developer Program — $99/yr.** Enrol at developer.apple.com (needs the
   business/individual identity). Everything below waits on this.
2. **App Store Connect — create the app record.** New App → name **VANO**,
   bundle id **com.vanojobs.app**, primary language English (Ireland). Paste the
   listing from `docs/APP-STORE-LISTING.md`, the privacy answers from
   `docs/APP-STORE-PRIVACY-LABELS.md`, and the review notes from
   `docs/APP-STORE-REVIEW-NOTES.md`.
3. **Build.** `npm run native:sync`, open Xcode (`npm run native:ios`), set the
   signing team, bump the build number, Product → Archive → Distribute → App
   Store Connect. (Privacy manifest is already in the target.)
4. **TestFlight on a real iPhone.** Install via TestFlight and actually test:
   - tap the **mic** and say a job (or confirm it falls back to typing),
   - tap **use my location** (location permission prompt appears on tap),
   - **book** (send a request) and see the confirmation,
   - if you set a helper demo login, **accept** a job and see the **4-digit
     code**.
5. **Submit for Review** with the review notes pasted. Do NOT claim it's
   submitted until you've pressed Submit — that's your action, not mine.
