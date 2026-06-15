import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, CreditCard, MessageCircle, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { teamWhatsAppHref } from '@/lib/contact';
import { loadBookingMemory } from '@/lib/bookingMemory';
import { BottomSheet } from '@/components/household/BottomSheet';

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

interface Service {
  key: string;
  emoji: string;
  label: string;
  desc: string;
  monthlyCents: number;
  weeklyCents: number;
}

// Subset of create-autopilot-checkout's catalogue — keep prices in sync.
// Weekly ≈ monthly pro-rata + ~10%, so monthly reads as "commit and save".
//
// Each price assumes a CAPPED visit time so it pays a helper above the
// Irish minimum wage (€14.15/hr, 2026) on BOTH billing modes and still
// leaves Vano a margin. Don't lengthen the scope without re-pricing:
//   cleaning 90min · laundry 45min · garden 45min · dog 30min ·
//   bins 15min · plants 10min  →  ~€18–24/hr gross per visit.
// (Monthly is ~10% cheaper per week, so it's the binding constraint:
//  e.g. cleaning €119/mo = €27.46/wk ÷ 1.5h = €18.31/hr.)
const SERVICES: Service[] = [
  { key: 'cleaning', emoji: '🧽', label: 'Cleaning',             desc: '90-min refresh, every week',       monthlyCents: 11900, weeklyCents: 3000 },
  { key: 'laundry',  emoji: '🧺', label: 'Laundry & ironing',    desc: 'Washed, ironed, put away',        monthlyCents: 5900,  weeklyCents: 1500 },
  { key: 'garden',   emoji: '🌿', label: 'Garden & lawn',        desc: 'Kept tidy, week in week out',     monthlyCents: 5900,  weeklyCents: 1500 },
  { key: 'dog',      emoji: '🐕', label: 'Dog walks',            desc: 'A good 30-min walk, every week',  monthlyCents: 4500,  weeklyCents: 1200 },
  { key: 'bins',     emoji: '🗑️', label: 'Bins & house check',   desc: 'Out, back in, quick look around', monthlyCents: 1900,  weeklyCents: 500 },
  { key: 'plants',   emoji: '🪴', label: 'Plants & post',        desc: 'Watered, post cleared',           monthlyCents: 1500,  weeklyCents: 400 },
];

// The most popular ongoing setup — pre-ticked so the price (and bundle
// discount) is alive the moment the section scrolls into view.
const DEFAULT_PICKED = ['cleaning', 'laundry', 'garden', 'bins'];

const BUNDLE_MIN = 3;

function euro(cents: number): string {
  return (cents / 100) % 1 === 0 ? `€${cents / 100}` : `€${(cents / 100).toFixed(2)}`;
}

function isoPlusDays(days: number): string {
  const d = new Date(Date.now() + days * 86400_000);
  return d.toISOString().slice(0, 10);
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
  // Tiny picks (plants alone) round below €1/day — "<€1" beats showing €0
  const perDayLabel = perDayCents === 0 ? '<€1' : euro(perDayCents);

  function toggle(key: string) {
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || selected.length === 0 || loading) return;
    setLoading(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('create-autopilot-checkout', {
        body: {
          mode,
          ...(mode === 'ongoing' ? { billing } : {}),
          services: selected,
          start_date: startDate,
          ...(mode === 'away' ? { end_date: endDate } : {}),
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
    <div className="max-w-md lg:max-w-4xl mx-auto">
      <div className="rounded-3xl border border-border/60 bg-white shadow-sm overflow-hidden lg:grid lg:grid-cols-[1fr,340px]">
        {/* Left column — configure: pick mode, tick the jobs, set the dates */}
        <div className="lg:border-r lg:border-border/50">
        {/* Mode toggle — the only decision above the ticks */}
        <div className="p-1.5 m-4 mb-0 rounded-full bg-secondary/80 flex">
          {([['ongoing', '🏠 Ongoing'], ['away', "✈️ While I'm away"]] as [Mode, string][]).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'flex-1 h-11 rounded-full text-sm font-semibold transition-all duration-200',
                mode === m ? 'bg-white text-foreground shadow-sm' : 'text-foreground/50',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Service ticks */}
        <div className="p-4 space-y-2">
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
                  'w-full flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors duration-150',
                  on ? 'border-sage/50 bg-sage-light' : 'border-border/60 bg-white hover:border-foreground/20',
                )}
              >
                <span className={cn(
                  'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors duration-150',
                  on ? 'bg-sage border-sage' : 'border-border bg-white',
                )}>
                  {on && <Check size={12} className="text-white" strokeWidth={3.5} />}
                </span>
                <span className="text-lg flex-shrink-0" aria-hidden="true">{s.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{s.label}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">{s.desc}</span>
                </span>
                <span className={cn('text-sm font-bold tabular-nums flex-shrink-0', on ? 'text-foreground' : 'text-foreground/40')}>
                  {mode === 'ongoing' && billing === 'monthly' ? `${euro(s.monthlyCents)}/mo` : `${euro(s.weeklyCents)}/wk`}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* Dates */}
        <div className="px-4 pb-4">
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

        </div>

        {/* Right column — running total + CTA. Checkout itself slides up in a
            sheet (below), so this panel stays calm and the price always shows. */}
        <div className="border-t lg:border-t-0 border-border/50 bg-secondary/30 p-4 lg:p-5 lg:flex lg:flex-col lg:justify-center">
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
                    'flex-1 h-9 rounded-full text-xs font-semibold transition-all duration-200 tabular-nums',
                    billing === b ? 'bg-white text-foreground shadow-sm' : 'text-foreground/50',
                  )}
                >
                  {b === 'weekly'
                    ? 'Pay weekly'
                    : monthlySavesCents > 0 ? `Monthly · save ${euro(monthlySavesCents)}` : 'Pay monthly'}
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

          <div className="mb-4">
            {selected.length === 0 ? (
              <p className="text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground/25 tabular-nums leading-none">—</p>
            ) : mode === 'ongoing' ? (
              <>
                <p className="text-[11px] text-muted-foreground">
                  {selected.length} service{selected.length > 1 ? 's' : ''} — that's about
                </p>
                {/* Lead with the per-day: a big total reads as scary, so the
                    friendly unit gets the size. The real total and billing
                    cadence sit right under it — nothing is hidden. */}
                <p className="text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground tabular-nums leading-none">
                  {perDayLabel}<span className="text-lg font-semibold text-muted-foreground">/day</span>
                </p>
                <p className="mt-2 text-[12px] text-muted-foreground tabular-nums">
                  <span className="font-semibold text-foreground/70">
                    {euro(totalCents)}{billing === 'weekly' ? '/wk' : '/mo'}
                  </span>{' '}
                  · billed {billing} · cancel anytime
                </p>
              </>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground">
                  {selected.length} service{selected.length > 1 ? 's' : ''} · {weeks} week{weeks > 1 ? 's' : ''}
                </p>
                <p className="text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground tabular-nums">
                  {euro(totalCents)}<span className="text-sm font-semibold text-muted-foreground"> total</span>
                </p>
              </>
            )}
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => setOpen(true)}
            disabled={selected.length === 0}
            className="w-full h-13 py-3.5 rounded-full bg-foreground text-background text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
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
                  placeholder="Your name" required
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-base placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-transparent transition-[border-color,box-shadow] duration-150"
                />
                <div>
                  <div className="flex gap-2">
                    <input
                      type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone number" required
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
                      placeholder="Eircode or area"
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
                  className="w-full h-12 rounded-full bg-foreground text-background text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
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
