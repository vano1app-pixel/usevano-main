import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useReducedMotion, useDragControls } from 'framer-motion';
import { MessageCircle, Loader2, X, Zap, ChevronDown, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SUPPORTED_CITIES } from '@/lib/cities';
import { supabase } from '@/integrations/supabase/client';
import { teamWhatsAppHref } from '@/lib/contact';
import { AddressPicker } from '@/components/household/AddressPicker';
import { loadBookingMemory, saveBookingMemory, clearBookingMemory } from '@/lib/bookingMemory';
import { getReferralCode } from '@/lib/referral';
import { deriveArea } from '@/lib/areaFromAddress';
import { getHouseholdPriceCents } from '@/lib/householdPricing';

// ─── Data ─────────────────────────────────────────────────────────────────

interface Category {
  emoji:       string;
  label:       string;
  slug:        string;
  hint:        string;
  description: string;
  popular?:    boolean;
  sizes?:      string[];
  sizeLabel?:  string;
}

const CATEGORIES: Category[] = [
  {
    // Laundry: the helper collects, washes/dries/folds and returns it. Flat
    // rate, one-off — finishes when the customer marks it done. Slug stays
    // 'shopping' so existing bookings, pricing and the DB category all keep
    // working; only the customer-facing wording changed.
    emoji: '🧺', label: 'Laundry', slug: 'shopping',
    hint: 'Collected, washed & returned folded',
    description: 'Your helper collects your laundry, washes, dries and folds it, and brings it back to your door — fresh and sorted.',
  },
  {
    emoji: '🐕', label: 'Dog walk',  slug: 'dog-walk',
    hint: 'On-lead · collected & returned safely',
    description: 'Collected from your door, walked on-lead, returned home safely.',
    sizeLabel: 'How long?', sizes: ['30 min', '1 hour'],
  },
  {
    emoji: '🌿', label: 'Garden',    slug: 'garden',
    hint: 'Mow, weed & tidy · waste bagged',
    description: 'Mowing, weeding, edging and tidying — all waste bagged.',
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', '3 hours', '4 hours', '5 hours', '6 hours', '7 hours', '8 hours'],
  },
  {
    emoji: '📦', label: 'Moving',    slug: 'moving',
    hint: 'Heavy lifting · you arrange the van',
    description: 'Loading, carrying, unloading — you arrange the van, we do the heavy lifting.',
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', '3 hours', '4+ hours'],
  },
  {
    emoji: '🧹', label: 'Cleaning',  slug: 'cleaning',
    hint: 'Kitchen, bathroom, floors & surfaces',
    description: 'Hoovering, mopping, surfaces, kitchen and bathroom.',
    popular: true,
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', '3 hours'],
  },
  {
    emoji: '📚', label: 'Tutoring',  slug: 'tutoring',
    hint: 'One-to-one · any subject at home',
    description: 'One-to-one at your home. Any subject — Maths, science, languages.',
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', '3 hours', '4 hours', '5 hours', '6 hours', '7 hours', '8 hours'],
  },
];

// Smart defaults — most common booking for each service
const DEFAULT_SIZE: Record<string, string> = {
  shopping:  '',
  'dog-walk': '30 min',
  garden:    '2 hours',
  moving:    '2 hours',
  cleaning:  '2 hours',
  tutoring:  '1 hour',
};

// Per-category accent — a soft, decorative tint for the sheet header only
// (wash behind the title, the emoji tile's ring, the reassurance pill). The
// CTA stays brand-sage everywhere, so the codex's "exactly one primary action
// = sage" rule holds; these hues just give each service its own hero.
interface Accent { wash: string; ring: string; pill: string }
const ACCENT: Record<string, Accent> = {
  cleaning:   { wash: 'from-sage-light',  ring: 'ring-sage/25',     pill: 'text-sage-dark ring-sage/20' },
  shopping:   { wash: 'from-sky-100',     ring: 'ring-sky-300/50',  pill: 'text-sky-700 ring-sky-300/50' },
  'dog-walk': { wash: 'from-amber-100',   ring: 'ring-amber-300/50',pill: 'text-amber-700 ring-amber-300/50' },
  garden:     { wash: 'from-emerald-100', ring: 'ring-emerald-300/50', pill: 'text-emerald-700 ring-emerald-300/50' },
  moving:     { wash: 'from-orange-100',  ring: 'ring-orange-300/50', pill: 'text-orange-700 ring-orange-300/50' },
  tutoring:   { wash: 'from-violet-100',  ring: 'ring-violet-300/50', pill: 'text-violet-700 ring-violet-300/50' },
};
const accentFor = (slug: string): Accent => ACCENT[slug] ?? ACCENT.cleaning;

// ─── Pricing ──────────────────────────────────────────────────────────────

// Delegates to the shared price source so the sheet, the cards and the
// marketing table never disagree — see src/lib/householdPricing.ts.
const getPriceCents = getHouseholdPriceCents;

function fmt(cents: number): string {
  const eur = cents / 100;
  // Discounted prices (10% off) aren't whole euros — show cents only then
  return Number.isInteger(eur) ? `€${eur}` : `€${eur.toFixed(2)}`;
}

// What to show on the card before tapping
function cardPrice(cat: Category): string {
  const defSize = DEFAULT_SIZE[cat.slug];
  const cents = getPriceCents(cat.slug, defSize);
  if (cents === null) return 'from €15';
  const price = fmt(cents);
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

// Booking ahead earns the server-side 10% scheduled discount (the backend
// has supported `scheduled: true` all along — the quick sheet just never
// offered it). Labels are stored verbatim as scheduled_date.
const TOMORROW_SLOTS = ['Tomorrow 9am', 'Tomorrow 12pm', 'Tomorrow 3pm', 'Tomorrow 6pm'];

/** Must mirror the backend's discount math exactly: Math.round(cents * 0.9) */
function applyScheduledDiscount(cents: number): number {
  return Math.round(cents * 0.9);
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────

function buildWhatsAppMsg(cat: Category, when: string, size: string): string {
  const lines = [`Hi VANO! I need ${cat.label.toLowerCase()} help.`];
  if (when) lines.push(`When: ${when === 'Now' ? 'ASAP / right now' : `today at ${when}`}`);
  if (size) lines.push(`Duration: ${size}`);
  lines.push('Can you let me know who is available?');
  return lines.join('\n');
}

// ─── Animated chip + stagger ────────────────────────────────────────────────

// A pill whose selected state is a single shared element that physically
// slides between options (framer `layoutId`) instead of every chip swapping
// colour in place — the segmented-control feel. The sliding highlight is
// dropped for reduced-motion users; it just appears under the active chip.
const OptionChip: React.FC<{
  active:   boolean;
  group:    string;
  onClick:  () => void;
  liveDot?: boolean;
  children: React.ReactNode;
}> = ({ active, group, onClick, liveDot, children }) => {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      aria-pressed={active}
      className={cn(
        'relative flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium',
        'flex-shrink-0 cursor-pointer select-none border transition-colors duration-200',
        active
          ? 'border-transparent text-background'
          : 'border-border bg-background text-foreground hover:border-foreground/30',
      )}
    >
      {active && (
        <motion.span
          layoutId={reduce ? undefined : `chip-${group}`}
          className="absolute inset-0 rounded-full bg-foreground"
          transition={{ type: 'spring', stiffness: 480, damping: 34 }}
        />
      )}
      {liveDot && (
        <span
          className={cn('relative z-10 h-1.5 w-1.5 rounded-full animate-pulse', active ? 'bg-emerald-300' : 'bg-emerald-500')}
          aria-hidden="true"
        />
      )}
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
};

// Sheet content cascades in: each section rises + fades just after the one
// above it (Emil's stagger — ~50ms apart, decorative, never blocks input).
const sheetContainer = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.05, delayChildren: 0.12 } },
};
const sheetItem = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.36, ease: [0.16, 1, 0.3, 1] as const } },
};

// ─── Bottom sheet ─────────────────────────────────────────────────────────

interface SheetProps {
  cat:          Category;
  onClose:      () => void;
  /** Pre-select a size (e.g. the "book your usual" shortcut). */
  initialSize?: string;
}

const Sheet: React.FC<SheetProps> = ({ cat, onClose, initialSize }) => {
  const timeSlots  = useMemo(() => getTimeSlots(), []);
  const remembered = useMemo(() => loadBookingMemory(), []);
  const referralCode = useMemo(() => getReferralCode(), []);
  const [when,     setWhen]    = useState('Now');
  const [size,     setSize]    = useState(
    (initialSize && cat.sizes?.includes(initialSize) ? initialSize : null)
      ?? DEFAULT_SIZE[cat.slug] ?? cat.sizes?.[0] ?? '',
  );
  const [phone,    setPhone]   = useState(remembered?.phone ?? '');
  const [address,  setAddress] = useState(remembered?.address ?? '');
  const [coords,   setCoords]  = useState<{ lat: number; lng: number } | null>(
    remembered?.lat != null && remembered?.lng != null
      ? { lat: remembered.lat, lng: remembered.lng }
      : null,
  );
  const [city,     setCity]    = useState<string>(remembered?.city ?? 'Galway');
  // True once the area came from the address geocoder — hides the manual chips
  const [cityAuto, setCityAuto] = useState(false);
  const [prefilled, setPrefilled] = useState(!!remembered);
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState<string | null>(null);
  // Book-ahead (tomorrow) chips stay tucked away until asked for — keeps the
  // default "When?" row to one line. Collapsing while a tomorrow slot is
  // picked falls back to "Now" so the visible row never looks unselected.
  const [showAhead, setShowAhead] = useState(false);
  const toggleAhead = () => setShowAhead(prev => {
    const next = !prev;
    if (!next && when.startsWith('Tomorrow')) setWhen('Now');
    return next;
  });
  // Progressive disclosure: time / duration / area collapse into one summary
  // line so a new visitor sees only phone + address + Book. Smart defaults are
  // already set, so the summary is accurate before it's ever opened.
  const [editDetails, setEditDetails] = useState(false);

  // Drag-to-dismiss — only the handle starts the drag (dragListener=false), so
  // the scrollable body keeps scrolling normally. A flick or a long pull closes.
  const dragControls = useDragControls();

  const accent = accentFor(cat.slug);

  function forgetMe() {
    clearBookingMemory();
    setPhone(''); setAddress(''); setCoords(null); setCity('Galway'); setCityAuto(false);
    setPrefilled(false);
  }

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

  const isScheduledAhead = when.startsWith('Tomorrow');
  const baseCents  = getPriceCents(cat.slug, size);
  const priceCents = baseCents && isScheduledAhead ? applyScheduledDiscount(baseCents) : baseCents;
  const priceLabel = priceCents ? fmt(priceCents) : null;

  const ctaLabel = [
    `Book ${cat.label}`,
    size || null,
    priceLabel,
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
          scheduled:        isScheduledAhead, // unlocks the server's 10% book-ahead discount
          note:             '',
          customer_name:    'Guest', // name collected by Stripe at checkout
          customer_phone:   phoneClean,
          customer_email:   null,
          customer_address: address.trim(),
          ...(coords ? { customer_lat: coords.lat, customer_lng: coords.lng } : {}),
          city,
          ...(referralCode ? { referral_code: referralCode } : {}),
        }},
      );
      if (fnErr || !data?.checkout_url) {
        throw new Error((data as { error?: string } | null)?.error || fnErr?.message || 'Something went wrong.');
      }
      saveBookingMemory({
        phone:   phoneClean,
        address: address.trim(),
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        city,
        lastCategory: cat.slug,
        lastSize:     size,
      });
      window.location.href = data.checkout_url as string;
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

      {/* Sheet — slides up from the bottom of the screen; the phone field is
          focused the moment it lands. Enter reads as a slide, exit snaps back. */}
      <motion.div
        key="sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%', transition: { duration: 0.3, ease: [0.32, 0.72, 0, 1] } }}
        transition={{ duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={(_, info) => { if (info.offset.y > 120 || info.velocity.y > 600) onClose(); }}
        className="fixed inset-x-0 bottom-0 z-[70] bg-cream rounded-t-3xl shadow-2xl safe-area-bottom"
        style={{ maxHeight: '88vh', overflowY: 'auto' }}
        role="dialog"
        aria-modal="true"
        aria-label={`Book ${cat.label}`}
      >
        {/* Hero header — a soft per-category wash, a grab handle (drag it down
            to dismiss), the emoji on a ringed tile that springs in, and a
            one-line reassurance. Personality instead of a wall of inputs. */}
        <div className={cn('relative overflow-hidden rounded-t-3xl bg-gradient-to-b to-cream', accent.wash)}>
          {/* Grab zone — only this starts the drag, so the body still scrolls */}
          <div
            onPointerDown={(e) => dragControls.start(e)}
            className="flex cursor-grab touch-none justify-center pt-3 pb-1 active:cursor-grabbing"
          >
            <div className="h-1 w-10 rounded-full bg-foreground/15" />
          </div>
          <div className="relative px-5 pb-4 pt-1">
            <div className="flex items-start gap-3.5">
              <motion.div
                initial={{ scale: 0.5, opacity: 0, rotate: -8 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 360, damping: 17, delay: 0.05 }}
                className={cn('flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white text-3xl shadow-md ring-1', accent.ring)}
                aria-hidden="true"
              >
                {cat.emoji}
              </motion.div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 className="font-display text-2xl font-bold leading-tight text-foreground" style={{ fontFamily: 'Bricolage Grotesque, Plus Jakarta Sans, system-ui, sans-serif' }}>
                  {cat.label}
                </h2>
                <p className="mt-0.5 text-sm text-foreground/60">{cat.hint}</p>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-foreground/8 transition-colors hover:bg-foreground/12"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-foreground/60" />
              </button>
            </div>
            <div className={cn('mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-[12px] font-medium shadow-sm ring-1', accent.pill)}>
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              Free to book — you only pay when a helper accepts
            </div>
          </div>
        </div>

        <div className="px-5 pb-6 pt-3">
          <form onSubmit={handleBook}>
            <motion.div variants={sheetContainer} initial="hidden" animate="show" className="space-y-5">
              {/* Welcome back — details remembered from the last booking */}
              {prefilled && (
                <motion.div variants={sheetItem} className="flex items-center justify-between gap-3 rounded-xl bg-sage/8 border border-sage/25 px-3.5 py-2.5">
                  <p className="text-xs text-foreground/70">
                    <span className="font-semibold text-sage-dark">Welcome back</span> — we filled in your details
                  </p>
                  <button
                    type="button"
                    onClick={forgetMe}
                    className="text-[11px] font-semibold text-foreground/45 hover:text-foreground/70 underline underline-offset-2 flex-shrink-0 transition-colors"
                  >
                    Clear
                  </button>
                </motion.div>
              )}

              {/* Phone first — the sheet slides up straight onto this field.
                  Time + duration below are pre-picked, so number + address is
                  all a new visitor has to type. */}
              <motion.div variants={sheetItem}>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">Your phone</p>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="08x xxx xxxx"
                  autoComplete="tel"
                  autoFocus={!prefilled}
                  required
                  className="w-full rounded-xl border border-border bg-white px-4 py-3 text-base placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-transparent transition-[border-color,box-shadow] duration-150"
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">We'll text you when someone accepts</p>
              </motion.div>

              {/* Address — Eircode search or current location */}
              <motion.div variants={sheetItem}>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">Where?</p>
                <AddressPicker
                  value={address}
                  coords={coords}
                  error={false}
                  onAddress={(addr, lat, lng, locality) => {
                    setAddress(addr);
                    setCoords({ lat, lng });
                    // Eircode/address already knows the area — don't make them pick
                    const area = deriveArea(locality, { lat, lng });
                    if (area) { setCity(area); setCityAuto(true); }
                  }}
                  onTextChange={(t) => { setAddress(t); setCoords(null); }}
                  onBlur={() => {}}
                  placeholder="Address or Eircode…"
                  showMapPreview={false}
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">So your helper knows exactly where to go</p>
              </motion.div>

              {/* Booking details — collapsed into one summary + live-price card.
                  A new visitor sees only phone, address and Book; "Change…"
                  reveals time / duration / area inline. Defaults are already
                  set, so the summary is accurate before it's ever opened. */}
              <motion.div variants={sheetItem} className="overflow-hidden rounded-2xl border border-foreground/8 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {when === 'Now' ? 'Now' : when}{size ? ` · ${size}` : ''}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {cat.label} · <span aria-hidden="true">📍</span> {city}
                    </p>
                  </div>
                  {priceCents != null && (
                    /* Price rolls with a blur+slide swap whenever it changes —
                       turns a silent number change into responsive feedback. */
                    <span className="relative flex-shrink-0 overflow-hidden leading-none">
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                          key={priceCents}
                          initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
                          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                          exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
                          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                          className="block text-xl font-bold text-foreground tabular-nums"
                        >
                          {fmt(priceCents)}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                  )}
                </div>
                {isScheduledAhead && baseCents && (
                  <p className="flex items-center justify-between px-4 pb-2.5 -mt-1 text-[11px]">
                    <span className="font-semibold text-sage-dark">✓ Book-ahead discount −10%</span>
                    <span className="text-muted-foreground line-through tabular-nums">{fmt(baseCents)}</span>
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setEditDetails(v => !v)}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-foreground/8 py-2.5 text-[12px] font-semibold text-foreground/55 transition-colors hover:bg-foreground/4"
                  aria-expanded={editDetails}
                >
                  {editDetails ? 'Done' : 'Change time, duration or area'}
                  <motion.span animate={{ rotate: editDetails ? 180 : 0 }} transition={{ duration: 0.2 }} className="inline-flex" aria-hidden="true">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {editDetails && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden border-t border-foreground/8"
                    >
                      <div className="space-y-5 px-4 py-4">
                        {/* When? — "Now" pre-selected; book-ahead behind a toggle */}
                        <div>
                          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40">When?</p>
                          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                            {timeSlots.map(opt => (
                              <OptionChip key={opt} group="when" active={when === opt} liveDot={opt === 'Now'} onClick={() => setWhen(opt)}>
                                {opt}
                              </OptionChip>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={toggleAhead}
                            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-sage/30 bg-sage/8 px-3 py-1.5 text-[12px] font-semibold text-sage-dark transition-colors hover:bg-sage/14"
                            aria-expanded={showAhead}
                          >
                            <span aria-hidden="true">📅</span>
                            Book ahead &amp; save 10%
                            <motion.span animate={{ rotate: showAhead ? 180 : 0 }} transition={{ duration: 0.2 }} className="inline-flex" aria-hidden="true">
                              <ChevronDown className="h-3.5 w-3.5" />
                            </motion.span>
                          </button>
                          <AnimatePresence initial={false}>
                            {showAhead && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                                className="overflow-hidden"
                              >
                                <div className="flex gap-2.5 overflow-x-auto pb-1 pt-2.5 scrollbar-hide -mx-1 px-1">
                                  {TOMORROW_SLOTS.map(opt => (
                                    <OptionChip key={opt} group="when" active={when === opt} onClick={() => setWhen(opt)}>
                                      {opt}
                                    </OptionChip>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* How long? — sensible default pre-selected */}
                        {cat.sizes && (
                          <div>
                            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40">
                              {cat.sizeLabel ?? 'How long?'}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {cat.sizes.map(opt => (
                                <OptionChip key={opt} group="size" active={size === opt} onClick={() => setSize(opt)}>
                                  {opt}
                                </OptionChip>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Area — auto-detected from the address; chips fallback */}
                        {cityAuto ? (
                          <div className="flex items-center justify-between gap-3 rounded-xl bg-foreground/4 border border-foreground/8 px-3.5 py-2.5">
                            <p className="text-sm text-foreground/75 min-w-0 truncate">
                              <span aria-hidden="true">📍</span> Area: <span className="font-semibold text-foreground">{city}</span>
                              <span className="text-muted-foreground text-xs"> · from your address</span>
                            </p>
                            <button
                              type="button"
                              onClick={() => setCityAuto(false)}
                              className="text-[11px] font-semibold text-foreground/45 hover:text-foreground/70 underline underline-offset-2 flex-shrink-0 transition-colors"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <div>
                            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40">Your area</p>
                            <div className="flex flex-wrap gap-2">
                              {(SUPPORTED_CITIES.includes(city as typeof SUPPORTED_CITIES[number])
                                ? [...SUPPORTED_CITIES]
                                : [city, ...SUPPORTED_CITIES]
                              ).map(c => {
                                // Galway-first: dispatch is live in Galway today. Other
                                // cities read as "soon" — but a remembered or address-
                                // derived area stays selectable for returning customers.
                                const comingSoon = c !== 'Galway' && c !== city;
                                if (comingSoon) {
                                  return (
                                    <span
                                      key={c}
                                      className="px-3.5 py-1.5 rounded-full text-sm font-medium border border-border/50 text-muted-foreground/50 bg-secondary/40 flex-shrink-0 select-none"
                                    >
                                      {c} · soon
                                    </span>
                                  );
                                }
                                return (
                                  <OptionChip key={c} group="area" active={city === c} onClick={() => setCity(c)}>
                                    {c}
                                  </OptionChip>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* CTA block */}
              <motion.div variants={sheetItem} className="space-y-2.5">
                {referralCode && (
                  <p className="flex items-center justify-center gap-1.5 text-xs text-sage-dark font-medium">
                    <span aria-hidden="true">🎁</span>
                    Your friend's €5 comes off your first booking when you pay
                  </p>
                )}

                <motion.div whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                  <Button
                    type="submit"
                    disabled={loading || !phone.trim()}
                    className="group w-full rounded-full gap-2 font-semibold text-[15px] h-12 shadow-primary-glow"
                  >
                    {loading
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Booking…</>
                      : <><Zap className="w-4 h-4" />{ctaLabel}<ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" /></>}
                  </Button>
                </motion.div>

                <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                  A nearby helper usually replies in minutes
                </p>

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
              </motion.div>

              <motion.div variants={sheetItem}>
                {error && <p className="text-center text-xs text-destructive mb-2">{error}</p>}
                <p className="text-center text-[11px] text-muted-foreground">
                  No payment now — pay securely (card, Apple Pay, Google Pay) once your helper accepts · money back guarantee
                </p>
              </motion.div>
            </motion.div>
          </form>
        </div>
      </motion.div>
    </>
  );
};

// ─── Main grid ────────────────────────────────────────────────────────────

// One category tile. A subtle 3D parallax tilt follows the cursor on hover
// (desktop), composed with the lift/press + emoji wiggle. The tilt is skipped
// for reduced-motion users; the lift/wiggle are gated by the app MotionConfig.
const TILE_TILT_DEG = 8;

const CategoryTile: React.FC<{ cat: Category; onOpen: () => void }> = ({ cat, onOpen }) => {
  const reduce = useReducedMotion();
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const rotateX = useSpring(rx, { stiffness: 300, damping: 20 });
  const rotateY = useSpring(ry, { stiffness: 300, damping: 20 });
  const shown = cardPrice(cat);

  const handleMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * TILE_TILT_DEG * 2);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * TILE_TILT_DEG * 2);
  };
  const handleLeave = () => { rx.set(0); ry.set(0); };

  return (
    <motion.button
      onClick={onOpen}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      initial="rest"
      animate="rest"
      whileHover="hover"
      whileTap="tap"
      variants={{ rest: { y: 0, scale: 1 }, hover: { y: -3, scale: 1.04 }, tap: { scale: 0.93 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      style={{ rotateX, rotateY, transformPerspective: 700 }}
      className={cn(
        'relative flex flex-col items-center justify-center gap-1.5',
        'min-h-[96px] rounded-2xl px-2 py-3 border',
        'bg-white text-foreground hover:bg-secondary/60 border-foreground/15 hover:border-foreground/30 shadow-sm hover:shadow-md',
        'transition-[background-color,border-color,box-shadow] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      )}
    >
      {/* Popular badge */}
      {cat.popular && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-foreground text-background text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap z-10">
          Popular
        </span>
      )}
      <motion.span
        className="text-2xl leading-none select-none"
        aria-hidden="true"
        variants={{ rest: { rotate: 0, scale: 1 }, hover: { rotate: [0, -12, 10, -7, 0], scale: 1.18 }, tap: { scale: 0.85 } }}
        transition={{ duration: 0.45, ease: 'easeInOut' }}
      >
        {cat.emoji}
      </motion.span>
      <span className="text-[13px] font-semibold leading-tight text-center">{cat.label}</span>
      {/* Smart default price — the key info before you tap */}
      <span className="text-[11px] font-medium text-foreground/60 leading-tight tabular-nums">{shown}</span>
    </motion.button>
  );
};

export const CategoryGrid: React.FC = () => {
  const [selected, setSelected] = useState<{ cat: Category; size?: string } | null>(null);

  const openSheet = useCallback((cat: Category, size?: string) => setSelected({ cat, size }), []);
  const closeSheet = useCallback(() => setSelected(null), []);

  // One-tap rebook: last booked job from this device
  const usual = useMemo(() => {
    const mem = loadBookingMemory();
    if (!mem?.lastCategory) return null;
    const cat = CATEGORIES.find(c => c.slug === mem.lastCategory);
    if (!cat) return null;
    const size = mem.lastSize && cat.sizes?.includes(mem.lastSize) ? mem.lastSize : undefined;
    const cents = getPriceCents(cat.slug, size ?? DEFAULT_SIZE[cat.slug] ?? '');
    return { cat, size, price: cents ? fmt(cents) : null };
  }, []);

  // Support the vano:select-category custom event (e.g. PricingTable).
  useEffect(() => {
    const handle = (e: Event) => {
      const { slug, size } = (e as CustomEvent<{ slug: string; size?: string }>).detail;
      const cat = CATEGORIES.find(c => c.slug === slug);
      if (cat) openSheet(cat, size);
    };
    window.addEventListener('vano:select-category', handle);
    return () => window.removeEventListener('vano:select-category', handle);
  }, [openSheet]);

  return (
    <>
      <div id="category-grid" aria-label="What do you need help with?">
        <div className="grid grid-cols-3 gap-2.5">
          {CATEGORIES.map((cat) => (
            <CategoryTile key={cat.slug} cat={cat} onOpen={() => openSheet(cat)} />
          ))}
        </div>

        {/* One-tap rebook — remembers the last job booked on this device */}
        {usual && (
          <button
            onClick={() => openSheet(usual.cat, usual.size)}
            className="mt-3.5 w-full rounded-2xl bg-sage/8 border border-sage/30 px-4 py-3 flex items-center gap-3 text-left shadow-sm hover:bg-sage/14 hover:shadow-md active:scale-[0.98] transition-[background-color,box-shadow,transform] duration-150"
          >
            <span className="text-xl leading-none flex-shrink-0" aria-hidden="true">{usual.cat.emoji}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-foreground leading-snug">
                Book your usual{usual.price ? ` — ${usual.price}` : ''}
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5 truncate">
                {usual.cat.label}{usual.size ? ` · ${usual.size}` : ''} · details already filled in
              </span>
            </span>
            <span className="text-sage text-lg font-bold leading-none flex-shrink-0" aria-hidden="true">↻</span>
          </button>
        )}

        {/* WhatsApp fallback — one quiet line, not a competing card */}
        <button
          onClick={() => window.open(`${teamWhatsAppHref}?text=${encodeURIComponent('Hi VANO! I need help with something — ')}`, '_blank', 'noopener,noreferrer')}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" aria-hidden="true" />
          Something else?<span className="font-semibold text-foreground/80 underline underline-offset-2">WhatsApp us</span>
        </button>
      </div>

      {/* Bottom sheet portal-style — rendered outside the grid */}
      <AnimatePresence>
        {selected && (
          <Sheet cat={selected.cat} initialSize={selected.size} onClose={closeSheet} />
        )}
      </AnimatePresence>
    </>
  );
};
