import React from 'react';
import { motion, type Variants } from 'framer-motion';

/**
 * How it works — three honest steps on a clean white band. Replaced the
 * testimonial carousel: seeded reviews read as fake, so rather than fake
 * social proof this just explains the (genuinely simple) process.
 * Plain by design — white background, black type — but it springs to life
 * on scroll so it never reads as a static block.
 */

const STEPS = [
  { n: '1', title: 'Pick a category',   lines: ['Tap what you need', 'When & where'] },
  { n: '2', title: 'Book in seconds',   lines: ['Drop your number', 'Pay only when we find a helper'] },
  { n: '3', title: 'A student does it', lines: ['Shows up & does the job', 'Gets paid at the end'] },
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
// A one-shot ripple that rings out from each number as the step lands.
const ringV: Variants = {
  hidden: { scale: 1, opacity: 0 },
  show:   { scale: 2.1, opacity: [0.4, 0], transition: { duration: 0.7, ease: 'easeOut' } },
};

export const HowItWorks: React.FC = () => {
  return (
    <section className="bg-white py-16 lg:py-20">
      <div className="px-4 max-w-5xl mx-auto">
        <div className="text-center mb-10 lg:mb-14">
          <p className="eyebrow mb-3">How it works</p>
          <h2 className="display-lg text-foreground">Help in three simple steps</h2>
        </div>

        <motion.ol
          className="grid gap-10 sm:grid-cols-3 sm:gap-8"
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
        >
          {STEPS.map((s) => (
            <motion.li key={s.n} variants={stepV} className="group text-center sm:text-left">
              <span className="relative inline-flex">
                <motion.span
                  variants={ringV}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-foreground/25"
                />
                <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background text-lg font-bold tabular-nums transition-[background-color,transform] duration-200 group-hover:bg-sage group-hover:-translate-y-0.5">
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
