import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { teamWhatsAppHref } from '@/lib/contact';

/**
 * One-tap FAQ. Replaced the fake chatbot — answers a visitor has to dig
 * for (open panel → tap chip → fake typing delay) aren't trust, they're
 * friction. The most important answer (safety) is open before they touch
 * anything.
 */

const FAQS = [
  {
    q: 'Is it safe to have a student in my home?',
    a: 'Every student is ID-verified before their first job. You see their photo, name and rating before they arrive — and you can rate them afterwards.',
  },
  {
    q: 'How does payment work?',
    a: 'You pay by card only after a helper accepts your job. The price is agreed upfront and locked in — no surprise charges after.',
  },
  {
    q: 'How quickly can someone arrive?',
    a: 'Most jobs are confirmed within a few hours. For urgent requests, message us on WhatsApp and we\'ll do our best to sort something same-day.',
  },
  {
    q: 'What if I\'m not satisfied?',
    a: 'Tell us within 24 hours. We\'ll make it right — either re-do the job or give you a refund. Your satisfaction is guaranteed.',
  },
  {
    q: 'Which areas do you cover?',
    a: 'Galway city and the surrounding areas right now. More on the way — drop us a WhatsApp if yours isn\'t covered yet.',
  },
];

export const FAQSection: React.FC = () => {
  // Safety is everyone's first question — it starts open
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section className="px-4 py-14">
      <div className="max-w-lg mx-auto">
        <p className="eyebrow mb-3">Got questions?</p>
        <h2 className="display-lg text-foreground mb-8">Quick answers</h2>

        <div className="space-y-2.5">
          {FAQS.map((f, i) => {
            const open = openIdx === i;
            return (
              <div
                key={f.q}
                className={cn(
                  'rounded-2xl border bg-white overflow-hidden transition-colors duration-150',
                  open ? 'border-foreground/15 shadow-tinted' : 'border-border/50',
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(open ? null : i)}
                  aria-expanded={open}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="text-[15px] font-semibold text-foreground leading-snug">{f.q}</span>
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 text-foreground/40 flex-shrink-0 transition-transform duration-200',
                      open && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <p className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Escape hatch — a human, one tap away */}
        <a
          href={`${teamWhatsAppHref}?text=${encodeURIComponent('Hi VANO! Quick question — ')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 flex items-center justify-center gap-1.5 py-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" aria-hidden="true" />
          Something else?<span className="font-semibold text-foreground/80 underline underline-offset-2">WhatsApp us</span> — we reply in minutes
        </a>
      </div>
    </section>
  );
};
