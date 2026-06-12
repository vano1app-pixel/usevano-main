import React, { useMemo } from 'react';
import { Gift, Building2, CheckCircle2 } from 'lucide-react';
import { teamWhatsAppHref } from '@/lib/contact';
import { AutopilotBuilder } from '@/components/household/AutopilotBuilder';

/**
 * Monthly plans + gifting. Plans are self-serve Stripe subscriptions
 * (create-plan-checkout) — card, Apple Pay, Google Pay — with WhatsApp kept
 * as the "questions first" path. Gift vouchers and the Business plan stay
 * WhatsApp conversations.
 */

const GIFT_AMOUNTS = ['€25', '€50', '€100'];

function giftWaHref(amount: string): string {
  const text =
    `Hi VANO! 🎁 I'd like to gift a VANO voucher (${amount}) to someone — how does it work?`;
  return `${teamWhatsAppHref}?text=${encodeURIComponent(text)}`;
}


const BUSINESS_WA_TEXT =
  "Hi VANO! 👋 I'm interested in the Business plan (€499/month) for my company. Can we have a chat about what's available and how it works?";

export const HomePlans: React.FC = () => {
  // Stripe redirects back with ?plan=success after a completed subscription
  const planSuccess = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get('plan') === 'success'; }
    catch { return false; }
  }, []);

  return (
    <section id="plans" className="relative bg-navy px-4 py-14">
      <div className="relative max-w-5xl mx-auto">

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

        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">House autopilot</p>
          <h2 className="text-3xl font-bold text-white mb-3" style={{ letterSpacing: '-0.02em' }}>
            Put your house on autopilot
          </h2>
          <p className="text-white/55 text-base max-w-md mx-auto leading-relaxed">
            Tick the jobs you never want to think about again. Pick your dates.
            One trusted local student handles it — for your place, a parent's,
            or while you're away.
          </p>
        </div>

        {/* Airbnb-style builder — tick services, pick dates, live price */}
        <AutopilotBuilder />

        <p className="text-center text-white/45 text-sm mt-5">
          Card, Apple Pay or Google Pay · cancel anytime · no contracts
        </p>

        {/* Gift VANO */}
        <div className="mt-8 rounded-2xl border border-gold/30 bg-gold/[0.1] p-5 sm:flex sm:items-center sm:gap-5">
          <div className="flex items-start gap-3.5 flex-1 mb-4 sm:mb-0">
            <span className="w-10 h-10 rounded-xl bg-gold/20 flex items-center justify-center flex-shrink-0">
              <Gift className="w-5 h-5 text-gold" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold text-white">Gift a helping hand</p>
              <p className="text-xs text-white/55 mt-0.5 leading-relaxed">
                A spotless house for new parents. A garden day for your dad. We arrange everything — they just open the door.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {GIFT_AMOUNTS.map(amount => (
              <a
                key={amount}
                href={giftWaHref(amount)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-full border border-gold/40 bg-white/5 text-sm font-semibold text-white hover:bg-gold/15 active:scale-[0.96] transition-[background-color,transform] duration-150"
              >
                {amount}
              </a>
            ))}
          </div>
        </div>

        {/* Business — slim banner instead of a third-of-the-grid card */}
        <a
          href={`${teamWhatsAppHref}?text=${encodeURIComponent(BUSINESS_WA_TEXT)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 flex items-center gap-3.5 hover:bg-white/[0.08] active:scale-[0.99] transition-[background-color,transform] duration-150"
        >
          <span className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-white" aria-hidden="true" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-white">Office or business?</span>
            <span className="block text-xs text-white/50 mt-0.5">
              Dedicated contact, unlimited tasks, same-day dispatch — from €499/mo
            </span>
          </span>
          <span className="text-sm font-semibold text-white/60 flex-shrink-0">Talk to us →</span>
        </a>
      </div>
    </section>
  );
};
