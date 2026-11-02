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

  // ── Safe areas ───────────────────────────────────────────────────────────
  // env(safe-area-inset-*) reports 0px inside the Capacitor WKWebView even
  // though the webview IS full-screen (measured on the iPhone 17 Pro
  // simulator 2026-09-06: env top = 0, window.innerHeight === screen.height),
  // so every CSS rule that trusted env() was inert and the fixed nav sat
  // under the clock. Read the real status-bar height from the StatusBar
  // plugin instead and publish both insets as CSS variables; index.css reads
  // them with env() as the web fallback. Fail-soft: if the plugin can't
  // answer we leave the variables unset and env() takes over as before.
  void (async () => {
    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      const info = await StatusBar.getInfo();
      const top = typeof info.height === 'number' && info.height > 0 ? info.height : 0;
      if (top > 0) {
        document.documentElement.style.setProperty('--vano-safe-top', `${top}px`);
        // iOS gives no API for the home-indicator inset, but it is a fixed
        // 34pt on every device that has one — and every such device also has
        // a tall (>24pt) status bar, which is what we key on. Devices with a
        // classic 20pt bar have a physical home button and need nothing.
        if (platform === 'ios' && top > 24) {
          document.documentElement.style.setProperty('--vano-safe-bottom', '34px');
        }
      }
    } catch {
      /* status-bar plugin unavailable — env() fallback stands */
    }
  })();

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
