import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

const FAQ = [
  { q: 'Is it safe to have a student in my home?', a: 'Every student is verified before their first job. You see their photo and name before they arrive.' },
  { q: "What if I'm not happy?", a: "Tell us within 24 hours. We'll make it right or you don't pay." },
  { q: 'How does payment work?', a: 'Pay by card when done. Price agreed upfront — no surprises.' },
  { q: 'Which cities do you cover?', a: 'Currently Galway — city and surrounding areas. More cities coming soon.' },
];

function ShadowShape({ flip = false }: { flip?: boolean }) {
  return (
    <div className="w-full h-full" style={{ filter: 'blur(9px)', transform: flip ? 'scaleX(-1)' : undefined }}>
      <svg viewBox="0 0 100 230" fill="rgba(28,18,6,0.72)" className="w-full h-full" preserveAspectRatio="xMidYMax meet">
        <ellipse cx="50" cy="36" rx="26" ry="30" />
        <rect x="42" y="62" width="16" height="20" rx="7" />
        <path d="M0 230 C0 158 16 118 50 113 C84 118 100 158 100 230Z" />
      </svg>
    </div>
  );
}

export const ChatFAQ: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section
      className="py-12 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 65% 65% at 50% 55%, rgba(255,155,55,0.17) 0%, hsl(var(--cream)) 68%)' }}
    >
      <div className="text-center mb-8 px-4">
        <p className="eyebrow mb-3">Got questions?</p>
        <h2 className="display-lg text-foreground">We've got answers</h2>
      </div>

      <div ref={ref} className="flex items-stretch max-w-2xl mx-auto lg:max-w-3xl">

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="w-24 lg:w-32 flex-shrink-0 -mr-3"
        >
          <ShadowShape />
        </motion.div>

        <div className="flex-1 flex flex-col gap-3 py-2 px-2 z-10">
          {FAQ.flatMap((pair, i) => [
            <motion.div
              key={`q-${i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.25 + i * 0.22, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              className="self-start relative"
            >
              <div className="absolute top-3 -left-[8px]" style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderRight: '9px solid white' }} />
              <div className="bg-white border border-border/30 text-foreground rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm leading-relaxed shadow-sm">{pair.q}</div>
            </motion.div>,

            <motion.div
              key={`a-${i}`}
              initial={{ opacity: 0, x: 8 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.4 + i * 0.22, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              className="self-end relative"
            >
              <div className="absolute top-3 -right-[8px]" style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '9px solid hsl(var(--primary))' }} />
              <div className="bg-primary text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm leading-relaxed">{pair.a}</div>
            </motion.div>,
          ])}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="w-24 lg:w-32 flex-shrink-0 -ml-3"
        >
          <ShadowShape flip />
        </motion.div>

      </div>
    </section>
  );
};
