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
    <section id="plans" className="relative bg-navy px-4 py-14 scroll-mt-20">
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

        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">House autopilot</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-3" style={{ letterSpacing: '-0.02em' }}>
            Put your house on autopilot
          </h2>
          <p className="text-white/55 text-base max-w-md mx-auto leading-relaxed">
            Tick the jobs you never want to think about again.
            One trusted local student handles them — every week,
            or just while you're away.
          </p>
          {/* Entry anchor — the default selection opens high; this keeps
              the floor visible so the offer never reads as expensive */}
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] border border-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/75">
            From €5/week · pay weekly or monthly
          </p>
        </div>

        {/* Airbnb-style builder — tick services, pick dates, live price */}
        <AutopilotBuilder />

        <p className="text-center text-white/45 text-sm mt-5">
          Card, Apple Pay or Google Pay · cancel anytime · no contracts
        </p>

        {/* Business — proper card, the second-biggest offer in the section */}
        <a
          href={`${teamWhatsAppHref}?text=${encodeURIComponent(BUSINESS_WA_TEXT)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-10 block w-full rounded-3xl border border-white/12 bg-white/[0.06] p-6 sm:p-7 hover:bg-white/[0.09] hover:border-white/20 hover:-translate-y-0.5 active:scale-[0.99] transition-[background-color,border-color,transform] duration-150"
        >
          <div className="sm:flex sm:items-center sm:gap-6">
            <div className="flex items-start gap-4 flex-1">
              <span className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-6 h-6 text-white" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-lg font-bold text-white">Office or business?</p>
                <p className="text-sm text-white/55 mt-1 leading-relaxed">
                  Dedicated contact · unlimited tasks · same-day dispatch
                </p>
              </div>
            </div>
            <div className="mt-5 sm:mt-0 flex items-center justify-between sm:flex-col sm:items-end gap-3 flex-shrink-0">
              <div className="text-left sm:text-right">
                <p className="text-white font-extrabold text-2xl tabular-nums leading-none">
                  €499<span className="text-sm font-semibold text-white/50">/mo</span>
                </p>
                <p className="text-[11px] font-medium text-white/45 tabular-nums mt-1">≈ €16/day</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-white text-navy px-5 py-2.5 text-sm font-bold">
                Talk to us →
              </span>
            </div>
          </div>
        </a>

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
