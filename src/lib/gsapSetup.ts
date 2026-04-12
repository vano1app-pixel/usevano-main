import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { TextPlugin } from 'gsap/TextPlugin';
import { Flip } from 'gsap/Flip';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, TextPlugin, Flip);

// Global defaults — smooth, cinematic feel
gsap.defaults({
  ease: 'power3.out',
  duration: 0.8,
});

export { gsap, ScrollTrigger, Flip, useGSAP };
