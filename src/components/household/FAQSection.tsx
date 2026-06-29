import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { teamWhatsAppHref } from '@/lib/contact';
import { FAQS } from '@/components/household/faqData';

/**
 * One-tap FAQ. Replaced the fake chatbot — answers a visitor has to dig
 * for (open panel → tap chip → fake typing delay) aren't trust, they're
 * friction. The most important answer (safety) is open before they touch
 * anything.
 */

export const FAQSection: React.FC = () => {
  // Safety is everyone's first question — it starts open
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section className="px-4 py-20">
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
                  'rounded-2xl border bg-white overflow-hidden transition-[colors,box-shadow,transform] duration-200',
                  open
                    ? 'border-foreground/15 shadow-tinted'
                    : 'border-border/50 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-tinted-sm',
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(open ? null : i)}
                  aria-expanded={open}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-secondary/60 transition-colors duration-200"
                >
                  <span className="text-[15px] font-semibold text-foreground leading-snug">{f.q}</span>
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 flex-shrink-0 transition-[transform,color] duration-300 ease-out',
                      open ? 'rotate-180 text-foreground/70' : 'text-foreground/40',
                    )}
                    aria-hidden="true"
                  />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      key="content"
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <motion.p
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeOut', delay: 0.06 }}
                        className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed"
                      >
                        {f.a}
                      </motion.p>
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
