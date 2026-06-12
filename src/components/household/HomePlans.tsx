import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Check, Gift, Building2, CreditCard, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { teamWhatsAppHref } from '@/lib/contact';
import { supabase } from '@/integrations/supabase/client';
import { loadBookingMemory } from '@/lib/bookingMemory';

/**
 * Monthly plans + gifting. Plans are self-serve Stripe subscriptions
 * (create-plan-checkout) — card, Apple Pay, Google Pay — with WhatsApp kept
 * as the "questions first" path. Gift vouchers and the Business plan stay
 * WhatsApp conversations.
 */

interface Plan {
  slug:     string;
  name:     string;
  price:    string;
  period:   string;
  tagline:  string;
  features: string[];
  popular:  boolean;
}

const PLANS: Plan[] = [
  {
    slug: 'family',
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
  },
  {
    slug: 'home-pass',
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
  },
  {
    slug: 'family-plus',
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
  },
];

const GIFT_AMOUNTS = ['€25', '€50', '€100'];

function giftWaHref(amount: string): string {
  const text =
    `Hi VANO! 🎁 I'd like to gift a VANO voucher (${amount}) to someone — how does it work?`;
  return `${teamWhatsAppHref}?text=${encodeURIComponent(text)}`;
}

function planWaHref(plan: Plan): string {
  const text =
    `Hi VANO! 👋 I have a question about the ${plan.name} plan (${plan.price}/month) before signing up.`;
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
    <section id="plans" className="relative bg-white px-4 py-14">
      <div className="relative max-w-5xl mx-auto">

        {planSuccess && (
          <div className="mb-8 rounded-2xl border border-sage/30 bg-sage-light px-5 py-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-sage mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-foreground text-sm">You're all set! 🎉</p>
              <p className="text-foreground/70 text-sm mt-0.5 leading-relaxed">
                Your plan is active. We'll WhatsApp you within the hour to schedule your first visit and match your regular helper.
              </p>
            </div>
          </div>
        )}

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
          Card, Apple Pay or Google Pay · cancel anytime · no contracts
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

function PlanCard({ plan }: { plan: Plan }) {
  const remembered = useMemo(() => loadBookingMemory(), []);
  const [open,    setOpen]    = useState(false);
  const [name,    setName]    = useState('');
  const [phone,   setPhone]   = useState(remembered?.phone ?? '');
  const [city,    setCity]    = useState(remembered?.city ?? '');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setLoading(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        'create-plan-checkout',
        { body: {
          plan:           plan.slug,
          customer_name:  name.trim(),
          customer_phone: phone.trim(),
          ...(city.trim() ? { city: city.trim() } : {}),
        }},
      );
      if (fnErr || !(data as { checkout_url?: string } | null)?.checkout_url) {
        throw new Error((data as { error?: string } | null)?.error || fnErr?.message || 'Something went wrong.');
      }
      window.location.href = (data as { checkout_url: string }).checkout_url;
    } catch (err: unknown) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

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

        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="w-full rounded-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white transition-all duration-150 active:scale-[0.96]"
            style={{ backgroundColor: 'hsl(var(--primary))' }}
          >
            <CreditCard className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
            <span>Start {plan.name} — {plan.price}/mo</span>
          </button>
        ) : (
          <form onSubmit={handleSubscribe} className="space-y-2">
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Your name" required autoFocus
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="Your phone number" required
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="text" value={city} onChange={e => setCity(e.target.value)}
              placeholder="Your city (e.g. Galway)"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={loading || !name.trim() || !phone.trim()}
              className="w-full rounded-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white transition-all duration-150 active:scale-[0.96] disabled:opacity-50"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Opening secure checkout…</>
                : <><CreditCard className="w-4 h-4" />Subscribe — {plan.price}/mo</>}
            </button>
          </form>
        )}
        {error && <p className="text-center text-[11px] text-destructive mt-2">{error}</p>}
        <a
          href={planWaHref(plan)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="w-3 h-3" />
          Questions first? WhatsApp us
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
            <div key={plan.slug} className="snap-center flex-shrink-0 w-[calc(100%-2rem)] pt-4">
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
          <PlanCard key={plan.slug} plan={plan} />
        ))}
      </div>
    </div>
  );
}
