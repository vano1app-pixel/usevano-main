import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, CreditCard, MessageCircle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { teamWhatsAppHref } from '@/lib/contact';
import { loadBookingMemory } from '@/lib/bookingMemory';

/**
 * "Put your house on autopilot" — Airbnb-style builder and the site's
 * flagship offer. One toggle (ongoing monthly vs while-you're-away),
 * tick the jobs you want, watch the price build. Prices here are
 * display only — the create-autopilot-checkout function recomputes
 * everything server-side.
 */

type Mode = 'ongoing' | 'away';

interface Service {
  key: string;
  emoji: string;
  label: string;
  desc: string;
  monthlyCents: number;
  weeklyCents: number;
}

// Subset of create-autopilot-checkout's catalogue — keep prices in sync.
const SERVICES: Service[] = [
  { key: 'cleaning', emoji: '🧽', label: 'Cleaning',             desc: '2-hour visit, every week',        monthlyCents: 11900, weeklyCents: 2800 },
  { key: 'grocery',  emoji: '🛒', label: 'Grocery collection',   desc: 'Order online — we deliver it',    monthlyCents: 4900,  weeklyCents: 1200 },
  { key: 'garden',   emoji: '🌿', label: 'Garden & lawn',        desc: 'Kept tidy, week in week out',     monthlyCents: 5900,  weeklyCents: 1400 },
  { key: 'dog',      emoji: '🐕', label: 'Dog walks',            desc: 'A proper walk, every week',       monthlyCents: 4500,  weeklyCents: 1100 },
  { key: 'bins',     emoji: '🗑️', label: 'Bins & house check',   desc: 'Out, back in, quick look around', monthlyCents: 1900,  weeklyCents: 500 },
  { key: 'plants',   emoji: '🪴', label: 'Plants & post',        desc: 'Watered, post cleared',           monthlyCents: 1500,  weeklyCents: 400 },
];

// The most popular ongoing setup — pre-ticked so the price (and bundle
// discount) is alive the moment the section scrolls into view.
const DEFAULT_PICKED = ['cleaning', 'grocery', 'garden', 'bins'];

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

  const baseCents = selected.reduce((sum, k) => {
    const s = SERVICES.find((x) => x.key === k)!;
    return sum + (mode === 'ongoing' ? s.monthlyCents : s.weeklyCents * weeks);
  }, 0);
  const bundled = selected.length >= BUNDLE_MIN;
  // Same rounding as the server so the displayed figure matches checkout
  const totalCents = Math.round((bundled ? baseCents * 0.9 : baseCents) / 50) * 50;
  // Soften the monthly sticker: visits are weekly, so show the weekly and
  // daily equivalent of whatever's ticked. Rounded to whole euros — the
  // "≈"/"about" copy covers the rounding.
  const perWeekCents = Math.round((totalCents * 12) / 52 / 100) * 100;
  const perDayCents = Math.round((totalCents * 12) / 365 / 100) * 100;

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
          services: selected,
          start_date: startDate,
          ...(mode === 'away' ? { end_date: endDate } : {}),
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          ...(city.trim() ? { city: city.trim() } : {}),
        },
      });
      const url = (data as { checkout_url?: string } | null)?.checkout_url;
      if (fnErr || !url) {
        throw new Error((data as { error?: string } | null)?.error || fnErr?.message || 'Something went wrong.');
      }
      window.location.href = url;
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
          {([['ongoing', '🏠 Ongoing · monthly'], ['away', "✈️ While I'm away"]] as [Mode, string][]).map(([m, label]) => (
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
                  {mode === 'ongoing' ? `${euro(s.monthlyCents)}/mo` : `${euro(s.weeklyCents)}/wk`}
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

        {/* Right column — summary + checkout. On desktop it sits beside the
            ticks so the running price stays on screen, no scrolling. */}
        <div className="border-t lg:border-t-0 border-border/50 bg-secondary/30 p-4 lg:p-5 lg:flex lg:flex-col lg:justify-center">
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
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-[11px] text-muted-foreground">
                {selected.length === 0
                  ? 'Nothing ticked yet'
                  : `${selected.length} service${selected.length > 1 ? 's' : ''}${mode === 'away' ? ` · ${weeks}wk` : ''}`}
              </p>
              <p className="text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground tabular-nums">
                {selected.length === 0 ? '—' : euro(totalCents)}
                {selected.length > 0 && (
                  <span className="text-sm font-semibold text-muted-foreground">
                    {mode === 'ongoing' ? '/mo' : ' total'}
                  </span>
                )}
              </p>
              {mode === 'ongoing' && selected.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                  ≈ {euro(perWeekCents)}/week · about {euro(perDayCents)}/day
                </p>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground text-right leading-relaxed pb-1">
              Same trusted helper<br />Pause or cancel anytime
            </p>
          </div>

          {!open ? (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setOpen(true)}
              disabled={selected.length === 0}
              className="w-full h-13 py-3.5 rounded-full bg-foreground text-background text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
            >
              <CreditCard size={17} />
              {mode === 'ongoing' ? 'Start my autopilot' : 'Cover my trip'} {selected.length > 0 && `· ${euro(totalCents)}${mode === 'ongoing' ? '/mo' : ''}`}
            </motion.button>
          ) : (
            <form onSubmit={handleCheckout} className="space-y-2">
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Your name" required autoFocus
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex gap-2">
                <input
                  type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number" required
                  className="flex-1 rounded-xl border border-border bg-white px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="text" value={city} onChange={(e) => setCity(e.target.value)}
                  placeholder="Area (e.g. Galway)"
                  className="flex-1 rounded-xl border border-border bg-white px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !name.trim() || !phone.trim()}
                className="w-full py-3.5 rounded-full bg-foreground text-background text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading
                  ? <><Loader2 size={16} className="animate-spin" />Opening secure checkout…</>
                  : <><CreditCard size={16} />Pay {euro(totalCents)}{mode === 'ongoing' ? '/mo' : ''} — card · Apple Pay · Google Pay</>}
              </button>
              {error && <p className="text-center text-[11px] text-destructive">{error}</p>}
            </form>
          )}

          {/* Risk reversal — the same guarantee one-off bookings carry */}
          <p className="mt-2.5 text-center text-[11px] text-muted-foreground">
            Not happy after the first visit? <span className="font-semibold text-foreground/70">Full refund — no questions.</span>
          </p>

          {/* Lower-commitment off-ramp — a monthly plan is a big first ask, so
              send hesitant visitors back to the one-off booking in the hero */}
          {!open && (
            <a
              href="#book"
              className="mt-2.5 flex items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Not ready for a plan?{' '}
              <span className="font-semibold text-foreground/70 underline underline-offset-2">Book a single visit →</span>
            </a>
          )}

          <a
            href={`${teamWhatsAppHref}?text=${encodeURIComponent(waText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <MessageCircle size={11} /> Questions first? WhatsApp us
          </a>
        </div>
      </div>
    </div>
  );
};
