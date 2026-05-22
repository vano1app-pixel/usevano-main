import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const PRICES = [
  { emoji: '🛒', label: 'Shopping run',     price: '€12 flat'   },
  { emoji: '🐕', label: 'Dog walk',          price: '€10'        },
  { emoji: '🌿', label: 'Garden work',       price: '€18/hr'     },
  { emoji: '📦', label: 'Moving help',       price: '€18/hr per helper' },
  { emoji: '🧹', label: 'Cleaning',          price: '€16/hr'     },
  { emoji: '✨', label: 'General errands',   price: '€15 flat'   },
  { emoji: '⚡', label: 'Express (≤1 hr)',   price: '€25/hr',  express: true },
];

const WEEKLY_FEATURES = [
  '2 tasks per month, any type',
  'Same trusted student each time',
  'Priority same-day booking',
];

export const PricingTable: React.FC = () => {
  return (
    <section className="px-4 py-12 max-w-lg mx-auto md:max-w-xl lg:max-w-2xl">
      <p className="eyebrow mb-3">Transparent pricing</p>
      <h2 className="text-2xl font-semibold text-foreground mb-6">
        Simple pricing. No surprises.
      </h2>

      {/* Price rows */}
      <ul className="mb-2">
        {PRICES.map(({ emoji, label, price, express }) => (
          <li
            key={label}
            className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
          >
            <span className="flex items-center gap-2.5 text-sm text-foreground/80">
              <span className="text-lg leading-none" aria-hidden="true">{emoji}</span>
              {label}
            </span>
            <span
              className={cn(
                'font-semibold text-sm',
                express ? 'text-express-orange' : 'text-foreground',
              )}
            >
              {price}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground text-xs text-center mb-8">
        Pay by Revolut or cash when your helper leaves. Price agreed upfront — no surprises.
      </p>

      {/* Weekly subscription card — card-bezel gives the double-inset premium look */}
      <div className="card-bezel">
        <div className="bg-sage-light/60 rounded-xl p-5 border border-sage/20">
          <div className="flex items-start justify-between mb-3">
            <div>
              <Badge
                className="bg-sage text-white text-[10px] tracking-wide uppercase mb-2"
              >
                VANO Weekly
              </Badge>
              <p className="font-semibold text-foreground text-lg">from €39/month</p>
            </div>
            <span className="text-2xl mt-1" aria-hidden="true">🗓️</span>
          </div>

          <ul className="space-y-2">
            {WEEKLY_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-sage flex-shrink-0" aria-hidden="true" />
                <span className="text-sm text-foreground/80">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};
