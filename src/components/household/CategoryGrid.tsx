import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useDragControls, useReducedMotion, type Variants } from 'framer-motion';
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
import { getHouseholdPriceCents, computeVanoFeeCents, VANO_COVER_CENTS, SUPPLIES_ADDON_CENTS, travelTopupCents, CARD_PAY_OFFERED, HOURLY_RATE_CENTS } from '@/lib/householdPricing';
import { COOLING_OFF_DAYS, IMMEDIATE_PERFORMANCE_CONSENT_TEXT } from '@/lib/legalEntity';
import { searchCustomJobs, isShortVisit, customJobByKey, type CustomJob } from '@/lib/customJobs';
import { BUILDER_TASKS, SIZING_QUESTIONS, EQUIPMENT_QUESTIONS, builderMinutes, builderSizeLabel, builderMarketCents, builderNote, builderShortLabel, minutesLabel, minutesText, taskMinutes, hoursFromSizeLabel, bookedMinutes, durationText, type SizingOption, type EquipmentOption } from '@/lib/jobBuilder';
import { KIT_HIRE_CENTS, kitHireCents, kitLabel } from '@/lib/kit';
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
  // Array order IS the tile order. Cleaning leads top-left (owner call
  // 2026-07-24: the most-booked service takes the strongest slot — eyes land
  // top-left first); Laundry takes cleaning's old bottom-right spot.
  {
    emoji: '🧹', label: 'Cleaning',  slug: 'cleaning',
    hint: 'Kitchen, bathroom, floors & surfaces',
    description: 'Hoovering, mopping, surfaces, kitchen and bathroom.',
    popular: true,
    // Cap raised 3h → 5h → 6h (2026-07-27, the suitable-money rule): a 4+
    // bed home with everything ticked INCLUDING the extra-messy condition
    // tick estimates 5.4h — the cap must sit above the biggest honest
    // estimate or the student gets booked for less time than the listed
    // work. jobBuilder.test's suitable-money invariant enforces exactly
    // that for every tick × size combination.
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', '3 hours', '4 hours', '5 hours', '6 hours'],
  },
  {
    // BUSINESS temp staff (owner test, 2026-07-23): flyers, sampling, events,
    // busking for pubs, shop cover — the demand probe for shops & brands.
    // Renders as the NAVY 6th tile (it took the "Anything else" slot on
    // 2026-07-23 — see the grid render; the describe-it door is parked).
    // Premium €22/hr, 2-hour minimum shift; dispatches to ALL id_verified
    // helpers like 'custom' (it's not a join-form skill).
    emoji: '💼', label: 'Business', slug: 'business',
    hint: 'Flyers, samples, events, music & shop cover',
    description: 'Temp staff for your business — flyer runs, sampling, event help, busking & live music, shop-floor cover. ID-verified students, same day.',
    sizeLabel: 'How long?', sizes: ['2 hours', '3 hours', '4 hours', '5 hours', '6 hours', '7 hours', '8 hours'],
  },
  {
    // Renamed "Dog walk" → "Pets" (July 2026): the sub-service step underneath
    // exposes the vetted pet jobs (wash & brush, sitting/feeding, puppy visits,
    // small pets & hens). The slug stays 'dog-walk' — walks book this category
    // at its flat prices; the other pet jobs book as 'custom' at €22/hr.
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
    // Laundry: the helper collects, washes/dries/folds and returns it.
    // Priced per BAG since 2026-07-24 (€30/€50/€65 for 1/2/3 — the task is
    // the unit, the machine does the hours); a missing size prices as the
    // 1-bag €30 everywhere. Slug stays 'shopping' so existing bookings,
    // pricing and the DB category all keep working; only the customer-facing
    // wording changed.
    emoji: '🧺', label: 'Laundry', slug: 'shopping',
    hint: 'Collected, washed & returned folded',
    description: 'Your helper collects your laundry, washes, dries and folds it, and brings it back to your door — fresh and sorted.',
    sizeLabel: 'How much laundry?', sizes: ['1 bag', '2 bags', '3 bags'],
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
// Custom picks still price through the canonical €22/hr rate.

// How long the job takes — drives the hourly price for custom sub-services.
const DURATIONS = ['1 hour', '2 hours', '3 hours', '4 hours', '5 hours', '6 hours', '7 hours', '8 hours'];
// Short visit jobs (dog walk, bins, key-drop…) can be booked sub-hour, from €14.
const SHORT_DURATIONS = ['30 min', '45 min', '1 hour', '2 hours'];

// The "Anything else" tile's entry — opened the sheet on the describe-it
// page. PARKED 2026-07-23 (owner call: the Business tile took the navy 6th
// slot). The describe-it machinery below (isDescribe, describeRows) stays
// intact — remount by rendering a tile that calls openSheet(CUSTOM_TILE).
const CUSTOM_TILE: Category = {
  emoji: '✨', label: 'Anything else', slug: 'custom',
  hint: 'An ID-verified student, matched to your job',
  description: '',
};

// ─── Sub-services (wizard page 1) ─────────────────────────────────────────
// Each tile's "What kind of …?" options. kind:'core' books the tile's own
// category (flat/dog-walk/cleaning prices + its dispatch pool); kind:'custom'
// books the named catalogue job as a 'custom' booking (€22/hr, dispatches to
// all approved helpers) with the job label riding through note + extra_label —
// that's the "better info" win: dispatch texts and the helper's job screen
// show exactly what was asked for. jobKeys MUST exist in customJobs.ts — the
// catalogue is the single source of labels/emoji/hours AND the legal screen.
type SubService =
  // carry: the picked label rides into note + extra_label so dispatch texts
  // and the helper's job screen say the REAL job ("Flyer & leaflet runs"),
  // not just the category. Only business subs set it — household core rows
  // ("Standard clean") add nothing a helper needs.
  | { kind: 'core'; label: string; emoji: string; size?: string; carry?: boolean }
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
      // 'dryclean' was here until 2026-07-30 — see customJobs.ts for why it
      // came out (two visits sold as one, and nobody to pay the cleaner).
    ],
    more: [],
  },
  business: {
    // The job list is deliberately WIDE (owner call: businesses should scroll
    // and recognise their own need). All core+carry → every row books the
    // 'business' category at €22/hr and the picked label rides to dispatch.
    // Kept clear of licensed work: no door SECURITY (PSA licence), no
    // driving, no trades — greeting/queueing, performing, stock and promo
    // are all fine for a student.
    featured: [
      { kind: 'core', label: 'Flyer & leaflet runs', emoji: '📄', carry: true },
      { kind: 'core', label: 'Sampling & promo staff', emoji: '🥤', carry: true },
      { kind: 'core', label: 'Busking & live music for pubs', emoji: '🎸', carry: true },
      { kind: 'core', label: 'Event setup & staffing', emoji: '🎪', carry: true },
      { kind: 'core', label: 'Shop floor & stockroom cover', emoji: '🛍️', carry: true },
      { kind: 'core', label: 'Poster & window display runs', emoji: '📍', carry: true },
    ],
    more: [
      { kind: 'core', label: 'Greeters & queue helpers', emoji: '👋', carry: true },
      { kind: 'core', label: 'Market stall help', emoji: '🏪', carry: true },
      { kind: 'core', label: 'Leaflet drops door-to-door', emoji: '📬', carry: true },
      { kind: 'core', label: 'Mascot & costume promo', emoji: '🎭', carry: true },
      { kind: 'core', label: 'Sign holding & street promo', emoji: '🪧', carry: true },
      { kind: 'core', label: 'Glass collection & kitchen porter', emoji: '🍽️', carry: true },
      { kind: 'core', label: 'Stocktake & inventory count', emoji: '📋', carry: true },
      { kind: 'core', label: 'Social media content day', emoji: '📱', carry: true },
      { kind: 'core', label: 'Data entry & admin day', emoji: '💻', carry: true },
      { kind: 'core', label: 'Something else for my business', emoji: '💼', carry: true },
    ],
  },
};


// Smart defaults — most common booking for each service
const DEFAULT_SIZE: Record<string, string> = {
  shopping:  '1 bag',
  'dog-walk': '30 min',
  garden:    '2 hours',
  moving:    '2 hours',
  cleaning:  '2 hours',
  business:  '4 hours', // typical flyer/sampling shift is a half day
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
  if (size) lines.push(`Duration: ${durationText(size)}`);
  if (address) lines.push(`Address: ${address}`);
  lines.push('Can you let me know who is available?');
  return lines.join('\n');
}

// ─── Motion presets ─────────────────────────────────────────────────────────

// Spring for the sliding selection pill — quick, lively, settles fast.
const PILL_SPRING = { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 } as const;

// The one easing for the sheet — a strong ease-out, so every move starts
// instantly and settles gently. Nothing lurches, nothing pops.
const SHEET_EASE = [0.16, 1, 0.3, 1] as const;

// Wizard pages hand off like iOS navigation: the leaving page slips out the
// way it came, the arriving one slides in from the direction of travel.
// `custom` is the direction: +1 forward, -1 back, 0 = the sheet's first paint
// (pure fade — the sheet itself is already sliding up, one motion is enough).
const pageHidden = (dir: number) => ({ opacity: 0, x: dir === 0 ? 0 : dir * 26 });
const pageExit   = (dir: number) => ({
  opacity: 0,
  x: dir * -20,
  transition: { duration: 0.15, ease: 'easeOut' as const },
});
const pickPage: Variants = {
  hidden: pageHidden,
  show:   { opacity: 1, x: 0, transition: { duration: 0.3, ease: SHEET_EASE } },
  exit:   pageExit,
};
// The form page also orchestrates its children: fields cascade in one-by-one
// as the page lands.
const formPage: Variants = {
  hidden: pageHidden,
  show:   {
    opacity: 1, x: 0,
    transition: { duration: 0.3, ease: SHEET_EASE, staggerChildren: 0.05, delayChildren: 0.08 },
  },
  exit:   pageExit,
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

// ─── Animated price ──────────────────────────────────────────────────────────

/** Rolling money: when the amount changes it counts to the new value with a
 *  small settle pop, so a duration bump or the €2 Cover visibly BUILDS the
 *  price instead of teleporting it. Interruptible — a change mid-roll starts
 *  from wherever the roll got to. Reduced motion snaps straight to the target.
 *  Screen readers only ever hear the final amount (the rolling digits are
 *  aria-hidden); pass `announce` on at most one instance per card. */
const AnimatedPrice: React.FC<{ cents: number; className?: string; announce?: boolean }> = ({ cents, className, announce }) => {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(cents);
  const displayRef = useRef(cents);
  useEffect(() => {
    const from = displayRef.current;
    if (from === cents) return;
    if (reduceMotion) { displayRef.current = cents; setDisplay(cents); return; }
    const t0 = performance.now();
    const DUR = 520;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
    let raf = requestAnimationFrame(function tick(now: number) {
      const p = Math.min(1, (now - t0) / DUR);
      const v = Math.round(from + (cents - from) * easeOut(p));
      displayRef.current = v;
      setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [cents, reduceMotion]);
  return (
    <span className={cn('tabular-nums', className)}>
      <motion.span
        key={cents}
        initial={reduceMotion ? false : { scale: 0.85 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 460, damping: 21 }}
        className="inline-block origin-right"
        aria-hidden="true"
      >
        {fmt(display)}
      </motion.span>
      <span className="sr-only" aria-live={announce ? 'polite' : 'off'}>{fmt(cents)}</span>
    </span>
  );
};

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
  // Tick-box job builder (owner pick 2026-07-24): the hourly categories'
  // page 1 is tick-the-tasks instead of pick-one-row. Ticks sum to minutes,
  // minutes round UP to an existing size label — checkout still only ever
  // sees category + size, so the server prices exactly as before.
  const builderTasks = BUILDER_TASKS[entryCat.slug];
  const startOnPick = (isDescribe || !!subServices || !!builderTasks) && !initialSize && !entryExtraLabel && !direct;
  const [step, setStep] = useState<'pick' | 'form'>(startOnPick ? 'pick' : 'form');
  const [ticked, setTicked] = useState<string[]>([]);
  // The one-tap sizing question (2026-07-27, owner ask: "after they choose
  // the category it asks a small question — how big is the garden, how big
  // is the place, what type of dog — so the price is fairest for both
  // sides"). Builder categories ask it FIRST (the answer's factor scales the
  // tick estimates); Pets/Laundry ask it right after the core sub-pick.
  // Rebooks + deep links with a size (`direct`/`initialSize`) never re-ask.
  const question = SIZING_QUESTIONS[entryCat.slug];
  const [sizing, setSizing] = useState<SizingOption | null>(null);
  // The one-tap equipment question (2026-07-30, owner ask: "if the job needs
  // a tool, ask the customer if they have it"). Asked right after the sizing
  // question — the answer rides the NOTE so dispatch offers + the helper's
  // job screen read the setup ("Has hoover + products") before accepting.
  // Cleaning's "no products" answer books the helper to bring the basics
  // (+€8, priced by the SERVER from an explicit bring_supplies boolean).
  // Rebooks + deep links with a size never see either question, as before.
  const equipQuestion = EQUIPMENT_QUESTIONS[entryCat.slug];
  const [equip, setEquip] = useState<EquipmentOption | null>(null);
  // Gear the helper is booked to BRING (kit slugs). Set when the builder page
  // hands over; the SERVER re-prices it from this list, never from the note.
  const [kit, setKit] = useState<string[]>([]);
  // Page-1 phase: 'ask' = the sizing question, 'equip' = the equipment
  // question, 'main' = ticks (builders) or the sub-service list.
  const [pickPhase, setPickPhase] = useState<'ask' | 'equip' | 'main'>(
    startOnPick && question && builderTasks ? 'ask' : 'main',
  );
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
  // How the job gets paid. CARD IS NOW THE DEFAULT (owner call 2026-07-30:
  // "keep escrow, it's faster and less friction") — one card payment covers
  // the job + the VANO fee at accept, and the helper STILL keeps 100% of the
  // job price (Stripe Connect transfers it on completion; VANO never holds
  // the money, which is what keeps this out of payment-intermediary
  // territory). 'direct' stays available for customers who'd rather hand
  // over cash/Revolut on the day, and for helpers not yet onboarded for
  // payouts. Display-only here; the server stamps booking_data.card_pay.
  const [payMode, setPayMode] = useState<'direct' | 'card'>('card');
  // The open question the form never asked (2026-07-27): gate code, parking,
  // the dog's name. Collapsed to one quiet line — zero friction for everyone
  // who skips it; the text rides the booking note to dispatch offers and the
  // helper's job screen (and through the server's free-text safety screen).
  const [customerNote, setCustomerNote] = useState('');
  const [showNoteField, setShowNoteField] = useState(false);
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
  // Success beat: the booking landed — the button confirms it for a moment
  // before the tracking page takes over, so the handoff reads as one flow.
  const [bookedOk, setBookedOk] = useState(false);
  // AUTH-AT-BOOKING: true while we hand off to the external Stripe card step —
  // drives a "Securing…" beat so the full-page navigation reads as intentional.
  const [securing, setSecuring] = useState(false);
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
  // Which way the wizard is travelling (+1 forward, -1 back, 0 = first paint)
  // — read by the page variants so each page slides in from where it "lives".
  const navDir = useRef(0);
  // The scrollable middle — reset to the top on every page change so a new
  // page never lands mid-scroll.
  const scrollRef = useRef<HTMLDivElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  // Synchronous submit lock — `loading` state only disables the button after a
  // re-render, so a fast double-tap can fire handleBook twice before then. This
  // ref flips instantly, closing that window (server-side dedupe is the backstop).
  const submitLock = useRef(false);
  // A fast double-tap on the opening tile lands its SECOND tap on the
  // backdrop — it mounts full-screen the instant the sheet starts rising, so
  // onClose fired and the sheet slid straight back down (owner repro
  // 2026-07-27: "I tapped and it went straight down"). The backdrop's
  // tap-to-close arms only after the entrance settles (rise is 420ms); the
  // X, Escape and the drag handle stay live the whole time.
  const backdropArmed = useRef(false);
  useEffect(() => {
    const t = window.setTimeout(() => { backdropArmed.current = true; }, 600);
    return () => window.clearTimeout(t);
  }, []);

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
      setActive({
        cat: entryCat,
        note: sub.carry ? sub.label : undefined,
        extraLabel: sub.carry ? sub.label : undefined,
      });
      if (sub.size) setSize(sub.size);
      // Speed-wizard beat: a core pick in a question category (dog walks,
      // laundry) pauses on the one-tap sizing question before the form.
      // Custom rows keep their own flow — the catalogue job IS the answer.
      if (question) {
        navDir.current = 1;
        setPickPhase('ask');
        return;
      }
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
    navDir.current = 1;
    setStep('form');
  }

  // One tap answers the sizing question. Builders move on to the ticks (the
  // factor is applied to the estimates live); Pets/Laundry go straight to the
  // form — a `size` answer jumps to that existing label (laundry bags), a
  // carry answer rides note + extra_label (dog type) so dispatch offers and
  // the helper's job screen name the real ask — and for dog walks the SERVER
  // prices that extra_label (the surcharge ladder). The client never invents
  // a price: checkout recomputes the same category+size+extra pair.
  function applySizing(opt: SizingOption) {
    haptic(10);
    track('hero_size_pick', { category: entryCat.slug, answer: opt.key });
    setSizing(opt);
    if (opt.size) setSize(opt.size);
    navDir.current = 1;
    if (builderTasks) {
      setPickPhase(equipQuestion ? 'equip' : 'main');
      return;
    }
    if (opt.carry) setActive((a) => ({ ...a, note: opt.carry, extraLabel: opt.carry }));
    if (equipQuestion) {
      // One more tap — "lead & bags by the door?" — before the form.
      setPickPhase('equip');
      return;
    }
    setPickPhase('main'); // so "back" from the form lands on the sub list, not the question
    setStep('form');
  }

  // One tap answers the equipment question. Builders move on to the ticks;
  // Pets go straight to the form with the carry riding the NOTE only — the
  // extraLabel must stay the PRICED dog answer (the server reads it).
  function applyEquip(opt: EquipmentOption) {
    haptic(10);
    track('hero_equip_pick', { category: entryCat.slug, answer: opt.key });
    setEquip(opt);
    // Ticks SURVIVE an answer change — a job that needs gear the household
    // lacks simply gains the hire fee (and loses it again if they say they
    // do have it). Dropping the tick was the old behaviour, back when a
    // missing mower killed the row outright.
    navDir.current = 1;
    if (builderTasks) {
      setPickPhase('main');
      return;
    }
    setActive((a) => ({ ...a, note: [a.note, opt.carry].filter(Boolean).join(' · ') }));
    setPickPhase('main');
    setStep('form');
  }

  // Builder page derived values — the ticked tasks priced through the same
  // canonical table as everything else (the builder only ever picks a SIZE).
  // The sizing answer scales the MINUTES (estimates are calibrated to the
  // middle answer), so the total still rounds onto an existing size label.
  const sizingFactor = sizing?.factor ?? 1;
  // The estimate the customer can literally add up off the tick rows, and the
  // time we actually book (rounded UP in quarter-hour steps, never below the
  // 1-hour minimum). Showing BOTH is the fix for the 2026-07-30 owner report
  // — "I've clicked two, same price" was the 1-hour minimum doing its job
  // silently. Silent is what made it look broken.
  const builderEstMinutes = builderTasks ? builderMinutes(entryCat.slug, ticked, sizingFactor) : 0;
  const builderSize = builderTasks && entryCat.sizes
    ? builderSizeLabel(builderEstMinutes, entryCat.sizes)
    : null;
  const builderBookedMinutes = builderSize ? bookedMinutes(builderSize) : null;
  const builderSpareMinutes = builderBookedMinutes != null ? builderBookedMinutes - builderEstMinutes : 0;
  const builderPriceCents = builderSize ? getPriceCents(entryCat.slug, builderSize) : null;
  // What the build-up card shows: labour + the bring-the-basics supplies
  // add-on when the equipment answer picked it. The market "you save" anchor
  // keeps comparing labour to labour (supplies aren't cleaning hours).
  // Gear the household hasn't got, for the jobs they've actually ticked.
  // The fee is the STUDENT'S money (fuel, wear, hauling a mower across town),
  // so it rides the job price exactly like the supplies add-on, and the
  // booking fee stays computed on the BASE price. Dispatch then only offers
  // the job to helpers whose own_kit carries it.
  const builderKit = builderTasks
    ? builderTasks
        .filter((t) => t.needsKit && ticked.includes(t.key) && equip?.lacks?.includes(t.needsKit))
        .map((t) => t.needsKit as string)
    : [];
  const builderKitCents = kitHireCents(builderKit);
  const builderEquipCents = (equip?.suppliesAddon ? SUPPLIES_ADDON_CENTS : 0) + builderKitCents;
  const builderDisplayCents = builderPriceCents != null ? builderPriceCents + builderEquipCents : null;
  // What actually leaves the customer's pocket: the job, the supplies add-on,
  // and VANO's booking fee (charged on the BASE job price — the helper's
  // expenses aren't taxed). This is the number the market anchor is compared
  // against, so "you save" can't quietly ignore our own fee.
  const builderAllInCents = builderPriceCents != null
    ? builderPriceCents + builderEquipCents + computeVanoFeeCents(builderPriceCents)
    : null;
  const builderMarket = builderSize ? builderMarketCents(entryCat.slug, builderSize) : null;

  // Page 1 (builder) → page 2: same contract as applyPick — the ticked list
  // rides note (full, for the helper) + extraLabel (short, for offers), and
  // the computed size preselects the form's "How long?" chips, which stay
  // live so the customer can still adjust. The sizing answer leads the note
  // ("3-bed home · Kitchen deep-clean + …") so the helper reads the scope.
  function applyBuilderPick() {
    if (!builderTasks || !builderSize) return;
    haptic(10);
    track('builder_continue', {
      category: entryCat.slug,
      tasks: ticked.length,
      size: builderSize,
      ...(sizing ? { sizing: sizing.key } : {}),
    });
    setActive({
      cat: entryCat,
      // Scope first, then the tasks, then the equipment answer — one string
      // the helper reads top to bottom before saying yes.
      note: [
        sizing?.carry,
        builderNote(entryCat.slug, ticked),
        equip?.carry,
        builderKit.length ? `Helper brings: ${kitLabel(builderKit)}` : null,
      ].filter(Boolean).join(' · '),
      extraLabel: builderShortLabel(entryCat.slug, ticked) ?? undefined,
    });
    setKit(builderKit);
    setSize(builderSize);
    navDir.current = 1;
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
    business:   'What does your business need?',
  };
  const pickTitle = isDescribe ? 'What do you need done?' : (PICK_TITLES[entryCat.slug] ?? `What kind of ${entryCat.label.toLowerCase()}?`);
  // The sizing/equipment questions take over page 1's header while asked.
  const asking = step === 'pick' && pickPhase === 'ask' && !!question;
  const askingEquip = step === 'pick' && pickPhase === 'equip' && !!equipQuestion;
  const headerTitle = asking && question ? question.title
    : askingEquip && equipQuestion ? equipQuestion.title
    : pickTitle;
  const headerWhy = asking && question ? question.why
    : askingEquip && equipQuestion ? equipQuestion.why
    : null;
  // Answer rows carry the real resulting price — the single price source,
  // never hardcoded. Laundry rows price their bag label; dog rows price the
  // picked walk duration WITH that answer (€15/€15/€18/€20 for 30 min), so the
  // surcharge is visible BEFORE the tap, never after. Builder answers scale
  // the ticks, so there's no price to show yet.
  const sizingPriceLabel = (opt: SizingOption): string => {
    if (opt.factor) return '';
    const cents = opt.size
      ? getPriceCents(entryCat.slug, opt.size)
      : opt.carry
        ? getPriceCents(entryCat.slug, size, opt.carry)
        : null;
    return cents ? fmt(cents) : '';
  };
  const visibleSubs: SubService[] = subServices
    ? [...subServices.featured, ...(showMoreSubs ? subServices.more : [])]
    : [];
  // Row price: core rows use the category's real table (flat €15 laundry,
  // €15/€20 walks, "from €22" hourly); custom rows are the flat truth — €22/hr
  // (short-visit jobs can book 30 min from €14).
  const subPriceLabel = (s: SubService): string => {
    if (s.kind === 'custom') return isShortVisit(s.jobKey) ? 'from €14' : '€22/hr';
    const cents = getPriceCents(entryCat.slug, s.size ?? entryCat.sizes?.[0] ?? '');
    if (!cents) return '€22/hr';
    // Walk rows read "from €15": the dog question after this pick can raise
    // the price (big dog / two dogs), so an exact figure here would lie.
    if (entryCat.slug === 'dog-walk' && s.size) return `from ${fmt(cents)}`;
    return s.size || !entryCat.sizes ? fmt(cents) : `from ${fmt(cents)}`;
  };
  // cascadeIndex staggers the row's entrance (.cascade-in, pure CSS) so a
  // fresh list rises up one row at a time instead of appearing as a block.
  // Pass undefined for lists that churn (typing in describe-it) — animating
  // every keystroke would read as noise, not flow.
  const renderSubRow = (key: string, emoji: string, label: string, hint: string | null, price: string, onPick: () => void, cascadeIndex?: number) => (
    <button
      key={key}
      type="button"
      onClick={onPick}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-white px-3.5 py-3.5 text-left hover:border-sage/60 hover:bg-sage-light/30 active:scale-[0.98] transition-[border-color,background-color,transform] duration-150',
        cascadeIndex != null && 'cascade-in',
      )}
      style={cascadeIndex != null ? ({ '--cascade-i': Math.min(cascadeIndex, 8) } as React.CSSProperties) : undefined}
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

  // Every wizard page starts from the top — landing mid-scroll reads as a glitch.
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [step, pickPhase]);

  // Focus the phone field only AFTER the sheet (or page) has finished sliding —
  // the keyboard rising mid-slide shoves the whole sheet around, which is
  // exactly the "jump" this flow shouldn't have. Sequenced, it reads as one
  // motion: sheet lands, then the keyboard comes up. (Best-effort: some mobile
  // browsers only open the keyboard on a direct tap — the field is right there
  // then, same as before.)
  useEffect(() => {
    if (step !== 'form' || prefilled) return;
    const t = setTimeout(() => {
      const el = phoneInputRef.current;
      if (el && !el.value.trim()) el.focus({ preventScroll: true });
    }, 430);
    return () => clearTimeout(t);
  }, [step, prefilled]);

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
  // extraLabel rides along for the dog-walk surcharge (the ONLY branch that
  // prices it — builder "+2" labels and custom job names are ignored); the
  // server re-prices the same pair authoritatively at checkout.
  const priceCents = getPriceCents(cat.slug, size, extraLabel);
  // Bring-the-basics supplies (equipment question) + travel top-up (far-out
  // addresses) — both the STUDENT'S money, both recomputed authoritatively
  // by the server (bring_supplies boolean / geocoded coordinates); these are
  // display mirrors so the sheet's total never surprises at accept time.
  const suppliesCents = equip?.suppliesAddon ? SUPPLIES_ADDON_CENTS : 0;
  // Hired gear (a mower, a power washer) the household hasn't got — also the
  // student's money, also re-priced by the server from the explicit `kit`
  // list rather than the note.
  const kitCents = kitHireCents(kit);
  const travelCents = coords ? travelTopupCents(coords.lat, coords.lng) : 0;
  const jobTotalCents = priceCents != null ? priceCents + suppliesCents + kitCents + travelCents : null;
  // The docked CTA quotes what the booking COSTS IN TOTAL — job money
  // (labour + supplies + travel) plus VANO's fee and any Cover. In card mode
  // that is exactly the receipt's total band; in direct mode it's the true
  // all-in cost (fee on the card today, the rest to the helper after). It
  // used to quote the job money alone, which read €41 on a €46 checkout.
  const totalCostCents = jobTotalCents != null
    ? jobTotalCents + computeVanoFeeCents(priceCents ?? 0) + (coverOpted ? VANO_COVER_CENTS : 0)
    : null;
  const priceLabel = totalCostCents ? fmt(totalCostCents) : null;

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
  // Sizes computed by the tick-box builder are quarter-hour DECIMALS
  // ("1.75 hours") because every price parser in the codebase reads a leading
  // number. Nobody books "1.75 hours" though, so every place a size is SHOWN
  // runs it through durationText → "1 hr 45 min". Non-duration labels
  // ("2 bags", "Small area") come back untouched.
  const sizeText = size ? durationText(size) : '';
  const ctaLabel = [
    cat.label.length <= 12 ? `Book ${cat.label}` : 'Book',
    sizeText || null,
    priceLabel,
  ].filter(Boolean).join(' · ');

  function sendWhatsApp() {
    // After a failed submit the typed details ride along, so the WhatsApp
    // thread starts with everything our team needs to book it by hand.
    const withDetails = submitFailed && address.trim() ? address.trim() : undefined;
    const url = `${teamWhatsAppHref}?text=${encodeURIComponent(buildWhatsAppMsg(cat, when, size, withDetails))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // True once the "Edit details" unfold has finished — the wrapper needs
  // overflow-hidden only WHILE the height animates; left on, it would clip
  // the address suggestions dropdown.
  const [fieldsUnfolded, setFieldsUnfolded] = useState(false);

  // The two identity fields (phone + address). Rendered two ways below: fresh
  // visitors get them as a normal cascade item; returning customers see them
  // unfold in place when "Edit" (or a validation error) reveals them.
  const detailFields = (
    <>
      {/* Phone first — the sheet slides up straight onto this field.
          Time + duration below are pre-picked, so number + address is
          all a new visitor has to type. */}
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-foreground/50 mb-2.5 flex items-center gap-1.5">
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
          ref={phoneInputRef}
          type="tel"
          value={phone}
          onChange={e => { setPhone(e.target.value); if (phoneError) setPhoneError(false); if (error) setError(null); }}
          placeholder="08x xxx xxxx"
          autoComplete="tel"
          inputMode="tel"
          enterKeyHint="go"
          autoCapitalize="off"
          autoCorrect="off"
          required
          className={cn(
            'w-full rounded-xl border bg-white px-4 py-3 text-base placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:border-transparent transition-[border-color,box-shadow] duration-150',
            phoneError ? 'border-destructive focus:ring-destructive/30' : 'border-border focus:ring-foreground/20',
          )}
        />
        <p className="text-[13px] leading-relaxed text-muted-foreground mt-1.5">We'll text you when a helper says yes · Outside Ireland? Add your country code (+44…)</p>
      </div>

      {/* Address — Eircode search or current location */}
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-foreground/50 mb-2.5 flex items-center gap-1.5">
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
          showMapPreview
        />
        <p className="text-[13px] text-muted-foreground mt-1.5">So your helper knows exactly where to go</p>
      </div>
    </>
  );

  // A failed validation must SHOW the field it's pointing at: the customer
  // just pressed Book at the BOTTOM of the sheet, and the fields live at the
  // top (possibly folded behind the returning-customer summary). Unfold and
  // scroll back up so the red border is on screen, not above the fold.
  function revealFieldError() {
    setEditDetails(true);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (submitLock.current) return; // ignore a double-tap before the re-render
    const phoneClean = phone.trim().replace(/\s+/g, '');
    if (!isValidPhone(phone)) {
      revealFieldError();
      setPhoneError(true);
      setError('Please enter a valid phone number.');
      return;
    }
    if (normalizePhoneE164(phone) === null) {
      // Phone-shaped but not textable (UK 07…, landlines) — every update
      // (pay link, on-my-way, arrival) goes by text, so catch it here with a
      // fix instead of booking someone we can never reach.
      revealFieldError();
      setPhoneError(true);
      setError("We can't text that number — Irish mobiles (08…) work as-is; for other countries add the code, e.g. +44 7…");
      return;
    }
    if (!address.trim()) {
      revealFieldError();
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
          // Equipment answer: the helper brings the basics (+€8, cleaning
          // only — the server validates and prices it).
          ...(suppliesCents > 0 ? { bring_supplies: true } : {}),
          ...(kit.length ? { kit } : {}),
          // Card-pay option: one card payment for everything at accept.
          ...(CARD_PAY_OFFERED && payMode === 'card' ? { card_pay: true } : {}),
          // Distance-selling evidence: the customer expressly asked for
          // immediate performance and acknowledged the 14-day right ends once
          // the job is done (the sentence shown above the Book button).
          immediate_performance_consent: true,
          ...(computeScheduledAt(when) ? { scheduled_at: computeScheduledAt(when) } : {}),
          // Wizard scope first, then the customer's own words — one string
          // the helper reads top to bottom ("3-bed home · Kitchen … · Gate
          // code 1234").
          note:             [note ?? '', customerNote.trim()].filter(Boolean).join(' · '),
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
        // The dog answer is PRICED — a rebook that dropped it would quietly
        // underpay the student. Saves merge, so readers gate on lastCategory.
        ...(cat.slug === 'dog-walk' && extraLabel ? { lastExtra: extraLabel } : {}),
      });
      // Same-origin handoff (the /track page) rides the SPA router — no
      // white-flash full reload at the peak-momentum moment. A short
      // "Booked ✓" beat on the button acknowledges the moment first, then
      // the tracking page fades in and its radar + celebration take the
      // baton — teleporting mid-spinner read as a glitch. Anything external
      // (a real Stripe URL) still hard-navigates immediately.
      const dest = data.checkout_url as string;
      try {
        const u = new URL(dest, window.location.origin);
        if (u.origin === window.location.origin) {
          setLoading(false);
          setBookedOk(true);
          haptic(20);
          window.setTimeout(() => navigate(u.pathname + u.search), 700);
          return;
        }
      } catch { /* malformed URL — fall through to the hard redirect */ }
      // External dest = the Stripe card step (AUTH-AT-BOOKING). Swap the
      // button to a "Securing…" beat first so the full-page handoff reads as
      // the next step of THIS flow, not a hijack mid-spinner.
      setLoading(false);
      setSecuring(true);
      haptic(15);
      window.setTimeout(() => { window.location.href = dest; }, 650);
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
        className="fixed inset-0 z-[69] bg-navy/50 backdrop-blur-sm"
        onClick={() => { if (backdropArmed.current) onClose(); }}
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
        className={cn(
          'fixed inset-x-0 bottom-0 z-[70] bg-cream rounded-t-3xl shadow-2xl safe-area-bottom sm:mx-auto sm:bottom-6 sm:rounded-3xl flex flex-col overflow-hidden',
          // Desktop: the form page goes two-column (details | price) so the
          // whole booking fits one screen with no scrolling; the wizard's
          // pick page stays a comfortable single column. Width animates
          // between the two so the page handoff reads as one motion.
          'sm:transition-[max-width] sm:duration-300 sm:ease-out',
          step === 'form' ? 'sm:max-w-[780px]' : 'sm:max-w-[460px]',
        )}
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
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-2" style={{ overscrollBehavior: 'contain' }}>
          {/* Header — step-aware: page 1 asks the question, page 2 names the
              picked job and (when the wizard ran) offers a way back. The emoji
              and titles are keyed on their content, so a page change replays a
              gentle pop/crossfade instead of hard-swapping the text. */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-start gap-1 min-w-0">
              {/* Back — grows in from zero width so the title glides right
                  instead of being shoved when the button appears. */}
              <AnimatePresence initial={false}>
                {startOnPick && (step === 'form' || (asking && !builderTasks) || askingEquip) && (
                  <motion.button
                    key="wizard-back"
                    type="button"
                    // From the form → back to page 1 (ticks/list). From the
                    // sizing question after a sub-pick (pets/laundry) → back
                    // to the list. Builders asking FIRST have nothing behind.
                    onClick={() => {
                      navDir.current = -1;
                      if (step === 'form') setStep('pick');
                      // Equipment question → back to the sizing question
                      // (builders) or the sub list (pets).
                      else if (pickPhase === 'equip') setPickPhase(builderTasks && question ? 'ask' : 'main');
                      else setPickPhase('main');
                    }}
                    aria-label={step === 'form' ? 'Back to job types' : 'Back to job list'}
                    initial={{ width: 0, marginLeft: 0, opacity: 0, scale: 0.6 }}
                    animate={{ width: 36, marginLeft: -8, opacity: 1, scale: 1 }}
                    exit={{ width: 0, marginLeft: 0, opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.28, ease: SHEET_EASE }}
                    whileTap={{ scale: 0.85 }}
                    className="h-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden hover:bg-foreground/[0.08] transition-[background-color] duration-150"
                  >
                    <ArrowLeft className="w-5 h-5 text-foreground/60 flex-shrink-0" />
                  </motion.button>
                )}
              </AnimatePresence>
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 mb-0.5">
                  <motion.span
                    key={step === 'pick' ? entryCat.emoji : cat.emoji}
                    className="text-2xl leading-none inline-block"
                    aria-hidden="true"
                    initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 480, damping: 20, delay: 0.1 }}
                  >
                    {step === 'pick' ? entryCat.emoji : cat.emoji}
                  </motion.span>
                  <h2 className="font-display text-xl font-bold text-foreground" style={{ fontFamily: 'Bricolage Grotesque, Plus Jakarta Sans, system-ui, sans-serif' }}>
                    <motion.span
                      key={step === 'pick' ? headerTitle : cat.label}
                      className="inline-block"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: SHEET_EASE }}
                    >
                      {step === 'pick' ? headerTitle : cat.label}
                    </motion.span>
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground ml-9">
                  <motion.span
                    key={step === 'pick' ? `pick-sub-${pickPhase}` : cat.hint}
                    className="inline-block"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25, delay: 0.05 }}
                  >
                    {step === 'pick'
                      ? (headerWhy
                          ?? (isDescribe
                            ? 'Tap a popular job, or type your own'
                            : builderTasks
                              ? 'Tap all that apply — the price builds as you go'
                              : 'Tap one — it takes a second'))
                      : cat.hint}
                  </motion.span>
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
              <span className="w-8 h-8 rounded-full bg-foreground/[0.08] flex items-center justify-center group-hover/close:bg-foreground/[0.12] transition-colors">
                <X className="w-4 h-4 text-foreground/60" />
              </span>
            </button>
          </div>

          {/* Trust at the decision moment — one glanceable row, absorbed
              without reading (the Airbnb trick): who's coming, what covers
              you. The details live in /terms + /cover; this is the signal.
              Rises in with the form page (initial={false} keeps it static when
              the sheet opens directly on the form — it rides the sheet slide). */}
          <AnimatePresence initial={false}>
            {step === 'form' && (
              <motion.div
                key="trust-row"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: SHEET_EASE, delay: 0.15 } }}
                exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, transition: { duration: 0.18, ease: 'easeOut' } }}
                className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-2xl bg-sage-light/60 border border-sage/20 px-4 py-2.5 mb-5 overflow-hidden"
              >
                {[
                  { id: 'idv',   text: 'ID-verified student' },
                  // Live chip: ticking the €2 Cover below flips the promise
                  // from "optional" to "added" — the sheet acknowledges it.
                  { id: 'cover', text: coverOpted ? '€250 cover added' : 'Optional €250 cover' },
                  { id: 'mbg',   text: 'Money-back guarantee' },
                ].map(({ id, text }) => (
                  <span key={id} className="inline-flex items-center gap-1.5 text-xs sm:text-[13px] font-semibold text-sage-dark whitespace-nowrap">
                    <Check className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={3} aria-hidden="true" />
                    <motion.span
                      key={text}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="inline-block"
                    >
                      {text}
                    </motion.span>
                  </span>
                ))}
                {/* The proof behind the chips — phrased as HER question. New
                    tab so the half-filled sheet is never lost to a curiosity
                    tap (same pattern as the /cover links below). */}
                <a
                  href="/safety"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs sm:text-[13px] font-semibold text-sage-dark/80 underline underline-offset-2 whitespace-nowrap hover:text-sage-dark transition-colors"
                >
                  Who's coming? →
                </a>
              </motion.div>
            )}
          </AnimatePresence>

          {/* The two wizard pages hand off with a directional slide (iOS
              push/pop) instead of a hard cut — mode="wait" lets the old page
              slip away before the new one arrives, so heights never fight. */}
          <AnimatePresence mode="wait" custom={navDir.current}>
          {step === 'pick' ? (
            /* ── Wizard page 1: sizing question / sub-service picker / describe-it ── */
            <motion.div
              // Keyed on the phase so ask → ticks/list hands off with the same
              // directional slide the pick → form transition uses.
              key={`pick-${pickPhase}`}
              custom={navDir.current}
              variants={pickPage}
              initial="hidden"
              animate="show"
              exit="exit"
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
                  enterKeyHint="go"
                  aria-label="Describe what you need done"
                  className="mb-3 w-full h-12 rounded-2xl border border-border bg-white px-4 text-base sm:text-[15px] text-foreground placeholder:text-foreground/45 focus:outline-none focus:ring-2 focus:ring-ring"
                />
              )}
              {equipQuestion && pickPhase === 'equip' && !isDescribe ? (
                /* ── The one-tap equipment question. Rows use the same
                    grammar as the sizing question; the cleaning "helper
                    brings products" row wears its honest +€8. */
                <div className="space-y-2" role="group" aria-label={equipQuestion.title}>
                  {equipQuestion.options.map((opt, i) =>
                    renderSubRow(
                      opt.key,
                      opt.emoji,
                      opt.label,
                      opt.hint ?? null,
                      (opt.key === equip?.key ? '✓ ' : '') + (opt.suppliesAddon ? `+${fmt(SUPPLIES_ADDON_CENTS)}` : ''),
                      () => applyEquip(opt),
                      i,
                    ))}
                </div>
              ) : question && pickPhase === 'ask' && !isDescribe ? (
                /* ── The one-tap sizing question (the speed wizard). Rows use
                    the same grammar as the sub-picker: emoji + label + honest
                    hint, price only where the answer IS a price (laundry
                    bags). One tap → applySizing moves the wizard on. */
                <div className="space-y-2" role="group" aria-label={question.title}>
                  {question.options.map((opt, i) =>
                    renderSubRow(
                      opt.key,
                      opt.emoji,
                      opt.label,
                      opt.hint ?? null,
                      // Coming back via "Change"? Tick the current answer.
                      (opt.key === sizing?.key ? '✓ ' : '') + sizingPriceLabel(opt),
                      () => applySizing(opt),
                      i,
                    ))}
                </div>
              ) : builderTasks && !isDescribe ? (
                /* ── Tick-box builder: tap the tasks, watch the price build.
                    Each row is a task with an honest ~time; the card below
                    rolls the total (AnimatedPrice) and anchors it against the
                    display-only local going rate. Continue = applyBuilderPick. */
                <>
                  {/* The sizing answer stays visible + changeable while
                      ticking — it's scaling every estimate below. */}
                  {sizing && (
                    <button
                      type="button"
                      onClick={() => { haptic(8); navDir.current = -1; setPickPhase('ask'); }}
                      className="mb-2.5 flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-white px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/40"
                    >
                      <span className="flex items-center gap-2 text-sm text-foreground min-w-0">
                        <span className="text-lg leading-none flex-shrink-0" aria-hidden="true">{sizing.emoji}</span>
                        <span className="font-semibold truncate">{sizing.carry ?? sizing.label}</span>
                      </span>
                      <span className="text-[13px] font-semibold text-sage-dark flex-shrink-0">Change</span>
                    </button>
                  )}
                  {/* The equipment answer stays visible + changeable too — it
                      rides the note the helper reads, and cleaning's supplies
                      answer moves the price. */}
                  {equip && (
                    <button
                      type="button"
                      onClick={() => { haptic(8); navDir.current = -1; setPickPhase('equip'); }}
                      className="mb-2.5 flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-white px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/40"
                    >
                      <span className="flex items-center gap-2 text-sm text-foreground min-w-0">
                        <span className="text-lg leading-none flex-shrink-0" aria-hidden="true">{equip.emoji}</span>
                        <span className="font-semibold truncate">{equip.carry}{equip.suppliesAddon ? ` (+${fmt(SUPPLIES_ADDON_CENTS)})` : ''}</span>
                      </span>
                      <span className="text-[13px] font-semibold text-sage-dark flex-shrink-0">Change</span>
                    </button>
                  )}
                  <div className="space-y-2" role="group" aria-label={pickTitle}>
                    {builderTasks.map((t, i) => {
                      const on = ticked.includes(t.key);
                      // Needs gear the household hasn't got — still bookable,
                      // the helper just brings it for the hire fee (and only
                      // helpers who own one are offered the job).
                      const hireSlug = t.needsKit && equip?.lacks?.includes(t.needsKit) ? t.needsKit : null;
                      const hireCents = hireSlug ? KIT_HIRE_CENTS[hireSlug] ?? 0 : 0;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => { haptic(8); setTicked((v) => on ? v.filter((k) => k !== t.key) : [...v, t.key]); }}
                          className={cn(
                            'cascade-in flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3.5 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98]',
                            on ? 'border-sage bg-sage-light' : 'border-border/70 bg-white hover:border-sage/60 hover:bg-sage-light/30',
                          )}
                          style={{ '--cascade-i': Math.min(i, 8) } as React.CSSProperties}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150',
                              on ? 'border-sage bg-sage' : 'border-foreground/30 bg-white',
                            )}
                          >
                            {on && <Check className="h-4 w-4 text-white" strokeWidth={3.5} />}
                          </span>
                          <span className="text-2xl leading-none flex-shrink-0" aria-hidden="true">{t.emoji}</span>
                          {/* Wraps, never truncates — a slow reader must be able
                              to read the whole task they're ticking (375px
                              phones cut "Kitchen deep-cle…" with truncate). */}
                          <span className="flex-1 min-w-0 text-[15px] font-semibold text-foreground leading-snug">{t.label}</span>
                          {/* Room-and-area jobs scale with the sizing answer —
                              a 4-bed hoover-through honestly takes longer than
                              a 1-bed — while fixed-scope ones (the kitchen, the
                              oven) don't. taskMinutes is the SAME function the
                              billed total goes through, so the chips on screen
                              always add up to the price. */}
                          <span className="flex flex-col items-end flex-shrink-0 leading-tight">
                            <span className="text-xs font-semibold text-muted-foreground tabular-nums">{minutesLabel(taskMinutes(t, sizingFactor))}</span>
                            {/* The whole point of the kit loop: a household
                                with no mower is the one that most needs a
                                gardener, so this is an offer, not a refusal. */}
                            {hireCents > 0 && (
                              <span className="mt-0.5 text-[10px] font-bold text-sage-dark whitespace-nowrap">
                                +{fmt(hireCents)} we bring it
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Never a dead end: a job the boxes don't cover still has a
                      human door, right here — not after closing the sheet.
                      Sits ABOVE the sticky card so it scrolls with the rows. */}
                  <button
                    type="button"
                    onClick={sendWhatsApp}
                    className="mt-3 mx-auto block text-[13px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    Job not in the list? WhatsApp us — we sort anything
                  </button>

                  {/* The build-up card — duration + rolling price + anchor.
                      STICKY to the sheet's bottom edge (2026-07-24): on small
                      phones the card sat below the fold, so the whole "watch
                      the price build as you tick" moment was invisible while
                      ticking. Now the rows scroll underneath and the rolling
                      total never leaves the screen — the sheet's docked-bar
                      pattern, one page earlier. */}
                  <div className="sticky bottom-0 z-10 bg-cream pt-3 pb-1">
                  <div className="surface-float rounded-2xl border border-border bg-white px-4 pt-3.5 pb-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={cn('text-sm min-w-0', builderSize ? 'text-foreground/70' : 'text-muted-foreground')}>
                        {builderSize
                          ? <>You're booking <span className="font-semibold text-foreground">{durationText(builderSize)}</span> · €{HOURLY_RATE_CENTS[entryCat.slug] / 100}/hr</>
                          : 'Tick what needs doing'}
                      </span>
                      {builderDisplayCents != null
                        ? <AnimatedPrice announce cents={builderDisplayCents} className="text-2xl font-bold text-foreground flex-shrink-0" />
                        : <span className="text-2xl font-bold text-foreground/25 tabular-nums flex-shrink-0" aria-hidden="true">€0</span>}
                    </div>
                    {/* The maths, out loud. The ticks add up to an estimate;
                        we book the next quarter-hour up, never under an hour.
                        Spare time isn't a rounding gouge — it's time the
                        customer has already paid for, so we say "tick more,
                        it's included" and mean it. */}
                    {builderSize && builderEstMinutes > 0 && (
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        {ticked.length === 1 ? 'Your tick adds up to' : `Your ${ticked.length} ticks add up to`}{' '}
                        <span className="font-semibold text-foreground/80 tabular-nums">
                          {minutesText(builderEstMinutes)}
                        </span>
                        {builderSpareMinutes > 0
                          ? <> · minimum booking is 1 hr, so you've <span className="font-semibold text-sage-dark">~{builderSpareMinutes} min spare — tick more, it's included</span></>
                          : <> · booked time covers all of it</>}
                      </p>
                    )}
                    {/* "You save" is measured against what the customer
                        ACTUALLY PAYS — job + supplies + our booking fee — not
                        the job price alone (found 2026-07-30 re-reading the
                        wizard). Comparing a €22 job to a €28 agency hour and
                        claiming "save €6" ignored the €5 fee on top: the real
                        saving on a one-hour clean is €1. This repo's own rule
                        is that an anchor which overclaims reads as a lie the
                        first time someone price-checks it — so it now quotes
                        the honest number, and stays silent below €2 rather
                        than dressing up a rounding difference as a deal. */}
                    {builderAllInCents != null && builderMarket != null
                      && builderMarket - builderAllInCents >= 200 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Typical Galway rate ~{fmt(builderMarket)} · <span className="font-semibold text-sage-dark">you save ~{fmt(builderMarket - builderAllInCents)} all in</span>
                      </p>
                    )}
                    {/* The honest answer to "what if it takes longer?" — the
                        helper can ask for extra time on the day and the
                        customer approves it on the tracking page. Said here,
                        BEFORE booking, so it's never a doorstep surprise. */}
                    {builderSize && (
                      <p className="text-[11px] text-muted-foreground/80 mt-1.5 leading-relaxed">
                        Bigger than it looks on the day? Your helper can ask for extra time — you approve it first, and it's never charged automatically.
                      </p>
                    )}
                    <Button
                      type="button"
                      disabled={!builderSize}
                      onClick={applyBuilderPick}
                      className="mt-3 w-full h-12 rounded-full text-[15px] font-bold"
                    >
                      {builderDisplayCents != null ? `Continue · ${fmt(builderDisplayCents)}` : 'Tick at least one job'}
                    </Button>
                  </div>
                  </div>
                </>
              ) : (
              <>
              <div className="space-y-2" role="group" aria-label={pickTitle}>
                {isDescribe
                  ? describeRows.map((row, i) =>
                      renderSubRow(
                        row.key,
                        row.emoji,
                        row.label,
                        row.key === 'other' ? 'Tell us exactly what you need' : row.group,
                        isShortVisit(row.key) ? 'from €14' : '€22/hr',
                        () => applyPick({ kind: 'custom', jobKey: row.key }),
                        // Cascade only the opening "popular jobs" list — live
                        // search results should update instantly, not animate.
                        describeQuery.trim().length >= 2 ? undefined : i,
                      ))
                  : visibleSubs.map((s, i) => {
                      const job = s.kind === 'custom' ? customJobByKey(s.jobKey) : null;
                      const featuredLen = subServices?.featured.length ?? 0;
                      return renderSubRow(
                        s.kind === 'custom' ? s.jobKey : s.label,
                        job ? job.emoji : (s as { emoji: string }).emoji,
                        job ? job.label : (s as { label: string }).label,
                        s.kind === 'core' && !s.size ? entryCat.hint : null,
                        subPriceLabel(s),
                        () => applyPick(s),
                        // "More options" rows restart the cascade from zero, so
                        // the reveal flows immediately instead of waiting out
                        // the featured rows' delays.
                        i < featuredLen ? i : i - featuredLen,
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
              </>
              )}
              <p className="text-center text-[13px] text-muted-foreground mt-4 leading-relaxed">
                Fair prices, always — your helper earns above minimum wage on every job.
              </p>
            </motion.div>
          ) : (
          <motion.form
            key="form-page"
            custom={navDir.current}
            id="quick-book-form"
            // noValidate: handleBook owns validation (scroll-to-field, red
            // border, friendly message). The browser's native `required`
            // bubble blocked submit BEFORE that path could run — an easy-to-
            // miss tooltip instead of the designed recovery.
            noValidate
            onSubmit={handleBook}
            className="space-y-5"
            variants={formPage}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            {/* ONE calm top-to-bottom column on every screen (Deliveroo/Uber
                checkout pattern): details → map → when → price → book. One
                reading order, capped width on desktop so it never sprawls. */}
            <div className="space-y-5 sm:max-w-lg sm:mx-auto">
            <div className="space-y-5">
            {/* Returning customer → one-tap confirm: the "welcome back" strip
                and the remembered phone + address live in ONE card (they used
                to be two stacked rows — the sheet reads shorter this way).
                "Edit" unfolds the fields beneath, "Clear" forgets the device.
                New visitors always get the fields. */}
            <AnimatePresence>
              {prefilled && !editDetails && (
                <motion.div
                  key="detail-summary"
                  variants={listItem}
                  exit={{ height: 0, opacity: 0, transition: { duration: 0.22, ease: 'easeOut' } }}
                  className="rounded-xl border border-sage/25 bg-white overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-3 bg-sage/[0.08] border-b border-sage/15 px-4 py-2">
                    <p className="text-[13px] text-foreground/70 truncate">
                      <span className="font-semibold text-sage-dark">Welcome back</span> — we filled in your details
                    </p>
                    <button
                      type="button"
                      onClick={forgetMe}
                      className="text-[13px] font-semibold text-foreground/45 hover:text-foreground/70 underline underline-offset-2 flex-shrink-0 transition-colors px-3 py-2.5 -mx-3 -my-2.5"
                    >
                      Clear
                    </button>
                  </div>
                  {/* The whole row opens the editor — a tap target the size of
                      the card, not just the little "Edit" label. */}
                  <button
                    type="button"
                    onClick={() => setEditDetails(true)}
                    aria-label="Edit your phone or address"
                    className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary/40"
                  >
                    <span className="block min-w-0 space-y-1.5">
                      <span className="flex items-center gap-2 text-sm text-foreground">
                        <Phone className="w-4 h-4 flex-shrink-0 text-foreground/45" aria-hidden="true" />
                        <span className="font-semibold truncate">{phone || 'Add your number'}</span>
                      </span>
                      <span className="flex items-center gap-2 text-sm text-foreground/80">
                        <MapPin className="w-4 h-4 flex-shrink-0 text-foreground/45" aria-hidden="true" />
                        <span className="truncate">{address || 'Add your address'}</span>
                      </span>
                    </span>
                    <span className="text-[13px] font-semibold text-sage-dark flex-shrink-0" aria-hidden="true">
                      Edit
                    </span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {(!prefilled || editDetails) && (
              prefilled ? (
                /* Revealed by "Edit" (or a validation error pointing here) —
                   unfolds in place so nothing below jumps. */
                <motion.div
                  key="detail-fields"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  transition={{ duration: 0.3, ease: SHEET_EASE }}
                  onAnimationComplete={() => setFieldsUnfolded(true)}
                  className={fieldsUnfolded ? undefined : 'overflow-hidden'}
                >
                  <div className="space-y-5">{detailFields}</div>
                </motion.div>
              ) : (
                <motion.div key="detail-fields" variants={listItem} className="space-y-5">
                  {detailFields}
                </motion.div>
              )
            )}

            {/* When + duration + area — ONE quiet "logistics" card, two lines
                (they were two separate rows). ASAP · Galway is what almost
                everyone wants, so both lines start collapsed and unfold their
                options in place when tapped. Fewer decisions up front = a
                faster booking. */}
            <motion.div variants={listItem} className="rounded-xl border border-border bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setShowWhen(s => !s)}
                aria-expanded={showWhen}
                className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-secondary/40"
              >
                <span className="flex items-center gap-2 text-sm text-foreground min-w-0">
                  <Clock className="w-4 h-4 flex-shrink-0 text-foreground/50" aria-hidden="true" />
                  <span className="font-semibold">{when === 'Now' ? 'ASAP' : when}</span>
                  {sizeText && <span className="text-muted-foreground truncate">· {sizeText}</span>}
                </span>
                <span className="text-[13px] font-semibold text-sage-dark flex-shrink-0">{showWhen ? 'Done' : 'Change'}</span>
              </button>

              <AnimatePresence initial={false}>
                {showWhen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: SHEET_EASE }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-3.5">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-foreground/50 mb-2.5">When?</p>
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
                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-foreground/50 mb-2.5">
                            {cat.sizeLabel ?? 'How long?'}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {/* The builder can set a quarter-hour size ('1.75
                                hours') that isn't a standard chip — inject it
                                in duration order so the selection is always
                                visible and tappable. The chip READS in words
                                ("1 hr 45 min"); the value stays the numeric
                                label the price tables are keyed on. */}
                            {(size && !cat.sizes.includes(size)
                              ? [...cat.sizes, size].sort((a, b) => (hoursFromSizeLabel(a) ?? 99) - (hoursFromSizeLabel(b) ?? 99))
                              : cat.sizes
                            ).map(opt => (
                              <Chip key={opt} group="size" active={size === opt} onClick={() => setSize(opt)}>
                                {durationText(opt)}
                              </Chip>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="border-t border-border/60" aria-hidden="true" />

              {/* Area — auto-detected from the address; chips unfold as fallback
                  (one tap now, whether or not the geocoder filled it) */}
              <button
                type="button"
                onClick={() => setShowArea(s => !s)}
                aria-expanded={showArea}
                className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-secondary/40"
              >
                <span className="flex items-center gap-2 text-sm text-foreground min-w-0">
                  <MapPin className="w-4 h-4 flex-shrink-0 text-foreground/50" aria-hidden="true" />
                  <span className="font-semibold">{city}</span>
                  <span className="text-muted-foreground text-xs truncate">· {cityAuto ? 'from your address' : 'your area'}</span>
                </span>
                <span className="text-[13px] font-semibold text-sage-dark flex-shrink-0">{showArea ? 'Done' : 'Change'}</span>
              </button>

              <AnimatePresence initial={false}>
                {showArea && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: SHEET_EASE }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-wrap gap-2 px-4 pb-3.5">
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
                          // A manual pick overrides the geocoder — clear the
                          // "from your address" claim so the row stays honest.
                          <Chip key={c} group="area" active={city === c} onClick={() => { setCity(c); setCityAuto(false); }}>
                            {c}
                          </Chip>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* The open question — one quiet dashed line; unfolds a small box
                whose text rides the note to dispatch + the helper's job
                screen. Stays open once it holds text. */}
            <motion.div variants={listItem}>
              {!showNoteField && !customerNote.trim() ? (
                <button
                  type="button"
                  onClick={() => setShowNoteField(true)}
                  className="w-full rounded-xl border border-dashed border-border bg-white px-4 py-3 text-left text-sm font-semibold text-foreground/60 hover:text-foreground hover:border-sage/50 transition-colors"
                >
                  + Add a note for your helper{' '}
                  <span className="font-normal text-muted-foreground">— gate code, parking, your dog's name…</span>
                </button>
              ) : (
                <div className="rounded-xl border border-border bg-white px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-foreground/50 mb-2">
                    Anything your helper should know?
                  </p>
                  <textarea
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    maxLength={240}
                    rows={2}
                    autoFocus
                    placeholder="e.g. Gate code 1234 · park on the street · Luna is friendly"
                    aria-label="Anything your helper should know?"
                    className="w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-base sm:text-[15px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  />
                </div>
              )}
            </motion.div>

            </div>

            <div className="space-y-5">
            {/* Checkout (redesigned 2026-07-30, owner ask: "make it look like
                Deliveroo — simple, colour-coded, less AI-generated"). Three
                beats, in the order a person actually decides:
                  1. HOW you'll pay — chosen first, so the total never changes
                     under you after you've read it (it used to);
                  2. the RECEIPT — a till-receipt card in three bands, with the
                     two pots colour-coded (sage = your helper's money, navy =
                     VANO's fee) because "who gets this?" is the question this
                     pricing model always raises;
                  3. the TOTAL — one big number on a tinted footer.
                The explanatory paragraphs that used to sit here are gone: the
                colour coding and the one-line reassurance under the total say
                the same thing without a wall of text. */}
            <motion.div variants={listItem} className="space-y-3 pt-1">
              {/* ── HOW YOU'LL PAY ───────────────────────────────────
                  Deliveroo's lesson: decide the payment method FIRST, then
                  read the receipt. This used to sit BELOW the numbers, so
                  the total changed under you after you'd already read it.
                  Two cards, colour-coded — sage (the trust colour) for the
                  selected one, and the wallet names spelled out because
                  "Apple Pay" is the single biggest reassurance on a phone. */}
              {CARD_PAY_OFFERED && priceCents && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    How you'll pay
                  </p>
                  <div role="radiogroup" aria-label="How you'll pay" className="grid grid-cols-2 gap-2">
                    {([
                      { mode: 'card' as const,   title: 'By card',        sub: 'Apple Pay · Google Pay · Card', foot: 'Nothing on the day' },
                      { mode: 'direct' as const, title: 'Pay them',      sub: 'Revolut or cash',              foot: 'On the day, in person' },
                    ]).map((o) => {
                      const on = payMode === o.mode;
                      return (
                        <button
                          key={o.mode}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => { setPayMode(o.mode); haptic(8); }}
                          className={cn(
                            'relative rounded-2xl border-2 px-3.5 py-3 text-left',
                            'transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.97]',
                            on ? 'border-sage bg-sage-light' : 'border-border bg-white hover:border-foreground/20',
                          )}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className={cn(
                              'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150',
                              on ? 'border-sage bg-sage' : 'border-foreground/25 bg-white',
                            )} aria-hidden="true">
                              {on && <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />}
                            </span>
                            <span className="text-[15px] font-bold text-foreground">{o.title}</span>
                          </span>
                          <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{o.sub}</span>
                          <span className={cn('mt-0.5 block text-[11px] font-semibold', on ? 'text-sage-dark' : 'text-muted-foreground')}>{o.foot}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── THE RECEIPT ──────────────────────────────────────
                  One card, three bands, read top to bottom like a till
                  receipt: what your helper gets · what VANO charges ·
                  the total. The two pots are COLOUR-CODED (sage dot =
                  the student's money, navy dot = VANO's fee) because
                  "who is this money going to" is the single question
                  customers ask about this pricing model. */}
              {priceCents && jobTotalCents != null && (
                <div className="overflow-hidden rounded-2xl border border-border bg-white">
                  {/* Band 1 — the helper's money */}
                  <div className="px-4 pt-3.5 pb-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[15px] font-semibold text-foreground">
                        {cat.label}{sizeText ? ` · ${sizeText}` : ''}
                      </span>
                      <AnimatedPrice cents={priceCents} className="flex-shrink-0 text-[15px] font-bold text-foreground" />
                    </div>
                    {kitCents > 0 && (
                      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[13px] text-muted-foreground">
                        <span className="min-w-0 truncate">Helper brings {kitLabel(kit).toLowerCase()}</span>
                        <span className="flex-shrink-0 font-semibold text-foreground">+{fmt(kitCents)}</span>
                      </div>
                    )}
                    {suppliesCents > 0 && (
                      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="text-muted-foreground">Helper brings products</span>
                        <span className="flex-shrink-0 font-semibold text-foreground">+{fmt(suppliesCents)}</span>
                      </div>
                    )}
                    {travelCents > 0 && (
                      <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="text-muted-foreground">Travel to you</span>
                        <span className="flex-shrink-0 font-semibold text-foreground">+{fmt(travelCents)}</span>
                      </div>
                    )}
                    <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-sage-dark">
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-sage" aria-hidden="true" />
                      {fmt(jobTotalCents)} to your helper — they keep 100%
                    </p>
                  </div>

                  {/* Band 2 — what VANO charges */}
                  <div className="border-t border-border/70 px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-navy/45" aria-hidden="true" />
                        VANO booking fee
                      </span>
                      <AnimatedPrice cents={computeVanoFeeCents(priceCents)} className="flex-shrink-0 text-[13px] font-semibold text-foreground" />
                    </div>
                    <AnimatePresence initial={false}>
                      {coverOpted && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18, ease: SHEET_EASE }}
                          className="overflow-hidden"
                        >
                          <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-navy/45" aria-hidden="true" />
                              Vano Cover
                            </span>
                            <span className="flex-shrink-0 font-semibold text-foreground">+{fmt(VANO_COVER_CENTS)}</span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Band 3 — the total, the one number people look for */}
                  <div className="flex items-center justify-between gap-3 border-t border-border/70 bg-secondary/40 px-4 py-3.5">
                    <span className="text-[13px] font-semibold text-foreground/80">
                      {payMode === 'card' ? 'Card total on accept' : 'Card today'}
                    </span>
                    <AnimatedPrice
                      announce
                      cents={(payMode === 'card' ? jobTotalCents : 0) + computeVanoFeeCents(priceCents) + (coverOpted ? VANO_COVER_CENTS : 0)}
                      className="flex-shrink-0 text-2xl font-extrabold text-foreground"
                    />
                  </div>
                </div>
              )}

              {/* One line, and deliberately NOT "you only pay when a helper
                  says yes" — the docked bar already says that, and repeating
                  it is exactly the padding that makes a checkout read as
                  generated. This says the thing the bar doesn't. */}
              {priceCents && (
                <p className="flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 text-sage" aria-hidden="true" />
                  {payMode === 'card'
                    ? 'Apple Pay, Google Pay or card · secured by Stripe'
                    : "Only VANO's fee goes on your card — the rest is cash or Revolut"}
                </p>
              )}

              {/* Vano Cover — a compact ADD row, not a third competing card.
                  It only earns full weight once it's on (the amount then
                  appears in the receipt above). */}
              {priceCents && (
                <button
                  type="button"
                  onClick={() => { setCoverOpted(v => !v); haptic(8); }}
                  aria-pressed={coverOpted}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left',
                    'transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.98]',
                    coverOpted ? 'border-sage bg-sage-light' : 'border-dashed border-border bg-white hover:border-foreground/25',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150',
                      coverOpted ? 'border-sage bg-sage' : 'border-foreground/25 bg-white',
                    )}
                  >
                    <AnimatePresence initial={false}>
                      {coverOpted && (
                        <motion.span
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.6, opacity: 0 }}
                          transition={{ type: 'spring', duration: 0.3, bounce: 0.2 }}
                          className="inline-flex"
                        >
                          <Check className="h-3.5 w-3.5 text-white" strokeWidth={3.5} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] leading-snug text-foreground">
                    <span className="font-semibold">Add Vano Cover</span>
                    <span className="text-muted-foreground"> — accidental damage up to €250</span>
                  </span>
                  <span className="flex-shrink-0 text-[13px] font-bold text-sage-dark">+{fmt(VANO_COVER_CENTS)}</span>
                </button>
              )}

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
                    className="w-full rounded-full gap-2 h-10 font-medium text-sm border-[#25D366]/40 text-[#25D366] hover:bg-[#25D366]/[0.06]"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Or book via WhatsApp
                  </Button>
                </motion.div>
              )}
            </motion.div>

            </div>
            </div>

            {/* The one shared foot-of-sheet note (single column now, so one
                copy). Plain reassurance + the contract moment: the Terms must
                be incorporated at the point of sale, not just linked in the
                footer. */}
            <motion.div variants={listItem} className="sm:max-w-lg sm:mx-auto space-y-2 pt-1">
              <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
                {payMode === 'card'
                  ? 'Nothing is charged until a helper accepts — then one card payment covers the job and the small VANO fee. Your helper keeps 100% of the job price.'
                  : 'Booking only reserves the small VANO fee. You pay your helper directly (Revolut or cash) once the job\'s done.'}
              </p>
              <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
                By tapping Book you agree to VANO's{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground/70 underline underline-offset-2 hover:text-foreground transition-colors">Terms</a>
                {' '}— your helper is an independent person you pay directly, and{' '}
                <a href="/cover" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground/70 underline underline-offset-2 hover:text-foreground transition-colors">Vano Cover</a>
                {' '}is there if you add it.
              </p>
              {/* The {COOLING_OFF_DAYS}-day distance-selling right (SI 484/2013). Same-day
                  help is "fully performed" long before it expires, but the right
                  is only extinguished where the customer EXPRESSLY asked for
                  immediate performance AND acknowledged losing it. Tapping Book
                  is that express request; this sentence is the acknowledgement,
                  and checkout stamps it onto the booking as evidence. Plain
                  words on purpose — a right buried in legalese isn't informed
                  consent, and the free-cancel-before-they-start half is
                  genuinely good news worth reading. */}
              <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
                {IMMEDIATE_PERFORMANCE_CONSENT_TEXT}{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground/70 underline underline-offset-2 hover:text-foreground transition-colors">
                  Your {COOLING_OFF_DAYS}-day right
                </a>
              </p>
            </motion.div>
          </motion.form>
          )}
          </AnimatePresence>
        </div>

        {/* Docked action bar — Uber-style: risk-reversal + Book never scroll
            away, always thumb-reachable, and stay on screen while the keyboard
            is up. The button submits the form above via its form= attribute.
            Hidden on wizard page 1 — there's nothing to book yet. Rises in
            with the form page (initial={false}: when the sheet opens directly
            on the form it rides the sheet's own slide instead). */}
        <AnimatePresence initial={false}>
        {step === 'form' && (
        <motion.div
          key="docked-bar"
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1, transition: { duration: 0.32, ease: SHEET_EASE, delay: 0.12 } }}
          exit={{ y: 14, opacity: 0, transition: { duration: 0.15, ease: 'easeOut' } }}
          className="flex-shrink-0 border-t border-border/50 bg-cream px-5 pt-3 pb-4 space-y-2 shadow-[0_-12px_28px_-18px_hsl(var(--shadow-color)/0.28)]">
          {/* Risk-reversal at the decision point — the single most reassuring
              fact (you don't pay until a helper accepts) rides with the CTA.
              Swaps to the success line during the booked beat. */}
          <p className="flex items-center justify-center gap-1.5 text-xs sm:text-[13px] font-semibold text-sage-dark">
            <motion.span
              key={bookedOk ? 'assure-booked' : securing ? 'assure-securing' : 'assure-ready'}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0"
            >
              <ShieldCheck className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              {bookedOk
                ? 'Booked — taking you to live tracking…'
                : securing
                ? 'Opening the secure card step…'
                : <>
                    {/* Two nowrap phrases: a narrow screen breaks at the
                        separator, never mid-word ("money-/back"). */}
                    <span className="whitespace-nowrap">You only pay when a helper says yes</span>
                    <span className="whitespace-nowrap">· money-back guarantee</span>
                  </>}
            </motion.span>
          </p>

          <motion.div
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={cn(
              // Capped on desktop — a pill stretched across the whole
              // two-column sheet reads as a banner, not a button.
              'relative overflow-hidden rounded-full transition-shadow duration-300 sm:max-w-[480px] sm:mx-auto',
              // The glow only lights up once the form is genuinely ready to
              // submit (valid phone + an address), so it's a truthful "ready"
              // cue rather than lighting up on the first digit.
              phoneValid && addressValid && !loading ? 'shadow-primary-glow' : '',
            )}
          >
            <Button
              type="submit"
              form="quick-book-form"
              // No `!phone.trim()` here: a disabled-but-fully-lit button
              // silently swallowed the tap. Enabled, the tap runs handleBook's
              // validation, which scrolls to + highlights the missing field.
              disabled={loading || bookedOk || securing}
              className="w-full rounded-full gap-2 font-semibold text-base h-[52px] tabular-nums bg-primary hover:bg-primary disabled:opacity-100"
            >
              {/* Keyed on the state so ready → booking → booked crossfades
                  instead of the label snapping at the highest-anxiety moment. */}
              <motion.span
                key={bookedOk ? 'cta-booked' : securing ? 'cta-securing' : loading ? 'cta-loading' : 'cta-ready'}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="inline-flex items-center gap-2"
              >
                {bookedOk
                  ? <>
                      <motion.span
                        className="inline-flex"
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                      >
                        <Check className="w-5 h-5" strokeWidth={3} />
                      </motion.span>
                      Booked
                    </>
                  : securing
                  ? <>
                      <motion.span
                        className="inline-flex"
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                      >
                        <ShieldCheck className="w-5 h-5" strokeWidth={2.5} />
                      </motion.span>
                      Sending your booking…
                    </>
                  : loading
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
              </motion.span>
            </Button>
            {/* Occasional light sweep so the primary action feels alive —
                only once the form is actually ready to submit */}
            {!loading && !securing && !bookedOk && phoneValid && addressValid && (
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                initial={{ x: '-150%' }}
                animate={{ x: '450%' }}
                transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
              />
            )}
          </motion.div>

          {/* Error + recovery unfold gently — the bar growing in a snap is a
              jolt at exactly the moment the customer needs calm. */}
          <AnimatePresence initial={false}>
            {error && (
              <motion.p
                key="submit-error"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="text-center text-xs text-destructive overflow-hidden"
              >
                {error}
              </motion.p>
            )}

            {/* A failed checkout call must never be a dead end — flip the
                WhatsApp fallback into the primary recovery action, right here in
                the docked bar, with the typed details riding along. */}
            {submitFailed && (
              <motion.div
                key="submit-recover"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.26, ease: SHEET_EASE }}
                className="space-y-2 overflow-hidden"
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        )}
        </AnimatePresence>
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
    // The priced extra (the dog answer) rides the rebook so the chip's price
    // is what checkout will actually charge — gated on lastCategory because
    // memory saves merge and a stale extra can outlive a category switch.
    const memExtra = cat.slug === 'dog-walk' && typeof mem.lastExtra === 'string' && mem.lastExtra
      ? mem.lastExtra
      : undefined;
    const cents = getPriceCents(cat.slug, memSize ?? DEFAULT_SIZE[cat.slug] ?? '', memExtra);
    return { cat, size: memSize, extra: memExtra, price: cents ? fmt(cents) : null };
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
      <div id="category-grid" aria-label="What do you need help with?" className="relative mx-auto w-full max-w-xl sm:max-w-5xl lg:max-w-6xl scroll-mt-24">
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
            onClick={() => { haptic(10); track('hero_usual_tap', { category: usual.cat.slug }); openSheet(usual.cat, { size: usual.size, note: usual.extra, extraLabel: usual.extra, direct: true }); }}
            // Compact by design (owner call 2026-07-24): a quiet one-line chip.
            // The five tiles are the front door — the usual is a shortcut, not
            // a second hero card competing with them.
            className="tile-float mb-2.5 sm:mb-3 mx-auto flex w-fit max-w-full items-center gap-2 rounded-full border border-gold/50 bg-white pl-3 pr-3.5 py-2 text-left ring-1 ring-gold/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <span className="text-lg leading-none flex-shrink-0" aria-hidden="true">{usual.cat.emoji}</span>
            <span className="min-w-0 truncate text-[13px] sm:text-sm font-bold text-foreground">
              Book your usual · {usual.cat.label}{usual.size ? ` · ${usual.size}` : ''}{usual.price ? ` · ${usual.price}` : ''}
            </span>
            <span className="text-gold text-base font-bold leading-none flex-shrink-0" aria-hidden="true">↻</span>
          </motion.button>
        )}
        <motion.div
          role="group"
          aria-label="Book a service in one tap"
          // Phones: a clean 2×2 — four tiles, each half-width and easier to
          // tap. Desktop: ONE Airbnb-style row of four, so the whole hero
          // fits a laptop viewport with no scrolling.
          className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 lg:gap-4"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } } }}
        >
          {/* The FOUR household tiles — the whole front door. Business was
              parked 2026-07-24 (B2B test ended); MOVING was parked the same
              day (owner call: liability triage — heavy items + no
              goods-in-transit/injury cover is the same class of risk that
              retired 'midnight-lift' and 'plumbing'; small carries still
              book via the custom catalogue at €22/hr). Machinery for both
              stays in CATEGORIES for old deep links + in-flight bookings. */}
          {CATEGORIES.filter((c) => c.slug !== 'business' && c.slug !== 'moving').map((c) => {
            return (
              <motion.button
                key={c.slug}
                type="button"
                variants={{ hidden: { opacity: 0, y: 12, scale: 0.95 }, show: { opacity: 1, y: 0, scale: 1 } }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                onClick={() => { haptic(10); track('hero_tile_tap', { category: c.slug }); openSheet(c); }}
                aria-label={`Book ${c.label}`}
                // Owner call (2026-07-24): tiles carry ONLY pic + name — the
                // "from €X" price tags came OFF the front door ("so we don't
                // scare them off"). Price now reveals inside the sheet once
                // they're engaged: builder ticks build it up, the form card
                // shows the full maths. Don't re-add prices here without the
                // owner. The job description (cat.hint) lives in the booking
                // sheet header, not here.
                // Desktop (lg:) sizes run a step bigger than the usual scale on
                // purpose — the paying customer skews 35+ and the tiles are the
                // whole front door, so they must read from armchair distance.
                className="tile-float relative flex flex-col items-center justify-center gap-0.5 sm:gap-1 rounded-2xl lg:rounded-3xl border border-black/5 bg-white px-1.5 py-3 sm:px-2 sm:py-6 lg:py-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                {/* Cleaning wears the same "Most booked" crown as the podium */}
                {c.slug === 'cleaning' && (
                  <span className="absolute -top-2 sm:-top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gold px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wide text-navy whitespace-nowrap shadow-sm">
                    Most booked
                  </span>
                )}
                <span className="text-3xl sm:text-4xl lg:text-5xl leading-none select-none" aria-hidden="true">{c.emoji}</span>
                <span className="mt-1.5 sm:mt-2 text-sm sm:text-lg lg:text-xl font-bold text-foreground leading-tight">{c.label}</span>
              </motion.button>
            );
          })}
          {/* The navy BUSINESS (temp-staff) 6th tile is PARKED (owner call
              2026-07-24: households only — five tiles, less to think about;
              the one-day B2B test ended). Like CUSTOM_TILE, the machinery
              stays: the category + its sub-picker live on in CATEGORIES so
              old deep links and in-flight bookings keep working. Remount by
              rendering a navy tile for CATEGORIES 'business' here. */}
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
