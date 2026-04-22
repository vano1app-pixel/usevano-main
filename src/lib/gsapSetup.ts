import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { TextPlugin } from 'gsap/TextPlugin';
// Runtime is Flip.js (capital F); types ship at types/flip.d.ts
// (lowercase). Pin the .js extension so Node resolves the runtime on
// case-sensitive Linux CI; bundler resolution + noImplicitAny:false
// lets the missing-types lookup fall back to `any` without error.
import { Flip } from 'gsap/Flip.js';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, TextPlugin, Flip);

// Global defaults — smooth, cinematic feel
gsap.defaults({
  ease: 'power3.out',
  duration: 0.8,
});

export { gsap, ScrollTrigger, Flip, useGSAP };
