import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, MessageCircle, CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { teamWhatsAppHref } from '@/lib/contact';

interface Category {
  emoji:       string;
  label:       string;
  slug:        string;
  price:       string;
  sizeLabel:   string;
  sizes:       string[];
}

const CATEGORIES: Category[] = [
  {
    emoji: '🛒', label: 'Shopping',  slug: 'shopping',  price: 'from €12',
    sizeLabel: 'What kind?',
    sizes: ['Quick run', 'Big weekly shop', 'Pharmacy + bits'],
  },
  {
    emoji: '🐕', label: 'Dog walk',  slug: 'dog-walk',  price: '€20 flat',
    sizeLabel: 'How long?',
    sizes: ['30 min', '1 hour', '2 hours'],
  },
  {
    emoji: '🌿', label: 'Garden',    slug: 'garden',    price: 'from €18/hr',
    sizeLabel: 'How long?',
    sizes: ['1 hour', '2 hours', 'Half day'],
  },
  {
    emoji: '📦', label: 'Moving',    slug: 'moving',    price: 'from €18/hr',
    sizeLabel: 'How much help?',
    sizes: ['2 hours', 'Half day', 'Full day'],
  },
  {
    emoji: '🧹', label: 'Cleaning',  slug: 'cleaning',  price: 'from €16/hr',
    sizeLabel: 'How long?',
    sizes: ['1 hour', '2 hours', '3 hours'],
  },
  {
    emoji: '✨', label: 'Other',     slug: 'other',     price: 'from €12',
    sizeLabel: '',
    sizes: [],
  },
];

const WHEN_OPTIONS = ['Today', 'Tomorrow', 'This weekend', "I'm flexible"];

function getPriceCents(slug: string, size: string): number | null {
  if (slug === 'shopping') return 1200;
  if (slug === 'dog-walk') return 2000;
  if (slug === 'other') return null;
  const key = `${slug}|${size}`;
  const map: Record<string, number> = {
    'garden|1 hour': 1800,   'garden|2 hours': 3600,   'garden|Half day': 5400,
    'moving|2 hours': 3600,  'moving|Half day': 5400,   'moving|Full day': 10800,
    'cleaning|1 hour': 1600, 'cleaning|2 hours': 3200,  'cleaning|3 hours': 4800,
  };
  return map[key] ?? null;
}

function formatPrice(cents: number): string {
  return `€${cents / 100}`;
}

function buildMessage(cat: Category, when: string, size: string, note: string): string {
  const lines: string[] = [`Hi VANO! I need ${cat.label.toLowerCase()} help in Galway.`];
  if (when) lines.push(`When: ${when}`);
  if (size) lines.push(`${cat.sizeLabel || 'Details'}: ${size}`);
  if (note.trim()) lines.push(note.trim());
  lines.push('Can you let me know who is available?');
  return lines.join('\n');
}

function openWhatsApp(message: string): void {
  const url = `${teamWhatsAppHref}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

const chipBase =
  'px-3.5 py-1.5 rounded-full text-sm font-medium border transition-[background-color,color,border-color] duration-150 active:scale-[0.96]';

const fadeSlide = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
  transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const },
};

export const CategoryGrid: React.FC = () => {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [when, setWhen] = useState('');
  const [size, setSize] = useState('');
  const [note, setNote] = useState('');

  React.useEffect(() => {
    function handleSelect(e: Event) {
      const slug = (e as CustomEvent<{ slug: string }>).detail.slug;
      setSelectedSlug(slug);
      setWhen('');
      setSize('');
      setNote('');
      setShowPayForm(false);
      setPayName('');
      setPayPhone('');
      setPayError(null);
    }
    window.addEventListener('vano:select-category', handleSelect);
    return () => window.removeEventListener('vano:select-category', handleSelect);
  }, []);

  // Pay-by-card form state
  const [showPayForm, setShowPayForm] = useState(false);
  const [payName, setPayName] = useState('');
  const [payPhone, setPayPhone] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const selected = CATEGORIES.find(c => c.slug === selectedSlug) ?? null;

  function pickCategory(slug: string) {
    if (selectedSlug === slug) {
      setSelectedSlug(null);
    } else {
      setSelectedSlug(slug);
      setWhen('');
      setSize('');
      setNote('');
      setShowPayForm(false);
      setPayName('');
      setPayPhone('');
      setPayError(null);
    }
  }

  function send() {
    if (!selected) return;
    openWhatsApp(buildMessage(selected, when, size, note));
  }

  async function handleCardPay(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (!payName.trim()) { setPayError('Please enter your name.'); return; }
    if (!payPhone.trim()) { setPayError('Please enter your phone number.'); return; }

    setPayLoading(true);
    setPayError(null);

    try {
      const { data, error } = await supabase.functions.invoke(
        'create-household-payment-checkout',
        {
          body: {
            category: selected.slug,
            when_label: when,
            size_label: size,
            note: note.trim(),
            customer_name: payName.trim(),
            customer_phone: payPhone.trim(),
          },
        },
      );

      if (error || !data?.checkout_url) {
        throw new Error(
          (data as { error?: string } | null)?.error ||
          error?.message ||
          'Something went wrong. Please try again.',
        );
      }

      window.location.href = data.checkout_url as string;
    } catch (err: unknown) {
      setPayLoading(false);
      setPayError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  const priceCents = selected ? getPriceCents(selected.slug, size) : null;
  const canPayByCard = priceCents !== null && when !== '';

  return (
    <section id="category-grid" aria-label="What do you need help with?">
      <p
        className="text-sm font-semibold text-muted-foreground mb-4 tracking-wide uppercase"
        style={{ letterSpacing: '0.06em' }}
      >
        What do you need?
      </p>

      <div className="grid grid-cols-3 gap-2.5">
        {CATEGORIES.map((cat) => {
          const active = selectedSlug === cat.slug;
          return (
            <button
              key={cat.slug}
              onClick={() => pickCategory(cat.slug)}
              aria-pressed={active}
              aria-label={`${cat.label} — ${cat.price}`}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1',
                'min-h-[88px] rounded-2xl px-2 border',
                'transition-[background-color,color,border-color,transform] duration-150 ease-out-expo',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                'active:scale-[0.95]',
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-secondary/70 text-foreground hover:bg-secondary border-border/40',
              )}
            >
              <span className="text-xl leading-none">{cat.emoji}</span>
              <span className="text-sm font-semibold leading-tight">{cat.label}</span>
              <span className={cn('text-[11px] leading-tight', active ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                {cat.price}
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {selected && (
          <motion.div
            key={selected.slug}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] as const }}
            className="mt-4 rounded-2xl border border-border/50 bg-secondary/40 p-4"
          >
            <AnimatePresence mode="wait">
              {showPayForm ? (
                <motion.div key="pay-form" {...fadeSlide} className="space-y-4">
                  {/* Back */}
                  <button
                    onClick={() => { setShowPayForm(false); setPayError(null); }}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>

                  <p className="font-semibold text-foreground text-base">Your details</p>

                  <form onSubmit={handleCardPay} className="space-y-3">
                    <input
                      type="text"
                      value={payName}
                      onChange={(e) => setPayName(e.target.value)}
                      placeholder="Your name"
                      required
                      className={cn(
                        'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm',
                        'placeholder:text-muted-foreground/50',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                        'transition-[border-color,box-shadow] duration-150',
                      )}
                    />
                    <input
                      type="tel"
                      value={payPhone}
                      onChange={(e) => setPayPhone(e.target.value)}
                      placeholder="Phone number"
                      required
                      className={cn(
                        'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm',
                        'placeholder:text-muted-foreground/50',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                        'transition-[border-color,box-shadow] duration-150',
                      )}
                    />

                    <Button
                      type="submit"
                      disabled={payLoading}
                      className="w-full rounded-full gap-2 font-semibold"
                    >
                      {payLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Opening secure checkout…
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4" />
                          {`Pay securely · ${formatPrice(priceCents!)}`}
                        </>
                      )}
                    </Button>

                    {payError && (
                      <p className="text-center text-xs text-destructive">{payError}</p>
                    )}

                    <p className="text-center text-xs text-muted-foreground">
                      Redirects to Stripe's secure checkout · Cancel anytime
                    </p>
                  </form>
                </motion.div>
              ) : (
                <motion.div key="chips" {...fadeSlide} className="space-y-4">
                  {/* When? */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                      When?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {WHEN_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setWhen(when === opt ? '' : opt)}
                          className={cn(
                            chipBase,
                            when === opt
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-foreground border-border hover:border-primary/40',
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Duration / size — hidden for "Other" */}
                  {selected.sizes.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                        {selected.sizeLabel}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selected.sizes.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setSize(size === opt ? '' : opt)}
                            className={cn(
                              chipBase,
                              size === opt
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-foreground border-border hover:border-primary/40',
                            )}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Free text */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                      {selected.slug === 'other' ? 'What do you need?' : 'Anything to add?'}
                      {selected.slug !== 'other' && (
                        <span className="ml-1 font-normal normal-case text-muted-foreground/60">(optional)</span>
                      )}
                    </p>
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={
                        selected.slug === 'other'
                          ? 'Tell us what you need...'
                          : 'Your address or any special requests'
                      }
                      className={cn(
                        'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm',
                        'placeholder:text-muted-foreground/50',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                        'transition-[border-color,box-shadow] duration-150',
                      )}
                    />
                  </div>

                  {/* Pay by card — shown when price is known and when is selected */}
                  {canPayByCard && (
                    <Button
                      onClick={() => setShowPayForm(true)}
                      variant="default"
                      className="w-full rounded-full gap-2 font-semibold"
                    >
                      <CreditCard className="w-4 h-4" />
                      Pay by card · {formatPrice(priceCents!)}
                    </Button>
                  )}

                  {/* WhatsApp CTA */}
                  <Button
                    onClick={send}
                    disabled={!when && selected.slug !== 'other'}
                    variant={canPayByCard ? 'outline' : 'default'}
                    className="w-full rounded-full gap-2 font-semibold"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Send to WhatsApp
                  </Button>

                  {!when && selected.slug !== 'other' && (
                    <p className="text-center text-xs text-muted-foreground !mt-1.5">
                      Pick a time above to continue
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {!selectedSlug && (
        <p className="text-center text-xs text-muted-foreground mt-4">
          Something else?{' '}
          <button
            onClick={() => openWhatsApp('Hi VANO! I need help with something in Galway — ')}
            className="underline underline-offset-2 text-foreground/60 hover:text-foreground transition-colors"
          >
            Tell us what you need
          </button>
        </p>
      )}
    </section>
  );
};
