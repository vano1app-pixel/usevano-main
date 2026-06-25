import { Capacitor } from '@capacitor/core';

/**
 * Platform detection for the native (Capacitor) shell.
 *
 * `isNativeApp()` is TRUE only inside the iOS/Android app built with Capacitor.
 * It is FALSE everywhere else — the website on vanojobs.com, local dev, the
 * Node prerender step, and the vitest test env (Capacitor reports "web" there).
 *
 * Use it to gate web-only UI (PWA install prompts, the web service-worker
 * auto-updater, the iOS "Add to Home Screen" tip) that is meaningless or broken
 * inside the store app. The web build is completely unaffected.
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Current platform: 'ios' | 'android' | 'web'. */
export function getPlatform(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
}
