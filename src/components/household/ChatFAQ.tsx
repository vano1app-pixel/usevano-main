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

// Front-facing person silhouette (head + shoulders)
function PersonSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 180" fill="currentColor" className={className} aria-hidden="true">
      {/* Head */}
      <circle cx="60" cy="44" r="34" />
      {/* Shoulders / torso */}
      <path d="M0 180 C0 118 22 100 60 97 C98 100 120 118 120 180Z" />
    </svg>
  );
}

export const ChatFAQ: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section className="py-16 bg-cream overflow-hidden">

      {/* Heading */}
      <div className="text-center mb-10 px-4">
        <p className="eyebrow mb-3">Got questions?</p>
        <h2 className="display-lg text-foreground">We've got answers</h2>
      </div>

      {/* Conversation area — silhouettes on edges, bubbles in centre */}
      <div ref={ref} className="relative mx-auto max-w-2xl lg:max-w-3xl min-h-[420px] lg:min-h-[480px] flex items-center">

        {/* LEFT silhouette — customer, partially cropped off left edge */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-0 bottom-0 -translate-x-[38%] lg:-translate-x-[30%]"
        >
          <PersonSilhouette className="w-36 h-52 lg:w-44 lg:h-64 text-slate-200" />
        </motion.div>

        {/* RIGHT silhouette — VANO helper, flipped, partially cropped off right edge */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="absolute right-0 bottom-0 translate-x-[38%] lg:translate-x-[30%]"
          style={{ transform: 'scaleX(-1) translateX(-38%)' }}
        >
          <PersonSilhouette className="w-36 h-52 lg:w-44 lg:h-64 text-primary/20" />
        </motion.div>

        {/* Speech bubbles in the centre */}
        <div className="relative z-10 w-full flex flex-col gap-4 px-28 lg:px-36">
          {bubbles.map((bubble, i) => (
            <motion.div
              key={bubble.id}
              initial={{ opacity: 0, scale: 0.92, y: 8 }}
              animate={inView ? { opacity: 1, scale: 1, y: 0 } : {}}
              transition={{ delay: 0.2 + i * 0.14, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className={bubble.side === 'customer' ? 'self-start w-full' : 'self-end w-full'}
            >
              {bubble.side === 'customer' ? (
                <div className="relative">
                  {/* Left-pointing tail toward customer silhouette */}
                  <div
                    className="absolute top-4 -left-[9px]"
                    style={{
                      width: 0, height: 0,
                      borderTop: '7px solid transparent',
                      borderBottom: '7px solid transparent',
                      borderRight: '10px solid white',
                    }}
                  />
                  <div className="bg-white border border-border/40 text-foreground rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
                    {bubble.text}
                  </div>
                </div>
              ) : (
                <div className="relative">
                  {/* Right-pointing tail toward VANO silhouette */}
                  <div
                    className="absolute top-4 -right-[9px]"
                    style={{
                      width: 0, height: 0,
                      borderTop: '7px solid transparent',
                      borderBottom: '7px solid transparent',
                      borderLeft: '10px solid hsl(var(--primary))',
                    }}
                  />
                  <div className="bg-primary text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
                    {bubble.text}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
};
