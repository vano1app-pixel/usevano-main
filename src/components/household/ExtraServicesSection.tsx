import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, CreditCard, Loader2, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SUPPORTED_CITIES } from '@/lib/cities';
import { supabase } from '@/integrations/supabase/client';
import { teamWhatsAppHref } from '@/lib/contact';
import { serviceFeeCents, totalWithFeeCents, fmtEuro } from '@/lib/householdPricing';

interface ExtraCategory {
  emoji:       string;
  label:       string;
  slug:        string;
  tagline:     string;
  description: string;
  sizeLabel:   string;
  sizes:       string[];
  priceHint:   string;
  accentBg:    string; // emoji icon background
}

const EXTRA_CATEGORIES: ExtraCategory[] = [
  {
    emoji: '🔨', label: 'Handyman', slug: 'handyman',
    tagline: 'Shelves, curtain rails, small repairs',
    description: 'Hanging pictures, assembling shelves, curtain rails, minor repairs — tasks that need a pair of skilled hands.',
    sizeLabel: 'How long?',
    sizes: ['1 hour', '2 hours', '3 hours'],
    priceHint: 'from €25',
    accentBg: 'bg-amber-50',
  },
  {
    emoji: '🚿', label: 'Plumbing help', slug: 'plumbing',
    tagline: 'Leaky taps, blocked drains, toilet fixes',
    description: 'Basic plumbing fixes — leaky taps, blocked sinks, toilet cistern, showerhead replacement. Not for major pipework.',
    sizeLabel: 'How long?',
    sizes: ['1 hour', '2 hours'],
    priceHint: 'from €30',
    accentBg: 'bg-sky-50',
  },
  {
    emoji: '🪑', label: 'Furniture assembly', slug: 'furniture-assembly',
    tagline: 'IKEA or any flat-pack built for you',
    description: 'IKEA or any flat-pack furniture assembled and placed exactly where you want it — no tools needed.',
    sizeLabel: 'How many items?',
    sizes: ['1 item', '2–3 items', '4–6 items', '7+ items'],
    priceHint: 'from €22',
    accentBg: 'bg-violet-50',
  },
  {
    emoji: '📱', label: 'Tech help', slug: 'tech-help',
    tagline: 'Phone, laptop, TV, Wi-Fi setup',
    description: 'Device setup, troubleshooting, Wi-Fi fixes at your home. Great for elderly family members.',
    sizeLabel: 'What needs help?',
    sizes: ['Phone / tablet', 'Laptop / PC', 'TV / streaming', 'Wi-Fi / router', 'Smart home setup'],
    priceHint: 'from €20',
    accentBg: 'bg-blue-50',
  },
  {
    emoji: '🚪', label: 'Wait for delivery', slug: 'wait-delivery',
    tagline: "We wait at home while you're out",
    description: "We wait at your home to receive a delivery or let in a tradesperson — so you don't have to take time off.",
    sizeLabel: 'How long?',
    sizes: ['Up to 2 hours', 'Up to 4 hours'],
    priceHint: '€10 / €18',
    accentBg: 'bg-emerald-50',
  },
];

function getPriceCents(slug: string, size: string): number | null {
  if (slug === 'handyman') {
    return ({ '1 hour': 2500, '2 hours': 4500, '3 hours': 6500 })[size] ?? null;
  }
  if (slug === 'plumbing') {
    return ({ '1 hour': 3000, '2 hours': 5500 })[size] ?? null;
  }
  if (slug === 'furniture-assembly') {
    return ({ '1 item': 2200, '2–3 items': 3800, '4–6 items': 5800, '7+ items': 8000 })[size] ?? null;
  }
  if (slug === 'tech-help') {
    return ({
      'Phone / tablet': 2000, 'Laptop / PC': 2800, 'TV / streaming': 2200,
      'Wi-Fi / router': 3000, 'Smart home setup': 4000,
    })[size] ?? null;
  }
  if (slug === 'wait-delivery') {
    return ({ 'Up to 2 hours': 1000, 'Up to 4 hours': 1800 })[size] ?? null;
  }
  return null;
}

const DEFAULT_SIZE: Record<string, string> = {
  handyman:            '1 hour',
  plumbing:            '1 hour',
  'furniture-assembly': '2–3 items',
  'tech-help':         'Laptop / PC',
  'wait-delivery':     'Up to 2 hours',
};

// ─── Chip helper ──────────────────────────────────────────────────────────────

const chip = (active: boolean) => cn(
  'px-3.5 py-1.5 rounded-full text-sm font-medium border flex-shrink-0 cursor-pointer select-none',
  'transition-[background-color,color,border-color] duration-150',
  active
    ? 'bg-foreground text-background border-foreground'
    : 'bg-background text-foreground border-border hover:border-foreground/30',
);

// ─── Bottom sheet ─────────────────────────────────────────────────────────────

const Sheet: React.FC<{ cat: ExtraCategory; onClose: () => void }> = ({ cat, onClose }) => {
  const [size,    setSize]    = useState(DEFAULT_SIZE[cat.slug] ?? cat.sizes[0]);
  const [phone,   setPhone]   = useState('');
  const [city,    setCity]    = useState('Galway');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    const scrollY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  const priceCents = getPriceCents(cat.slug, size);
  // Stripe adds a 5% service fee as a second line item — show the final total.
  const feeCents   = priceCents ? serviceFeeCents(priceCents) : 0;
  const totalCents = priceCents ? totalWithFeeCents(priceCents) : null;

  function sendWhatsApp() {
    const lines = [
      `Hi VANO! I need help with: ${cat.label}.`,
      `Option: ${size}`,
      'Can you let me know who is available?',
    ];
    window.open(`${teamWhatsAppHref}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer');
  }

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    const phoneClean = phone.trim().replace(/\s+/g, '');
    if (!phoneClean) { setError('Please enter your phone number.'); return; }
    if (!/^\+?[\d\s\-().]{7,15}$/.test(phoneClean)) { setError('Please enter a valid phone number.'); return; }
    setLoading(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        'create-household-payment-checkout',
        { body: {
          category:       cat.slug,
          when_label:     'ASAP',
          size_label:     size,
          note:           '',
          customer_name:  'Guest',
          customer_phone: phoneClean,
          customer_email: null,
          city,
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
    <>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        className="fixed inset-0 z-[69] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        key="sheet"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
        className="fixed inset-x-0 bottom-0 z-[70] bg-cream rounded-t-3xl shadow-2xl safe-area-bottom"
        style={{ maxHeight: '88vh', overflowY: 'auto' }}
        role="dialog" aria-modal="true" aria-label={`Book ${cat.label}`}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-foreground/15" />
        </div>

        <div className="px-5 pb-8 pt-2">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2.5 mb-0.5">
                <span className="text-2xl leading-none" aria-hidden="true">{cat.emoji}</span>
                <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, Plus Jakarta Sans, system-ui, sans-serif' }}>
                  {cat.label}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground ml-9">{cat.tagline}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-foreground/8 flex items-center justify-center hover:bg-foreground/12 transition-colors flex-shrink-0 mt-0.5"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-foreground/60" />
            </button>
          </div>

          <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{cat.description}</p>

          <form onSubmit={handleBook} className="space-y-5">
            {/* Size / option */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">{cat.sizeLabel}</p>
              <div className="flex flex-wrap gap-2">
                {cat.sizes.map(opt => (
                  <motion.button
                    key={opt} type="button"
                    onClick={() => setSize(opt)}
                    whileTap={{ scale: 0.92 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                    className={chip(size === opt)}
                  >
                    {opt}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Phone */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">Your phone</p>
              <input
                type="tel" value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="08x xxx xxxx"
                autoComplete="tel" autoFocus required
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-base placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-transparent transition-[border-color,box-shadow] duration-150"
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">We'll text you when a helper accepts</p>
            </div>

            {/* City */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">Your city</p>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_CITIES.map(c => (
                  <motion.button
                    key={c} type="button"
                    onClick={() => setCity(c)}
                    whileTap={{ scale: 0.92 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                    className={chip(city === c)}
                  >
                    {c}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Price summary */}
            {priceCents && totalCents && (
              <div className="px-4 py-3 rounded-xl bg-foreground/4 border border-foreground/8">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground/60">{cat.label} · {size}</span>
                  <span className="text-lg font-bold text-foreground tabular-nums">{fmtEuro(totalCents)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {fmtEuro(priceCents)} job + {fmtEuro(feeCents)} service fee — exactly what you'll pay
                </p>
              </div>
            )}

            {/* CTAs */}
            <div className="space-y-2.5">
              <motion.div whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                <Button
                  type="submit"
                  disabled={loading || !phone.trim()}
                  className="w-full rounded-full gap-2 font-semibold text-[15px] h-12"
                >
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Opening checkout…</>
                    : <><CreditCard className="w-4 h-4" />Book {cat.label}{totalCents ? ` — ${fmtEuro(totalCents)}` : ''}</>}
                </Button>
              </motion.div>

              <motion.div whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                <Button
                  type="button" variant="outline"
                  onClick={sendWhatsApp}
                  className="w-full rounded-full gap-2 font-medium text-sm h-10 border-[#25D366]/40 text-[#25D366] hover:bg-[#25D366]/6"
                >
                  <MessageCircle className="w-4 h-4" />
                  Or book via WhatsApp
                </Button>
              </motion.div>
            </div>

            {error && <p className="text-center text-xs text-destructive">{error}</p>}
            <p className="text-center text-[11px] text-muted-foreground">
              Stripe secure checkout · paid upfront · money back guarantee
            </p>
          </form>
        </div>
      </motion.div>
    </>
  );
};

// ─── Main section ─────────────────────────────────────────────────────────────

const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const cardVariant = {
  hidden: { opacity: 0, y: 16, scale: 0.95 },
  show:   { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

export const ExtraServicesSection: React.FC = () => {
  const [selected, setSelected] = useState<ExtraCategory | null>(null);
  const open  = useCallback((cat: ExtraCategory) => setSelected(cat), []);
  const close = useCallback(() => setSelected(null), []);

  return (
    <>
      <section className="bg-navy px-4 pb-14">
        <div className="max-w-5xl mx-auto">
          {/* Heading */}
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3 pt-2">More services</p>
          <h2 className="text-2xl font-bold text-white mb-2" style={{ letterSpacing: '-0.02em' }}>
            What else can helpers do?
          </h2>
          <p className="text-sm text-white/55 mb-8 max-w-sm leading-relaxed">
            These jobs go beyond errands — skilled helpers ready for trickier tasks around your home.
          </p>

          {/* Cards */}
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            variants={container} initial="hidden" whileInView="show"
            viewport={{ once: true, margin: '-48px' }}
          >
            {EXTRA_CATEGORIES.map((cat) => (
              <motion.button
                key={cat.slug}
                variants={cardVariant}
                onClick={() => open(cat)}
                className={cn(
                  'group flex items-center gap-4 rounded-2xl bg-white p-4 text-left',
                  'border-l-[3px] border-l-transparent border border-white/10 shadow-sm',
                  'hover:border-l-sage hover:shadow-lg hover:-translate-y-0.5',
                  'active:scale-[0.98]',
                  'transition-[transform,box-shadow,border-color] duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-navy',
                )}
              >
                {/* Emoji with per-category accent bg */}
                <span className={cn(
                  'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-2xl leading-none shadow-sm',
                  cat.accentBg,
                )}>
                  {cat.emoji}
                </span>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-sm font-bold text-foreground leading-tight">{cat.label}</p>
                    <span className="text-[11px] font-semibold text-sage-dark bg-sage/10 border border-sage/25 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {cat.priceHint}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">{cat.tagline}</p>
                </div>

                {/* Arrow */}
                <ChevronRight className="w-4 h-4 text-muted-foreground/30 flex-shrink-0 group-hover:text-sage group-hover:translate-x-0.5 transition-[color,transform] duration-150" />
              </motion.button>
            ))}
          </motion.div>

          {/* WhatsApp fallback */}
          <button
            onClick={() => window.open(`${teamWhatsAppHref}?text=${encodeURIComponent('Hi VANO! I need help with something around my home — ')}`, '_blank', 'noopener,noreferrer')}
            className="mt-4 w-full rounded-2xl bg-[#25D366]/10 border border-[#25D366]/25 px-4 py-3.5 flex items-center gap-3.5 hover:bg-[#25D366]/15 active:scale-[0.98] transition-[background-color,transform] duration-150"
          >
            <span className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-3.5 h-3.5 text-white" aria-hidden="true" />
            </span>
            <span className="flex-1 text-left">
              <span className="block text-sm font-semibold text-white">Need something else?</span>
              <span className="block text-xs text-white/50 mt-0.5">Chat to us on WhatsApp — we'll sort it</span>
            </span>
            <span className="text-[#25D366] text-lg font-bold leading-none">→</span>
          </button>
        </div>
      </section>

      {/* Bottom sheet */}
      <AnimatePresence>
        {selected && <Sheet cat={selected} onClose={close} />}
      </AnimatePresence>
    </>
  );
};
