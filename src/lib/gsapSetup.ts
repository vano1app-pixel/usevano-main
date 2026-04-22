import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { TextPlugin } from 'gsap/TextPlugin';
// gsap's Flip plugin ships Flip.js at the package root but the type
// definitions live in types/flip.d.ts (lowercase). On Linux CI, tsc
// resolves `gsap/Flip` to types/Flip.d.ts which doesn't exist
// (case-sensitive), so we pin the .js extension + ts-expect-error to
// skip the mismatched type resolution. The runtime is the same plugin.
// @ts-expect-error gsap/Flip type casing mismatch on case-sensitive FS
import { Flip } from 'gsap/Flip.js';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, TextPlugin, Flip);

// Global defaults — smooth, cinematic feel
gsap.defaults({
  ease: 'power3.out',
  duration: 0.8,
});

export { gsap, ScrollTrigger, Flip, useGSAP };
