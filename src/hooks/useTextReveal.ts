import { useEffect, useRef, type RefObject } from 'react';
import { animateWordsCascade, animateCharsExplodeIn, animateTextScramble } from '@/lib/animations/textEffects';

type RevealType = 'cascade' | 'explode' | 'scramble';

/**
 * Hook that applies a text reveal animation to a ref'd element when it enters the viewport.
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

    const { threshold = 0.3, stagger = 0.06, delay = 0, once = true } = options;
    const originalText = el.textContent || '';
    let cleanup: (() => void) | undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        if (once && hasAnimated.current) return;
        hasAnimated.current = true;

        switch (type) {
          case 'cascade':
            animateWordsCascade(el, { stagger, delay });
            break;
          case 'explode':
            animateCharsExplodeIn(el, { stagger: 0.02, delay });
            break;
          case 'scramble': {
            const scramble = animateTextScramble(el, originalText, { delay });
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
