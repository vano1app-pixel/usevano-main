import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface QAPair {
  q: string;
  a: string;
}

const FAQ: QAPair[] = [
  {
    q: 'Is it safe to have a student in my home?',
    a: 'Every student is verified through ATU. For indoor jobs we always send two together — our duo rule.',
  },
  {
    q: "What if I'm not happy?",
    a: "Let us know within 24 hours if anything wasn't right. We'll make it right or you don't pay.",
  },
  {
    q: 'How does payment work?',
    a: 'Pay by card at booking, Revolut or cash when the job is done — whichever suits. Price agreed upfront.',
  },
  {
    q: 'Do you cover all of Galway?',
    a: 'City and suburbs — Salthill, Knocknacarra, Renmore, Newcastle, and more. Expanding soon.',
  },
];

export const ChatFAQ: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  const bubbles = FAQ.flatMap((pair, i) => [
    { id: `q-${i}`, text: pair.q, side: 'customer' as const },
    { id: `a-${i}`, text: pair.a, side: 'vano' as const },
  ]);

  return (
    <section className="px-4 py-12 max-w-lg mx-auto md:max-w-xl lg:max-w-5xl">
      <p className="eyebrow mb-4">Got questions?</p>
      <h2 className="display-lg text-foreground mb-10">We've got answers</h2>

      {/* Ref wrapper — always in the DOM so useInView fires on both breakpoints */}
      <div ref={ref}>
        {/* Mobile: chat bubble thread */}
        <div className="flex flex-col gap-2.5 lg:hidden">
          {bubbles.map((bubble, i) => (
            <motion.div
              key={bubble.id}
              initial={{ opacity: 0, y: 8 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.15, duration: 0.38, ease: [0.16, 1, 0.3, 1] as const }}
              className={bubble.side === 'customer' ? 'self-start max-w-[85%]' : 'self-end max-w-[85%]'}
            >
              {bubble.side === 'customer' ? (
                <div className="bg-secondary text-foreground rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed shadow-tinted-sm">
                  {bubble.text}
                </div>
              ) : (
                <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed">
                  {bubble.text}
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Desktop: 2×2 card grid */}
        <div className="hidden lg:grid lg:grid-cols-2 gap-5">
          {FAQ.map((pair, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
              className="rounded-2xl border border-border/50 bg-secondary/30 p-6"
            >
              <p className="font-semibold text-foreground text-base mb-2">{pair.q}</p>
              <p className="text-muted-foreground text-sm leading-relaxed">{pair.a}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
