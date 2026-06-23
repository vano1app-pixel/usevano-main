import { isNativeApp, getPlatform } from '@/lib/platform';
import { initNativeAuth } from '@/lib/native/initNativeAuth';

let started = false;

/**
 * One-time native shell setup. Runs ONLY inside the Capacitor app (iOS/Android).
 * Every native plugin is dynamically imported, so none of this code ships in the
 * web bundle or loads during tests / prerender. Safe to call on every mount —
 * it no-ops on the web and after the first run.
 */
export async function initNativeApp(): Promise<void> {
  if (started || !isNativeApp()) return;
  started = true;

  const platform = getPlatform();

  // Expose the platform to CSS for any native-only tweaks (e.g. safe areas).
  // e.g. `html.native-ios .my-header { padding-top: env(safe-area-inset-top); }`
  document.documentElement.classList.add('native-app', `native-${platform}`);

  // Register the OAuth / magic-link deep-link listener as early as possible so
  // a fast auth return trip isn't missed.
  await initNativeAuth();

  // Status bar — the app UI is light (white / off-white), so we want DARK
  // icons. Counterintuitively that is Style.Light ("dark content for light
  // backgrounds"). On Android, stop the bar overlaying the webview so page
  // content never sits under the clock; iOS handles this via the safe area.
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light });
    if (platform === 'android') {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setBackgroundColor({ color: '#ffffff' });
    }
  } catch {
    /* status-bar plugin unavailable — non-fatal */
  }

  // Reveal the app now that React has painted (launchAutoHide is false in
  // capacitor.config.ts, so we control the hide for a flash-free handoff).
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {
    /* splash plugin unavailable — non-fatal */
  }
}
