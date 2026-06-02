import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { IrelandMap } from './IrelandMap';

const ITEMS = [
  'Every student Garda vetted',
  'Not happy? You don\'t pay.',
];

export const SafetyBanner: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section className="bg-sage-light py-12 px-4">
      <div ref={ref} className="max-w-5xl mx-auto">
        <div className="lg:grid lg:grid-cols-2 lg:gap-12 lg:items-center">

          {/* Left: trust copy */}
          <div>
            <p className="eyebrow mb-3">Your peace of mind</p>
            <h2 className="text-2xl font-semibold text-foreground mb-6">
              Safe, local, verified
            </h2>

            <ul className="space-y-4">
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

          {/* Right: Ireland map zoomed on Galway */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.2, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10 lg:mt-0"
          >
            <IrelandMap />
          </motion.div>

        </div>
      </div>
    </section>
  );
};
