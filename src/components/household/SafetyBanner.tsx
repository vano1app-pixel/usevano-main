import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

const ITEMS = [
  'Every student personally vetted',
  'Not happy? You don\'t pay.',
];

export const SafetyBanner: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section className="relative overflow-hidden bg-sage-light py-12 px-4">

      {/* Google Maps — Galway, faded background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <iframe
          title="Galway map"
          src="https://www.openstreetmap.org/export/embed.html?bbox=-9.1500%2C53.2500%2C-8.9000%2C53.3500&layer=mapnik"
          className="w-full h-full border-0"
          style={{ opacity: 0.12, filter: 'grayscale(60%)' }}
          loading="lazy"
        />
      </div>

      {/* Content */}
      <div ref={ref} className="relative max-w-5xl mx-auto">
        <p className="eyebrow mb-3">Your peace of mind</p>
        <h2 className="text-2xl font-semibold text-foreground mb-6">
          Safe, local, verified
        </h2>

        <ul className="space-y-4 lg:flex lg:gap-12 lg:space-y-0 lg:items-start">
          {ITEMS.map((item, i) => (
            <motion.li
              key={item}
              initial={{ opacity: 0, x: -12 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{
                delay: i * 0.12,
                duration: 0.45,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex items-start gap-3"
            >
              <CheckCircle2
                className="w-5 h-5 text-sage mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />
              <span className="text-foreground/80 text-sm leading-relaxed">{item}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
};
