import React, { useRef, useState } from 'react';
import { MessageCircle, Check, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { teamWhatsAppHref } from '@/lib/contact';

const PLANS = [
  {
    name: 'Family',
    price: '€80',
    period: '/mo',
    tagline: 'Weekly help for your parent',
    features: [
      'Weekly grocery run',
      'Garden upkeep',
      'Friendly check-in',
    ],
    popular: false,
    cta: 'Get started',
    waText:
      "Hi VANO! 👋 I'd like to set up the Family plan (€80/month) for regular help for my parent. Can you tell me more about how it works?",
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
    popular: true,
    cta: 'Get started',
    waText:
      "Hi VANO! 👋 I'm interested in the Family Plus plan (€149/month) for my parent. Can you walk me through what's included?",
  },
  {
    name: 'Business',
    price: '€499',
    period: '/mo',
    tagline: 'For companies & offices',
    features: [
      'Dedicated contact',
      'Unlimited tasks',
      'Same-day dispatch',
      'Multiple helpers',
    ],
    popular: false,
    cta: 'Talk to us',
    waText:
      "Hi VANO! 👋 I'm interested in the Business plan (€499/month) for my company. Can we have a chat about what's available and how it works?",
  },
];

export const ElderlyPitch: React.FC = () => {
  return (
    <section className="relative bg-primary px-4 py-14 overflow-hidden">
      <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative max-w-4xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <p className="eyebrow mb-3 text-primary-foreground/70">For families &amp; businesses</p>
          <h2 className="display-lg text-primary-foreground mb-3">
            Worried about a parent near you?
          </h2>
          <p className="text-primary-foreground/80 text-base max-w-sm mx-auto leading-relaxed">
            One simple monthly plan. Verified students handle the weekly tasks — so you stop worrying.
          </p>
        </div>

        {/* Plan cards — swipeable on mobile, grid on desktop */}
        <ElderlyCards />

        <p className="text-center text-primary-foreground/60 text-sm mt-5">
          All plans via WhatsApp — no app, no login needed
        </p>
      </div>
    </section>
  );
};

function PlanCard({ plan }: { plan: typeof PLANS[number] }) {
  return (
    <div
      className={cn(
        'relative rounded-2xl p-6 flex flex-col h-full',
        plan.popular
          ? 'bg-white shadow-xl ring-2 ring-white/30'
          : 'bg-white/15 border border-white/25',
      )}
    >
      {plan.popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[hsl(var(--gold))] text-foreground text-xs font-bold uppercase tracking-widest rounded-full px-3 py-1 whitespace-nowrap">
          Popular
        </span>
      )}
      <p className={cn('text-xs font-bold uppercase tracking-widest mb-2', plan.popular ? 'text-muted-foreground' : 'text-white/80')}>
        {plan.name}
      </p>
      <div className="flex items-baseline gap-1 mb-1">
        <span className={cn('text-4xl font-bold leading-none tracking-tight', plan.popular ? 'text-foreground' : 'text-white')}>
          {plan.price}
        </span>
        <span className={cn('text-sm font-medium', plan.popular ? 'text-muted-foreground' : 'text-white/70')}>
          {plan.period}
        </span>
      </div>
      <p className={cn('text-sm leading-snug mb-4', plan.popular ? 'text-muted-foreground' : 'text-white/80')}>
        {plan.tagline}
      </p>
      <div className={cn('h-px mb-4', plan.popular ? 'bg-black/10' : 'bg-white/20')} />
      <ul className="space-y-2.5 mb-6 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className={cn('w-4 h-4 mt-px flex-shrink-0', plan.popular ? 'text-primary' : 'text-white')} strokeWidth={2.5} />
            <span className={cn('text-sm leading-snug', plan.popular ? 'text-foreground/80' : 'text-white')}>{f}</span>
          </li>
        ))}
      </ul>
      <a
        href={`${teamWhatsAppHref}?text=${encodeURIComponent(plan.waText)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'group flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold',
          'transition-all duration-150 active:scale-[0.96] hover:-translate-y-px',
          plan.popular
            ? 'bg-primary text-white shadow-md hover:shadow-[0_6px_20px_hsl(var(--primary)/0.4)] hover:opacity-90'
            : 'bg-white text-foreground hover:bg-white/90 hover:shadow-md',
        )}
      >
        <MessageCircle className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
        <span>{plan.cta}</span>
        <ArrowRight className="w-3.5 h-3.5 flex-shrink-0 opacity-60 group-hover:translate-x-0.5 transition-transform" />
      </a>
    </div>
  );
}

function ElderlyCards() {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

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
      {/* Mobile swipeable */}
      <div className="sm:hidden">
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
              className={cn('rounded-full transition-all duration-200', active === i ? 'w-5 h-2 bg-white' : 'w-2 h-2 bg-white/40')}
            />
          ))}
        </div>
      </div>

      {/* Desktop grid */}
      <div className="hidden sm:grid sm:grid-cols-3 gap-4 pt-4">
        {PLANS.map((plan) => (
          <PlanCard key={plan.name} plan={plan} />
        ))}
      </div>
    </div>
  );
}
