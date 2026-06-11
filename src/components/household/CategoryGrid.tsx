import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, CreditCard, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SUPPORTED_CITIES } from '@/lib/cities';
import { supabase } from '@/integrations/supabase/client';
import { teamWhatsAppHref } from '@/lib/contact';
import { AddressPicker } from '@/components/household/AddressPicker';
import {
  QUICK_BOOK_CATEGORIES as CATEGORIES,
  QUICK_BOOK_DEFAULT_SIZE as DEFAULT_SIZE,
  quickBookPriceCents as getPriceCents,
  type QuickBookCategory as Category,
  serviceFeeCents, totalWithFeeCents, fmtEuro,
} from '@/lib/householdPricing';

// What to show on the card before tapping
function cardPrice(cat: Category): string {
  const defSize = DEFAULT_SIZE[cat.slug];
  const cents = getPriceCents(cat.slug, defSize);
  if (cents === null) return 'from €15';
  const price = fmtEuro(cents);
  if (!defSize) return price;
  return `${price} · ${defSize}`;
}

// ─── Time slots ───────────────────────────────────────────────────────────

function getTimeSlots(): string[] {
  const slots: string[] = ['Now'];
  const next = new Date();
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() < 30 ? 30 : 60);
  const fmtTime = (d: Date) => {
    const h = d.getHours(), m = d.getMinutes();
    return `${h > 12 ? h - 12 : h === 0 ? 12 : h}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;
  };
  while (next.getHours() < 21) {
    slots.push(fmtTime(next));
    next.setMinutes(next.getMinutes() + 30);
  }
  return slots.slice(0, 8); // max 8 time chips
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────

function buildWhatsAppMsg(cat: Category, when: string, size: string): string {
  const lines = [`Hi VANO! I need ${cat.label.toLowerCase()} help.`];
  if (when) lines.push(`When: ${when === 'Now' ? 'ASAP / right now' : `today at ${when}`}`);
  if (size) lines.push(`Duration: ${size}`);
  lines.push('Can you let me know who is available?');
  return lines.join('\n');
}

// ─── Chip helper ──────────────────────────────────────────────────────────

const chip = (active: boolean, accent?: boolean) => cn(
  'px-3.5 py-1.5 rounded-full text-sm font-medium border flex-shrink-0 cursor-pointer select-none',
  'transition-[background-color,color,border-color] duration-150',
  active
    ? accent
      ? 'bg-emerald-500 text-white border-emerald-500'
      : 'bg-foreground text-background border-foreground'
    : accent
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
      : 'bg-background text-foreground border-border hover:border-foreground/30',
);

// ─── Bottom sheet ─────────────────────────────────────────────────────────

interface SheetProps {
  cat:       Category;
  onClose:   () => void;
}

const Sheet: React.FC<SheetProps> = ({ cat, onClose }) => {
  const timeSlots  = useMemo(() => getTimeSlots(), []);
  const [when,     setWhen]    = useState('Now');
  const [size,     setSize]    = useState(DEFAULT_SIZE[cat.slug] ?? cat.sizes?.[0] ?? '');
  const [phone,    setPhone]   = useState('');
  const [address,  setAddress] = useState('');
  const [coords,   setCoords]  = useState<{ lat: number; lng: number } | null>(null);
  const [city,     setCity]    = useState<string>('Galway');
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState<string | null>(null);

  // Lock body scroll while sheet is open without changing scroll position
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

  // Escape key
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  const priceCents = getPriceCents(cat.slug, size);
  // Stripe adds a 5% service fee as a second line item — the button and
  // summary must show that final total, never a smaller number.
  const feeCents   = priceCents ? serviceFeeCents(priceCents) : 0;
  const totalCents = priceCents ? totalWithFeeCents(priceCents) : null;

  const ctaLabel = [
    `Book ${cat.label}`,
    size || null,
    totalCents ? fmtEuro(totalCents) : null,
  ].filter(Boolean).join(' · ');

  function sendWhatsApp() {
    const url = `${teamWhatsAppHref}?text=${encodeURIComponent(buildWhatsAppMsg(cat, when, size))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    const phoneClean = phone.trim().replace(/\s+/g, '');
    if (!phoneClean) { setError('Please enter your phone number.'); return; }
    if (!/^\+?[\d\s\-().]{7,15}$/.test(phoneClean)) { setError('Please enter a valid phone number.'); return; }
    if (!address.trim()) { setError('Please enter your address or Eircode.'); return; }
    setLoading(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        'create-household-payment-checkout',
        { body: {
          category:         cat.slug,
          when_label:       when,
          size_label:       size,
          note:             '',
          customer_name:    'Guest', // name collected by Stripe at checkout
          customer_phone:   phoneClean,
          customer_email:   null,
          customer_address: address.trim(),
          ...(coords ? { customer_lat: coords.lat, customer_lng: coords.lng } : {}),
          city,
        }},
      );
      // Pay-after-accept: the server returns track_url — the customer pays
      // only once a helper accepts. checkout_url kept as legacy fallback.
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
    <>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        className="fixed inset-0 z-[69] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <motion.div
        key="sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
        className="fixed inset-x-0 bottom-0 z-[70] bg-cream rounded-t-3xl shadow-2xl safe-area-bottom"
        style={{ maxHeight: '88vh', overflowY: 'auto' }}
        role="dialog"
        aria-modal="true"
        aria-label={`Book ${cat.label}`}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-foreground/15" />
        </div>

        <div className="px-5 pb-6 pt-2">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2.5 mb-0.5">
                <span className="text-2xl leading-none" aria-hidden="true">{cat.emoji}</span>
                <h2 className="font-display text-xl font-bold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, Plus Jakarta Sans, system-ui, sans-serif' }}>
                  {cat.label}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground ml-9">{cat.hint}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-foreground/8 flex items-center justify-center hover:bg-foreground/12 transition-colors flex-shrink-0 mt-0.5"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-foreground/60" />
            </button>
          </div>

          <form onSubmit={handleBook} className="space-y-5">
            {/* When? */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">When?</p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                {timeSlots.map(opt => (
                  <motion.button
                    key={opt}
                    type="button"
                    onClick={() => setWhen(opt)}
                    whileTap={{ scale: 0.92 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                    className={chip(when === opt, opt === 'Now')}
                  >
                    {opt}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* How long? */}
            {cat.sizes && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">
                  {cat.sizeLabel ?? 'How long?'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {cat.sizes.map(opt => (
                    <motion.button
                      key={opt}
                      type="button"
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
            )}

            {/* Phone */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">Your phone</p>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="08x xxx xxxx"
                autoComplete="tel"
                autoFocus
                required
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-base placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-transparent transition-[border-color,box-shadow] duration-150"
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">We'll text you when someone accepts</p>
            </div>

            {/* Address — Eircode search or current location */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">Where?</p>
              <AddressPicker
                value={address}
                coords={coords}
                error={false}
                onAddress={(addr, lat, lng) => { setAddress(addr); setCoords({ lat, lng }); }}
                onTextChange={(t) => { setAddress(t); setCoords(null); }}
                onBlur={() => {}}
                placeholder="Address or Eircode…"
                showMapPreview={false}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">So your helper knows exactly where to go</p>
            </div>

            {/* City chips */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">Your city</p>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_CITIES.map(c => (
                  <motion.button
                    key={c}
                    type="button"
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

            {/* Price summary + CTA */}
            <div className="space-y-2.5 pt-1">
              {priceCents && totalCents && (
                <div className="px-4 py-3 rounded-xl bg-foreground/4 border border-foreground/8">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground/60">{cat.label} · {when === 'Now' ? 'ASAP' : when}{size ? ` · ${size}` : ''}</span>
                    <span className="text-lg font-bold text-foreground tabular-nums">{fmtEuro(totalCents)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {fmtEuro(priceCents)} job + {fmtEuro(feeCents)} service fee — pay only when a helper accepts
                  </p>
                </div>
              )}

              <motion.div whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                <Button
                  type="submit"
                  disabled={loading || !phone.trim()}
                  className="w-full rounded-full gap-2 font-semibold text-[15px] h-12"
                >
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Placing booking…</>
                    : <><CreditCard className="w-4 h-4" />{ctaLabel}</>}
                </Button>
              </motion.div>

              <motion.div whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                <Button
                  type="button"
                  variant="outline"
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

// ─── Main grid ────────────────────────────────────────────────────────────

export const CategoryGrid: React.FC = () => {
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);

  const openSheet = useCallback((cat: Category) => setSelectedCat(cat), []);
  const closeSheet = useCallback(() => setSelectedCat(null), []);

  // Support the vano:select-category custom event from TaskShowcase etc.
  useEffect(() => {
    const handle = (e: Event) => {
      const slug = (e as CustomEvent<{ slug: string }>).detail.slug;
      const cat = CATEGORIES.find(c => c.slug === slug);
      if (cat) openSheet(cat);
    };
    window.addEventListener('vano:select-category', handle);
    return () => window.removeEventListener('vano:select-category', handle);
  }, [openSheet]);

  return (
    <>
      <div id="category-grid" aria-label="What do you need help with?">
        <div className="grid grid-cols-3 gap-2.5">
          {CATEGORIES.map((cat, idx) => {
            const shown = cardPrice(cat);
            return (
              <motion.button
                key={cat.slug}
                onClick={() => openSheet(cat)}
                whileHover={{ y: -3, scale: 1.04 }}
                whileTap={{ scale: 0.93 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-1.5',
                  'min-h-[96px] rounded-2xl px-2 py-3 border',
                  'bg-white text-foreground hover:bg-secondary/60 border-border/60 hover:border-foreground/20 hover:shadow-sm',
                  'transition-[background-color,border-color,box-shadow] duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                )}
              >
                {/* Pulse ring */}
                <span
                  className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-foreground/10 animate-pulse"
                  style={{ animationDelay: `${idx * 180}ms`, animationDuration: '3s' }}
                  aria-hidden="true"
                />
                {/* Popular badge */}
                {cat.popular && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-foreground text-background text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap z-10">
                    Popular
                  </span>
                )}
                <span className="text-2xl leading-none select-none" aria-hidden="true">{cat.emoji}</span>
                <span className="text-[13px] font-semibold leading-tight text-center">{cat.label}</span>
                {/* Smart default price — the key info before you tap */}
                <span className="text-[11px] font-medium text-foreground/50 leading-tight tabular-nums">{shown}</span>
              </motion.button>
            );
          })}
        </div>

        {/* WhatsApp fallback */}
        <button
          onClick={() => window.open(`${teamWhatsAppHref}?text=${encodeURIComponent('Hi VANO! I need help with something — ')}`, '_blank', 'noopener,noreferrer')}
          className="mt-3.5 w-full rounded-2xl bg-[#25D366]/8 border border-[#25D366]/25 px-4 py-3.5 flex items-center gap-3.5 hover:bg-[#25D366]/12 active:scale-[0.98] transition-[background-color,transform] duration-150"
        >
          <span className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-3.5 h-3.5 text-white" aria-hidden="true" />
          </span>
          <span className="flex-1 text-left">
            <span className="block text-sm font-semibold text-foreground">Need something else?</span>
            <span className="block text-xs text-muted-foreground mt-0.5">Chat to us on WhatsApp — we'll sort it</span>
          </span>
          <span className="text-[#25D366] text-lg font-bold leading-none">→</span>
        </button>
      </div>

      {/* Bottom sheet portal-style — rendered outside the grid */}
      <AnimatePresence>
        {selectedCat && (
          <Sheet cat={selectedCat} onClose={closeSheet} />
        )}
      </AnimatePresence>
    </>
  );
};
