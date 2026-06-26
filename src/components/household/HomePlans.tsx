import React, { useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { AutopilotBuilder } from '@/components/household/AutopilotBuilder';

/**
 * House Autopilot — the flagship subscription offer. The "name any job" custom
 * booking that used to sit here moved UP into the hero (it's now the single
 * front door — see CategoryGrid), so this section is focused purely on
 * Autopilot. Currently a concierge request (no upfront charge) while supply is
 * thin; see AutopilotBuilder. (The old self-serve monthly plans /
 * create-plan-checkout were retired — superseded by Autopilot.)
 */

export const HomePlans: React.FC = () => {
  // Stripe redirects back with ?plan=success after a completed subscription
  const planSuccess = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get('plan') === 'success'; }
    catch { return false; }
  }, []);

  // Stripe returns to /?plan=success (no hash), so the homepage lands at the
  // top and this confirmation sits a few screens down — unseen, right after
  // money left the customer's account. Pull it into view on mount so the
  // subscription visibly succeeded. (Delay lets the lazy section settle first.)
  const successRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!planSuccess) return;
    const t = window.setTimeout(
      () => successRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      300,
    );
    return () => window.clearTimeout(t);
  }, [planSuccess]);

  return (
    <section id="plans" className="relative bg-navy px-4 py-20 lg:py-28 scroll-mt-20">
      {/* Soft seams — the navy band melts in and out of the cream sections
          above and below it, instead of a hard colour cut. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-cream to-transparent" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-cream to-transparent" aria-hidden="true" />
      <div className="relative max-w-4xl mx-auto">

        {planSuccess && (
          <div ref={successRef} className="mb-8 rounded-2xl border border-sage/40 bg-sage/15 px-5 py-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-sage mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-white text-sm">You're all set! 🎉</p>
              <p className="text-white/70 text-sm mt-0.5 leading-relaxed">
                Your plan is active. We'll WhatsApp you within the hour to schedule your first visit and match your regular helper.
              </p>
            </div>
          </div>
        )}

        {/* Header — eases in on scroll (only this block; the builder below owns a
            position:fixed sheet, so it must not sit under a transform ancestor) */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">House autopilot</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>
            Put your house on autopilot
          </h2>
        </motion.div>

        {/* Airbnb-style builder — tick services, pick dates, live price */}
        <AutopilotBuilder />

        <p className="text-center text-white/45 text-sm mt-5">
          No payment now · we'll WhatsApp you to set it up · cancel anytime · no contracts
        </p>
      </div>
    </section>
  );
};
