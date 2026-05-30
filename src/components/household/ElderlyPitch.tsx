import React from 'react';
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
    <section className="relative bg-primary px-4 py-12 overflow-hidden">
      <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative max-w-3xl mx-auto">

        {/* Header */}
        <div className="text-center mb-7">
          <p className="eyebrow mb-2.5 text-primary-foreground/60">For families &amp; businesses</p>
          <h2 className="display-lg text-primary-foreground mb-2.5">
            Worried about a parent near you?
          </h2>
          <p className="text-primary-foreground/70 text-sm max-w-xs mx-auto leading-relaxed">
            One simple monthly plan. Vetted students handle the weekly tasks — so you stop worrying.
          </p>
        </div>

        {/* Plan cards — always 3 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                'relative rounded-2xl p-4 flex flex-col',
                plan.popular
                  ? 'bg-white shadow-xl ring-2 ring-white/30'
                  : 'bg-white/10 border border-white/15',
              )}
            >
              {/* Most popular badge */}
              {plan.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-[hsl(var(--gold))] text-foreground text-[8px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5 whitespace-nowrap">
                  Popular
                </span>
              )}

              {/* Plan name */}
              <p className={cn(
                'text-[9px] font-bold uppercase tracking-widest mb-1',
                plan.popular ? 'text-muted-foreground' : 'text-primary-foreground/50',
              )}>
                {plan.name}
              </p>

              {/* Price */}
              <div className="flex items-baseline gap-0.5 mb-0.5">
                <span className={cn('text-[22px] font-bold leading-none tracking-tight', plan.popular ? 'text-foreground' : 'text-white')}>
                  {plan.price}
                </span>
                <span className={cn('text-[10px]', plan.popular ? 'text-muted-foreground' : 'text-primary-foreground/60')}>
                  {plan.period}
                </span>
              </div>
              <p className={cn('text-[10px] leading-tight mb-3', plan.popular ? 'text-muted-foreground' : 'text-primary-foreground/55')}>
                {plan.tagline}
              </p>

              {/* Divider */}
              <div className={cn('h-px mb-3', plan.popular ? 'bg-black/8' : 'bg-white/10')} />

              {/* Features */}
              <ul className="space-y-1.5 mb-4 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5">
                    <Check
                      className={cn('w-3 h-3 mt-px flex-shrink-0', plan.popular ? 'text-primary' : 'text-white/70')}
                      strokeWidth={2.5}
                    />
                    <span className={cn('text-[10px] leading-tight', plan.popular ? 'text-foreground/80' : 'text-primary-foreground/80')}>
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <a
                href={`${teamWhatsAppHref}?text=${encodeURIComponent(plan.waText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'group flex items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-bold tracking-wide',
                  'transition-all duration-150 active:scale-[0.96] hover:-translate-y-px',
                  plan.popular
                    ? 'bg-primary text-white shadow-md hover:shadow-[0_6px_20px_hsl(var(--primary)/0.4)] hover:opacity-90'
                    : 'bg-white text-foreground hover:bg-white/90 hover:shadow-md',
                )}
              >
                <MessageCircle className="w-3 h-3 flex-shrink-0" strokeWidth={2} />
                <span>{plan.cta}</span>
                <ArrowRight className="w-2.5 h-2.5 flex-shrink-0 opacity-60 group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>
          ))}
        </div>

        <p className="text-center text-primary-foreground/40 text-[11px] mt-4">
          All plans via WhatsApp — no app, no login needed
        </p>
      </div>
    </section>
  );
};
