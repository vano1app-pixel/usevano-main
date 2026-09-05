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

## 2b. App Store review demo — WIRED (2026-09-05), switch it on before submitting
Server-side, one number, behind a kill switch (`supabase/functions/_shared/reviewDemo.ts`).
Apple reviews the exact binary that ships, so the demo can't be a build flag;
it's keyed on the demo phone and only alive while the secret is on.

**Secrets** (Supabase → Edge Functions → Secrets):
```
REVIEW_DEMO=true              # on for the review, off (or deleted) after
REVIEW_DEMO_PHONE=+353890000000   # optional; this is the hard-coded default
```

**Demo helper row** (SQL Editor, run once). `is_available=false` keeps it out
of dispatch, the public helper count and the "Meet the helpers" faces:
```sql
insert into household_helpers (name, phone, email, city, status, is_available, id_verified, student_email_verified)
values ('Apple Review', '+353890000000', 'apple-review@vanojobs.com', 'Galway', 'approved', false, true, true);
```

**What the reviewer gets with 089 000 0000:**
- Customer: "Send request" → confirmed screen. No WhatsApp/SMS to you, no row.
- Helper: Account → "Already a helper? Sign in" → phone → code **000000** →
  profile / payouts / **Delete my account**.

With `REVIEW_DEMO` unset, both functions behave exactly as before.

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
1. **Apple Developer Program — $99/yr.** developer.apple.com → Enrol.
   Everything below waits on this. Allow 24–48h for approval.
2. **Xcode → sign in.** Xcode → Settings → Accounts → + → your Apple ID.
3. **App Store Connect → create the app.** appstoreconnect.apple.com → My
   Apps → + → New App: iOS, name **VANO**, primary language English (Ireland),
   bundle id **com.vanojobs.app** (register it first at developer.apple.com →
   Identifiers if it isn't offered), SKU `vano-ios`. Paste
   `docs/APP-STORE-LISTING.md`, the privacy answers from
   `docs/APP-STORE-PRIVACY-LABELS.md`, and the notes + sign-in fields from
   `docs/APP-STORE-REVIEW-NOTES.md`.
4. **Supabase:** Auth → URL Configuration → Redirect URLs → add
   `com.vanojobs.app://auth-callback`. Then the two demo secrets + the demo
   helper row (section 2b) — do this BEFORE the reviewer opens the app.
5. **Build the web bundle into the shell:** in the repo, `npm run native:sync`
   (build + `cap sync`), then `npm run native:ios` to open Xcode.
6. **Xcode:** select the **App** target → Signing & Capabilities → tick
   "Automatically manage signing" → pick your Team. In General, set
   Version `1.0`, Build `1` (bump Build on every upload). Top bar: choose
   **Any iOS Device (arm64)** as the destination.
7. **Archive:** Product → Archive. When the Organizer opens: Distribute App →
   App Store Connect → Upload → Automatically manage signing → Upload.
8. **TestFlight tab in App Store Connect:** the build appears after ~10 min of
   processing. The export-compliance question is pre-answered (Info.plist).
   Add yourself under Internal Testing → install the TestFlight app on your
   iPhone → install VANO.
9. **Test on the real phone, in this order:**
   - Home loads, no white screen, header clears the notch, tab bar clears the
     home indicator.
   - Type a job → **one tap** on Send someone opens the sheet.
   - Name + `0890000000` → Send request → confirmed screen. Check your
     WhatsApp: nothing should arrive (demo).
   - Account → Already a helper? Sign in → `0890000000` → `000000` → helper
     account loads → scroll to Delete my account (don't press it).
   - Account → Privacy, Terms, Support open.
   - Tap "use my location" in the sheet → the iOS location prompt appears.
10. **Screenshots:** on the same phone, per `docs/APP-STORE-SCREENSHOTS.md`
    (6.9" set is enough for iPhone-only; 6.5" if ASC asks).
11. **Submit:** App Store Connect → the 1.0 version → pick the TestFlight
    build → fill age rating (4+) → Save → **Add for Review** → Submit.
12. **After approval:** `REVIEW_DEMO=false`.
