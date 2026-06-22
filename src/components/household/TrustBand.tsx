import React from 'react';
import { ShieldCheck, Eye, CreditCard, BadgeCheck } from 'lucide-react';
import { motion, type Variants } from 'framer-motion';

/**
 * "Booked with confidence" — the trust band that backs the hero's promise
 * ("…from someone you trust"). For a service with few reviews yet, the proof
 * isn't testimonials — it's the vetting + "you see them first" + risk-free
 * structure. Sits right after the activity ticker, where doubt peaks, before
 * "How it works". Cream base so it blends with the surrounding sections rather
 * than cutting in as a hard band.
 */

const PILLARS = [
  { icon: ShieldCheck, title: 'ID-verified & vetted', line: 'Every helper passes an ID + selfie check before their first job.' },
  { icon: Eye,         title: 'You see them first',   line: 'Name, photo and rating before they arrive.' },
  { icon: CreditCard,  title: 'Protected payment',    line: "Pay only after a helper accepts — protected until the job's done." },
  { icon: BadgeCheck,  title: 'Money-back guarantee', line: "Not right? We'll make it right or refund you." },
];

const container: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 360, damping: 26 } },
};

export const TrustBand: React.FC = () => (
  <section className="bg-cream px-4 py-14 lg:py-16" aria-label="Why Vano is safe">
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-10">
        <span className="eyebrow">Booked with confidence</span>
        <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          Every helper is ID-verified, and your booking is protected from the moment you request to the moment it's done.
        </p>
      </div>

      <motion.ul
        className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-9"
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-60px' }}
      >
        {PILLARS.map(({ icon: Icon, title, line }) => (
          <motion.li
            key={title}
            variants={item}
            className="flex flex-col items-center text-center lg:items-start lg:text-left gap-2.5"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sage/12 text-sage">
              <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </span>
            <h3 className="text-sm font-bold text-foreground leading-tight">{title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[26ch]">{line}</p>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  </section>
);
