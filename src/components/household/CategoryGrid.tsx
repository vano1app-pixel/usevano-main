import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, MessageCircle, CreditCard, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { SUPPORTED_CITIES } from '@/lib/cities';
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
    emoji: '📚', label: 'Tutoring',  slug: 'tutoring',  price: 'from €15/hr',
    sizeLabel: 'How long?',
    sizes: ['1 hour', '2 hours', '3 hours'],
  },
];

function getTimeSlots(): string[] {
  const now = new Date();
  const slots: string[] = ['Now'];

  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(now.getMinutes() < 30 ? 30 : 60);

  const fmt = (d: Date) => {
    const h = d.getHours();
    const m = d.getMinutes();
    const period = h >= 12 ? 'pm' : 'am';
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''}${period}`;
  };

  while (next.getHours() < 21) {
    slots.push(fmt(next));
    next.setMinutes(next.getMinutes() + 30);
  }

  return slots;
}

function getPriceCents(slug: string, size: string): number | null {
  if (slug === 'shopping') return 1200;
  if (slug === 'dog-walk') return 2000;
  if (slug === 'tutoring') return null;
  const key = `${slug}|${size}`;
  const map: Record<string, number> = {
    'garden|1 hour': 1800,   'garden|2 hours': 3600,   'garden|Half day': 5400,
    'moving|2 hours': 3600,  'moving|Half day': 5400,   'moving|Full day': 10800,
    'cleaning|1 hour': 1600, 'cleaning|2 hours': 3200,  'cleaning|3 hours': 4800,
  };
  return map[key] ?? null;
}

function formatPrice(cents: number): string {
  return `€${(cents / 100).toFixed(0)}`;
}

function buildMessage(cat: Category, when: string, size: string, note: string): string {
  const lines: string[] = [`Hi VANO! I need ${cat.label.toLowerCase()} help.`];
  if (when) lines.push(`When: ${when === 'Now' ? 'ASAP / right now' : `today at ${when}`}`);
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
  'px-3.5 py-1.5 rounded-full text-sm font-medium border transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.96]';

const fadeSlide = {
  initial:    { opacity: 0, y: 6 },
  animate:    { opacity: 1, y: 0 },
  exit:       { opacity: 0, y: -6 },
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
      resetForm(slug);
    }
    window.addEventListener('vano:select-category', handleSelect);
    return () => window.removeEventListener('vano:select-category', handleSelect);
  }, []);

  const [showPayForm, setShowPayForm] = useState(false);
  const [payName, setPayName] = useState('');
  const [payPhone, setPayPhone] = useState('');
  const [payCity, setPayCity] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const selected = CATEGORIES.find(c => c.slug === selectedSlug) ?? null;

  function resetForm(slug: string | null) {
    setSelectedSlug(slug);
    setWhen('');
    setSize('');
    setNote('');
    setShowPayForm(false);
    setPayName('');
    setPayPhone('');
    setPayCity('');
    setPayError(null);
  }

  function pickCategory(slug: string) {
    resetForm(selectedSlug === slug ? null : slug);
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
    if (!payCity.trim()) { setPayError('Please select your city.'); return; }

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
            city: payCity,
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
  const timeSlots = React.useMemo(() => getTimeSlots(), []);

  return (
    <section id="category-grid" aria-label="What do you need help with?">

      {/* 3-column card grid */}
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
                'flex flex-col items-center justify-center gap-1.5',
                'min-h-[90px] rounded-2xl px-2 py-3 border',
                'transition-[background-color,color,border-color,transform] duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                'active:scale-[0.95]',
                active
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-secondary/60 text-foreground hover:bg-secondary border-border/50 hover:border-border',
              )}
            >
              <span className="text-2xl leading-none select-none">{cat.emoji}</span>
              <span className="text-[13px] font-semibold leading-tight text-center">{cat.label}</span>
              <span className={cn(
                'text-[11px] leading-tight',
                active ? 'text-primary-foreground/75' : 'text-muted-foreground',
              )}>
                {cat.price}
              </span>
            </button>
          );
        })}
      </div>

      {/* Expanded booking panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.slug}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="mt-3 rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden"
          >
            {/* Panel header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-secondary/30">
              <span className="text-xl leading-none select-none">{selected.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-snug">{selected.label}</p>
                <p className="text-xs text-muted-foreground">{selected.price}</p>
              </div>
              <button
                onClick={() => resetForm(null)}
                aria-label="Close"
                className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4">
              <AnimatePresence mode="wait">
                {showPayForm ? (
                  <motion.div key="pay-form" {...fadeSlide} className="space-y-4">
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
                        placeholder="Your full name"
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
                        placeholder="Your phone number"
                        required
                        className={cn(
                          'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm',
                          'placeholder:text-muted-foreground/50',
                          'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                          'transition-[border-color,box-shadow] duration-150',
                        )}
                      />
                      <Select value={payCity} onValueChange={setPayCity}>
                        <SelectTrigger className="rounded-xl h-10">
                          <SelectValue placeholder="Your city" />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_CITIES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

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
                            {`Pay ${formatPrice(priceCents!)} securely`}
                          </>
                        )}
                      </Button>

                      {payError && (
                        <p className="text-center text-xs text-destructive">{payError}</p>
                      )}

                      <p className="text-center text-xs text-muted-foreground">
                        Stripe secure checkout · Card held, only charged when done
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
                      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                        {timeSlots.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setWhen(when === opt ? '' : opt)}
                            className={cn(
                              chipBase,
                              'flex-shrink-0',
                              when === opt
                                ? opt === 'Now'
                                  ? 'bg-emerald-500 text-white border-emerald-500'
                                  : 'bg-primary text-primary-foreground border-primary'
                                : opt === 'Now'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800'
                                  : 'bg-background text-foreground border-border hover:border-primary/40',
                            )}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Duration / size */}
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

                    {/* Optional note */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                        Anything to add?{' '}
                        <span className="font-normal normal-case text-muted-foreground/60">(optional)</span>
                      </p>
                      <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Address or special requests"
                        className={cn(
                          'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm',
                          'placeholder:text-muted-foreground/40',
                          'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                          'transition-[border-color,box-shadow] duration-150',
                        )}
                      />
                    </div>

                    {/* Primary CTA: card payment when price is known */}
                    {canPayByCard && (
                      <Button
                        onClick={() => setShowPayForm(true)}
                        variant="default"
                        className="w-full rounded-full gap-2 font-semibold"
                      >
                        <CreditCard className="w-4 h-4" />
                        Book for {formatPrice(priceCents!)} — pay by card
                      </Button>
                    )}

                    {/* WhatsApp CTA */}
                    <Button
                      onClick={send}
                      disabled={!when && selected.slug !== 'tutoring'}
                      variant={canPayByCard ? 'outline' : 'default'}
                      className={cn(
                        'w-full rounded-full gap-2 font-semibold',
                        !canPayByCard && when
                          ? 'bg-[#25D366] hover:bg-[#1ebe5d] text-white border-transparent hover:border-transparent'
                          : '',
                      )}
                    >
                      <MessageCircle className="w-4 h-4" />
                      {canPayByCard ? 'Or book via WhatsApp' : 'Book via WhatsApp'}
                    </Button>

                    {!when && selected.slug !== 'tutoring' && (
                      <p className="text-center text-xs text-muted-foreground !mt-1.5">
                        Pick a time above to continue
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!selectedSlug && (
        <p className="text-center text-xs text-muted-foreground mt-4">
          Something else?{' '}
          <button
            onClick={() => openWhatsApp('Hi VANO! I need help with something — ')}
            className="underline underline-offset-2 text-foreground/60 hover:text-foreground transition-colors"
          >
            Chat to us on WhatsApp
          </button>
        </p>
      )}
    </section>
  );
};
