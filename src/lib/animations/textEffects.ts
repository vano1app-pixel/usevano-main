/**
 * Text animation utilities — word-split reveals, character animations, typewriter.
 * Works with GSAP (already installed).
 *
 * Mobile notes:
 * - splitTextIntoChars is expensive on long text (creates span per char)
 * - animateTextScramble runs RAF at 60fps — use sparingly on mobile
 * - Callers (useTextReveal) handle mobile downgrade logic
 */
import { gsap } from '@/lib/gsapSetup';

/**
 * Split a text element's content into individual word spans for animation.
 * Returns the created span elements for GSAP targeting.
 */
export function splitTextIntoWords(el: HTMLElement): HTMLSpanElement[] {
  const text = el.textContent || '';
  const words = text.split(/\s+/).filter(Boolean);
  el.innerHTML = '';
  el.style.overflow = 'hidden';

  return words.map((word, i) => {
    const span = document.createElement('span');
    span.textContent = word;
    span.style.display = 'inline-block';
    span.style.willChange = 'transform, opacity';
    if (i < words.length - 1) {
      span.innerHTML += '&nbsp;';
    }
    el.appendChild(span);
    return span;
  });
}

/**
 * Split text into individual characters for animation.
 */
export function splitTextIntoChars(el: HTMLElement): HTMLSpanElement[] {
  const text = el.textContent || '';
  el.innerHTML = '';
  el.style.overflow = 'hidden';

  return [...text].map((char) => {
    const span = document.createElement('span');
    span.textContent = char === ' ' ? '\u00A0' : char;
    span.style.display = 'inline-block';
    span.style.willChange = 'transform, opacity';
    el.appendChild(span);
    return span;
  });
}

/**
 * Animate words cascading in with physics — each word drops in with rotation.
 */
export function animateWordsCascade(
  el: HTMLElement,
  options: { stagger?: number; duration?: number; delay?: number; ease?: string } = {}
): gsap.core.Tween {
  const { stagger = 0.06, duration = 0.8, delay = 0, ease = 'back.out(1.7)' } = options;
  const words = splitTextIntoWords(el);

  gsap.set(words, { y: 50, opacity: 0, rotateX: 40, transformPerspective: 600 });
  return gsap.to(words, {
    y: 0,
    opacity: 1,
    rotateX: 0,
    stagger,
    duration,
    delay,
    ease,
  });
}

/**
 * Animate characters exploding in — each char flies in from random positions.
 */
export function animateCharsExplodeIn(
  el: HTMLElement,
  options: { stagger?: number; duration?: number; delay?: number } = {}
): gsap.core.Tween {
  const { stagger = 0.02, duration = 0.6, delay = 0 } = options;
  const chars = splitTextIntoChars(el);

  chars.forEach((char) => {
    gsap.set(char, {
      y: gsap.utils.random(-80, 80),
      x: gsap.utils.random(-40, 40),
      rotation: gsap.utils.random(-90, 90),
      scale: 0,
      opacity: 0,
    });
  });

  return gsap.to(chars, {
    y: 0,
    x: 0,
    rotation: 0,
    scale: 1,
    opacity: 1,
    stagger,
    duration,
    delay,
    ease: 'back.out(2)',
  });
}

/**
 * Animate a number counting up from 0 to target value.
 */
export function animateNumberCounter(
  el: HTMLElement,
  targetValue: number,
  options: { duration?: number; delay?: number; prefix?: string; suffix?: string } = {}
): gsap.core.Tween {
  const { duration = 1.5, delay = 0, prefix = '', suffix = '' } = options;
  const proxy = { val: 0 };

  return gsap.to(proxy, {
    val: targetValue,
    duration,
    delay,
    ease: 'power2.out',
    snap: { val: 1 },
    onUpdate: () => {
      el.textContent = `${prefix}${Math.round(proxy.val)}${suffix}`;
    },
  });
}

/**
 * Text scramble effect — characters randomize then resolve to final text.
 */
export function animateTextScramble(
  el: HTMLElement,
  finalText: string,
  options: { duration?: number; delay?: number; chars?: string } = {}
): { kill: () => void } {
  const { duration = 1.5, delay = 0, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%' } = options;

  let frame = 0;
  const totalFrames = Math.round(duration * 60);
  let raf: number;
  let timeout: number;

  const animate = () => {
    frame++;
    const progress = frame / totalFrames;
    const resolved = Math.floor(progress * finalText.length);

    let display = '';
    for (let i = 0; i < finalText.length; i++) {
      if (i < resolved) {
        display += finalText[i];
      } else if (finalText[i] === ' ') {
        display += ' ';
      } else {
        display += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    el.textContent = display;

    if (frame < totalFrames) {
      raf = requestAnimationFrame(animate);
    }
  };

  timeout = window.setTimeout(() => {
    raf = requestAnimationFrame(animate);
  }, delay * 1000);

  return {
    kill: () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
      el.textContent = finalText;
    },
  };
}
