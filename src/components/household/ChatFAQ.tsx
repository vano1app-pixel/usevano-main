import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface QAPair {
  q: string;
  a: string;
}

/* Short, punchy — real chat reads fast. Long answers kill the illusion. */
const FAQ: QAPair[] = [
  {
    q: 'Is it safe to have a student in my home?',
    a: 'Every student is verified through ATU. For indoor jobs we always send two together — our duo rule.',
  },
  {
    q: 'What if I\'m not happy?',
    a: 'Let us know within 24 hours if anything wasn\'t right. We\'ll make it right or you don\'t pay.',
  },
  {
    q: 'How does payment work?',
    a: 'We agree the price upfront on WhatsApp. You pay by Revolut or cash when the job is done — nothing beforehand.',
  },
  {
    q: 'Do you cover all of Galway?',
    a: 'City and suburbs — Salthill, Knocknacarra, Renmore, Newcastle, and more. Expanding soon.',
  },
];

/* The chat-bubble format is the key differentiator vs. a plain accordion.
   Bubbles animate in with a stagger on scroll entry — like a real thread loading. */
export const ChatFAQ: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  const bubbles = FAQ.flatMap((pair, i) => [
    { id: `q-${i}`, text: pair.q, side: 'customer' as const },
    { id: `a-${i}`, text: pair.a, side: 'vano'     as const },
  ]);

  return (
    <section className="px-4 py-16 max-w-lg mx-auto md:max-w-xl">
      <p className="eyebrow mb-4">Got questions?</p>
      <h2 className="display-lg text-foreground mb-10">We've got answers</h2>

      <div ref={ref} className="flex flex-col gap-2.5">
        {bubbles.map((bubble, i) => (
          <motion.div
            key={bubble.id}
            initial={{ opacity: 0, y: 8 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: i * 0.15, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
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
    </section>
  );
};
