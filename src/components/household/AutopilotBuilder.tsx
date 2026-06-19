import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, CreditCard, MessageCircle, Sparkles, X, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { teamWhatsAppHref } from '@/lib/contact';
import { loadBookingMemory } from '@/lib/bookingMemory';
import { BottomSheet } from '@/components/household/BottomSheet';
import { haptic } from '@/lib/haptics';
import { microCelebrate } from '@/lib/celebrate';

/**
 * "Put your house on autopilot" — Airbnb-style builder and the site's
 * flagship offer. One toggle (ongoing vs while-you're-away), tick the
 * jobs you want, watch the price build. Ongoing is billed weekly
 * (flexible, cancel anytime) or monthly (saves ~10% vs week-by-week).
 * Prices here are display only — the create-autopilot-checkout function
 * recomputes everything server-side.
 */

type Mode = 'ongoing' | 'away';
type Billing = 'weekly' | 'monthly';
// How the student gets in while the customer is away. Lockbox is the default
// and the whole point of the trust story: the key never leaves the home, the
// student just gets a code for the trip — so Vano never holds a key.
type AccessMethod = 'lockbox' | 'home' | 'smartlock';

interface Service {
  key: string;
  emoji: string;
  label: string;
  /** Capped visit time in minutes. Every service has one, and
   *  autopilotPayMath.test.ts guarantees the price still pays the helper at
   *  least minimum wage for that time — even at the cheapest (monthly+bundle). */
  mins: number;
  monthlyCents: number;
  weeklyCents: number;
}

// Subset of create-autopilot-checkout's catalogue — keep prices in sync.
// Weekly ≈ monthly pro-rata + ~10%, so monthly reads as "commit and save".
//
// Each price must pay a helper above the Irish minimum wage (€14.15/hr,
// 2026) on BOTH billing modes, with margin left for Vano. Two kinds:
//   • TIME-BASED — scoped by the clock: cleaning (90-min refresh) and
//     dog (30-min walk). Keep the stated time or re-price.
//   • JOB-BASED — one flat price for the task done: laundry, garden,
//     bins, plants. Sized for a SMALL weekly job (~10–45 min); if a job
//     balloons it's a separate one-off booking, not this plan.
// Monthly is ~10% cheaper per week, so it's the binding case — e.g.
// cleaning €119/mo = €27.46/wk ÷ 1.5h = €18.31/hr; the small job-based
// tasks net ~€18–24/hr at their typical times.
const SERVICES: Service[] = [
  { key: 'cleaning', emoji: '🧽', label: 'Cleaning',          mins: 90, monthlyCents: 11900, weeklyCents: 3000 },
  { key: 'laundry',  emoji: '🧺', label: 'Laundry & ironing', mins: 45, monthlyCents: 5900,  weeklyCents: 1500 },
  { key: 'garden',   emoji: '🌿', label: 'Garden & lawn',     mins: 45, monthlyCents: 5900,  weeklyCents: 1500 },
  { key: 'dog',      emoji: '🐕', label: 'Dog walks',         mins: 30, monthlyCents: 4500,  weeklyCents: 1200 },
  { key: 'bins',     emoji: '🗑️', label: 'Bins & house check', mins: 10, monthlyCents: 1900,  weeklyCents: 500 },
  { key: 'plants',   emoji: '🪴', label: 'Plants & post',     mins: 10, monthlyCents: 1500,  weeklyCents: 400 },
];

// The most popular ongoing setup — pre-ticked so the price (and bundle
// discount) is alive the moment the section scrolls into view.
const DEFAULT_PICKED = ['cleaning', 'laundry', 'garden', 'bins'];

const BUNDLE_MIN = 3;

// Away-cover entry options. Lockbox first — it's the recommended, lowest-fuss
// and most reassuring path (the customer keeps their key; nothing for Vano to
// hold or insure). The server mirrors these and defaults to lockbox.
const ACCESS: { key: AccessMethod; emoji: string; label: string; sub: string }[] = [
  { key: 'lockbox',   emoji: '🔑', label: 'Lockbox by your door', sub: 'We fit one free · your key never leaves home' },
  { key: 'home',      emoji: '🏠', label: "I'll be home",          sub: 'Let the student in on the first visit' },
  { key: 'smartlock', emoji: '📲', label: 'Smart-lock code',       sub: 'Share a temporary entry code' },
];

function euro(cents: number): string {
  return (cents / 100) % 1 === 0 ? `€${cents / 100}` : `€${(cents / 100).toFixed(2)}`;
}

function isoPlusDays(days: number): string {
  const d = new Date(Date.now() + days * 86400_000);
  return d.toISOString().slice(0, 10);
}

// Roll a cents value to a new target so the headline price feels alive when
// services are ticked. Snaps instantly when the user prefers reduced motion.
function useAnimatedCents(target: number): number {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      fromRef.current = target;
      setVal(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / 350, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (target - from) * eased);
      setVal(v);
      fromRef.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return val;
}

export const AutopilotBuilder: React.FC = () => {
  const remembered = useMemo(() => loadBookingMemory(), []);
  const [mode, setMode] = useState<Mode>('ongoing');
  // Weekly first — the smaller ask is the whole point of the cadence choice;
  // the monthly toggle wears the "save €X" badge to earn the switch.
  const [billing, setBilling] = useState<Billing>('weekly');
  const [selected, setSelected] = useState<string[]>(DEFAULT_PICKED);
  const [startDate, setStartDate] = useState(isoPlusDays(2));
  const [endDate, setEndDate] = useState(isoPlusDays(9));
  // Away-cover only. Lockbox by default — the frictionless, no-key-held path.
  const [access, setAccess] = useState<AccessMethod>('lockbox');

  // Mobile is a 2-step flow so each screen breathes: step 1 = mode + services,
  // step 2 = when/how + price. Desktop (lg:) shows everything at once, so `step`
  // only gates visibility on small screens.
  const [step, setStep] = useState<1 | 2>(1);
  const rootRef = useRef<HTMLDivElement>(null);
  const goStep = (s: 1 | 2) => {
    setStep(s);
    // Keep the top of the builder in view as the step swaps.
    requestAnimationFrame(() => {
      const top = rootRef.current?.getBoundingClientRect().top;
      if (typeof top === 'number') window.scrollBy({ top: top - 88, behavior: 'smooth' });
    });
  };

  // Checkout
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(remembered?.phone ?? '');
  const [city, setCity] = useState(remembered?.city ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const weeks = useMemo(() => {
    if (mode !== 'away') return 0;
    const ms = +new Date(endDate) - +new Date(startDate);
    if (isNaN(ms) || ms <= 0) return 1;
    return Math.min(12, Math.max(1, Math.ceil(ms / (7 * 86400_000))));
  }, [mode, startDate, endDate]);

  const bundled = selected.length >= BUNDLE_MIN;
  // Same rounding as the server so the displayed figure matches checkout
  const finalise = (cents: number) => Math.round((bundled ? cents * 0.9 : cents) / 50) * 50;
  const sumBy = (pick: (s: Service) => number) =>
    selected.reduce((sum, k) => sum + pick(SERVICES.find((x) => x.key === k)!), 0);

  // Both cadence totals are always live: one is the price, the other powers
  // the "save €X" badge on the monthly toggle.
  const weeklyTotalCents = finalise(sumBy((s) => s.weeklyCents));
  const monthlyTotalCents = finalise(sumBy((s) => s.monthlyCents));
  const totalCents = mode === 'away'
    ? finalise(sumBy((s) => s.weeklyCents) * weeks)
    : billing === 'weekly' ? weeklyTotalCents : monthlyTotalCents;
  // Pre-discount subtotal + the exact € the bundle takes off, so the on-screen
  // breakdown always sums perfectly: subtotal − discount = total.
  const rawSubtotalCents = mode === 'away'
    ? sumBy((s) => s.weeklyCents) * weeks
    : billing === 'weekly' ? sumBy((s) => s.weeklyCents) : sumBy((s) => s.monthlyCents);
  const discountCents = Math.max(0, rawSubtotalCents - totalCents);
  // What a month of week-by-week billing costs over paying monthly — whole €
  const monthlySavesCents = Math.max(
    0,
    Math.round(((weeklyTotalCents * 52) / 12 - monthlyTotalCents) / 100) * 100,
  );
  // The friendly anchor: visits are weekly, but a per-day figure is the
  // softest honest way to read the price. Rounded to whole euros — the
  // "≈"/"about" copy covers the rounding.
  const perDayCents = billing === 'weekly'
    ? Math.round((totalCents * 52) / 365 / 100) * 100
    : Math.round((totalCents * 12) / 365 / 100) * 100;
  // Roll the headline per-day figure to its new value as services are ticked
  // (whole-euro steps so it reads as a clean counter, not flickering cents).
  const animPerDayCents = useAnimatedCents(perDayCents);
  // Tiny picks (plants alone) round below €1/day — "<€1" beats showing €0
  const perDayLabel = animPerDayCents === 0 ? '<€1' : euro(Math.round(animPerDayCents / 100) * 100);

  // Pop a little confetti the moment the 3+ service bundle discount unlocks.
  const prevBundledRef = useRef(bundled);
  useEffect(() => {
    if (bundled && !prevBundledRef.current) microCelebrate();
    prevBundledRef.current = bundled;
  }, [bundled]);

  function toggle(key: string) {
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || selected.length === 0 || loading) return;
    setLoading(true); setError(null);
    haptic(12);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('create-autopilot-checkout', {
        body: {
          mode,
          ...(mode === 'ongoing' ? { billing } : {}),
          services: selected,
          start_date: startDate,
          ...(mode === 'away' ? { end_date: endDate, access_method: access } : {}),
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          ...(city.trim() ? { city: city.trim() } : {}),
        },
      });
      const payload = data as { checkout_url?: string; total_cents?: number; error?: string } | null;
      if (fnErr || !payload?.checkout_url) {
        throw new Error(payload?.error || fnErr?.message || 'Something went wrong.');
      }
      // Never send anyone to a checkout that doesn't match the price on
      // screen (e.g. this tab predates a price change on the server).
      if (typeof payload.total_cents === 'number' && payload.total_cents !== totalCents) {
        throw new Error('Our prices were just updated — refresh the page and try again.');
      }
      window.location.href = payload.checkout_url;
    } catch (err: unknown) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Something went wrong — try again or WhatsApp us.');
    }
  }

  const waText = `Hi VANO! 👋 I'm setting up house autopilot (${selected.join(', ') || 'no services yet'}) and have a question.`;

  return (
    <div ref={rootRef} className="max-w-md lg:max-w-4xl mx-auto">
      <div className="rounded-3xl border border-border/60 bg-white shadow-sm overflow-hidden lg:grid lg:grid-cols-[1fr,340px]">
        {/* Left column — configure: pick mode, tick the jobs, set the dates */}
        <div className="lg:border-r lg:border-border/50">
        {/* Mode toggle — step 1 on mobile (the only decision above the ticks) */}
        <div className={cn('p-1.5 m-4 mb-0 rounded-full bg-secondary/80', step === 1 ? 'flex' : 'hidden', 'lg:flex')}>
          {([['ongoing', '🏠 Ongoing'], ['away', "✈️ While I'm away"]] as [Mode, string][]).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'relative flex-1 h-11 rounded-full text-sm font-semibold transition-colors duration-200',
                mode === m ? 'text-foreground' : 'text-foreground/50',
              )}
            >
              {mode === m && (
                <motion.span
                  layoutId="autopilot-mode-pill"
                  className="absolute inset-0 rounded-full bg-white shadow-sm"
                  transition={{ type: 'spring', stiffness: 520, damping: 36, mass: 0.7 }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>

        {/* Service ticks — step 1 on mobile. Full rows so the visit time AND the
            price both show; on desktop it's the same list in the left column. */}
        <div className={cn('p-4 space-y-2', step === 1 ? 'block' : 'hidden', 'lg:block')}>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 px-1 pb-1">
            Tick what you want done
          </p>
          {SERVICES.map((s) => {
            const on = selected.includes(s.key);
            return (
              <motion.button
                key={s.key}
                type="button"
                onClick={() => toggle(s.key)}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  'w-full flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-[background-color,border-color,box-shadow] duration-150',
                  on ? 'border-sage bg-sage-light shadow-sm' : 'border-border/60 bg-white hover:border-foreground/25 hover:shadow-sm',
                )}
              >
                <span className={cn(
                  'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors duration-150',
                  on ? 'bg-sage border-sage' : 'border-border bg-white',
                )}>
                  <AnimatePresence>
                    {on && (
                      <motion.span
                        key="check"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 600, damping: 18 }}
                      >
                        <Check size={12} className="text-white" strokeWidth={3.5} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
                <span className="text-lg flex-shrink-0" aria-hidden="true">{s.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{s.label}</span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock size={11} className="flex-shrink-0" aria-hidden="true" />
                    {s.mins} min · weekly
                  </span>
                </span>
                <span className={cn('text-sm font-bold tabular-nums flex-shrink-0', on ? 'text-foreground' : 'text-foreground/40')}>
                  {mode === 'ongoing' && billing === 'monthly' ? `${euro(s.monthlyCents)}/mo` : `${euro(s.weeklyCents)}/wk`}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* Mobile only: advance to the "when & how" step. */}
        <div className={cn('px-4 pb-4', step === 1 ? 'block' : 'hidden', 'lg:hidden')}>
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => { if (selected.length) { haptic(8); goStep(2); } }}
            disabled={selected.length === 0}
            className="w-full h-12 rounded-full bg-foreground text-background text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 transition-opacity"
          >
            Next: when &amp; how →
          </motion.button>
          {selected.length === 0 && (
            <p className="text-center text-[11px] text-muted-foreground mt-2">Pick at least one job to continue</p>
          )}
        </div>

        {/* Mobile only: back to the services step. */}
        <button
          type="button"
          onClick={() => goStep(1)}
          className={cn('px-4 pt-4 pb-1 items-center gap-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors', step === 2 ? 'flex' : 'hidden', 'lg:hidden')}
        >
          ← Back to services
        </button>

        {/* Dates — step 2 on mobile */}
        <div className={cn('px-4 pb-4', step === 2 ? 'block' : 'hidden', 'lg:block')}>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 px-1 pb-2">
            {mode === 'ongoing' ? 'First visit' : 'From → until'}
          </p>
          <div className="flex gap-2">
            <input
              type="date"
              value={startDate}
              min={isoPlusDays(1)}
              onChange={(e) => setStartDate(e.target.value)}
              className="flex-1 h-11 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {mode === 'away' && (
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 h-11 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            )}
          </div>
          {mode === 'away' && (
            <p className="text-[11px] text-muted-foreground mt-1.5 px-1">
              {weeks} week{weeks > 1 ? 's' : ''} of cover · visits spread across your trip
            </p>
          )}
        </div>

        {/* How we get in — only matters for away-cover (nobody's home). Lockbox
            is the default and the trust pitch: the key stays in the customer's
            own box on their property, the student just gets a code for the trip,
            so Vano never takes custody of a key. */}
        {mode === 'away' && (
          <div className={cn('px-4 pb-4', step === 2 ? 'block' : 'hidden', 'lg:block')}>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 px-1 pb-2">
              How we get in
            </p>
            <div className="space-y-2">
              {ACCESS.map((a) => {
                const on = access === a.key;
                return (
                  <motion.button
                    key={a.key}
                    type="button"
                    onClick={() => setAccess(a.key)}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-[background-color,border-color,box-shadow] duration-150',
                      on ? 'border-sage bg-sage-light shadow-sm' : 'border-border/60 bg-white hover:border-foreground/25 hover:shadow-sm',
                    )}
                  >
                    <span className="text-lg flex-shrink-0" aria-hidden="true">{a.emoji}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{a.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{a.sub}</span>
                    </span>
                    <span className={cn(
                      'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors duration-150',
                      on ? 'border-sage bg-sage' : 'border-border bg-white',
                    )}>
                      <AnimatePresence>
                        {on && (
                          <motion.span
                            key="dot"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={{ type: 'spring', stiffness: 600, damping: 18 }}
                            className="w-1.5 h-1.5 rounded-full bg-white"
                          />
                        )}
                      </AnimatePresence>
                    </span>
                  </motion.button>
                );
              })}
            </div>
            <p className="mt-2 px-1 text-[11px] text-muted-foreground leading-relaxed">
              🔒 <span className="font-semibold text-foreground/70">Your key never leaves your home.</span>{' '}
              {access === 'lockbox'
                ? 'We fit a small lockbox free on the first visit — your student gets a code for the trip that you reset when you’re back.'
                : access === 'home'
                  ? 'You let your student in on the first visit and agree how they’ll get in for the rest.'
                  : 'You share a temporary entry code — no key changes hands at all.'}
            </p>

            {/* Trust block — away-cover is a hard ask (someone in your empty
                home while you're gone), so spell out exactly what they get:
                a student Vano picks, Vano carrying the responsibility, and
                proof on every visit. */}
            <div className="mt-3 rounded-2xl border border-border/50 bg-secondary/40 p-3.5 space-y-2.5">
              {[
                { icon: '🎓', bold: 'We choose your student', rest: 'ID-verified and matched by Vano — you never have to find, vet or chase anyone yourself.' },
                { icon: '🛡️', bold: 'It’s on Vano, not you', rest: 'We take responsibility for every visit. Your home is left exactly as you left it.' },
                { icon: '📸', bold: 'Proof on every visit', rest: 'A photo when the job’s done and the door’s locked — so you can switch off wherever you are.' },
              ].map((t) => (
                <div key={t.bold} className="flex items-start gap-2.5">
                  <span className="text-sm flex-shrink-0 leading-5" aria-hidden="true">{t.icon}</span>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-foreground">{t.bold}.</span> {t.rest}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        </div>

        {/* Right column — running total + CTA. Step 2 on mobile; always shown on
            desktop. Checkout itself slides up in a sheet (below). */}
        <div className={cn('border-t lg:border-t-0 border-border/50 bg-secondary/30 p-4 lg:p-5', step === 2 ? 'block' : 'hidden', 'lg:flex lg:flex-col lg:justify-center')}>
          {/* Cadence — weekly is the no-commitment way in, monthly wears the
              live "save €X" badge so committing earns something visible */}
          {mode === 'ongoing' && (
            <div className="p-1 mb-3 rounded-full bg-secondary/80 flex">
              {(['weekly', 'monthly'] as Billing[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBilling(b)}
                  className={cn(
                    'relative flex-1 h-9 rounded-full text-xs font-semibold transition-colors duration-200 tabular-nums',
                    billing === b ? 'text-foreground' : 'text-foreground/50',
                  )}
                >
                  {billing === b && (
                    <motion.span
                      layoutId="autopilot-billing-pill"
                      className="absolute inset-0 rounded-full bg-white shadow-sm"
                      transition={{ type: 'spring', stiffness: 520, damping: 36, mass: 0.7 }}
                    />
                  )}
                  <span className="relative z-10">
                    {b === 'weekly'
                      ? 'Pay weekly'
                      : monthlySavesCents > 0 ? `Monthly · save ${euro(monthlySavesCents)}` : 'Pay monthly'}
                  </span>
                </button>
              ))}
            </div>
          )}

          <AnimatePresence>
            {bundled && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-[11px] font-semibold text-sage flex items-center gap-1 pb-1"
              >
                <Sparkles size={11} /> Bundle discount applied — 10% off for {BUNDLE_MIN}+ services
              </motion.p>
            )}
          </AnimatePresence>

          <div className="mb-4" aria-live="polite">
            {selected.length === 0 ? (
              <p className="text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground/25 tabular-nums leading-none">—</p>
            ) : (
              <>
                {/* Transparent breakdown — subtotal → bundle discount → total, so
                    the price is never a black box: subtotal − discount = total. */}
                {bundled ? (
                  <>
                    <div className="space-y-1 text-[13px] tabular-nums">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>{selected.length} services{mode === 'away' ? ` · ${weeks} week${weeks > 1 ? 's' : ''}` : ''}</span>
                        <span>{euro(rawSubtotalCents)}{mode === 'away' ? '' : billing === 'weekly' ? '/wk' : '/mo'}</span>
                      </div>
                      <div className="flex items-center justify-between font-medium text-sage">
                        <span>Bundle 10% off · 3+ services</span>
                        <span>−{euro(discountCents)}</span>
                      </div>
                    </div>
                    <div className="my-2.5 border-t border-border/60" />
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground mb-1">
                    {selected.length} service{selected.length > 1 ? 's' : ''}{mode === 'away' ? ` · ${weeks} week${weeks > 1 ? 's' : ''}` : " — that's about"}
                  </p>
                )}

                {mode === 'ongoing' ? (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-3xl font-extrabold tracking-tight text-foreground tabular-nums leading-none">
                        {euro(totalCents)}<span className="text-base font-semibold text-muted-foreground">{billing === 'weekly' ? '/wk' : '/mo'}</span>
                      </p>
                      <p className="text-[12px] text-muted-foreground tabular-nums flex-shrink-0">≈ {perDayLabel}/day</p>
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">billed {billing} · cancel anytime</p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-extrabold tracking-tight text-foreground tabular-nums">
                      {euro(totalCents)}<span className="text-sm font-semibold text-muted-foreground"> total</span>
                    </p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">for {weeks} week{weeks > 1 ? 's' : ''} · cancel anytime</p>
                  </>
                )}
              </>
            )}
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => { haptic(10); setOpen(true); }}
            disabled={selected.length === 0}
            className="w-full h-13 py-3.5 rounded-full bg-foreground text-background text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity tabular-nums"
          >
            <CreditCard size={17} />
            {mode === 'ongoing' ? 'Start my autopilot' : 'Cover my trip'}{selected.length > 0 && (mode === 'ongoing' ? ` · ${perDayLabel}/day` : ` · ${euro(totalCents)}`)}
          </motion.button>

          {/* Risk reversal — visible before they commit */}
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Not happy after your first visit? <span className="font-semibold text-foreground/70">Full refund — no questions.</span>
          </p>

          {/* Lower-commitment off-ramp — a monthly plan is a big first ask, so
              send hesitant visitors back to the one-off booking in the hero */}
          <a
            href="#book"
            className="mt-2 flex items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Not ready for a plan?{' '}
            <span className="font-semibold text-foreground/70 underline underline-offset-2">Book a single visit →</span>
          </a>
        </div>
      </div>

      {/* Checkout slides up from the bottom — keeps the builder uncluttered and
          puts the short form on its own focused screen (fits one mobile view). */}
      <AnimatePresence>
        {open && (
          <BottomSheet onClose={() => { if (!loading) setOpen(false); }} label="Start your autopilot">
            <div className="px-5 pb-5 pt-0.5">
              {/* Header — what you're starting + the price, so context carries in */}
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <h3
                    className="text-xl font-bold text-foreground"
                    style={{ fontFamily: 'Bricolage Grotesque, Plus Jakarta Sans, system-ui, sans-serif' }}
                  >
                    {mode === 'ongoing' ? 'Start your autopilot' : 'Cover your trip'}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {selected.length} service{selected.length > 1 ? 's' : ''} ·{' '}
                    <span className="font-semibold text-foreground tabular-nums">
                      {euro(totalCents)}{mode === 'ongoing' ? (billing === 'weekly' ? '/wk' : '/mo') : ' total'}
                    </span>
                    {mode === 'ongoing' && selected.length > 0 && (
                      <span className="tabular-nums"> · ≈ {perDayLabel}/day</span>
                    )}
                  </p>
                  {mode === 'away' && (
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                      <span aria-hidden="true">{ACCESS.find((a) => a.key === access)?.emoji}</span>
                      {ACCESS.find((a) => a.key === access)?.label}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { if (!loading) setOpen(false); }}
                  className="w-8 h-8 rounded-full bg-foreground/8 flex items-center justify-center hover:bg-foreground/12 transition-colors flex-shrink-0 mt-0.5"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-foreground/60" />
                </button>
              </div>

              {/* No autoFocus — on mobile it pops the keyboard the instant the
                  sheet opens and shoves the Pay button off-screen. Let the whole
                  sheet land first; the user taps a field when ready. */}
              <form onSubmit={handleCheckout} className="space-y-2.5">
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Your name" required autoComplete="name" autoCapitalize="words"
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-base placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-transparent transition-[border-color,box-shadow] duration-150"
                />
                <div>
                  <div className="flex gap-2">
                    <input
                      type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone number" required autoComplete="tel" inputMode="tel" autoCapitalize="off" autoCorrect="off"
                      className="flex-1 min-w-0 rounded-xl border border-border bg-white px-4 py-2.5 text-base placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-transparent transition-[border-color,box-shadow] duration-150"
                    />
                    {/* Eircode pinpoints the home in 7 chars — far better than a
                        vague "area" for a recurring in-home visit, and it fits the
                        checkout's short location field. Sent as `city` (stored as
                        plan_city metadata); the full address is confirmed on the
                        WhatsApp scheduling call. An area name is still accepted so
                        we never block someone who doesn't know their Eircode. */}
                    <input
                      type="text" value={city} onChange={(e) => setCity(e.target.value)}
                      placeholder="Eircode or area" autoCapitalize="off" autoCorrect="off"
                      className="flex-1 min-w-0 rounded-xl border border-border bg-white px-4 py-2.5 text-base placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-transparent transition-[border-color,box-shadow] duration-150"
                    />
                  </div>
                  <p className="mt-1 px-0.5 text-[11px] text-muted-foreground">
                    Eircode helps us find your door — full address confirmed by WhatsApp.
                  </p>
                </div>

                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.97 }}
                  disabled={loading || !name.trim() || !phone.trim()}
                  className="w-full h-12 rounded-full bg-foreground text-background text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity tabular-nums"
                >
                  {loading
                    ? <><Loader2 size={16} className="animate-spin" /> Opening secure checkout…</>
                    : <><CreditCard size={16} /> Pay {euro(totalCents)}{mode === 'ongoing' ? (billing === 'weekly' ? '/wk' : '/mo') : ''}</>}
                </motion.button>

                {error && <p className="text-center text-[12px] text-destructive">{error}</p>}

                <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
                  Secure checkout · cancel anytime · <span className="font-semibold text-foreground/70">full refund after your first visit</span>
                </p>
                <a
                  href={`${teamWhatsAppHref}?text=${encodeURIComponent(waText)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 pt-0.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <MessageCircle size={12} className="text-[#25D366]" /> Questions first? WhatsApp us
                </a>
              </form>
            </div>
          </BottomSheet>
        )}
      </AnimatePresence>
    </div>
  );
};
