/**
 * Cursor effect utilities — magnetic pull, glow follow, custom cursor.
 * All effects are desktop-only and respect prefers-reduced-motion.
 */
import { gsap } from '@/lib/gsapSetup';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isTouchDevice = () =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

/**
 * Apply a magnetic hover effect to an element.
 * The element subtly follows the cursor within its bounds.
 */
export function applyMagneticEffect(
  el: HTMLElement,
  options: { strength?: number; ease?: string; duration?: number } = {}
): () => void {
  if (prefersReducedMotion() || isTouchDevice()) return () => {};

  const { strength = 0.3, ease = 'power3.out', duration = 0.4 } = options;
  const rect = () => el.getBoundingClientRect();

  const onMove = (e: MouseEvent) => {
    const r = rect();
    const x = (e.clientX - r.left - r.width / 2) * strength;
    const y = (e.clientY - r.top - r.height / 2) * strength;
    gsap.to(el, { x, y, duration, ease });
  };

  const onLeave = () => {
    gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)' });
  };

  el.addEventListener('mousemove', onMove);
  el.addEventListener('mouseleave', onLeave);

  return () => {
    el.removeEventListener('mousemove', onMove);
    el.removeEventListener('mouseleave', onLeave);
    gsap.set(el, { x: 0, y: 0 });
  };
}

/**
 * Create a cursor glow/trail element that follows the mouse.
 * Returns a cleanup function.
 */
export function createCursorGlow(options: {
  size?: number;
  color?: string;
  opacity?: number;
  blur?: number;
} = {}): () => void {
  if (prefersReducedMotion() || isTouchDevice()) return () => {};

  const { size = 300, color = 'hsl(221 83% 53%)', opacity = 0.06, blur = 80 } = options;

  const glow = document.createElement('div');
  glow.className = 'cursor-glow-effect';
  Object.assign(glow.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
    opacity: String(opacity),
    filter: `blur(${blur}px)`,
    pointerEvents: 'none',
    zIndex: '9998',
    transform: 'translate(-50%, -50%)',
    willChange: 'transform',
    transition: 'opacity 0.3s ease',
  });

  document.body.appendChild(glow);

  let raf: number;
  const onMove = (e: MouseEvent) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      glow.style.transform = `translate(${e.clientX - size / 2}px, ${e.clientY - size / 2}px)`;
    });
  };

  const onLeave = () => { glow.style.opacity = '0'; };
  const onEnter = () => { glow.style.opacity = String(opacity); };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseleave', onLeave);
  document.addEventListener('mouseenter', onEnter);

  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseleave', onLeave);
    document.removeEventListener('mouseenter', onEnter);
    glow.remove();
  };
}
