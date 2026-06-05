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

// Silhouette fades from transparent at top to solid at bottom — gives a
// "rising from the floor" effect that looks more editorial than a flat shape.
function PersonSilhouette({ id, color }: { id: string; color: string }) {
  return (
    <svg viewBox="0 0 110 190" fill="none" className="w-full h-full" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="55%" stopColor={color} stopOpacity="0.55" />
          <stop offset="100%" stopColor={color} stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {/* Head */}
      <circle cx="55" cy="42" r="30" fill={`url(#${id})`} />
      {/* Neck */}
      <rect x="47" y="68" width="16" height="14" rx="6" fill={`url(#${id})`} />
      {/* Shoulders / torso */}
      <path d="M0 190 C0 130 18 112 55 109 C92 112 110 130 110 190Z" fill={`url(#${id})`} />
    </svg>
  );
}

export const ChatFAQ: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="py-16 bg-cream overflow-hidden">

      {/* Heading */}
      <div className="text-center mb-12 px-4">
        <p className="eyebrow mb-3">Got questions?</p>
        <h2 className="display-lg text-foreground">We've got answers</h2>
      </div>

      {/* Main stage */}
      <div ref={ref} className="relative mx-auto max-w-2xl lg:max-w-3xl" style={{ minHeight: 480 }}>

        {/* ── Left silhouette — YOU ── */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-0 bottom-0 w-32 lg:w-40 select-none"
          style={{ transform: 'translateX(-42%)' }}
        >
          <PersonSilhouette id="grad-customer" color="#94a3b8" />
          <p className="text-center text-xs font-semibold text-slate-400 tracking-wide mt-1">You</p>
        </motion.div>

        {/* ── Right silhouette — VANO (mirrored) ── */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="absolute right-0 bottom-0 w-32 lg:w-40 select-none"
          style={{ transform: 'translateX(42%) scaleX(-1)' }}
        >
          <PersonSilhouette id="grad-vano" color="hsl(143,40%,40%)" />
          <p className="text-center text-xs font-semibold tracking-wide mt-1" style={{ transform: 'scaleX(-1)', color: 'hsl(143,35%,50%)' }}>VANO</p>
        </motion.div>

        {/* ── Speech bubbles ── */}
        <div className="relative z-10 flex flex-col gap-3.5 pt-2 pb-6 px-[5.5rem] lg:px-[7rem]">
          {bubbles.map((bubble, i) => (
            <motion.div
              key={bubble.id}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={inView ? { opacity: 1, scale: 1, y: 0 } : {}}
              transition={{ delay: 0.15 + i * 0.13, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            >
              {bubble.side === 'customer' ? (
                <div className="relative self-start">
                  {/* Tail → left toward customer */}
                  <div className="absolute top-[14px] -left-[9px]" style={{ width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderRight: '10px solid white' }} />
                  <div className="bg-white border border-border/30 text-foreground rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
                    {bubble.text}
                  </div>
                </div>
              ) : (
                <div className="relative self-end">
                  {/* Tail → right toward VANO */}
                  <div className="absolute top-[14px] -right-[9px]" style={{ width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: '10px solid hsl(143,40%,40%)' }} />
                  <div className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed text-white" style={{ backgroundColor: 'hsl(143,40%,40%)' }}>
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
