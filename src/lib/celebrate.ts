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
