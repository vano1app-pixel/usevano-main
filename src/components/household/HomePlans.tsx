import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Gift, CheckCircle2 } from 'lucide-react';
import { teamWhatsAppHref } from '@/lib/contact';
import { AutopilotBuilder } from '@/components/household/AutopilotBuilder';
import { CustomJobBuilder } from '@/components/household/CustomJobBuilder';

/**
 * House Autopilot + "name any job" + gifting. The Autopilot builder opens a
 * Stripe subscription (create-autopilot-checkout); the custom builder books a
 * one-off via create-household-payment-checkout. Gift vouchers stay a WhatsApp
 * conversation. (The old self-serve monthly plans / create-plan-checkout were
 * retired — superseded by Autopilot, which prices every visit above min wage.)
 */

const GIFT_AMOUNTS = ['€25', '€50', '€100'];

function giftWaHref(amount: string): string {
  const text =
    `Hi VANO! 🎁 I'd like to gift a VANO voucher (${amount}) to someone — how does it work?`;
  return `${teamWhatsAppHref}?text=${encodeURIComponent(text)}`;
}

export const HomePlans: React.FC = () => {
  // Stripe redirects back with ?plan=success after a completed subscription
  const planSuccess = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get('plan') === 'success'; }
    catch { return false; }
  }, []);

  return (
    <section id="plans" className="relative bg-navy px-4 py-20 lg:py-28 scroll-mt-20">
      <div className="relative max-w-4xl mx-auto">

        {planSuccess && (
          <div className="mb-8 rounded-2xl border border-sage/40 bg-sage/15 px-5 py-4 flex items-start gap-3">
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
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-3" style={{ letterSpacing: '-0.02em' }}>
            Put your house on autopilot
          </h2>
          <ul className="flex flex-wrap justify-center gap-2.5">
            {['Set & forget', 'One trusted student', 'Weekly or while away'].map((chip) => (
              <li
                key={chip}
                className="inline-flex items-center rounded-full bg-white/10 border border-white/15 px-4 py-2.5 text-sm font-semibold text-white"
              >
                {chip}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Airbnb-style builder — tick services, pick dates, live price */}
        <AutopilotBuilder />

        <p className="text-center text-white/45 text-sm mt-5">
          Card, Apple Pay or Google Pay · cancel anytime · no contracts
        </p>

        {/* Name any job — custom, time-priced booking with a live fair-vs-market
            comparison. Books through the one create-household-payment-checkout
            flow, same as the quick sheet. */}
        <CustomJobBuilder />

        {/* Gift VANO — one slim row */}
        <div className="mt-3 rounded-2xl border border-gold/25 bg-gold/[0.07] px-5 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-3">
          <p className="flex items-center gap-2.5 flex-1 min-w-[200px] text-sm text-white/70">
            <Gift className="w-4 h-4 text-gold flex-shrink-0" aria-hidden="true" />
            <span><span className="font-bold text-white">Gift a helping hand</span> — we arrange it, they just open the door</span>
          </p>
          <div className="flex gap-2 flex-shrink-0">
            {GIFT_AMOUNTS.map(amount => (
              <a
                key={amount}
                href={giftWaHref(amount)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 rounded-full border border-gold/40 bg-white/5 text-xs font-semibold text-white hover:bg-gold/15 active:scale-[0.96] transition-[background-color,transform] duration-150"
              >
                {amount}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
