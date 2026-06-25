import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wraps the existing Vite web build (`dist/`) in a native iOS/Android
 * shell so VANO can ship to the App Store + Google Play. It is purely additive:
 * the web app on vanojobs.com is unaffected.
 *
 * IMPORTANT — `appId` is your PERMANENT store identifier (iOS bundle id +
 * Android applicationId). It CANNOT be changed once the app is published.
 * If you want a different one, change it here BEFORE the first publish, then
 * delete + re-add the native folders (`rm -rf ios android && npx cap add ios
 * && npx cap add android`). Current value is a sensible default for vanojobs.com.
 *
 * We deliberately do NOT set `server.url`. The app loads the BUNDLED build from
 * the device (capacitor://localhost on iOS, https://localhost on Android), not
 * the live website. A webview pointed at a website gets rejected by Apple under
 * App Store Review Guideline 4.2 ("minimum functionality"); a bundled build with
 * native capabilities (push, deep-link auth, status bar, splash) is the path
 * that passes review.
 */
const config: CapacitorConfig = {
  appId: 'com.vanojobs.app',
  appName: 'VANO',
  webDir: 'dist',
  // Android serves the bundled app over https://localhost — a secure context,
  // so the existing service worker + web APIs behave the same as on the web.
  android: {
    backgroundColor: '#1a2340',
  },
  ios: {
    backgroundColor: '#1a2340',
    // Keep the webview content under the status bar / notch handled by CSS
    // safe-area insets (the app already uses env(safe-area-inset-*)).
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      // Brief brand splash, then the app fades in. The web shell paints fast
      // (lazy routes + small entry chunk), so a long splash isn't needed.
      launchShowDuration: 700,
      launchAutoHide: false, // we hide it from JS once React has mounted
      backgroundColor: '#1a2340',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
};

export default config;
