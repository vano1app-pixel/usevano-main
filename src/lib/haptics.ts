/**
 * A tiny haptic tick for confirming key taps (book, start a plan, tick a
 * service). Only fires where the Vibration API exists — Android Chrome and
 * friends; iOS Safari has no web vibration, so it silently no-ops there.
 * Kept short and subtle: this is a confirmation, not a buzzer.
 */
export function haptic(ms = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported — no-op */
  }
}
