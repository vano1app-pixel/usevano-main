import React from 'react';
import { motion, type Variants } from 'framer-motion';

/**
 * How it works — three honest steps on a clean white band. Replaced the
 * testimonial carousel: seeded reviews read as fake, so rather than fake
 * social proof this just explains the (genuinely simple) process.
 * Deliberately plain — white background, black type, numbered steps.
 */

const STEPS = [
  { n: '1', title: 'Pick a category',  body: 'Tap the help you need — cleaning, dog walk, garden, moving and more.' },
  { n: '2', title: 'Book in seconds',  body: 'Drop your number and address. You pay nothing until a helper accepts.' },
  { n: '3', title: 'A student does it', body: 'A trusted local student comes to your door and gets the job done.' },
];

const container: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};
const step: Variants = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 30 } },
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
            <motion.li key={s.n} variants={step} className="text-center sm:text-left">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background text-lg font-bold tabular-nums">
                {s.n}
              </span>
              <h3 className="mt-4 text-lg font-bold text-foreground">{s.title}</h3>
              <p className="mt-1.5 text-sm text-foreground/55 leading-relaxed max-w-xs mx-auto sm:mx-0">
                {s.body}
              </p>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
};
