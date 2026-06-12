import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Check, Gift, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { teamWhatsAppHref } from '@/lib/contact';

/**
 * Monthly plans + gifting. Successor to the elderly-only pitch: the Family
 * plans stay (strong niche), but Home Pass opens the section to every busy
 * household, and gift vouchers turn happy customers into new ones. All CTAs
 * are WhatsApp conversations — no checkout, the team closes the details.
 */

const PLANS = [
  {
    name: 'Family',
    price: '€80',
    period: '/mo',
    tagline: 'Weekly help for a parent',
    features: [
      'Weekly grocery run',
      'Garden upkeep',
      'Friendly check-in',
      'Same familiar face each week',
    ],
    popular: false,
    cta: 'Get started',
    waText:
      "Hi VANO! 👋 I'd like to set up the Family plan (€80/month) for regular help for my parent. Can you tell me more about how it works?",
  },
  {
    name: 'Home Pass',
    price: '€99',
    period: '/mo',
    tagline: 'Your home, on autopilot',
    features: [
      'Weekly 2-hour visit',
      'Mix any jobs — cleaning, garden, errands',
      'Same trusted helper every week',
      'Priority same-day booking',
      'Pause or cancel anytime',
    ],
    popular: true,
    cta: 'Get started',
    waText:
      "Hi VANO! 👋 I'm interested in the Home Pass (€99/month) — a weekly 2-hour visit for my home. Can you tell me how it works?",
  },
  {
    name: 'Family Plus',
    price: '€149',
    period: '/mo',
    tagline: 'More visits, more tasks',
    features: [
      'Twice-weekly visits',
      'Groceries & all errands',
      'Garden & tech help',
      'Priority booking',
    ],
    popular: false,
    cta: 'Get started',
    waText:
      "Hi VANO! 👋 I'm interested in the Family Plus plan (€149/month) for my parent. Can you walk me through what's included?",
  },
];

const GIFT_AMOUNTS = ['€25', '€50', '€100'];

function giftWaHref(amount: string): string {
  const text =
    `Hi VANO! 🎁 I'd like to gift a VANO voucher (${amount}) to someone — how does it work?`;
  return `${teamWhatsAppHref}?text=${encodeURIComponent(text)}`;
}

const BUSINESS_WA_TEXT =
  "Hi VANO! 👋 I'm interested in the Business plan (€499/month) for my company. Can we have a chat about what's available and how it works?";

export const HomePlans: React.FC = () => {
  return (
    <section className="relative bg-white px-4 py-14">
      <div className="relative max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <p className="eyebrow mb-3">Monthly plans</p>
          <h2 className="display-lg text-foreground mb-3">
            Put your home on autopilot
          </h2>
          <p className="text-foreground/60 text-base max-w-sm mx-auto leading-relaxed">
            One simple plan, one trusted helper — for your own place, or a parent you worry about.
          </p>
        </div>

        {/* Plan cards — swipeable on mobile, grid on desktop */}
        <PlanCards />

        <p className="text-center text-foreground/50 text-sm mt-5">
          All plans via WhatsApp — no app, no login needed
        </p>

        {/* Gift VANO */}
        <div className="mt-8 rounded-2xl border border-gold/40 bg-gold/[0.07] p-5 sm:flex sm:items-center sm:gap-5">
          <div className="flex items-start gap-3.5 flex-1 mb-4 sm:mb-0">
            <span className="w-10 h-10 rounded-xl bg-gold/15 flex items-center justify-center flex-shrink-0">
              <Gift className="w-5 h-5 text-gold" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">Gift a helping hand</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
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
                className="px-4 py-2 rounded-full border border-gold/50 bg-white text-sm font-semibold text-foreground hover:bg-gold/10 active:scale-[0.96] transition-[background-color,transform] duration-150"
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
          className="mt-3 w-full rounded-2xl border border-border/60 bg-secondary/30 px-5 py-4 flex items-center gap-3.5 hover:bg-secondary/60 active:scale-[0.99] transition-[background-color,transform] duration-150"
        >
          <span className="w-10 h-10 rounded-xl bg-navy/8 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-navy" aria-hidden="true" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-foreground">Office or business?</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              Dedicated contact, unlimited tasks, same-day dispatch — from €499/mo
            </span>
          </span>
          <span className="text-sm font-semibold text-foreground/60 flex-shrink-0">Talk to us →</span>
        </a>
      </div>
    </section>
  );
};

function PlanCard({ plan }: { plan: typeof PLANS[number] }) {
  return (
    <div
      className={cn(
        'relative flex flex-col h-full rounded-2xl border overflow-hidden',
        plan.popular
          ? 'border-primary/30 shadow-sm shadow-primary/5'
          : 'border-border/50 shadow-sm',
      )}
    >
      {plan.popular && (
        <div className="px-4 py-1.5 flex items-center gap-1.5 bg-primary">
          <span className="text-white text-[11px] font-bold tracking-wide uppercase">Most Popular</span>
        </div>
      )}
      <div className={cn('flex flex-col flex-1 p-5', plan.popular ? 'bg-primary/[0.04]' : 'bg-card')}>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">{plan.name}</p>
        <div className="flex items-end gap-1 mb-0.5">
          <span className="text-3xl font-bold tracking-tight text-foreground">{plan.price}</span>
          <span className="text-sm text-muted-foreground mb-1">{plan.period}</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{plan.tagline}</p>
        <ul className="space-y-2.5 mb-6 flex-1">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-primary" strokeWidth={2.5} />
              <span className="text-xs text-foreground/80 leading-relaxed">{f}</span>
            </li>
          ))}
        </ul>
        <a
          href={`${teamWhatsAppHref}?text=${encodeURIComponent(plan.waText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full rounded-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white transition-all duration-150 active:scale-[0.96]"
          style={{ backgroundColor: 'hsl(var(--primary))' }}
        >
          <MessageCircle className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
          <span>{plan.cta}</span>
        </a>
      </div>
    </div>
  );
}

const POPULAR_INDEX = PLANS.findIndex(p => p.popular);

function PlanCards() {
  const [active, setActive] = useState(POPULAR_INDEX);
  const trackRef = useRef<HTMLDivElement>(null);

  // Mobile carousel opens on the highlighted plan, neighbours peeking on
  // either side — set instantly before paint so there's no scroll jump.
  useEffect(() => {
    const el = trackRef.current;
    const card = el?.children[POPULAR_INDEX] as HTMLElement | undefined;
    if (el && card) el.scrollLeft = card.offsetLeft - (el.offsetWidth - card.offsetWidth) / 2;
  }, []);

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.offsetWidth));
  }

  function scrollTo(i: number) {
    trackRef.current?.scrollTo({ left: i * (trackRef.current.offsetWidth), behavior: 'smooth' });
    setActive(i);
  }

  return (
    <div>
      {/* Mobile swipeable — starts on the popular Home Pass card */}
      <div className="md:hidden">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-3 pb-2"
        >
          {PLANS.map((plan) => (
            <div key={plan.name} className="snap-center flex-shrink-0 w-[calc(100%-2rem)] pt-4">
              <PlanCard plan={plan} />
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-2 mt-3">
          {PLANS.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollTo(i)}
              aria-label={`Plan ${i + 1}`}
              className={cn('rounded-full transition-all duration-200', active === i ? 'w-5 h-2 bg-primary' : 'w-2 h-2 bg-border')}
            />
          ))}
        </div>
      </div>

      {/* Desktop grid */}
      <div className="hidden md:grid md:grid-cols-3 gap-4 pt-4">
        {PLANS.map((plan) => (
          <PlanCard key={plan.name} plan={plan} />
        ))}
      </div>
    </div>
  );
}
