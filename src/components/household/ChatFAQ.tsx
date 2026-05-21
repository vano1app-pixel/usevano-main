import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface QAPair {
  question: string;
  answer: string;
}

const FAQ: QAPair[] = [
  {
    question: "Is it safe to have a stranger in my home?",
    answer: "Every student is verified through their ATU student ID. For indoor tasks we always send two students together — our duo system. You'll see their name, photo, and rating before they arrive.",
  },
  {
    question: "What if I'm not happy with the job?",
    answer: "You have 24 hours to review before we release payment. If something's wrong, just let us know and we'll sort it — full refund or we send someone back out.",
  },
  {
    question: "Can they come inside my house?",
    answer: "Yes! Cleaning and indoor tasks are covered. We always send two students for indoor jobs — it's our standard for everyone's safety and peace of mind.",
  },
  {
    question: "When do I actually pay?",
    answer: "Your card is only charged once the job is marked complete. You're never charged upfront — only when you're happy with the work.",
  },
  {
    question: "Do you cover all of Galway?",
    answer: "Right now we cover Galway city and suburbs — Salthill, Knocknacarra, Renmore, Castlebar Road, Newcastle, and surrounding areas. Expanding soon!",
  },
];

/* Each bubble pair renders as: customer question (left) → VANO answer (right).
   Framer-motion staggers each bubble appearing with a 200ms delay, mimicking
   a real chat thread loading in — this is the key differentiator vs. a plain FAQ list. */
export const ChatFAQ: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  // Build a flat array of bubbles so we can assign a sequential delay
  const bubbles = FAQ.flatMap((pair, i) => [
    { id: `q-${i}`, text: pair.question, side: 'customer' as const },
    { id: `a-${i}`, text: pair.answer,   side: 'vano'     as const },
  ]);

  return (
    <section className="px-4 py-12 max-w-lg mx-auto md:max-w-xl">
      <p className="eyebrow mb-3">Got questions?</p>
      <h2 className="text-2xl font-semibold text-foreground mb-8">
        We've got answers
      </h2>

      <div ref={ref} className="flex flex-col gap-3">
        {bubbles.map((bubble, i) => (
          <motion.div
            key={bubble.id}
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{
              delay: i * 0.18,
              duration: 0.4,
              ease: [0.16, 1, 0.3, 1],
            }}
            className={bubble.side === 'customer' ? 'self-start max-w-[82%]' : 'self-end max-w-[82%]'}
          >
            {bubble.side === 'customer' ? (
              /* Customer bubble — left-aligned, bottom-left corner is sharp (rounded-bl-sm) */
              <div className="bg-secondary text-foreground rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed shadow-tinted-sm">
                {bubble.text}
              </div>
            ) : (
              /* VANO reply — right-aligned, bottom-right corner sharp */
              <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed shadow-tinted-sm">
                {bubble.text}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
};
