import React from 'react';
import { motion, type Variants } from 'framer-motion';

/**
 * How it works — three honest steps on a clean white band, explaining the
 * (genuinely simple) process before any social proof is asked for. The
 * ReviewCarousel lives further down the page and shows ONLY real
 * household_ratings (no seed testimonials — deleted July 2026), each with
 * the "Verified booking" badge.
 * Step 3's "ID-verified student" is literally enforced: dispatch and
 * accept-job only give jobs to id_verified helpers (the first-job gate).
 * Plain by design — white background, black type — but it springs to life
 * on scroll so it never reads as a static block.
 */

const STEPS = [
  { n: '1', title: 'Tap what you need', lines: ['Pick a job — no typing', 'See a fair price'] },
  { n: '2', title: 'Book in seconds',      lines: ['Drop your number', 'Small fee only when a helper accepts'] },
  { n: '3', title: 'An ID-verified student does it', lines: ['Shows up & does the job', 'Pay them directly when it’s done'] },
];

const container: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.16, delayChildren: 0.05 } },
};
// The whole step pops up together — guaranteed visible, with a little bounce.
const stepV: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.9 },
  show:   { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 16 } },
};
// A one-shot gold ripple that rings out from each number as the step lands.
const ringV: Variants = {
  hidden: { scale: 1, opacity: 0 },
  show:   { scale: 2.1, opacity: [0.5, 0], transition: { duration: 0.7, ease: 'easeOut' } },
};
// The connector line between the three numbers draws itself left-to-right.
const lineV: Variants = {
  hidden: { scaleX: 0, opacity: 0 },
  show:   { scaleX: 1, opacity: 1, transition: { duration: 0.8, delay: 0.25, ease: [0.16, 1, 0.3, 1] } },
};

export const HowItWorks: React.FC = () => {
  return (
    <section className="bg-white py-20 lg:pt-28 lg:pb-20 lg:min-h-screen lg:flex lg:flex-col lg:justify-center">
      <div className="px-4 max-w-5xl mx-auto">
        <div className="text-center mb-10 lg:mb-14">
          <p className="eyebrow mb-3">How it works</p>
          <h2 className="display-lg text-foreground">Help in three simple steps</h2>
        </div>

        <motion.ol
          className="relative grid gap-10 sm:grid-cols-3 sm:gap-8"
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
        >
          {/* Gold connector threading the three steps (desktop). Sits at the
              vertical centre of the number row and draws in left-to-right, so
              the section reads as a journey 1 → 2 → 3. */}
          <motion.div
            aria-hidden="true"
            variants={lineV}
            className="hidden sm:block absolute left-[8%] right-[8%] top-[22px] h-px origin-left"
            style={{ background: 'linear-gradient(90deg, transparent, hsl(43 90% 60% / 0.55) 14%, hsl(43 90% 60% / 0.55) 86%, transparent)' }}
          />
          {STEPS.map((s) => (
            <motion.li key={s.n} variants={stepV} className="group text-center sm:text-left">
              <span className="relative inline-flex">
                <motion.span
                  variants={ringV}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-gold/40"
                />
                <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background text-lg font-bold tabular-nums ring-2 ring-gold/30 transition-[background-color,transform,box-shadow] duration-200 group-hover:bg-sage group-hover:-translate-y-0.5 group-hover:ring-gold/60">
                  {s.n}
                </span>
              </span>
              <h3 className="mt-4 text-lg font-bold text-foreground">{s.title}</h3>
              <ul className="mt-3 flex flex-col gap-1.5 items-center sm:items-start">
                {s.lines.map((line) => (
                  <li
                    key={line}
                    className="inline-flex items-center rounded-full bg-secondary border border-border px-3 py-1 text-xs font-semibold text-foreground/80"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
};
