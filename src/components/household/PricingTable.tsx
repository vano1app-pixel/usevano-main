import React, { useState } from 'react';
import { CheckCircle2, ArrowDown, CreditCard, Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

const PRICES = [
  { emoji: '🛒', label: 'Grocery shopping',   price: 'from €12'    },
  { emoji: '🐕', label: 'Dog walking',         price: 'from €12'    },
  { emoji: '🌿', label: 'Lawn mowing',         price: 'from €22'    },
  { emoji: '📦', label: 'Moving help',         price: 'from €25'    },
  { emoji: '🧹', label: 'Outdoor cleaning',    price: 'from €22'    },
  { emoji: '📚', label: 'Tutoring & grinds',   price: 'from €22/hr' },
  { emoji: '🔧', label: 'Furniture assembly',  price: 'from €22'    },
  { emoji: '📱', label: 'Tech help',           price: 'from €20'    },
  { emoji: '🌙', label: 'Midnight Lift',       price: 'from €10'    },
  { emoji: '💊', label: 'Pharmacy run',        price: '€12 flat'    },
  { emoji: '📬', label: 'Post office run',     price: '€10 flat'    },
  { emoji: '🚪', label: 'Wait for deliveries', price: '€10 flat'    },
];

interface AirbnbTier {
  slug:        string;
  name:        string;
  price:       number; // cents
  label:       string;
  tagline:     string;
  features:    string[];
  highlight?:  boolean;
}

const TIERS: AirbnbTier[] = [
  {
    slug:    'airbnb-essential',
    name:    'Essential',
    price:   12900,
    label:   '€129',
    tagline: 'Great for occasional lets',
    features: [
      '2 changeover cleans per month',
      'Fresh linen & towels restocked',
      'Welcome pack stocked before arrival',
      'Booking confirmed in under 2 hrs',
    ],
  },
  {
    slug:    'airbnb-popular',
    name:    'Popular',
    price:   19900,
    label:   '€199',
    tagline: 'Best value for active hosts',
    highlight: true,
    features: [
      '4 changeover cleans per month',
      'Fresh linen & towels restocked',
      'Grocery & welcome pack every stay',
      'Garden & outdoor area kept tidy',
      'Priority same-day booking',
      'Booking confirmed in under 1 hr',
    ],
  },
  {
    slug:    'airbnb-premium',
    name:    'Full Management',
    price:   29900,
    label:   '€299',
    tagline: 'Hands-off property management',
    features: [
      'Unlimited changeover cleans',
      'Fresh linen & towels restocked',
      'Grocery & welcome pack every stay',
      'Garden, gutters & outdoor upkeep',
      'Minor maintenance & odd jobs',
      'Dedicated student who knows your home',
      '24 hr WhatsApp response guarantee',
    ],
  },
];

function TierCard({ tier }: { tier: AirbnbTier }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        'create-household-payment-checkout',
        { body: {
          category:       tier.slug,
          when_label:     'Monthly plan',
          size_label:     tier.name,
          customer_name:  'Airbnb Host',
          customer_phone: 'plan',
        }},
      );
      if (fnErr || !data?.checkout_url) {
        throw new Error((data as { error?: string } | null)?.error || fnErr?.message || 'Something went wrong.');
      }
      window.location.href = data.checkout_url as string;
    } catch (err: unknown) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className={cn(
      'relative flex flex-col rounded-2xl border overflow-hidden transition-shadow duration-200',
      tier.highlight
        ? 'border-amber-400/70 shadow-lg shadow-amber-100/60 dark:shadow-amber-900/30'
        : 'border-border/50 shadow-sm',
    )}>
      {tier.highlight && (
        <div className="bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-1.5 flex items-center gap-1.5">
          <Star className="w-3 h-3 text-white fill-white flex-shrink-0" />
          <span className="text-white text-[11px] font-bold tracking-wide uppercase">Most Popular</span>
        </div>
      )}

      <div className={cn(
        'flex flex-col flex-1 p-5',
        tier.highlight ? 'bg-amber-50/50 dark:bg-amber-950/10' : 'bg-card',
      )}>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">{tier.name}</p>
        <div className="flex items-end gap-1 mb-0.5">
          <span className="text-3xl font-bold tracking-tight text-foreground">{tier.label}</span>
          <span className="text-sm text-muted-foreground mb-1">/month</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{tier.tagline}</p>

        <ul className="space-y-2.5 mb-6 flex-1">
          {tier.features.map(f => (
            <li key={f} className="flex items-start gap-2">
              <CheckCircle2 className={cn(
                'w-3.5 h-3.5 flex-shrink-0 mt-0.5',
                tier.highlight ? 'text-amber-500' : 'text-emerald-500',
              )} />
              <span className="text-xs text-foreground/80 leading-relaxed">{f}</span>
            </li>
          ))}
        </ul>

        <Button
          onClick={handleCheckout}
          disabled={loading}
          className={cn(
            'w-full rounded-full gap-2 font-semibold',
            tier.highlight
              ? 'bg-amber-500 hover:bg-amber-600 text-white border-transparent'
              : '',
          )}
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" />Opening checkout…</>
            : <><CreditCard className="w-4 h-4" />Pay {tier.label}/month</>}
        </Button>
        {error && <p className="text-center text-[11px] text-destructive mt-2">{error}</p>}
        <p className="text-center text-[10px] text-muted-foreground mt-2">Stripe · cancel anytime</p>
      </div>
    </div>
  );
}

export const PricingTable: React.FC = () => {
  return (
    <section className="px-4 py-12 max-w-lg mx-auto md:max-w-xl lg:max-w-5xl">
      <p className="eyebrow mb-3">Transparent pricing</p>
      <h2 className="text-2xl font-semibold text-foreground mb-2">
        Simple pricing. No surprises.
      </h2>

      {/* Airbnb Host Special header */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-lg" aria-hidden="true">🏡</span>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Airbnb Host Special</span>
          {' '}— fully managed monthly plans. One fixed price, zero stress.
        </p>
      </div>

      {/* Three tier cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {TIERS.map(tier => <TierCard key={tier.slug} tier={tier} />)}
      </div>

      {/* Pay-per-job price rows */}
      <p className="eyebrow mb-4">Or book one job at a time</p>
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
          Book a single job from €10
        </Button>
      </div>
    </section>
  );
};
