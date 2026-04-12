import { useEffect, useRef, type RefObject } from 'react';
import { animateWordsCascade, animateCharsExplodeIn, animateTextScramble } from '@/lib/animations/textEffects';

type RevealType = 'cascade' | 'explode' | 'scramble';

const isMobileViewport = () =>
  typeof window !== 'undefined' && window.innerWidth < 768;

/**
 * Hook that applies a text reveal animation to a ref'd element when it enters the viewport.
 * Mobile-optimized: downgrades 'explode' to 'cascade' and 'scramble' to 'cascade' on small screens.
 *
 * Usage:
 *   const ref = useTextReveal<HTMLHeadingElement>('cascade');
 *   <h2 ref={ref}>Built different, on purpose</h2>
 */
export function useTextReveal<T extends HTMLElement>(
  type: RevealType = 'cascade',
  options: { threshold?: number; stagger?: number; delay?: number; once?: boolean } = {}
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const mobile = isMobileViewport();
    const { threshold = 0.3, delay = 0, once = true } = options;
    // Reduce stagger on mobile for snappier feel
    const stagger = mobile ? Math.min(options.stagger ?? 0.06, 0.04) : (options.stagger ?? 0.06);
    const originalText = el.textContent || '';
    let cleanup: (() => void) | undefined;

    // Downgrade expensive animations on mobile
    // 'explode' creates a span per character — too many DOM nodes on mobile
    // 'scramble' runs RAF at 60fps — battery drain on mobile
    const effectiveType: RevealType = mobile && (type === 'explode' || type === 'scramble')
      ? 'cascade'
      : type;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        if (once && hasAnimated.current) return;
        hasAnimated.current = true;

        switch (effectiveType) {
          case 'cascade':
            animateWordsCascade(el, {
              stagger,
              delay,
              duration: mobile ? 0.6 : 0.8,
            });
            break;
          case 'explode':
            animateCharsExplodeIn(el, { stagger: 0.02, delay });
            break;
          case 'scramble': {
            const scramble = animateTextScramble(el, originalText, {
              delay,
              duration: 1.2, // Slightly shorter than default 1.5
            });
            cleanup = scramble.kill;
            break;
          }
        }

        if (once) observer.disconnect();
      },
      { threshold }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      cleanup?.();
    };
  }, [type]);

  return ref;
}
