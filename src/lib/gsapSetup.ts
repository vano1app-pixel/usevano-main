import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { TextPlugin } from 'gsap/TextPlugin';

gsap.registerPlugin(ScrollTrigger, TextPlugin);

// Global defaults — smooth, cinematic feel
gsap.defaults({
  ease: 'power3.out',
  duration: 0.8,
});

export { gsap, ScrollTrigger };
