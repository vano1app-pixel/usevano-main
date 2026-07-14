import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useDragControls, type Variants } from 'framer-motion';
import { haptic } from '@/lib/haptics';
import { MessageCircle, Loader2, X, Zap, ShieldCheck, Check, ArrowLeft, Clock, Phone, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SUPPORTED_CITIES } from '@/lib/cities';
import { supabase } from '@/integrations/supabase/client';
import { teamWhatsAppHref } from '@/lib/contact';
import { AddressPicker } from '@/components/household/AddressPicker';
import { loadBookingMemory, saveBookingMemory, clearBookingMemory } from '@/lib/bookingMemory';
import { getReferralCode } from '@/lib/referral';
import { deriveArea } from '@/lib/areaFromAddress';
import { getHouseholdPriceCents, computeVanoFeeCents, VANO_COVER_CENTS } from '@/lib/householdPricing';
import { searchCustomJobs, isShortVisit, customJobByKey, type CustomJob } from '@/lib/customJobs';
import { isValidPhone, normalizePhoneE164 } from '@/lib/validation';
import { track } from '@/lib/track';

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
    // Renamed "Dog walk" → "Pets" (July 2026): the sub-service step underneath
    // exposes the vetted pet jobs (wash & brush, sitting/feeding, puppy visits,
    // small pets & hens). The slug stays 'dog-walk' — walks book this category
    // at its flat prices; the other pet jobs book as 'custom' at €18/hr.
    emoji: '🐾', label: 'Pets',  slug: 'dog-walk',
    hint: 'Walks, washes, sitting & feeding',
    description: 'Dog walks (collected & returned safely), washes, and pet sitting visits.',
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
  // In-home Tutoring tile removed — one-to-one teaching of minors needs Garda
  // vetting. Tutoring is now online/adults-only and lives in the custom job
  // catalogue (src/lib/customJobs.ts), not as a quick-book tile.
];

// The front door is TAP-ONLY (July 2026): the first real bookings came through
// the tap tiles + WhatsApp, and the search bar brought none — so the search
// bar is GONE. The 6 tiles open the booking sheet, whose first wizard page is
// a sub-service picker ("What kind of cleaning?") sourced EXCLUSIVELY from the
// legally-vetted custom-jobs catalogue (src/lib/customJobs.ts — trades,
// heights, Garda-vetting work, driving and clipper-grooming are already
// excluded there, so the wizard can never offer a job Vano can't stand over).
// The "Anything else ✨" tile opens the same sheet on a describe-it page —
// popular jobs tappable, typing only for the long tail. Every step is tracked
// (hero_tile_tap / hero_sub_pick / hero_search_open / hero_usual_tap).
// Custom picks still price through the canonical €18/hr rate.

// How long the job takes — drives the hourly price for custom sub-services.
const DURATIONS = ['1 hour', '2 hours', '3 hours', '4 hours', '5 hours', '6 hours', '7 hours', '8 hours'];
// Short visit jobs (dog walk, bins, key-drop…) can be booked sub-hour, from €12.
const SHORT_DURATIONS = ['30 min', '45 min', '1 hour', '2 hours'];

// The "Anything else" tile's entry — opens the sheet on the describe-it page.
const CUSTOM_TILE: Category = {
  emoji: '✨', label: 'Anything else', slug: 'custom',
  hint: 'An ID-verified student, matched to your job',
  description: '',
};

// ─── Sub-services (wizard page 1) ─────────────────────────────────────────
// Each tile's "What kind of …?" options. kind:'core' books the tile's own
// category (flat/dog-walk/cleaning prices + its dispatch pool); kind:'custom'
// books the named catalogue job as a 'custom' booking (€18/hr, dispatches to
// all approved helpers) with the job label riding through note + extra_label —
// that's the "better info" win: dispatch texts and the helper's job screen
// show exactly what was asked for. jobKeys MUST exist in customJobs.ts — the
// catalogue is the single source of labels/emoji/hours AND the legal screen.
type SubService =
  | { kind: 'core'; label: string; emoji: string; size?: string }
  | { kind: 'custom'; jobKey: string };

const SUB_SERVICES: Record<string, { featured: SubService[]; more: SubService[] }> = {
  cleaning: {
    featured: [
      { kind: 'core', label: 'Standard clean', emoji: '🧹' },
      { kind: 'custom', jobKey: 'deepclean' },
      { kind: 'custom', jobKey: 'oven' },
      { kind: 'custom', jobKey: 'windows' },
      { kind: 'custom', jobKey: 'tenancy' },
      { kind: 'custom', jobKey: 'afterbuild' },
    ],
    more: [
      { kind: 'custom', jobKey: 'carpetclean' },
      { kind: 'custom', jobKey: 'bathroomclean' },
      { kind: 'custom', jobKey: 'fridgeclean' },
      { kind: 'custom', jobKey: 'mould' },
      { kind: 'custom', jobKey: 'airbnb' },
      { kind: 'custom', jobKey: 'garageclean' },
      { kind: 'custom', jobKey: 'atticclear' },
      { kind: 'custom', jobKey: 'binclean' },
      { kind: 'custom', jobKey: 'conservatory' },
      { kind: 'custom', jobKey: 'officeclean' },
    ],
  },
  garden: {
    featured: [
      { kind: 'core', label: 'General garden tidy', emoji: '🌿' },
      { kind: 'custom', jobKey: 'mowing' },
      { kind: 'custom', jobKey: 'weeding' },
      { kind: 'custom', jobKey: 'hedge' },
      { kind: 'custom', jobKey: 'powerwash' },
      { kind: 'custom', jobKey: 'clearance' },
    ],
    more: [
      { kind: 'custom', jobKey: 'planting' },
      { kind: 'custom', jobKey: 'leafclear' },
      { kind: 'custom', jobKey: 'turfing' },
      { kind: 'custom', jobKey: 'fencepaint' },
      { kind: 'custom', jobKey: 'watering' },
      { kind: 'custom', jobKey: 'snow' },
      { kind: 'custom', jobKey: 'raisedbed' },
      { kind: 'custom', jobKey: 'pondclean' },
      { kind: 'custom', jobKey: 'greenhouse' },
      { kind: 'custom', jobKey: 'compost' },
      { kind: 'custom', jobKey: 'bbqclean' },
    ],
  },
  moving: {
    featured: [
      { kind: 'core', label: 'General moving help', emoji: '📦' },
      { kind: 'custom', jobKey: 'furniture' },
      { kind: 'custom', jobKey: 'vanhelp' },
      { kind: 'custom', jobKey: 'tiprun' },
      { kind: 'custom', jobKey: 'packing' },
      { kind: 'custom', jobKey: 'mattress' },
    ],
    more: [
      { kind: 'custom', jobKey: 'housemove' },
      { kind: 'custom', jobKey: 'studentmove' },
      { kind: 'custom', jobKey: 'storage' },
      { kind: 'custom', jobKey: 'officemove' },
      { kind: 'custom', jobKey: 'deliveryhelp' },
      { kind: 'custom', jobKey: 'dismantle' },
      { kind: 'custom', jobKey: 'houseclearance' },
    ],
  },
  'dog-walk': {
    featured: [
      { kind: 'core', label: 'Dog walk · 30 min', emoji: '🐕', size: '30 min' },
      { kind: 'core', label: 'Dog walk · 1 hour', emoji: '🐕', size: '1 hour' },
      { kind: 'custom', jobKey: 'doggroom' },
      { kind: 'custom', jobKey: 'petsit' },
      { kind: 'custom', jobKey: 'puppy' },
    ],
    more: [
      { kind: 'custom', jobKey: 'littertray' },
      { kind: 'custom', jobKey: 'smallpets' },
      { kind: 'custom', jobKey: 'chickens' },
    ],
  },
  shopping: {
    featured: [
      { kind: 'core', label: 'Wash, dry & fold', emoji: '🧺' },
      { kind: 'custom', jobKey: 'ironing' },
      { kind: 'custom', jobKey: 'dryclean' },
    ],
    more: [],
  },
};


// Smart defaults — most common booking for each service
const DEFAULT_SIZE: Record<string, string> = {
  shopping:  '',
  'dog-walk': '30 min',
  garden:    '2 hours',
  moving:    '2 hours',
  cleaning:  '2 hours',
};

// ─── Pricing ──────────────────────────────────────────────────────────────

// Delegates to the shared price source so the sheet, the cards and the
// marketing table never disagree — see src/lib/householdPricing.ts.
const getPriceCents = getHouseholdPriceCents;

function fmt(cents: number): string {
  const eur = cents / 100;
  // Fee amounts aren't always whole euros — show cents only then
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

// Book-ahead slots — scheduled dispatch at the same price (the old 10%
// scheduled discount retired with direct-pay; discounts now only ever touch
// Vano's booking fee). Labels are stored verbatim as scheduled_date.
const TOMORROW_SLOTS = ['Tomorrow 9am', 'Tomorrow 12pm', 'Tomorrow 3pm', 'Tomorrow 6pm'];

/**
 * Turn a chosen "when" slot into a real local timestamp (ISO) for book-ahead.
 * The server stores it so a future job dispatches at a lead window instead of
 * immediately. Returns null for ASAP ("Now"), unparseable, or already-past
 * today slots — null means "as soon as possible", the default behaviour.
 * Slots look like "Now", "1pm", "12:30pm" (today) or "Tomorrow 9am".
 */
function computeScheduledAt(when: string): string | null {
  if (!when || when === 'Now') return null;
  const m = when.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  let hr = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const pm = /pm/i.test(m[3]);
  if (pm && hr < 12) hr += 12;
  if (!pm && hr === 12) hr = 0;
  const d = new Date();
  if (/^tomorrow/i.test(when)) d.setDate(d.getDate() + 1);
  d.setHours(hr, min, 0, 0);
  // A "today" slot that's already passed → treat as ASAP rather than a past time.
  if (d.getTime() < Date.now() - 60_000) return null;
  return d.toISOString();
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────

function buildWhatsAppMsg(cat: Category, when: string, size: string, address?: string): string {
  const lines = [`Hi VANO! I need ${cat.label.toLowerCase()} help.`];
  if (when) lines.push(`When: ${when === 'Now' ? 'ASAP / right now' : when.startsWith('Tomorrow') ? when : `today at ${when}`}`);
  if (size) lines.push(`Duration: ${size}`);
  if (address) lines.push(`Address: ${address}`);
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
  /** Skip the sub-service wizard page — the entry already carries a choice
   *  (usual rebook, podium tile with a size, deep link). */
  direct?:      boolean;
}

const Sheet: React.FC<SheetProps> = ({ cat: entryCat, onClose, initialSize, note: entryNote, extraLabel: entryExtraLabel, direct }) => {
  const navigate   = useNavigate();
  const timeSlots  = useMemo(() => getTimeSlots(), []);
  const remembered = useMemo(() => loadBookingMemory(), []);
  const referralCode = useMemo(() => getReferralCode(), []);

  // ── Wizard page 1 ("What kind of …?" / describe-it) ──────────────────────
  // `active` is the WORKING selection page 2 books: page 1 refines it (a
  // custom sub-service swaps the category to slug 'custom' with the job's
  // label riding through note + extraLabel — the same contract the old search
  // flow used, so the form/checkout below is untouched).
  const subServices = SUB_SERVICES[entryCat.slug];
  const isDescribe = entryCat.slug === 'custom' && !entryExtraLabel;
  const startOnPick = (isDescribe || !!subServices) && !initialSize && !entryExtraLabel && !direct;
  const [step, setStep] = useState<'pick' | 'form'>(startOnPick ? 'pick' : 'form');
  const [active, setActive] = useState<{ cat: Category; note?: string; extraLabel?: string }>(
    { cat: entryCat, note: entryNote, extraLabel: entryExtraLabel },
  );
  const { cat, note, extraLabel } = active;
  const [showMoreSubs, setShowMoreSubs] = useState(false);
  // Describe-it page state — popular jobs when empty, catalogue matches while
  // typing ("Something else" is always appended so free text can always book).
  const [describeQuery, setDescribeQuery] = useState('');
  const describeRows = useMemo<CustomJob[]>(() => {
    if (!isDescribe || step !== 'pick') return [];
    const rows = searchCustomJobs(describeQuery, 8);
    return describeQuery.trim().length >= 2 ? rows : [...rows, customJobByKey('other')];
  }, [isDescribe, step, describeQuery]);

  const [when,     setWhen]    = useState('Now');
  // When + duration collapse to a single "ASAP · change" line by default —
  // most people want it now, so we don't make them wade through time chips.
  const [showWhen, setShowWhen] = useState(false);
  // Area also collapses to a compact line — Galway is the only live area and
  // it's usually auto-detected from the address, so the city chips are tucked
  // behind "Change".
  const [showArea, setShowArea] = useState(false);
  // Returning customers see their remembered phone + address as a read-only
  // summary (a one-tap confirm), not the full form. "Edit" reveals the fields.
  const [editDetails, setEditDetails] = useState(false);
  // Optional Vano Cover add-on — customer-elected at booking, flat €2.
  const [coverOpted, setCoverOpted] = useState(false);
  const [size,     setSize]    = useState(
    // Honour the caller's size even when no size chips are shown (custom jobs
    // already pick the duration on the first page, so the sheet doesn't re-ask).
    (initialSize && (!cat.sizes || cat.sizes.includes(initialSize)) ? initialSize : null)
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
  // True only after the checkout call itself failed (not field validation) —
  // flips the WhatsApp fallback into the primary recovery action.
  const [submitFailed, setSubmitFailed] = useState(false);
  // Field-level flags so a failed submit points at the field to fix, not just
  // a message at the foot of the sheet
  const [phoneError,   setPhoneError]   = useState(false);
  const [addressError, setAddressError] = useState(false);
  // Drag-to-dismiss: only the handle starts the drag, so the body still scrolls
  const dragControls = useDragControls();
  const sheetRef = useRef<HTMLDivElement>(null);
  // Synchronous submit lock — `loading` state only disables the button after a
  // re-render, so a fast double-tap can fire handleBook twice before then. This
  // ref flips instantly, closing that window (server-side dedupe is the backstop).
  const submitLock = useRef(false);

  function forgetMe() {
    clearBookingMemory();
    setPhone(''); setAddress(''); setCoords(null); setCity('Galway'); setCityAuto(false);
    setPrefilled(false);
  }

  // Page 1 → page 2: commit a sub-service and slide to the form. Custom picks
  // mirror the retired search flow's goBook contract exactly — slug 'custom',
  // job label as note + extraLabel, duration defaulted from typicalHours (the
  // singular '1 hour' matters: the server prices by EXACT label lookup) — and
  // pass `sizes` so the form's existing "How long?" chips + live price handle
  // the duration with zero new wiring.
  function applyPick(sub: SubService) {
    haptic(10);
    if (sub.kind === 'core') {
      track('hero_sub_pick', { category: entryCat.slug, sub: sub.label });
      setActive({ cat: entryCat, note: undefined, extraLabel: undefined });
      if (sub.size) setSize(sub.size);
    } else {
      const job = customJobByKey(sub.jobKey);
      track('hero_sub_pick', { category: entryCat.slug, sub: job.key });
      const short = isShortVisit(job.key);
      const h = Math.min(8, Math.max(1, job.typicalHours));
      const typed = describeQuery.trim();
      setActive({
        cat: {
          emoji: job.emoji,
          label: job.label,
          slug: 'custom',
          hint: 'An ID-verified student, matched to your job',
          description: typed || job.label,
          sizeLabel: 'How long?',
          sizes: short ? SHORT_DURATIONS : DURATIONS,
        },
        // The customer's own words beat the catalogue label — they're what the
        // helper needs to read ("better info" is the whole point of the wizard).
        note: typed || job.label,
        extraLabel: job.label,
      });
      setSize(short ? '30 min' : h === 1 ? '1 hour' : `${h} hours`);
    }
    setStep('form');
  }

  // Page-1 presentation bits. Questions are written per category (generic
  // "what kind of pets?" reads wrong) and every row carries its honest price.
  const PICK_TITLES: Record<string, string> = {
    cleaning:   'What kind of clean?',
    garden:     'What needs doing in the garden?',
    moving:     'What are we moving?',
    'dog-walk': 'What does your pet need?',
    shopping:   'What kind of laundry help?',
  };
  const pickTitle = isDescribe ? 'What do you need done?' : (PICK_TITLES[entryCat.slug] ?? `What kind of ${entryCat.label.toLowerCase()}?`);
  const visibleSubs: SubService[] = subServices
    ? [...subServices.featured, ...(showMoreSubs ? subServices.more : [])]
    : [];
  // Row price: core rows use the category's real table (flat €15 laundry,
  // €15/€20 walks, "from €18" hourly); custom rows are the flat truth — €18/hr
  // (short-visit jobs can book 30 min from €12).
  const subPriceLabel = (s: SubService): string => {
    if (s.kind === 'custom') return isShortVisit(s.jobKey) ? 'from €12' : '€18/hr';
    const cents = getPriceCents(entryCat.slug, s.size ?? entryCat.sizes?.[0] ?? '');
    if (!cents) return '€18/hr';
    return s.size || !entryCat.sizes ? fmt(cents) : `from ${fmt(cents)}`;
  };
  const renderSubRow = (key: string, emoji: string, label: string, hint: string | null, price: string, onPick: () => void) => (
    <button
      key={key}
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-white px-3.5 py-3.5 text-left hover:border-sage/60 hover:bg-sage-light/30 active:scale-[0.99] transition-[border-color,background-color,transform] duration-150"
    >
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-secondary/60 text-2xl leading-none" aria-hidden="true">{emoji}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold text-foreground truncate">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground truncate">{hint}</span>}
      </span>
      <span className="text-[13px] font-bold text-sage-dark tabular-nums flex-shrink-0">{price}</span>
      <span className="text-muted-foreground/40 text-lg leading-none flex-shrink-0" aria-hidden="true">›</span>
    </button>
  );

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
    // Tuck the app bottom-nav away while the sheet is up (it lives in a separate
    // stacking context, so it would otherwise poke through over the sheet).
    document.body.classList.add('vano-modal-open');
    return () => {
      document.body.classList.remove('vano-modal-open');
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
  // Direct-pay: the job price is the helper's money (no book-ahead discount —
  // Vano can't discount money it never collects; discounts live on the fee).
  const priceCents = getPriceCents(cat.slug, size);
  const priceLabel = priceCents ? fmt(priceCents) : null;

  // Live field validity — drives the small green ✓ next to each label as it's
  // filled. Quiet reassurance at the highest-friction step (a stranger typing
  // their number + address for in-home help). The phone tick means "we can
  // actually text this number", not just "looks phone-shaped".
  const phoneValid = normalizePhoneE164(phone) !== null;
  const addressValid = !!address.trim();

  // Abandoned-booking rescue: remember the details as they're typed, not only
  // after a successful checkout — someone who hesitates at the last button
  // comes back to a pre-filled sheet, one tap from booking.
  useEffect(() => {
    if (normalizePhoneE164(phone) === null) return;
    const t = setTimeout(() => {
      saveBookingMemory({
        phone: phone.trim().replace(/\s+/g, ''),
        ...(address.trim() ? { address: address.trim() } : {}),
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        city,
      });
    }, 600);
    return () => clearTimeout(t);
  }, [phone, address, coords, city]);

  // Long catalogue labels ("Oven & kitchen clean") overflow the docked button
  // — the job name is already in the header + summary line, so the CTA drops
  // it rather than truncating mid-word.
  const ctaLabel = [
    cat.label.length <= 12 ? `Book ${cat.label}` : 'Book',
    size || null,
    priceLabel,
  ].filter(Boolean).join(' · ');

  function sendWhatsApp() {
    // After a failed submit the typed details ride along, so the WhatsApp
    // thread starts with everything our team needs to book it by hand.
    const withDetails = submitFailed && address.trim() ? address.trim() : undefined;
    const url = `${teamWhatsAppHref}?text=${encodeURIComponent(buildWhatsAppMsg(cat, when, size, withDetails))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (submitLock.current) return; // ignore a double-tap before the re-render
    const phoneClean = phone.trim().replace(/\s+/g, '');
    if (!isValidPhone(phone)) {
      setEditDetails(true); // reveal the fields if the compact summary is showing
      setPhoneError(true);
      setError('Please enter a valid phone number.');
      return;
    }
    if (normalizePhoneE164(phone) === null) {
      // Phone-shaped but not textable (UK 07…, landlines) — every update
      // (pay link, on-my-way, arrival) goes by text, so catch it here with a
      // fix instead of booking someone we can never reach.
      setEditDetails(true);
      setPhoneError(true);
      setError("We can't text that number — Irish mobiles (08…) work as-is; for other countries add the code, e.g. +44 7…");
      return;
    }
    if (!address.trim()) {
      // The red border targets the AddressPicker — which is hidden behind the
      // "returning customer" compact summary. Reveal the fields first so the
      // flagged field the error points at is actually on screen.
      setEditDetails(true);
      setAddressError(true);
      setError('Please add your address so your helper can find you.');
      return;
    }
    submitLock.current = true;
    setLoading(true); setError(null); setSubmitFailed(false);
    haptic(12); // subtle confirm tick on supported phones
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        'create-household-payment-checkout',
        { body: {
          category:         cat.slug,
          when_label:       when,
          size_label:       size,
          scheduled:        isScheduledAhead,
          cover:            coverOpted,
          ...(computeScheduledAt(when) ? { scheduled_at: computeScheduledAt(when) } : {}),
          note:             note ?? '',
          ...(extraLabel ? { extra_label: extraLabel } : {}),
          customer_name:    'Guest', // quick sheet doesn't ask for a name (pay happens later, so Stripe never collects one either)
          customer_phone:   phoneClean,
          customer_email:   null,
          customer_address: address.trim(),
          ...(coords ? { customer_lat: coords.lat, customer_lng: coords.lng } : {}),
          city,
          ...(referralCode ? { referral_code: referralCode } : {}),
        }},
      );
      if (fnErr || !data?.checkout_url) {
        // On a non-2xx the client hides the response body behind
        // error.context and `data` is null — so the old fallback showed the
        // customer "Edge Function returned a non-2xx status code" instead of
        // the server's actual reason. Unwrap it.
        let serverMsg = (data as { error?: string } | null)?.error ?? null;
        const errCtx = (fnErr as { context?: Response } | null)?.context;
        if (!serverMsg && errCtx && typeof errCtx.json === 'function') {
          try { serverMsg = ((await errCtx.json()) as { error?: string } | null)?.error ?? null; }
          catch { /* body unreadable/not JSON — fall through to the generic copy */ }
        }
        throw new Error(serverMsg || 'Something went wrong. Please try again.');
      }
      saveBookingMemory({
        phone:   phoneClean,
        address: address.trim(),
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        city,
        lastCategory: cat.slug,
        lastSize:     size,
      });
      // Same-origin handoff (the /track page) rides the SPA router — instant
      // slide, no white-flash full reload at the peak-momentum moment.
      // Anything external (a real Stripe URL) still hard-navigates.
      const dest = data.checkout_url as string;
      try {
        const u = new URL(dest, window.location.origin);
        if (u.origin === window.location.origin) {
          navigate(u.pathname + u.search);
          return;
        }
      } catch { /* malformed URL — fall through to the hard redirect */ }
      window.location.href = dest;
    } catch (err: unknown) {
      submitLock.current = false; // allow a retry after a failure
      setLoading(false);
      setSubmitFailed(true);
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
        className="fixed inset-x-0 bottom-0 z-[70] bg-cream rounded-t-3xl shadow-2xl safe-area-bottom sm:mx-auto sm:max-w-[460px] sm:bottom-6 sm:rounded-3xl flex flex-col overflow-hidden"
        style={{ maxHeight: '88vh' }}
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

        {/* Scrollable middle — header + fields. The action bar below is docked
            outside this scroll area, Uber-style, so price + Book never leave
            the screen (and stay put while the keyboard is up). */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-2" style={{ overscrollBehavior: 'contain' }}>
          {/* Header — step-aware: page 1 asks the question, page 2 names the
              picked job and (when the wizard ran) offers a way back. */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-start gap-1 min-w-0">
              {startOnPick && step === 'form' && (
                <button
                  type="button"
                  onClick={() => setStep('pick')}
                  aria-label="Back to job types"
                  className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center flex-shrink-0 hover:bg-foreground/8 active:scale-90 transition-[background-color,transform] duration-150"
                >
                  <ArrowLeft className="w-5 h-5 text-foreground/60" />
                </button>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 mb-0.5">
                  <motion.span
                    className="text-2xl leading-none"
                    aria-hidden="true"
                    initial={{ scale: 0, rotate: -25 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 480, damping: 12, delay: 0.18 }}
                  >
                    {step === 'pick' ? entryCat.emoji : cat.emoji}
                  </motion.span>
                  <h2 className="font-display text-xl font-bold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, Plus Jakarta Sans, system-ui, sans-serif' }}>
                    {step === 'pick' ? pickTitle : cat.label}
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground ml-9">
                  {step === 'pick'
                    ? (isDescribe ? 'Tap a popular job, or type your own' : 'Tap one — it takes a second')
                    : cat.hint}
                </p>
                {step === 'form' && note && note.trim() && note.trim() !== cat.label && (
                  <p className="text-xs text-foreground/70 ml-9 mt-1">“{note.trim()}”</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-11 h-11 -mt-1.5 -mr-1.5 rounded-full flex items-center justify-center flex-shrink-0 group/close active:scale-90 transition-transform duration-150"
              aria-label="Close"
            >
              <span className="w-8 h-8 rounded-full bg-foreground/8 flex items-center justify-center group-hover/close:bg-foreground/12 transition-colors">
                <X className="w-4 h-4 text-foreground/60" />
              </span>
            </button>
          </div>

          {/* Trust at the decision moment — one glanceable row, absorbed
              without reading (the Airbnb trick): who's coming, what covers
              you. The details live in /terms + /cover; this is the signal. */}
          {step === 'form' && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl bg-sage-light/60 border border-sage/20 px-4 py-2.5 mb-5">
              {[
                'ID-verified student',
                'Optional €250 cover',
                'Money-back guarantee',
              ].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-sage-dark">
                  <Check className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={3} aria-hidden="true" />
                  {t}
                </span>
              ))}
            </div>
          )}

          {step === 'pick' ? (
            /* ── Wizard page 1: sub-service picker / describe-it ─────────── */
            <motion.div
              key="pick-page"
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              {isDescribe && (
                <input
                  type="text"
                  value={describeQuery}
                  onChange={(e) => setDescribeQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const first = describeRows[0];
                      if (first) applyPick({ kind: 'custom', jobKey: first.key });
                    }
                  }}
                  placeholder='e.g. "paint the fence" or "clean the oven"'
                  autoComplete="off"
                  aria-label="Describe what you need done"
                  className="mb-3 w-full h-12 rounded-2xl border border-border bg-white px-4 text-[15px] text-foreground placeholder:text-foreground/45 focus:outline-none focus:ring-2 focus:ring-ring"
                />
              )}
              <div className="space-y-2" role="list" aria-label={pickTitle}>
                {isDescribe
                  ? describeRows.map((row) =>
                      renderSubRow(
                        row.key,
                        row.emoji,
                        row.label,
                        row.key === 'other' ? 'Tell us exactly what you need' : row.group,
                        isShortVisit(row.key) ? 'from €12' : '€18/hr',
                        () => applyPick({ kind: 'custom', jobKey: row.key }),
                      ))
                  : visibleSubs.map((s) => {
                      const job = s.kind === 'custom' ? customJobByKey(s.jobKey) : null;
                      return renderSubRow(
                        s.kind === 'custom' ? s.jobKey : s.label,
                        job ? job.emoji : (s as { emoji: string }).emoji,
                        job ? job.label : (s as { label: string }).label,
                        s.kind === 'core' && !s.size ? entryCat.hint : null,
                        subPriceLabel(s),
                        () => applyPick(s),
                      );
                    })}
              </div>
              {!isDescribe && !!subServices?.more.length && !showMoreSubs && (
                <button
                  type="button"
                  onClick={() => setShowMoreSubs(true)}
                  className="mt-2.5 w-full h-11 rounded-2xl border border-dashed border-border text-sm font-semibold text-foreground/60 hover:text-foreground hover:border-sage/50 transition-colors"
                >
                  More options ↓
                </button>
              )}
              <p className="text-center text-[13px] text-muted-foreground mt-4 leading-relaxed">
                Fair prices, always — your helper earns above minimum wage on every job.
              </p>
            </motion.div>
          ) : (
          <motion.form
            id="quick-book-form"
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
                  className="text-[11px] font-semibold text-foreground/45 hover:text-foreground/70 underline underline-offset-2 flex-shrink-0 transition-colors px-3 py-3 -mx-3 -my-3"
                >
                  Clear
                </button>
              </motion.div>
            )}

            {/* Returning customer → one-tap confirm: show the remembered phone +
                address as a compact summary instead of the full form. "Edit"
                reveals the fields. New visitors always get the fields. */}
            {prefilled && !editDetails && (
              <motion.div variants={listItem} className="rounded-xl border border-border bg-white px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <p className="flex items-center gap-2 text-sm text-foreground">
                      <Phone className="w-4 h-4 flex-shrink-0 text-foreground/45" aria-hidden="true" />
                      <span className="font-semibold truncate">{phone || 'Add your number'}</span>
                    </p>
                    <p className="flex items-center gap-2 text-sm text-foreground/80">
                      <MapPin className="w-4 h-4 flex-shrink-0 text-foreground/45" aria-hidden="true" />
                      <span className="truncate">{address || 'Add your address'}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditDetails(true)}
                    className="text-[11px] font-semibold text-sage-dark flex-shrink-0 px-3 py-3 -mx-3 -my-3"
                  >
                    Edit
                  </button>
                </div>
              </motion.div>
            )}

            {(!prefilled || editDetails) && (<>
            {/* Phone first — the sheet slides up straight onto this field.
                Time + duration below are pre-picked, so number + address is
                all a new visitor has to type. */}
            <motion.div variants={listItem}>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5 flex items-center gap-1.5">
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
              <p className="text-xs leading-relaxed text-muted-foreground mt-1.5">We'll text you when someone accepts · non-Irish number? Start with your country code (+44…)</p>
            </motion.div>

            {/* Address — Eircode search or current location */}
            <motion.div variants={listItem}>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5 flex items-center gap-1.5">
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
              <p className="text-xs text-muted-foreground mt-1.5">So your helper knows exactly where to go</p>
            </motion.div>
            </>)}

            {/* When + duration — one quiet line by default (ASAP), because that's
                what almost everyone wants. Tap "Change" to reveal the time and
                duration options. Fewer decisions up front = a faster booking. */}
            <motion.div variants={listItem}>
              <button
                type="button"
                onClick={() => setShowWhen(s => !s)}
                aria-expanded={showWhen}
                className="w-full flex items-center justify-between rounded-xl border border-border bg-white px-4 py-3 text-left transition-colors hover:border-foreground/20"
              >
                <span className="flex items-center gap-2 text-sm text-foreground min-w-0">
                  <Clock className="w-4 h-4 flex-shrink-0 text-foreground/50" aria-hidden="true" />
                  <span className="font-semibold">{when === 'Now' ? 'ASAP' : when}</span>
                  {size && <span className="text-muted-foreground truncate">· {size}</span>}
                </span>
                <span className="text-xs font-semibold text-sage-dark flex-shrink-0">{showWhen ? 'Done' : 'Change'}</span>
              </button>

              <AnimatePresence initial={false}>
                {showWhen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">When?</p>
                      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                        {timeSlots.map(opt => (
                          <Chip key={opt} group="when" active={when === opt} accent={opt === 'Now'} onClick={() => setWhen(opt)}>
                            {opt}
                          </Chip>
                        ))}
                      </div>
                      {/* Book ahead — scheduled dispatch, same price (the old
                          10% book-ahead discount retired with direct-pay) */}
                      <p className="text-[11px] font-semibold text-sage-dark mt-2 mb-1.5">Or book ahead</p>
                      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                        {TOMORROW_SLOTS.map(opt => (
                          <Chip key={opt} group="when-ahead" active={when === opt} onClick={() => setWhen(opt)}>
                            {opt}
                          </Chip>
                        ))}
                      </div>

                      {/* How long? — sensible default pre-selected */}
                      {cat.sizes && (
                        <div className="mt-4">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">
                            {cat.sizeLabel ?? 'How long?'}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {cat.sizes.map(opt => (
                              <Chip key={opt} group="size" active={size === opt} onClick={() => setSize(opt)}>
                                {opt}
                              </Chip>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

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
                  className="text-[11px] font-semibold text-foreground/45 hover:text-foreground/70 underline underline-offset-2 flex-shrink-0 transition-colors px-3 py-3 -mx-3 -my-3"
                >
                  Change
                </button>
              </motion.div>
            ) : !showArea ? (
              <motion.div variants={listItem} className="flex items-center justify-between gap-3 rounded-xl bg-foreground/4 border border-foreground/8 px-3.5 py-2.5">
                <p className="text-sm text-foreground/75 min-w-0 truncate">
                  <span aria-hidden="true">📍</span> Area: <span className="font-semibold text-foreground">{city}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setShowArea(true)}
                  className="text-[11px] font-semibold text-foreground/45 hover:text-foreground/70 underline underline-offset-2 flex-shrink-0 transition-colors px-3 py-3 -mx-3 -my-3"
                >
                  Change
                </button>
              </motion.div>
            ) : (
              <motion.div variants={listItem}>
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/40">Your area</p>
                  <button type="button" onClick={() => setShowArea(false)} className="text-[11px] font-semibold text-sage-dark px-3 py-3 -mx-3 -my-3">Done</button>
                </div>
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

            {/* Price summary + CTA. Direct-pay: the job money goes to the
                helper directly (they keep 100%); Vano's card charge at accept
                is only the booking fee + the optional €2 Cover. */}
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
                  <p className="flex items-center justify-between text-[11px] mt-1">
                    <span className="text-muted-foreground">Paid to your helper directly — they keep 100%</span>
                  </p>
                  <p className="flex items-center justify-between text-[11px] mt-1 border-t border-foreground/8 pt-1.5">
                    <span className="text-muted-foreground">VANO booking fee (card, when a helper accepts)</span>
                    <span className="font-semibold text-foreground tabular-nums">{fmt(computeVanoFeeCents(priceCents))}</span>
                  </p>
                </div>
              )}

              {/* Optional Vano Cover — customer-elected, flat €2 */}
              <label className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-white px-3.5 py-3 cursor-pointer hover:border-sage/50 transition-colors">
                <input
                  type="checkbox"
                  checked={coverOpted}
                  onChange={(e) => setCoverOpted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-[#4a7c59]"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-foreground">
                    Add Vano Cover · {fmt(VANO_COVER_CENTS)}
                  </span>
                  <span className="block text-xs text-muted-foreground leading-relaxed">
                    Accidental damage covered up to €250 —{' '}
                    <a href="/cover" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" onClick={(e) => e.stopPropagation()}>how it works</a>
                  </span>
                </span>
              </label>

              {referralCode && (
                <p className="flex items-center justify-center gap-1.5 text-xs text-sage-dark font-medium">
                  <span aria-hidden="true">🎁</span>
                  Your friend's €5 comes off your booking fee
                </p>
              )}

              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                A nearby helper usually replies in minutes
              </p>

              {/* Quiet WhatsApp alternative — the loud green recovery version
                  lives in the docked bar and only appears after a failed submit. */}
              {!submitFailed && (
                <motion.div whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={sendWhatsApp}
                    className="w-full rounded-full gap-2 h-10 font-medium text-sm border-[#25D366]/40 text-[#25D366] hover:bg-[#25D366]/6"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Or book via WhatsApp
                  </Button>
                </motion.div>
              )}
            </motion.div>

            <motion.p variants={listItem} className="text-center text-[13px] leading-relaxed text-muted-foreground">
              No payment now — a small VANO booking fee confirms it when a helper accepts, and you pay your helper directly (Revolut or cash) once the job's done. Money-back guarantee on the fee
            </motion.p>
            {/* Contract moment: the Terms (incl. "your helper is an independent
                provider, VANO is the platform") must be incorporated at the
                point of sale, not just linked in the footer. */}
            <motion.p variants={listItem} className="text-center text-xs leading-relaxed text-muted-foreground">
              By booking you agree to VANO's{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">Terms</a>
              {' '}— your helper is an independent provider you pay directly, and{' '}
              <a href="/cover" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">Vano Cover</a>
              {' '}is there if you add it.
            </motion.p>
          </motion.form>
          )}
        </div>

        {/* Docked action bar — Uber-style: risk-reversal + Book never scroll
            away, always thumb-reachable, and stay on screen while the keyboard
            is up. The button submits the form above via its form= attribute.
            Hidden on wizard page 1 — there's nothing to book yet. */}
        {step === 'form' && (
        <div className="flex-shrink-0 border-t border-border/50 bg-cream px-5 pt-3 pb-4 space-y-2 shadow-[0_-12px_28px_-18px_rgba(0,0,0,0.22)]">
          {/* Risk-reversal at the decision point — the single most reassuring
              fact (you don't pay until a helper accepts) rides with the CTA. */}
          <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-sage-dark">
            <ShieldCheck className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            No payment until a helper accepts · money-back guarantee
          </p>

          <motion.div
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={cn(
              'relative overflow-hidden rounded-full transition-shadow duration-300',
              // The glow only lights up once the form is genuinely ready to
              // submit (valid phone + an address), so it's a truthful "ready"
              // cue rather than lighting up on the first digit.
              phoneValid && addressValid && !loading ? 'shadow-primary-glow' : '',
            )}
          >
            <Button
              type="submit"
              form="quick-book-form"
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
            {/* Occasional light sweep so the primary action feels alive —
                only once the form is actually ready to submit */}
            {!loading && phoneValid && addressValid && (
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

          {/* A failed checkout call must never be a dead end — flip the
              WhatsApp fallback into the primary recovery action, right here in
              the docked bar, with the typed details riding along. */}
          {submitFailed && (
            <>
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                Our team can book it for you on WhatsApp in a couple of minutes — your details are ready to send.
              </p>
              <motion.div whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                <Button
                  type="button"
                  onClick={sendWhatsApp}
                  className="w-full rounded-full gap-2 h-12 font-semibold text-base bg-[#25D366] text-white hover:bg-[#1fb457]"
                >
                  <MessageCircle className="w-4 h-4" />
                  Book via WhatsApp instead
                </Button>
              </motion.div>
            </>
          )}
        </div>
        )}
      </motion.div>
    </>
  );
};

// ─── Front door: tap tiles only ──────────────────────────────────────────────
// The search bar, its dropdown, the floating price card and the mobile
// full-screen takeover were REMOVED (July 2026) — zero bookings came through
// them. Six tiles open the booking sheet; its wizard page 1 asks "what kind?"
// (or describe-it for the Anything-else tile), page 2 is the form.

type Selection = { cat: Category; size?: string; note?: string; extraLabel?: string; direct?: boolean };

export const CategoryGrid: React.FC = () => {
  const [selected, setSelected] = useState<Selection | null>(null);

  const openSheet = useCallback(
    (cat: Category, opts?: { size?: string; note?: string; extraLabel?: string; direct?: boolean }) =>
      setSelected({ cat, size: opts?.size, note: opts?.note, extraLabel: opts?.extraLabel, direct: opts?.direct }),
    [],
  );
  const closeSheet = useCallback(() => setSelected(null), []);

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

  // Support the vano:select-category custom event (PopularCategories podium,
  // pricing-page deep links). An event that carries a size already made its
  // choice — skip the wizard question; a bare slug gets page 1 like a tile tap.
  useEffect(() => {
    const handle = (e: Event) => {
      const { slug, size: evSize } = (e as CustomEvent<{ slug: string; size?: string }>).detail;
      const cat = CATEGORIES.find(c => c.slug === slug);
      if (cat) openSheet(cat, { size: evSize, direct: !!evSize });
    };
    window.addEventListener('vano:select-category', handle);
    return () => window.removeEventListener('vano:select-category', handle);
  }, [openSheet]);

  return (
    <>
      <div id="category-grid" aria-label="What do you need help with?" className="relative mx-auto w-full max-w-xl scroll-mt-24">
        {/* ── The tap tiles — the one front door ──────────────────────────────
            One tap opens the booking sheet: page 1 "what kind?" (sub-services
            from the vetted catalogue), page 2 phone/address/when → book. */}
        {usual && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { haptic(10); track('hero_usual_tap', { category: usual.cat.slug }); openSheet(usual.cat, { size: usual.size, direct: true }); }}
            className="tile-float mb-2.5 flex w-full items-center gap-3 rounded-2xl border border-gold/50 bg-white px-4 py-3 text-left ring-1 ring-gold/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <span className="text-2xl leading-none flex-shrink-0" aria-hidden="true">{usual.cat.emoji}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-foreground truncate">
                Book your usual{usual.price ? ` · ${usual.price}` : ''}
              </span>
              <span className="block text-[11px] text-muted-foreground truncate">
                {usual.cat.label}{usual.size ? ` · ${usual.size}` : ''} · details saved — one tap
              </span>
            </span>
            <span className="text-gold text-lg font-bold leading-none flex-shrink-0" aria-hidden="true">↻</span>
          </motion.button>
        )}
        <motion.div
          role="group"
          aria-label="Book a service in one tap"
          className="grid grid-cols-3 gap-2 sm:gap-3"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } } }}
        >
          {CATEGORIES.map((c) => {
            const fromCents = getPriceCents(c.slug, c.sizes?.[0] ?? DEFAULT_SIZE[c.slug] ?? '');
            return (
              <motion.button
                key={c.slug}
                type="button"
                variants={{ hidden: { opacity: 0, y: 12, scale: 0.95 }, show: { opacity: 1, y: 0, scale: 1 } }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                onClick={() => { haptic(10); track('hero_tile_tap', { category: c.slug }); openSheet(c); }}
                aria-label={`Book ${c.label}${fromCents ? ` — from ${fmt(fromCents)}` : ''}`}
                className="tile-float relative flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-black/5 bg-white px-1.5 py-4 sm:py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                {/* Cleaning wears the same "Most booked" crown as the podium */}
                {c.slug === 'cleaning' && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-gold px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-navy whitespace-nowrap shadow-sm">
                    Most booked
                  </span>
                )}
                <span className="text-3xl sm:text-4xl leading-none select-none" aria-hidden="true">{c.emoji}</span>
                <span className="mt-1.5 text-[13px] sm:text-base font-bold text-foreground leading-tight">{c.label}</span>
                {fromCents != null && (
                  <span className="text-[11px] sm:text-[13px] font-semibold text-sage-dark tabular-nums leading-none">from {fmt(fromCents)}</span>
                )}
                <span className="hidden sm:block text-[11px] text-muted-foreground leading-tight text-center mt-0.5 px-1">{c.hint}</span>
              </motion.button>
            );
          })}
          {/* The 6th tile — glassy on the navy, the door for the ~100-job
              vetted catalogue: opens the sheet on its describe-it page. */}
          <motion.button
            type="button"
            variants={{ hidden: { opacity: 0, y: 12, scale: 0.95 }, show: { opacity: 1, y: 0, scale: 1 } }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            onClick={() => { haptic(10); track('hero_search_open'); openSheet(CUSTOM_TILE); }}
            aria-label="Anything else — describe any job"
            className="relative flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-white/20 bg-white/[0.08] px-1.5 py-4 sm:py-5 backdrop-blur-sm shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <span className="text-3xl sm:text-4xl leading-none select-none" aria-hidden="true">✨</span>
            <span className="mt-1.5 text-[13px] sm:text-base font-bold text-white leading-tight">Anything else</span>
            <span className="text-[11px] sm:text-[13px] font-medium text-white/70 leading-none">just ask</span>
            <span className="hidden sm:block text-[11px] text-white/55 leading-tight text-center mt-0.5 px-1">Flat-pack, painting, tech, errands…</span>
          </motion.button>
        </motion.div>
      </div>

      {/* Bottom sheet — a REAL portal to <body>. Rendered in place it sits in
          the hero's transform stacking context, where its z-70 can't beat the
          fixed nav (z-50). */}
      {typeof document !== 'undefined' && createPortal(<AnimatePresence>
        {selected && (
          <Sheet
            cat={selected.cat}
            initialSize={selected.size}
            note={selected.note}
            extraLabel={selected.extraLabel}
            direct={selected.direct}
            onClose={closeSheet}
          />
        )}
      </AnimatePresence>, document.body)}
    </>
  );
};
