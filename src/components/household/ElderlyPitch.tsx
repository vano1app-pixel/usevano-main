import React from 'react';
import { MessageCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const WHATSAPP = '353899817111';

const PLANS = [
  {
    name: 'Family',
    price: '€80',
    period: '/month',
    tagline: 'Weekly help for your parent',
    features: [
      'Weekly grocery run',
      'Garden upkeep',
      'Friendly check-in',
    ],
    popular: false,
    cta: 'Get started',
    waText:
      "Hi VANO! 👋 I'd like to set up the Family plan (€80/month) for regular help for my parent in Galway. Can you tell me more about how it works?",
  },
  {
    name: 'Family Plus',
    price: '€149',
    period: '/month',
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
      "Hi VANO! 👋 I'm interested in the Family Plus plan (€149/month) for my parent in Galway. Can you walk me through what's included?",
  },
  {
    name: 'Business',
    price: '€499',
    period: '/month',
    tagline: 'For companies & offices',
    features: [
      'Dedicated contact person',
      'Unlimited task requests',
      'Same-day dispatch',
      'Multiple helpers on call',
    ],
    popular: false,
    cta: 'Talk to us',
    waText:
      "Hi VANO! 👋 I'm interested in the Business plan (€499/month) for my company in Galway. Can we have a chat about what's available and how it works?",
  },
];

export const ElderlyPitch: React.FC = () => {
  return (
    <section className="relative bg-primary px-4 py-20 overflow-hidden">
      <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative max-w-4xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <p className="eyebrow mb-4 text-primary-foreground/60">For families &amp; businesses</p>
          <h2 className="display-lg text-primary-foreground mb-4">
            Worried about a parent in Galway?
          </h2>
          <p className="text-primary-foreground/70 text-base max-w-sm mx-auto leading-relaxed">
            One simple monthly plan. Vetted students handle the weekly tasks — so you stop worrying.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                'relative rounded-2xl p-5 flex flex-col',
                plan.popular
                  ? 'bg-white shadow-xl'
                  : 'bg-white/10 border border-white/15',
              )}
            >
              {/* Most popular badge */}
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[hsl(var(--gold))] text-foreground text-[10px] font-bold uppercase tracking-widest rounded-full px-3 py-1 whitespace-nowrap">
                  Most popular
                </span>
              )}

              {/* Price */}
              <div className="mb-4">
                <p className={cn(
                  'text-[10px] font-bold uppercase tracking-widest mb-2',
                  plan.popular ? 'text-muted-foreground' : 'text-primary-foreground/50',
                )}>
                  {plan.name}
                </p>
                <div className="flex items-baseline gap-1">
                  <span className={cn('text-3xl font-bold leading-none', plan.popular ? 'text-foreground' : 'text-white')}>
                    {plan.price}
                  </span>
                  <span className={cn('text-sm', plan.popular ? 'text-muted-foreground' : 'text-primary-foreground/60')}>
                    {plan.period}
                  </span>
                </div>
                <p className={cn('text-xs mt-1.5', plan.popular ? 'text-muted-foreground' : 'text-primary-foreground/55')}>
                  {plan.tagline}
                </p>
              </div>

              {/* Features */}
              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check
                      className={cn('w-4 h-4 mt-0.5 flex-shrink-0', plan.popular ? 'text-primary' : 'text-white/60')}
                      strokeWidth={2.5}
                    />
                    <span className={cn('text-sm leading-snug', plan.popular ? 'text-foreground/80' : 'text-primary-foreground/80')}>
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <a
                href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(plan.waText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold',
                  'transition-[opacity,transform] duration-150 active:scale-[0.97]',
                  plan.popular
                    ? 'bg-primary text-white hover:opacity-90'
                    : 'bg-white/15 text-white border border-white/20 hover:bg-white/22',
                )}
              >
                <MessageCircle className="w-4 h-4" strokeWidth={1.75} />
                {plan.cta}
              </a>
            </div>
          ))}
        </div>

        <p className="text-center text-primary-foreground/40 text-xs mt-6">
          All plans via WhatsApp — no app, no login needed
        </p>
      </div>
    </section>
  );
};
