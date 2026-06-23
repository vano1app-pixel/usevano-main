# Shipping VANO to the App Store & Google Play (Capacitor)

VANO is wrapped with [Capacitor](https://capacitorjs.com) so the existing Vite +
React web app can be published as a **native iOS and Android app** from one
codebase. Capacitor bundles the production web build (`dist/`) inside a native
shell and serves it locally on the device — it is **not** a webview pointed at
the live website (that gets rejected by Apple under guideline 4.2).

The website on vanojobs.com is **unaffected**. All native behaviour is additive
and gated behind `isNativeApp()` (`src/lib/platform.ts`).

---

## TL;DR workflow

```bash
npm run build         # build the web app into dist/
npx cap sync          # copy dist/ + plugins into ios/ and android/
npx cap open ios      # open Xcode      (needs macOS)
npx cap open android  # open Android Studio
```

There is a shortcut for the first two steps:

```bash
npm run native:sync   # = vite build + prerender + cap sync
```

Then build/run/submit from Xcode / Android Studio as normal.

---

## What's already wired up

| Area | Where |
|---|---|
| Capacitor config (appId, appName, splash) | `capacitor.config.ts` |
| iOS project | `ios/` (Swift Package Manager — no CocoaPods) |
| Android project | `android/` |
| Native shell init (status bar, splash, deep links) | `src/lib/native/initNativeApp.ts` |
| **Native OAuth / magic-link deep links** | `src/lib/native/initNativeAuth.ts` |
| Platform detection | `src/lib/platform.ts` |
| Auth redirect (web vs native) | `src/lib/siteUrl.ts` → `getAuthRedirectUrl()` |
| URL scheme (iOS) | `ios/App/App/Info.plist` → `CFBundleURLTypes` |
| URL scheme (Android) | `android/app/src/main/AndroidManifest.xml` → intent-filter |

Plugins installed: `@capacitor/app`, `@capacitor/browser`,
`@capacitor/status-bar`, `@capacitor/splash-screen`.

Inside the native app these web-only bits are automatically suppressed: the PWA
install banner, the iOS "Add to Home Screen" tip, the web push prompt, and the
web service-worker auto-updater (the app updates via the stores instead).

---

## ⚠️ Manual steps you MUST do (can't be done from this repo)

### 1. Allow-list the native redirect in Supabase  ← without this, native sign-in fails
Supabase Dashboard → **Authentication → URL Configuration → Redirect URLs**, add:

```
com.vanojobs.app://auth-callback
```

(Keep the existing `https://vanojobs.com` entry for the web.) Google Cloud needs
**no** change — the custom scheme is the hop from Supabase back to the app, not
from Google; the existing web OAuth client still works.

### 2. App icons & splash screen (currently Capacitor's placeholder)
The repo's best icon is 512×512 (`public/pwa-512x512.png`), staged at
`assets/icon.png`. **The App Store requires 1024×1024.** On your Mac/PC (the
icon tool needs `sharp`, which couldn't install in the build sandbox):

```bash
# Replace assets/icon.png with a 1024x1024 PNG first (optionally add
# assets/splash.png 2732x2732 and assets/splash-dark.png), then:
npm i -D @capacitor/assets
npx @capacitor/assets generate --iconBackgroundColor '#1a2340' --splashBackgroundColor '#1a2340'
npx cap sync
```

### 3. Developer accounts
- **Apple Developer Program** — $99/year → https://developer.apple.com/programs/
- **Google Play Console** — $25 one-time → https://play.google.com/console/signup

### 4. `appId` is permanent
`com.vanojobs.app` is baked into both native projects and becomes your iOS bundle
id + Android applicationId. **It cannot change after publishing.** To change it
*before* first publish: edit `capacitor.config.ts`, then
`rm -rf ios android && npx cap add ios && npx cap add android` and redo the
Info.plist / AndroidManifest scheme edits (or just change the scheme strings too).

---

## iOS — build & submit (requires macOS + Xcode)

1. `npm run build && npx cap sync`
2. `npx cap open ios`
3. In Xcode: select the **App** target → **Signing & Capabilities** → pick your
   Team (enables automatic signing).
4. Set **Version** (e.g. 1.0.0) and **Build** (e.g. 1).
5. Choose **Any iOS Device (arm64)** → **Product → Archive**.
6. In the Organizer: **Distribute App → App Store Connect**.
7. In [App Store Connect](https://appstoreconnect.apple.com): create the app
   (bundle id `com.vanojobs.app`), fill listing (name, screenshots, privacy
   details, support URL), attach the build, submit for review.

> Apple privacy: declare data collection (auth email, analytics via PostHog,
> crash logs via Sentry) in **App Privacy**. The app uses no native location/
> camera/contacts permissions in this first build (see "Known follow-ups").

## Android — build & submit (Android Studio)

1. `npm run build && npx cap sync`
2. `npx cap open android`
3. Create an upload keystore (once) and configure signing — or use Play App
   Signing and upload an **App Bundle**.
4. **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**.
5. Bump `versionCode` / `versionName` in `android/app/build.gradle` per release.
6. In [Play Console](https://play.google.com/console): create the app, complete
   the listing + Data Safety form, upload the `.aab`, roll out to testing →
   production.

---

## Native auth — how it works (and what to test)

Web is unchanged. On native:

1. `getAuthRedirectUrl()` returns `com.vanojobs.app://auth-callback` instead of
   the website.
2. **Google**: opened in the system browser (SFSafariViewController / Chrome
   Custom Tab) — Google blocks OAuth inside embedded webviews, so this is
   required. After auth, Supabase redirects to the custom scheme.
3. **Magic link**: the email link is a normal `https://…supabase.co` link; only
   the final hop redirects to the custom scheme — so it works in every email app.
4. The OS reopens the app with the deep link; the `appUrlOpen` listener in
   `initNativeAuth.ts` runs `exchangeCodeForSession()` (PKCE) and lands the user
   at `/`, where the shared `AuthProvider` + route guards take over — exactly as
   `detectSessionInUrl` does on the web.

**This is the one part that could not be tested in the build environment** (no
device / no live OAuth round-trip). Test on a real device after step 1 above:
- Tap **Continue with Google** → system browser opens → after consent the app
  reopens **signed in**.
- **Magic link**: enter email → open the email **on the same device** → tapping
  the link reopens the app **signed in**.

If sign-in doesn't return to the app, 99% of the time it's the Supabase redirect
allow-list (manual step 1).

---

## Known follow-ups (optional, not blockers)

- **Native push notifications** — the web push prompt is hidden on native. For
  real native push, add `@capacitor/push-notifications` + APNs (iOS) / FCM
  (Android) and bridge to the existing notification backend.
- **"Use my location"** — `navigator.geolocation` doesn't work in iOS WKWebView
  without a bridge. The manual Eircode/address field (the existing fallback)
  still works. To enable native location: add `@capacitor/geolocation`, the iOS
  `NSLocationWhenInUseUsageDescription` string, and Android location permissions.
- **Top safe area on iOS** — handled by a native-only CSS pad
  (`html.native-app body { padding-top: env(safe-area-inset-top) }`). Verify on a
  notched device; if the strip clashes with a full-bleed hero, move the pad onto
  the page header.

---

## Vercel / web

No change. Vercel still runs `npm run build` and deploys the SPA; it ignores the
`ios/` and `android/` folders. The added Capacitor dependencies are tiny and the
native plugins are dynamically imported, so they don't ship in the web bundle.
The PWA (manifest + service worker) on the website is untouched.
