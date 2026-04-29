# Mobile app (Capacitor) — phase 1 scaffold

This branch wraps the existing Vite/React site as a native iOS/Android app using
[Capacitor](https://capacitorjs.com). The web build is untouched: Vercel still
deploys `npm run build` → `dist/`, and Capacitor uses the same `dist/` as the
WebView source for the native shell.

## What's in this commit

- `@capacitor/core`, `@capacitor/app`, `@capacitor/push-notifications` (runtime)
- `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`, `@capacitor/assets` (dev)
- `capacitor.config.ts` — app id `com.vanojobs.app`, points at `dist/`
- `src/lib/native/platform.ts` — `isNative` / `isIOS` / `isAndroid` helpers
- `src/lib/native/push.ts` — `initNativePush()` registers with APNs/FCM, no-ops on web
- `cap:*` npm scripts (none affect Vercel)
- `ios/` and `android/` are gitignored until you're ready to commit them

Nothing in `src/` app code was modified. Importing `initNativePush` on the web
build is safe — it early-returns when not on a native platform.

## Getting a build on your phone

You need a Mac for iOS, and Android Studio (any OS) for Android. The native
project folders are not in git yet, so each environment generates them locally
the first time.

### One-time setup

```bash
npm install
npm run build
npx cap add ios       # Mac only — creates ios/
npx cap add android   # creates android/
```

### After the first add

```bash
npm run mobile:build      # vite build + cap sync
npm run cap:open:ios      # opens Xcode → Run ▶ to install on simulator/device
npm run cap:open:android  # opens Android Studio
```

`cap sync` copies `dist/` into the native projects and updates plugins. Run it
after every `vite build` you want reflected on device.

## Push notifications — phase 2 (not yet wired)

The plumbing exists (`src/lib/native/push.ts`) but isn't called anywhere. To
turn it on you'll need:

1. **Firebase project** with iOS + Android apps registered
   - Download `google-services.json` → `android/app/google-services.json`
   - Download `GoogleService-Info.plist` → drag into Xcode iOS target
2. **Apple Developer** APNs key (`.p8`) uploaded to Firebase Cloud Messaging settings
3. A `device_tokens` table in Supabase keyed by `user_id`
4. Call `initNativePush({ onToken: saveTokenToSupabase })` after auth, e.g. in
   the auth provider's `onAuthStateChange("SIGNED_IN")` branch
5. A Supabase edge function (`supabase/functions/send-push/`) that posts to FCM
   HTTP v1 with the stored tokens

The existing `src/sw.ts` web push handlers stay as the browser/PWA fallback;
native push goes through APNs/FCM directly and works when the app is closed.

## App Store gotchas to know up front

- **Stripe**: physical goods/services are fine. Apple requires StoreKit/IAP for
  digital subscriptions or unlocking digital content — review before submission.
- **Routing**: `BrowserRouter` works in Capacitor since the WebView serves from
  `capacitor://localhost`. No change needed unless you hit hash-routing edge
  cases.
- **Supabase OAuth redirects**: add a custom URL scheme (e.g. `vano://auth/callback`)
  and register it in `capacitor.config.ts` + native Info.plist / AndroidManifest.
- **App review**: a pure web wrapper gets rejected. Push notifications + the PWA
  offline behaviour you already have count as native value, but be ready to
  demonstrate it in the review notes.

## Rolling back

This whole branch is additive. To disable mobile work without losing it:
just keep developing on `main`. To remove entirely from this branch:

```bash
npm uninstall @capacitor/core @capacitor/app @capacitor/push-notifications \
  @capacitor/cli @capacitor/ios @capacitor/android @capacitor/assets
rm -rf capacitor.config.ts src/lib/native ios android
```
