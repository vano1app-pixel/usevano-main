import confetti from 'canvas-confetti';

// Shared celebration helpers so every "you did a thing" micro-moment in
// the freelancer onboarding flow has the same feel. Respect the user's
// reduced-motion preference in every path — opting out of animation
// should never leave a user stuck, and confetti over a form is the
// thing most likely to feel hostile to someone who opted out.

function reducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Tiny one-burst confetti. Used for micro-moments like "you picked a
 * category" — a small dopamine hit that keeps momentum from one step
 * to the next without being as loud as the publish celebration.
 */
export function microCelebrate(): void {
  if (reducedMotion()) return;
  if (typeof window === 'undefined') return;
  confetti({
    particleCount: 22,
    spread: 55,
    startVelocity: 28,
    ticks: 110,
    gravity: 1.1,
    zIndex: 80,
    origin: { x: 0.5, y: 0.35 },
    colors: ['#3b82f6', '#10b981', '#f59e0b'],
    disableForReducedMotion: true,
  });
}

/**
 * Bigger, brand-coloured burst for the headline "you're booked & paid"
 * moment on the tracking screen — a centre pop plus two side cannons a beat
 * later. Reduced-motion safe (no-op when the user has opted out).
 */
export function celebrateBooking(): void {
  if (reducedMotion()) return;
  if (typeof window === 'undefined') return;
  const base = {
    spread: 70,
    ticks: 160,
    gravity: 1,
    zIndex: 80,
    colors: ['#4a7c59', '#f5b301', '#10b981', '#ffffff'],
    disableForReducedMotion: true,
  } as const;
  confetti({ ...base, particleCount: 60, startVelocity: 38, origin: { x: 0.5, y: 0.3 } });
  setTimeout(() => {
    confetti({ ...base, particleCount: 28, angle: 60, origin: { x: 0, y: 0.65 } });
    confetti({ ...base, particleCount: 28, angle: 120, origin: { x: 1, y: 0.65 } });
  }, 140);
}
