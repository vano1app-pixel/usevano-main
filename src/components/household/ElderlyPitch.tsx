import React, { useRef, useState } from 'react';
import { MessageCircle, Check } from 'lucide-react';
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
    <section className="relative bg-white px-4 py-14">
      <div className="relative max-w-4xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <p className="eyebrow mb-3 text-foreground/50">For families &amp; businesses</p>
          <h2 className="display-lg text-foreground mb-3">
            Worried about a parent near you?
          </h2>
          <p className="text-foreground/60 text-base max-w-sm mx-auto leading-relaxed">
            One simple monthly plan. Verified students handle the weekly tasks — so you stop worrying.
          </p>
        </div>

        {/* Plan cards — swipeable on mobile, grid on desktop */}
        <ElderlyCards />

        <p className="text-center text-foreground/50 text-sm mt-5">
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
