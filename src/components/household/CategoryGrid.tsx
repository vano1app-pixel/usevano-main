import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion, useDragControls, type Variants } from 'framer-motion';
import { haptic } from '@/lib/haptics';
import { MessageCircle, Loader2, X, Zap, ShieldCheck, Check, Search, ArrowRight } from 'lucide-react';
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
import { searchCustomJobs, VANO_HOURLY_CENTS, type CustomJob } from '@/lib/customJobs';
import { isValidPhone } from '@/lib/validation';

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

// The front door is now ONE centered search bar: type → matching jobs drop down
// → pick one → see the VANO-vs-market price. The CATEGORIES above still power
// the booking sheet for returning customers ("book your usual"), deep links and
// the vano:select-category event — they're just no longer the way IN. Everything
// prices through the canonical custom rate (€18/hr, src/lib/customJobs.ts).

// How long the job takes — drives the custom hourly price + the comparison.
const DURATIONS = ['1 hour', '2 hours', '3 hours', '4 hours', '5 hours', '6 hours', '7 hours', '8 hours'];

// Rotating placeholder examples — the box hints what you can ask for, so a blank
// field never leaves a first-timer wondering what to type.
const HINTS = [
  'mow the lawn',
  'grinds for my son',
  'clean the house',
  'walk the dog',
  'tidy the garden',
  'mount a TV',
  'paint the spare room',
  'help move a sofa',
  'an hour of ironing',
  'fix a leaky tap',
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

// ─── Pricing ──────────────────────────────────────────────────────────────

// Delegates to the shared price source so the sheet, the cards and the
// marketing table never disagree — see src/lib/householdPricing.ts.
const getPriceCents = getHouseholdPriceCents;

function fmt(cents: number): string {
  const eur = cents / 100;
  // Discounted prices (10% off) aren't whole euros — show cents only then
  return Number.isInteger(eur) ? `€${eur}` : `€${eur.toFixed(2)}`;
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

// ─── Motion presets ─────────────────────────────────────────────────────────

// Spring for the sliding selection pill — quick, lively, settles fast.
const PILL_SPRING = { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 } as const;

// Staggered entrance: the sheet's fields cascade in one-by-one as it lands.
const listContainer: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.05, delayChildren: 0.08 } },
};
const listItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 440, damping: 32 } },
};

// ─── Chip ────────────────────────────────────────────────────────────────────

interface ChipProps {
  active:   boolean;
  /** Emerald "same-day" treatment (the "Now" slot). */
  accent?:  boolean;
  /** Shared-element namespace — the highlight glides between chips in a group. */
  group:    string;
  onClick:  () => void;
  children: React.ReactNode;
}

// A pill chip whose dark/emerald highlight is a shared layout element: when the
// active chip in a group changes, framer morphs the highlight from the old chip
// to the new one instead of snapping. The label rides above it.
const Chip: React.FC<ChipProps> = ({ active, accent, group, onClick, children }) => (
  <motion.button
    type="button"
    onClick={onClick}
    whileTap={{ scale: 0.9 }}
    transition={{ type: 'spring', stiffness: 600, damping: 22 }}
    className={cn(
      'relative px-4 py-2.5 rounded-full text-sm font-medium border flex-shrink-0 cursor-pointer select-none',
      'transition-colors duration-150',
      active
        ? cn('border-transparent', accent ? 'text-white' : 'text-background')
        : accent
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
          : 'bg-background text-foreground border-border hover:border-foreground/30',
    )}
  >
    {active && (
      <motion.span
        layoutId={`pill-${group}`}
        className={cn('absolute inset-0 rounded-full', accent ? 'bg-emerald-500' : 'bg-foreground')}
        transition={PILL_SPRING}
      />
    )}
    <span className="relative z-10">{children}</span>
  </motion.button>
);

// ─── Bottom sheet ─────────────────────────────────────────────────────────

interface SheetProps {
  cat:          Category;
  onClose:      () => void;
  /** Pre-select a size (e.g. the "book your usual" shortcut). */
  initialSize?: string;
  /** Free-text job description (custom "name any job" path) — sent verbatim. */
  note?:        string;
  /** Resolved job label for a custom booking (e.g. "Painting & decorating"). */
  extraLabel?:  string;
}

const Sheet: React.FC<SheetProps> = ({ cat, onClose, initialSize, note, extraLabel }) => {
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
  // Field-level flags so a failed submit points at the field to fix, not just
  // a message at the foot of the sheet
  const [phoneError,   setPhoneError]   = useState(false);
  const [addressError, setAddressError] = useState(false);
  // Drag-to-dismiss: only the handle starts the drag, so the body still scrolls
  const dragControls = useDragControls();
  const sheetRef = useRef<HTMLDivElement>(null);

  function forgetMe() {
    clearBookingMemory();
    setPhone(''); setAddress(''); setCoords(null); setCity('Galway'); setCityAuto(false);
    setPrefilled(false);
  }

  // Lock body scroll while sheet is open without changing scroll position
  useEffect(() => {
    const scrollY = window.scrollY;
    // Hand focus back to the tile that opened the sheet when it closes
    const trigger = document.activeElement as HTMLElement | null;
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
      trigger?.focus?.();
    };
  }, []);

  // Escape key
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  // Keep Tab focus inside the sheet while it's open (wrap at both ends)
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const f = el.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if (f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, []);

  const isScheduledAhead = when.startsWith('Tomorrow');
  const baseCents  = getPriceCents(cat.slug, size);
  const priceCents = baseCents && isScheduledAhead ? applyScheduledDiscount(baseCents) : baseCents;
  const priceLabel = priceCents ? fmt(priceCents) : null;

  // Live field validity — drives the small green ✓ next to each label as it's
  // filled. Quiet reassurance at the highest-friction step (a stranger typing
  // their number + address for in-home help).
  const phoneValid = isValidPhone(phone);
  const addressValid = !!address.trim();

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
    if (!isValidPhone(phone)) {
      setPhoneError(true);
      setError('Please enter a valid phone number.');
      return;
    }
    if (!address.trim()) {
      setAddressError(true);
      setError('Please add your address so your helper can find you.');
      return;
    }
    setLoading(true); setError(null);
    haptic(12); // subtle confirm tick on supported phones
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        'create-household-payment-checkout',
        { body: {
          category:         cat.slug,
          when_label:       when,
          size_label:       size,
          scheduled:        isScheduledAhead, // unlocks the server's 10% book-ahead discount
          note:             note ?? '',
          ...(extraLabel ? { extra_label: extraLabel } : {}),
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
          focused the moment it lands. Enter reads as a slide, exit snaps back.
          Drag the handle down past a threshold (or flick) to dismiss. */}
      <motion.div
        key="sheet"
        ref={sheetRef}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%', transition: { duration: 0.3, ease: [0.32, 0.72, 0, 1] } }}
        transition={{ duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        dragSnapToOrigin
        onDragEnd={(_, info) => { if (info.offset.y > 120 || info.velocity.y > 700) onClose(); }}
        className="fixed inset-x-0 bottom-0 z-[70] bg-cream rounded-t-3xl shadow-2xl safe-area-bottom sm:mx-auto sm:max-w-[460px] sm:bottom-6 sm:rounded-3xl"
        style={{ maxHeight: '88vh', overflowY: 'auto', overscrollBehavior: 'contain' }}
        role="dialog"
        aria-modal="true"
        aria-label={`Book ${cat.label}`}
      >
        {/* Drag handle — grab and pull down to close */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none"
        >
          <div className="w-10 h-1.5 rounded-full bg-foreground/20" />
        </div>

        <div className="px-5 pb-6 pt-2">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2.5 mb-0.5">
                <motion.span
                  className="text-2xl leading-none"
                  aria-hidden="true"
                  initial={{ scale: 0, rotate: -25 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 480, damping: 12, delay: 0.18 }}
                >
                  {cat.emoji}
                </motion.span>
                <h2 className="font-display text-xl font-bold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, Plus Jakarta Sans, system-ui, sans-serif' }}>
                  {cat.label}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground ml-9">{cat.hint}</p>
              {note && note.trim() && note.trim() !== cat.label && (
                <p className="text-xs text-foreground/70 ml-9 mt-1">“{note.trim()}”</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-foreground/8 flex items-center justify-center hover:bg-foreground/12 transition-colors flex-shrink-0 mt-0.5"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-foreground/60" />
            </button>
          </div>

          <motion.form
            onSubmit={handleBook}
            className="space-y-5"
            variants={listContainer}
            initial="hidden"
            animate="show"
          >
            {/* Welcome back — details remembered from the last booking */}
            {prefilled && (
              <motion.div variants={listItem} className="flex items-center justify-between gap-3 rounded-xl bg-sage/8 border border-sage/25 px-3.5 py-2.5">
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
            <motion.div variants={listItem}>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5 flex items-center gap-1.5">
                Your phone
                <AnimatePresence>
                  {phoneValid && (
                    <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }} className="text-emerald-500" aria-hidden="true">
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </p>
              <input
                type="tel"
                value={phone}
                onChange={e => { setPhone(e.target.value); if (phoneError) setPhoneError(false); if (error) setError(null); }}
                placeholder="08x xxx xxxx"
                autoComplete="tel"
                inputMode="tel"
                enterKeyHint="go"
                autoCapitalize="off"
                autoCorrect="off"
                autoFocus={!prefilled}
                required
                className={cn(
                  'w-full rounded-xl border bg-white px-4 py-3 text-base placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:border-transparent transition-[border-color,box-shadow] duration-150',
                  phoneError ? 'border-destructive focus:ring-destructive/30' : 'border-border focus:ring-foreground/20',
                )}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">We'll text you when someone accepts</p>
            </motion.div>

            {/* Address — Eircode search or current location */}
            <motion.div variants={listItem}>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5 flex items-center gap-1.5">
                Where?
                <AnimatePresence>
                  {addressValid && (
                    <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }} className="text-emerald-500" aria-hidden="true">
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </p>
              <AddressPicker
                value={address}
                coords={coords}
                error={addressError}
                onAddress={(addr, lat, lng, locality) => {
                  setAddress(addr);
                  setCoords({ lat, lng });
                  if (addressError) setAddressError(false);
                  if (error) setError(null);
                  // Eircode/address already knows the area — don't make them pick
                  const area = deriveArea(locality, { lat, lng });
                  if (area) { setCity(area); setCityAuto(true); }
                }}
                onTextChange={(t) => { setAddress(t); setCoords(null); if (addressError) setAddressError(false); if (error) setError(null); }}
                onBlur={() => {}}
                placeholder="Address or Eircode…"
                showMapPreview={false}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">So your helper knows exactly where to go</p>
            </motion.div>

            {/* When? — "Now" pre-selected; chips are an optional tweak */}
            <motion.div variants={listItem}>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">When?</p>
              <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                {timeSlots.map(opt => (
                  <Chip key={opt} group="when" active={when === opt} accent={opt === 'Now'} onClick={() => setWhen(opt)}>
                    {opt}
                  </Chip>
                ))}
              </div>
              {/* Book ahead — server grants 10% off scheduled bookings */}
              <p className="text-[10px] font-semibold text-sage-dark mt-2 mb-1.5">Or book ahead — 10% off</p>
              <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                {TOMORROW_SLOTS.map(opt => (
                  <Chip key={opt} group="when-ahead" active={when === opt} onClick={() => setWhen(opt)}>
                    {opt}
                  </Chip>
                ))}
              </div>
            </motion.div>

            {/* How long? — sensible default pre-selected */}
            {cat.sizes && (
              <motion.div variants={listItem}>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">
                  {cat.sizeLabel ?? 'How long?'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {cat.sizes.map(opt => (
                    <Chip key={opt} group="size" active={size === opt} onClick={() => setSize(opt)}>
                      {opt}
                    </Chip>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Area — auto-detected from the address; chips only as fallback */}
            {cityAuto ? (
              <motion.div variants={listItem} className="flex items-center justify-between gap-3 rounded-xl bg-foreground/4 border border-foreground/8 px-3.5 py-2.5">
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
              </motion.div>
            ) : (
              <motion.div variants={listItem}>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">Your area</p>
                <div className="flex flex-wrap gap-2">
                  {(SUPPORTED_CITIES.includes(city as typeof SUPPORTED_CITIES[number])
                    ? [...SUPPORTED_CITIES]
                    : [city, ...SUPPORTED_CITIES]
                  ).map(c => {
                    // Galway-first: dispatch is live in Galway today. Other cities
                    // read as "soon" — but a remembered or address-derived area
                    // stays selectable so returning customers aren't locked out.
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
                      <Chip key={c} group="area" active={city === c} onClick={() => setCity(c)}>
                        {c}
                      </Chip>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Price summary + CTA */}
            <motion.div variants={listItem} className="space-y-2.5 pt-1">
              {priceCents && (
                <div className="px-4 py-3 rounded-xl bg-foreground/4 border border-foreground/8">
                  <div className="flex items-center justify-between" aria-live="polite">
                    <span className="text-sm text-foreground/60">{cat.label} · {when === 'Now' ? 'ASAP' : when}{size ? ` · ${size}` : ''}</span>
                    {/* Bouncy live price — re-keying on the amount replays the spring pop */}
                    <motion.span
                      key={priceCents}
                      initial={{ scale: 0.68, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 520, damping: 16 }}
                      className="text-lg font-bold text-foreground tabular-nums inline-block origin-right"
                    >
                      {fmt(priceCents)}
                    </motion.span>
                  </div>
                  <AnimatePresence initial={false}>
                    {isScheduledAhead && baseCents && (
                      <motion.p
                        key="book-ahead"
                        initial={{ opacity: 0, height: 0, y: -4 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -4 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        className="flex items-center justify-between text-[11px] mt-1 overflow-hidden"
                      >
                        <span className="font-semibold text-sage-dark">✓ Book-ahead discount −10%</span>
                        <span className="text-muted-foreground line-through tabular-nums">{fmt(baseCents)}</span>
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {referralCode && (
                <p className="flex items-center justify-center gap-1.5 text-xs text-sage-dark font-medium">
                  <span aria-hidden="true">🎁</span>
                  Your friend's €5 comes off your first booking when you pay
                </p>
              )}

              {/* Risk-reversal at the decision point — the single most reassuring
                  fact (you don't pay until a helper accepts) sits right above the
                  CTA, not buried in the fine print beneath it. */}
              <p className="flex items-center justify-center gap-1.5 text-[11.5px] font-semibold text-sage-dark">
                <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                No payment until a helper accepts · money-back guarantee
              </p>

              <motion.div
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={cn(
                  'relative overflow-hidden rounded-full transition-shadow duration-300',
                  // The glow only lights up once the form can actually submit, so
                  // a disabled button never sits there glowing.
                  phone.trim() && !loading ? 'shadow-primary-glow' : '',
                )}
              >
                <Button
                  type="submit"
                  disabled={loading || !phone.trim()}
                  className="w-full rounded-full gap-2 font-semibold text-base h-[52px] tabular-nums bg-primary hover:bg-primary"
                >
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Booking…</>
                    : <>
                        <motion.span
                          className="inline-flex"
                          animate={{ scale: [1, 1.18, 1] }}
                          transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 2.6, ease: 'easeInOut' }}
                        >
                          <Zap className="w-4 h-4" />
                        </motion.span>
                        {ctaLabel}
                      </>}
                </Button>
                {/* Occasional light sweep so the primary action feels alive */}
                {!loading && !!phone.trim() && (
                  <motion.span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                    initial={{ x: '-150%' }}
                    animate={{ x: '450%' }}
                    transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
                  />
                )}
              </motion.div>

              {error && <p className="text-center text-xs text-destructive">{error}</p>}

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

            <motion.p variants={listItem} className="text-center text-[11px] text-muted-foreground">
              No payment now — you're charged only when a helper accepts, and they're paid only once you confirm it's done. Card, Apple Pay or Google Pay · money-back guarantee
            </motion.p>
          </motion.form>
        </div>
      </motion.div>
    </>
  );
};

// ─── Front door: type what you need ─────────────────────────────────────────

type Selection = { cat: Category; size?: string; note?: string; extraLabel?: string };

export const CategoryGrid: React.FC = () => {
  const [selected, setSelected] = useState<Selection | null>(null);

  // Search query + the job picked from the dropdown. Typing again clears the
  // pick so the dropdown reopens; `open` controls the dropdown visibility.
  const [query, setQuery] = useState('');
  const [job, setJob] = useState<CustomJob | null>(null);
  const [size, setSize] = useState('2 hours');
  const [hintIdx, setHintIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number | null>(null);

  const openSheet = useCallback(
    (cat: Category, opts?: { size?: string; note?: string; extraLabel?: string }) =>
      setSelected({ cat, size: opts?.size, note: opts?.note, extraLabel: opts?.extraLabel }),
    [],
  );
  const closeSheet = useCallback(() => setSelected(null), []);

  // Rotate the placeholder hint while the box is empty — so a blank field always
  // suggests something to type. Stops the moment they start typing.
  useEffect(() => {
    if (query) return;
    const id = window.setInterval(() => setHintIdx((i) => (i + 1) % HINTS.length), 2600);
    return () => window.clearInterval(id);
  }, [query]);

  // Typeahead suggestions for the dropdown, and the price for the picked job.
  // Pricing is the canonical custom rate (€18/hr) so it can never go under min
  // wage, with the picked job's typical market rate shown beside it.
  const suggestions = useMemo(() => searchCustomJobs(query, 6), [query]);
  const hours = Number(size.match(/^\d+/)?.[0]) || 0;
  const vanoCents = getPriceCents('custom', size) ?? VANO_HOURLY_CENTS * hours;
  const marketCents = (job?.marketHourlyCents ?? 0) * hours;
  const saveCents = Math.max(0, marketCents - vanoCents);
  const savePct = marketCents > 0 ? Math.round((saveCents / marketCents) * 100) : 0;

  // Pick a job from the dropdown — fills the bar, sets a sensible default
  // duration and reveals the price. ("Something else" keeps whatever they typed.)
  const chooseJob = useCallback((j: CustomJob) => {
    setJob(j);
    if (j.key !== 'other') setQuery(j.label);
    setSize(`${Math.min(8, Math.max(1, j.typicalHours))} hours`);
    setOpen(false);
    if (blurTimer.current) window.clearTimeout(blurTimer.current);
  }, []);

  // Hand the picked job to the booking sheet (phone / address / when) as a
  // custom booking — the ONE create-household-payment-checkout flow.
  const goBook = useCallback(() => {
    if (!job) return;
    const label = job.label;
    const note = query.trim() || label;
    const customCat: Category = {
      emoji: job.emoji,
      label,
      slug: 'custom',
      hint: 'A vetted student, matched to your job',
      description: note,
      sizeLabel: 'How long?',
      sizes: DURATIONS,
    };
    openSheet(customCat, { size, note, extraLabel: label });
  }, [job, query, size, openSheet]);

  // One-tap rebook: last booked job from this device
  const usual = useMemo(() => {
    const mem = loadBookingMemory();
    if (!mem?.lastCategory) return null;
    const cat = CATEGORIES.find(c => c.slug === mem.lastCategory);
    if (!cat) return null;
    const memSize = mem.lastSize && cat.sizes?.includes(mem.lastSize) ? mem.lastSize : undefined;
    const cents = getPriceCents(cat.slug, memSize ?? DEFAULT_SIZE[cat.slug] ?? '');
    return { cat, size: memSize, price: cents ? fmt(cents) : null };
  }, []);

  // Support the vano:select-category custom event (e.g. a pricing page deep link).
  useEffect(() => {
    const handle = (e: Event) => {
      const { slug, size: evSize } = (e as CustomEvent<{ slug: string; size?: string }>).detail;
      const cat = CATEGORIES.find(c => c.slug === slug);
      if (cat) openSheet(cat, { size: evSize });
    };
    window.addEventListener('vano:select-category', handle);
    return () => window.removeEventListener('vano:select-category', handle);
  }, [openSheet]);

  return (
    <>
      <div id="category-grid" aria-label="What do you need help with?" className="relative mx-auto w-full max-w-xl scroll-mt-24">
        {/* Big centered search bar — type, pick a job from the dropdown, see the price */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          <div className="flex items-center gap-2.5 rounded-2xl bg-white border border-black/5 shadow-2xl px-4 h-14 sm:h-16 focus-within:ring-2 focus-within:ring-gold/60 transition-shadow">
            <Search className="w-5 h-5 text-muted-foreground/50 flex-shrink-0" aria-hidden="true" />
            <input
              id="custom-job-input"
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setJob(null); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 140); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (suggestions[0]) chooseJob(suggestions[0]); } else if (e.key === 'Escape') { setOpen(false); } }}
              placeholder={`Try "${HINTS[hintIdx]}"…`}
              autoComplete="off"
              aria-label="Search for what you need done"
              className="flex-1 min-w-0 bg-transparent text-base sm:text-lg text-foreground placeholder:text-muted-foreground/45 focus:outline-none"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { if (suggestions[0]) chooseJob(suggestions[0]); }}
              aria-label="Search"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-150 active:scale-90"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Dropdown — matching jobs to pick from */}
          <AnimatePresence>
            {open && !job && suggestions.length > 0 && (
              <motion.ul
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[19rem] overflow-y-auto rounded-2xl border border-black/5 bg-white p-1.5 shadow-2xl text-left"
              >
                {query.trim().length < 2 && (
                  <li className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/35">Popular right now</li>
                )}
                {suggestions.map((s) => {
                  const isOther = s.key === 'other';
                  const from = getPriceCents('custom', `${Math.min(8, Math.max(1, s.typicalHours))} hours`);
                  return (
                    <li key={s.key}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => chooseJob(s)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-secondary/70 transition-colors"
                      >
                        <span className="text-lg leading-none flex-shrink-0" aria-hidden="true">{s.emoji}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-foreground truncate">
                            {isOther ? `Book “${query.trim() || 'something else'}”` : s.label}
                          </span>
                          <span className="block text-[11px] text-muted-foreground truncate">
                            {isOther ? 'Tell us exactly what you need' : s.group}
                          </span>
                        </span>
                        {!isOther && from != null && (
                          <span className="flex-shrink-0 text-xs font-bold text-foreground/70 tabular-nums">from {fmt(from)}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </motion.ul>
            )}
          </AnimatePresence>

          {/* Picked a job → VANO-vs-market price, the time above (like the custom box) */}
          <AnimatePresence initial={false}>
            {job && (
              <motion.div
                key="price"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="mt-3 rounded-2xl border border-black/5 bg-white p-4 shadow-2xl text-left"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="flex items-center gap-2 text-sm font-bold text-foreground min-w-0">
                    <span className="text-lg" aria-hidden="true">{job.emoji}</span>
                    <span className="truncate">{job.label}</span>
                  </span>
                  <select
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    aria-label="How long"
                    className="flex-shrink-0 rounded-lg border border-border bg-white text-xs font-semibold px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  >
                    {DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="flex items-stretch gap-2">
                  <div className="flex-1 rounded-xl border border-sage/40 bg-sage-light/40 px-3 py-2.5 text-center">
                    <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-sage-dark">VANO · fair</p>
                    <motion.p key={vanoCents} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }} className="mt-0.5 text-3xl font-extrabold tabular-nums text-foreground leading-none">
                      {fmt(vanoCents)}
                    </motion.p>
                    <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">€18/hr × {hours} hr</p>
                  </div>
                  <div className="flex-1 rounded-xl border border-border/60 px-3 py-2.5 text-center">
                    <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Typical rate</p>
                    <p className="mt-0.5 text-3xl font-bold tabular-nums text-muted-foreground/60 leading-none line-through decoration-muted-foreground/40">
                      {fmt(marketCents)}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">≈ €{job.marketHourlyCents / 100}/hr</p>
                  </div>
                </div>
                {saveCents > 0 && (
                  <p className="mt-2.5 text-center text-[12px] font-bold text-sage-dark">
                    ✨ You save {fmt(saveCents)} — {savePct}% under the going rate
                  </p>
                )}
                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} className="mt-3">
                  <Button type="button" onClick={goBook} className="w-full rounded-full gap-2 font-semibold text-base h-[52px] tabular-nums bg-primary hover:bg-primary shadow-primary-glow">
                    <Zap className="w-4 h-4" />
                    Book · {fmt(vanoCents)}
                  </Button>
                </motion.div>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">No payment until a helper accepts · money-back guarantee</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* One-tap rebook — remembers the last job booked on this device */}
        {usual && (
          <button
            onClick={() => openSheet(usual.cat, { size: usual.size })}
            className="mt-3 w-full rounded-2xl bg-white/10 border border-white/15 px-4 py-3 flex items-center gap-3 text-left backdrop-blur-sm hover:bg-white/15 active:scale-[0.98] transition-[background-color,transform] duration-150"
          >
            <span className="text-xl leading-none flex-shrink-0" aria-hidden="true">{usual.cat.emoji}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-white leading-snug">
                Book your usual{usual.price ? ` — ${usual.price}` : ''}
              </span>
              <span className="block text-xs text-white/55 mt-0.5 truncate">
                {usual.cat.label}{usual.size ? ` · ${usual.size}` : ''} · details already filled in
              </span>
            </span>
            <span className="text-gold text-lg font-bold leading-none flex-shrink-0" aria-hidden="true">↻</span>
          </button>
        )}

        {/* WhatsApp fallback — one quiet line on the dark hero */}
        <button
          onClick={() => window.open(`${teamWhatsAppHref}?text=${encodeURIComponent('Hi VANO! I need help with something — ')}`, '_blank', 'noopener,noreferrer')}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 text-[13px] text-white/55 hover:text-white/85 transition-colors duration-150"
        >
          <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" aria-hidden="true" />
          Prefer to chat?<span className="font-semibold text-white/85 underline underline-offset-2">WhatsApp us</span>
        </button>
      </div>

      {/* Bottom sheet portal-style — rendered outside the grid */}
      <AnimatePresence>
        {selected && (
          <Sheet
            cat={selected.cat}
            initialSize={selected.size}
            note={selected.note}
            extraLabel={selected.extraLabel}
            onClose={closeSheet}
          />
        )}
      </AnimatePresence>
    </>
  );
};
