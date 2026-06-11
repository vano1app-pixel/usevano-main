import React, { useState, useRef } from 'react';
import { CheckCircle2, CreditCard, Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// ─── Pay-per-job prices (matches the 6 bookable categories) ──────────────
const PRICES = [
  { emoji: '🛒', slug: 'shopping',  label: 'Shopping',    price: 'from €15'    },
  { emoji: '🐕', slug: 'dog-walk',  label: 'Dog walking', price: '€15–€20'     },
  { emoji: '🌿', slug: 'garden',    label: 'Garden work', price: 'from €18/hr' },
  { emoji: '📦', slug: 'moving',    label: 'Moving help', price: 'from €18/hr' },
  { emoji: '🧹', slug: 'cleaning',  label: 'Cleaning',    price: 'from €16/hr' },
  { emoji: '📚', slug: 'tutoring',  label: 'Tutoring',    price: 'from €15/hr' },
];

// ─── Airbnb tiers ──────────────────────────────────────────────────────────
interface AirbnbTier {
  slug:       string;
  name:       string;
  price:      number;
  label:      string;
  tagline:    string;
  features:   string[];
  highlight?: boolean;
}

const TIERS: AirbnbTier[] = [
  {
    slug: 'airbnb-essential', name: 'Essential', price: 12900, label: '€129',
    tagline: 'Great for occasional lets',
    highlight: true,
    features: [
      '2 full property cleans per month',
      'Grocery & welcome pack before each stay',
      'Garden tidied before guest arrival',
      'Booking confirmed in under 2 hrs',
    ],
  },
  {
    slug: 'airbnb-popular', name: 'Popular', price: 19900, label: '€199',
    tagline: 'Best value for active hosts',
    features: [
      '4 full property cleans per month',
      'Grocery & welcome pack every stay',
      'Garden & outdoor area kept tidy',
      'Shopping runs as needed',
      'Priority same-day booking',
      'Booking confirmed in under 1 hr',
    ],
  },
  {
    slug: 'airbnb-premium', name: 'Full Management', price: 29900, label: '€299',
    tagline: 'Hands-off hosting — we handle it',
    features: [
      'Unlimited property cleans',
      'Grocery & welcome pack every stay',
      'Garden & outdoor area maintained',
      'Shopping runs as needed',
      'Dog walking between guest stays',
      'Dedicated student who knows your home',
      '24 hr WhatsApp response guarantee',
    ],
  },
];


// ─── Swipeable card (Airbnb) ───────────────────────────────────────────────
function TierCard({ tier }: { tier: AirbnbTier }) {
  const [open,    setOpen]    = useState(false);
  const [name,    setName]    = useState('');
  const [phone,   setPhone]   = useState('');
  const [city,    setCity]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setLoading(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        'create-household-payment-checkout',
        { body: {
          category:       tier.slug,
          when_label:     'Monthly plan',
          size_label:     tier.name,
          customer_name:  name.trim(),
          customer_phone: phone.trim(),
          ...(city.trim() ? { city: city.trim() } : {}),
        }},
      );
      const nextUrl = (data?.track_url ?? data?.checkout_url) as string | undefined;
      if (fnErr || !nextUrl) {
        throw new Error((data as { error?: string } | null)?.error || fnErr?.message || 'Something went wrong.');
      }
      window.location.href = nextUrl;
    } catch (err: unknown) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className={cn(
      'relative flex flex-col h-full rounded-2xl border overflow-hidden',
      'border-[#FF385C]/30 shadow-sm shadow-[#FF385C]/5',
    )}>
      {tier.highlight && (
        <div className="px-4 py-1.5 flex items-center gap-1.5" style={{ background: '#FF385C' }}>
          <Star className="w-3 h-3 text-white fill-white flex-shrink-0" />
          <span className="text-white text-[11px] font-bold tracking-wide uppercase">Most Popular</span>
        </div>
      )}
      <div className={cn('flex flex-col flex-1 p-5', tier.highlight ? 'bg-[#FF385C]/[0.04]' : 'bg-card')}>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">{tier.name}</p>
        <div className="flex items-end gap-1 mb-0.5">
          <span className="text-3xl font-bold tracking-tight text-foreground">{tier.label}</span>
          <span className="text-sm text-muted-foreground mb-1">/month</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{tier.tagline}</p>

        <ul className="space-y-2.5 mb-6 flex-1">
          {tier.features.map(f => (
            <li key={f} className="flex items-start gap-2">
              <CheckCircle2
                className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                style={{ color: '#FF385C' }}
              />
              <span className="text-xs text-foreground/80 leading-relaxed">{f}</span>
            </li>
          ))}
        </ul>

        {!open ? (
          <Button
            onClick={() => setOpen(true)}
            className="w-full rounded-full gap-2 font-semibold text-white border-transparent"
            style={{ backgroundColor: '#FF385C' }}
          >
            <CreditCard className="w-4 h-4" />Get started — {tier.label}/mo
          </Button>
        ) : (
          <form onSubmit={handleCheckout} className="space-y-2">
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Your name" required
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring" />
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="Your phone number" required
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring" />
            <input type="text" value={city} onChange={e => setCity(e.target.value)}
              placeholder="Your city (e.g. Galway)"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring" />
            <Button type="submit" disabled={loading || !name.trim() || !phone.trim()}
              className="w-full rounded-full gap-2 font-semibold text-white border-transparent"
              style={{ backgroundColor: '#FF385C' }}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Opening checkout…</>
                : <><CreditCard className="w-4 h-4" />Pay {tier.label}/month</>}
            </Button>
          </form>
        )}
        {error && <p className="text-center text-[11px] text-destructive mt-2">{error}</p>}
        <p className="text-center text-[10px] text-muted-foreground mt-2">Stripe · cancel anytime</p>
      </div>
    </div>
  );
}

// ─── Swipeable carousel (mobile) / grid (desktop) ─────────────────────────
function TierCarousel() {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.offsetWidth);
    setActive(idx);
  }

  function scrollTo(i: number) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.offsetWidth, behavior: 'smooth' });
    setActive(i);
  }

  return (
    <div>
      {/* Mobile: swipeable */}
      <div className="sm:hidden">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-3 pb-2"
          style={{ scrollPaddingLeft: '1rem' }}
        >
          {TIERS.map(tier => (
            <div key={tier.slug} className="snap-center flex-shrink-0 w-[calc(100%-2rem)]">
              <TierCard tier={tier} />
            </div>
          ))}
        </div>
        {/* Dot indicators */}
        <div className="flex justify-center gap-2 mt-3">
          {TIERS.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollTo(i)}
              className={cn(
                'rounded-full transition-all duration-200',
                active === i ? 'w-5 h-2 bg-[#FF385C]' : 'w-2 h-2 bg-border',
              )}
            />
          ))}
        </div>
      </div>

      {/* Desktop: grid */}
      <div className="hidden sm:grid sm:grid-cols-3 gap-4">
        {TIERS.map(tier => <TierCard key={tier.slug} tier={tier} />)}
      </div>
    </div>
  );
}


// ─── Main export ───────────────────────────────────────────────────────────
export const PricingTable: React.FC = () => {
  return (
    <section className="px-4 py-12 max-w-lg mx-auto md:max-w-xl lg:max-w-5xl xl:max-w-6xl">
      <p className="eyebrow mb-3">Transparent pricing</p>
      <h2 className="text-2xl font-semibold text-foreground mb-2">
        Simple pricing. No surprises.
      </h2>

      {/* Airbnb Host Special */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-lg" aria-hidden="true">🏡</span>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold" style={{ color: '#FF385C' }}>Airbnb Host Special</span>
          {' '}— fully managed monthly plans. One fixed price, zero stress.
        </p>
      </div>

      <div>
        <TierCarousel />
      </div>

      {/* Pay-per-job compact grid */}
      <p className="eyebrow mb-3">Or book one job at a time</p>
      <h3 className="text-lg font-semibold text-foreground mb-4">One-off pricing</h3>

      <div className="grid grid-cols-2 gap-2 mb-6">
        {PRICES.map(({ emoji, slug, label, price }) => (
          <button
            key={slug}
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('vano:select-category', { detail: { slug } }))}
            className="flex items-center justify-between rounded-xl border border-border/50 bg-secondary/30 px-3 py-2.5 gap-2 text-left hover:border-foreground/30 hover:bg-secondary/60 transition-colors duration-150 w-full"
          >
            <span className="flex items-center gap-2 text-xs text-foreground/80 min-w-0">
              <span className="text-base leading-none flex-shrink-0" aria-hidden="true">{emoji}</span>
              <span className="truncate">{label}</span>
            </span>
            <span className="font-semibold text-xs text-foreground whitespace-nowrap">{price}</span>
          </button>
        ))}
      </div>

      <p className="text-muted-foreground text-xs text-center mb-6">
        Pay by card at checkout. Price locked upfront — no surprises.
      </p>

    </section>
  );
};
