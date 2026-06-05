import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

const FAQ = [
  {
    q: 'Is it safe to have a student in my home?',
    a: 'Every student is verified before their first job. You see their photo and name before they arrive.',
  },
  {
    q: "What if I'm not happy?",
    a: "Tell us within 24 hours. We'll make it right or you don't pay — guaranteed.",
  },
  {
    q: 'How does payment work?',
    a: 'Pay by card when the job is done. Price agreed upfront — no surprises.',
  },
  {
    q: 'Which cities do you cover?',
    a: 'Currently Galway — city and surrounding areas. More cities coming soon.',
  },
];

const bubbles = FAQ.flatMap((pair, i) => [
  { id: `q-${i}`, text: pair.q, side: 'customer' as const },
  { id: `a-${i}`, text: pair.a, side: 'vano' as const },
]);

function PersonSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 84" fill="currentColor" className={className}>
      <circle cx="30" cy="18" r="15" />
      <path d="M3 84 C3 56 13 46 30 44 C47 46 57 56 57 84Z" />
    </svg>
  );
}

export const ChatFAQ: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section className="py-16 bg-cream">
      <div className="px-4 max-w-xl mx-auto lg:max-w-2xl">

        <div className="text-center mb-10">
          <p className="eyebrow mb-3">Got questions?</p>
          <h2 className="display-lg text-foreground">We've got answers</h2>
        </div>

        <div ref={ref} className="relative">

          {/* Chat bubbles */}
          <div className="flex flex-col gap-4 pb-2">
            {bubbles.map((bubble, i) => (
              <motion.div
                key={bubble.id}
                initial={{ opacity: 0, y: 14, scale: 0.96 }}
                animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
                transition={{ delay: i * 0.13, duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                className={bubble.side === 'customer' ? 'self-start max-w-[78%]' : 'self-end max-w-[78%]'}
              >
                {bubble.side === 'customer' ? (
                  <div className="relative">
                    <div className="bg-white border border-border/40 text-foreground rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
                      {bubble.text}
                    </div>
                    {/* tail pointing down-left toward customer silhouette */}
                    <div
                      className="absolute -bottom-[9px] left-4"
                      style={{
                        width: 0, height: 0,
                        borderLeft: '7px solid transparent',
                        borderRight: '7px solid transparent',
                        borderTop: '10px solid white',
                        filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.06))',
                      }}
                    />
                  </div>
                ) : (
                  <div className="relative">
                    <div className="bg-primary text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed">
                      {bubble.text}
                    </div>
                    {/* tail pointing down-right toward VANO silhouette */}
                    <div
                      className="absolute -bottom-[9px] right-4"
                      style={{
                        width: 0, height: 0,
                        borderLeft: '7px solid transparent',
                        borderRight: '7px solid transparent',
                        borderTop: '10px solid hsl(var(--primary))',
                      }}
                    />
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Silhouettes */}
          <div className="flex justify-between items-end mt-10 px-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-2"
            >
              <PersonSilhouette className="w-14 h-[72px] text-slate-200" />
              <span className="text-xs text-muted-foreground/70 font-medium tracking-wide">You</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-2"
            >
              <PersonSilhouette className="w-14 h-[72px] text-primary/25" />
              <span className="text-xs text-muted-foreground/70 font-medium tracking-wide">VANO</span>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
};
