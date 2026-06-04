import React from 'react';
import { CheckCircle2, MessageCircle, ArrowDown, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PRICES = [
  { emoji: '🛒', label: 'Grocery shopping',    price: 'from €12'   },
  { emoji: '🐕', label: 'Dog walking',          price: 'from €12'   },
  { emoji: '🌿', label: 'Lawn mowing',          price: 'from €22'   },
  { emoji: '📦', label: 'Moving help',          price: 'from €25'   },
  { emoji: '🧹', label: 'Outdoor cleaning',     price: 'from €22'   },
  { emoji: '📚', label: 'Tutoring & grinds',    price: 'from €22/hr' },
  { emoji: '🔧', label: 'Furniture assembly',   price: 'from €22'   },
  { emoji: '📱', label: 'Tech help',            price: 'from €20'   },
  { emoji: '🌙', label: 'Midnight Lift',        price: 'from €10'   },
  { emoji: '💊', label: 'Pharmacy run',         price: '€12 flat'   },
  { emoji: '📬', label: 'Post office run',      price: '€10 flat'   },
  { emoji: '🚪', label: 'Wait for deliveries',  price: '€10 flat'   },
];

const AIRBNB_FEATURES = [
  'Changeover clean between every guest',
  'Fresh linen & towels restocked',
  'Grocery & welcome pack stocked before arrival',
  'Garden & outdoor area kept tidy',
  'Minor maintenance & odd jobs handled',
  'Same trusted student — knows your property',
];

export const PricingTable: React.FC = () => {
  return (
    <section className="px-4 py-12 max-w-lg mx-auto md:max-w-xl lg:max-w-5xl">
      <p className="eyebrow mb-3">Transparent pricing</p>
      <h2 className="text-2xl font-semibold text-foreground mb-6">
        Simple pricing. No surprises.
      </h2>

      {/* Airbnb Host Special */}
      <div className="mb-8 rounded-2xl overflow-hidden border border-amber-200/60 dark:border-amber-700/40 shadow-sm">
        {/* Top banner */}
        <div className="bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-2.5 flex items-center gap-2">
          <Star className="w-3.5 h-3.5 text-white fill-white flex-shrink-0" />
          <span className="text-white text-xs font-bold tracking-wide uppercase">Airbnb Host Special</span>
          <span className="ml-auto text-white/80 text-xs font-medium">Limited spots</span>
        </div>

        {/* Body */}
        <div className="bg-amber-50/60 dark:bg-amber-950/20 px-5 py-5">
          <div className="flex items-start justify-between mb-1">
            <div>
              <p className="font-bold text-foreground text-2xl tracking-tight">€100<span className="text-base font-semibold text-muted-foreground">/month</span></p>
              <p className="text-sm text-muted-foreground mt-0.5">Full property management, done-for-you</p>
            </div>
            <span className="text-3xl mt-0.5 select-none" aria-hidden="true">🏡</span>
          </div>

          <div className="my-4 h-px bg-amber-200/50 dark:bg-amber-700/30" />

          <ul className="space-y-2.5 mb-5">
            {AIRBNB_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span className="text-sm text-foreground/80">{f}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              asChild
              className="rounded-full gap-1.5 font-semibold bg-amber-500 hover:bg-amber-600 text-white border-transparent shadow-sm hover:-translate-y-px transition-[transform,box-shadow] duration-150"
            >
              <a
                href="https://wa.me/353899817111?text=Hi%20VANO%2C%20I%27m%20interested%20in%20the%20Airbnb%20Host%20Special%20%E2%80%94%20%E2%82%AC100%2Fmonth%20property%20management."
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Claim your spot
              </a>
            </Button>
            <span className="text-xs text-muted-foreground">WhatsApp us — we set it all up</span>
          </div>
        </div>
      </div>

      {/* Price rows */}
      <ul className="mb-2">
        {PRICES.map(({ emoji, label, price }) => (
          <li
            key={label}
            className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
          >
            <span className="flex items-center gap-2.5 text-sm text-foreground/80">
              <span className="text-lg leading-none" aria-hidden="true">{emoji}</span>
              {label}
            </span>
            <span className="font-semibold text-sm text-foreground">{price}</span>
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground text-xs text-center mb-6">
        Pay by card at checkout. Price locked upfront — no surprises.
      </p>

      <div className="flex justify-center">
        <Button
          onClick={() => {
            const el = document.getElementById('task-showcase');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="rounded-full px-8 font-semibold gap-2 hover:-translate-y-px hover:shadow-primary-glow transition-[transform,box-shadow] duration-150"
        >
          <ArrowDown className="w-4 h-4" aria-hidden="true" />
          Book from €10
        </Button>
      </div>
    </section>
  );
};
