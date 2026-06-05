import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

const FAQ = [
  {
    q: 'Is it safe to have a student in my home?',
    a: 'Every student is verified before their first job. You see their photo and name before they arrive.',
  },
  {
    q: "What if I'm not happy?",
    a: "Tell us within 24 hours. We'll make it right or you don't pay.",
  },
  {
    q: 'How does payment work?',
    a: 'Pay by card when done. Price agreed upfront — no surprises.',
  },
  {
    q: 'Which cities do you cover?',
    a: 'Currently Galway — city and surrounding areas. More cities coming soon.',
  },
];

// Soft blurred shadow — like a person standing in front of a light
// The heavy Gaussian blur is what gives it the "projected on a wall" look
function ShadowFigure({ filterId }: { filterId: string }) {
  return (
    <svg viewBox="0 0 100 200" fill="none" className="w-full h-full">
      <defs>
        <filter id={filterId} x="-30%" y="-10%" width="160%" height="120%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`} fill="rgba(30,20,10,0.62)">
        {/* Head */}
        <ellipse cx="50" cy="34" rx="23" ry="27" />
        {/* Neck */}
        <rect x="43" y="57" width="14" height="16" rx="6" />
        {/* Torso / shoulders */}
        <path d="M8 200 C8 148 22 108 50 103 C78 108 92 148 92 200Z" />
      </g>
    </svg>
  );
}

export const ChatFAQ: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section
      className="py-12 overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse 75% 85% at 50% 100%, rgba(255,170,80,0.18) 0%, hsl(var(--cream)) 60%)',
      }}
    >
      {/* Heading */}
      <div className="text-center mb-8 px-4">
        <p className="eyebrow mb-3">Got questions?</p>
        <h2 className="display-lg text-foreground">We've got answers</h2>
      </div>

      {/* Stage: two shadows flanking the conversation */}
      <div ref={ref} className="relative max-w-xl mx-auto lg:max-w-2xl">

        {/* Left shadow — partially cropped, facing right */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="absolute left-0 bottom-0 w-28 lg:w-36 select-none pointer-events-none"
          style={{ transform: 'translateX(-35%)' }}
        >
          <ShadowFigure filterId="sf-left" />
        </motion.div>

        {/* Right shadow — mirrored */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="absolute right-0 bottom-0 w-28 lg:w-36 select-none pointer-events-none"
          style={{ transform: 'translateX(35%) scaleX(-1)' }}
        >
          <ShadowFigure filterId="sf-right" />
        </motion.div>

        {/* Speech bubbles between them */}
        <div className="relative z-10 flex flex-col gap-3 px-24 lg:px-32 pb-8 pt-1">
          {FAQ.flatMap((pair, i) => [
            /* Question bubble — left, tail pointing left toward left shadow */
            <motion.div
              key={`q-${i}`}
              initial={{ opacity: 0, x: -10 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.3 + i * 0.25, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="self-start relative max-w-full"
            >
              <div
                className="absolute top-3 -left-[8px]"
                style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderRight: '9px solid white' }}
              />
              <div className="bg-white border border-border/30 text-foreground rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm leading-relaxed shadow-sm">
                {pair.q}
              </div>
            </motion.div>,

            /* Answer bubble — right, tail pointing right toward right shadow */
            <motion.div
              key={`a-${i}`}
              initial={{ opacity: 0, x: 10 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.45 + i * 0.25, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="self-end relative max-w-full"
            >
              <div
                className="absolute top-3 -right-[8px]"
                style={{ width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '9px solid hsl(var(--primary))' }}
              />
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
