import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

const FAQ = [
  { q: 'Is it safe to have a student in my home?', a: 'Every student is verified before their first job. You see their photo and name before they arrive.' },
  { q: "What if I'm not happy?", a: "Tell us within 24 hours. We'll make it right or you don't pay." },
  { q: 'How does payment work?', a: 'Pay by card when done. Price agreed upfront — no surprises.' },
  { q: 'Which cities do you cover?', a: 'Currently Galway — city and surrounding areas. More cities coming soon.' },
];

// The SVG is just the shape — CSS blur on the wrapper gives the soft shadow effect
function ShadowShape() {
  return (
    <svg viewBox="0 0 100 240" fill="rgba(30,20,8,0.55)" className="w-full h-full" preserveAspectRatio="xMidYMax meet">
      <ellipse cx="50" cy="38" rx="26" ry="30" />
      <rect x="42" y="64" width="16" height="20" rx="7" />
      <path d="M2 240 C2 165 18 125 50 120 C82 125 98 165 98 240Z" />
    </svg>
  );
}

export const ChatFAQ: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section
      className="py-12 overflow-hidden relative"
      style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 100%, rgba(255,165,70,0.15) 0%, hsl(var(--cream)) 65%)' }}
    >
      {/* Heading */}
      <div className="text-center mb-8 px-4 relative z-10">
        <p className="eyebrow mb-3">Got questions?</p>
        <h2 className="display-lg text-foreground">We've got answers</h2>
      </div>

      {/* Stage */}
      <div ref={ref} className="relative max-w-xl mx-auto lg:max-w-2xl">

        {/* LEFT shadow — spans full height, cropped off left edge */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="absolute inset-y-0 left-0 w-36 lg:w-44 pointer-events-none select-none"
          style={{ transform: 'translateX(-52%)', filter: 'blur(10px)' }}
        >
          <ShadowShape />
        </motion.div>

        {/* RIGHT shadow — mirrored */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="absolute inset-y-0 right-0 w-36 lg:w-44 pointer-events-none select-none"
          style={{ transform: 'translateX(52%) scaleX(-1)', filter: 'blur(10px)' }}
        >
          <ShadowShape />
        </motion.div>

        {/* Bubbles — centred between the two shadows */}
        <div className="relative z-10 flex flex-col gap-3 px-24 lg:px-28 pb-6 pt-1">
          {FAQ.flatMap((pair, i) => [
            <motion.div
              key={`q-${i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.3 + i * 0.22, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              className="self-start relative"
            >
              <div className="absolute top-3 -left-[8px]" style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderRight: '9px solid white' }} />
              <div className="bg-white border border-border/30 text-foreground rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm leading-relaxed shadow-sm">
                {pair.q}
              </div>
            </motion.div>,

            <motion.div
              key={`a-${i}`}
              initial={{ opacity: 0, x: 8 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.44 + i * 0.22, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              className="self-end relative"
            >
              <div className="absolute top-3 -right-[8px]" style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '9px solid hsl(var(--primary))' }} />
              <div className="bg-primary text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm leading-relaxed">
                {pair.a}
              </div>
            </motion.div>,
          ])}
        </div>

      </div>
    </section>
  );
};
