import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';

const STEPS = [
  {
    emoji: '📱',
    title: 'Book in 30 seconds',
    body: 'Pick your task, choose a time, and you\'re done. No calls, no forms.',
  },
  {
    emoji: '👋',
    title: 'We send a verified student',
    body: 'A vetted ATU student shows up at your door, ready to help.',
  },
  {
    emoji: '✅',
    title: 'Job done, you rate',
    body: 'Pay only when the job\'s complete. Rate your helper in one tap.',
  },
];

export const HowItWorks: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="px-4 py-12 max-w-5xl mx-auto">
      <p className="eyebrow mb-3">Simple as that</p>
      <h2 className="display-lg text-foreground mb-8">How it works</h2>

      <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STEPS.map((step, i) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{
              delay: i * 0.15,
              duration: 0.5,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <Card className="shadow-tinted rounded-2xl h-full">
              <CardContent className="p-6">
                <div className="text-4xl mb-4 leading-none" aria-hidden="true">
                  {step.emoji}
                </div>
                <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
