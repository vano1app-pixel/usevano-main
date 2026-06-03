import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

const STEPS = [
  {
    n: '1',
    title: 'Pick and pay in 30 seconds',
    body: 'Choose a category, pick a time, and pay securely by card. Price shown upfront — no surprises.',
  },
  {
    n: '2',
    title: 'We find your helper',
    body: 'A verified student nearby accepts the job. You get their name and photo before they arrive.',
  },
  {
    n: '3',
    title: 'Job done, you rate them',
    body: 'Your helper arrives and gets it done. Rate them after. Not happy? We\'ll make it right.',
  },
];

/* Numbered circles instead of emojis — looks intentional, not auto-generated. */
export const HowItWorks: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="px-4 py-10 lg:py-16 max-w-5xl mx-auto">
      <p className="eyebrow mb-4">How it works</p>
      <h2 className="display-lg text-foreground mb-10">Simple as that.</h2>

      <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {STEPS.map((step, i) => (
          <motion.div
            key={step.n}
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: i * 0.12, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="flex gap-5 md:flex-col md:gap-4"
          >
            {/* Number badge */}
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-sage-light flex items-center justify-center">
              <span className="text-sage font-bold text-sm tabular-nums">{step.n}</span>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1 leading-snug">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
