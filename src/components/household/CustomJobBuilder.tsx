import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Zap, Sparkles, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { AddressPicker } from '@/components/household/AddressPicker';
import { haptic } from '@/lib/haptics';
import { loadBookingMemory, saveBookingMemory } from '@/lib/bookingMemory';
import { getReferralCode } from '@/lib/referral';
import { deriveArea } from '@/lib/areaFromAddress';
import { getHouseholdPriceCents } from '@/lib/householdPricing';
import { POPULAR_CUSTOM_JOBS, matchCustomJob, customJobByKey, VANO_HOURLY_CENTS } from '@/lib/customJobs';
import { teamTelHref, TEAM_PHONE_DISPLAY } from '@/lib/contact';

/**
 * "Name any job" — the custom booking section. The customer describes a job
 * (painting, flat-pack, a clear-out…), picks how long they think it needs, and
 * the price builds live UNDERNEATH — shown side by side with the typical local
 * rate so the fairness is visible, not asserted.
 *
 * Pricing is purely TIME-BASED at VANO's standard €18/hr labour rate (the same
 * rate that already clears minimum wage), so a custom job can never be priced
 * under the floor whatever the task. The "typical local rate" figures are
 * conservative display-only estimates — never charged, only compared.
 *
 * It books through the ONE flow: create-household-payment-checkout with
 * category 'custom'. That inserts the booking, dispatches to helpers and fires
 * the admin emails/WhatsApp exactly like every other booking. Pay-after-accept.
 * If the auto price doesn't fit the job, the customer calls and we adjust.
 */

const DURATIONS = ['1 hour', '2 hours', '3 hours', '4 hours', '5 hours', '6 hours', '7 hours', '8 hours'];

function fmt(cents: number): string {
  const eur = cents / 100;
  return Number.isInteger(eur) ? `€${eur}` : `€${eur.toFixed(2)}`;
}

// Today-only slots (Now + half-hour steps). Custom jobs book for today, so the
// displayed price is always the exact, undiscounted €18/hr × hours.
function getTodaySlots(): string[] {
  const slots = ['Now'];
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
  return slots.slice(0, 6);
}

// A compact single-select pill (job type / duration / when).
const Pill: React.FC<{ active: boolean; accent?: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active, accent, onClick, children,
}) => (
  <motion.button
    type="button"
    onClick={onClick}
    whileTap={{ scale: 0.92 }}
    transition={{ type: 'spring', stiffness: 600, damping: 22 }}
    className={cn(
      'relative px-3.5 py-2 rounded-full text-sm font-medium border flex-shrink-0 cursor-pointer select-none transition-colors duration-150',
      active
        ? cn('border-transparent', accent ? 'text-white' : 'text-background')
        : accent
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
          : 'bg-white text-foreground border-border hover:border-foreground/30',
    )}
  >
    {active && (
      <motion.span
        layoutId={accent ? 'custom-pill-accent' : undefined}
        className={cn('absolute inset-0 rounded-full', accent ? 'bg-emerald-500' : 'bg-foreground')}
      />
    )}
    <span className="relative z-10">{children}</span>
  </motion.button>
);

export const CustomJobBuilder: React.FC = () => {
  const remembered = useMemo(() => loadBookingMemory(), []);
  const referralCode = useMemo(() => getReferralCode(), []);
  const timeSlots = useMemo(() => getTodaySlots(), []);

  const [selectedKey, setSelectedKey] = useState<string | null>('painting');
  const [jobText, setJobText] = useState('');
  const [size, setSize] = useState('2 hours');
  const [when, setWhen] = useState('Now');
  const [phone, setPhone] = useState(remembered?.phone ?? '');
  const [address, setAddress] = useState(remembered?.address ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    remembered?.lat != null && remembered?.lng != null ? { lat: remembered.lat, lng: remembered.lng } : null,
  );
  const [city, setCity] = useState(remembered?.city ?? 'Galway');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState(false);
  const [addressError, setAddressError] = useState(false);

  // The recogniser turns free text into a known job; an explicit chip tap wins.
  const textMatch = matchCustomJob(jobText);
  const activeJob = selectedKey ? customJobByKey(selectedKey) : (textMatch ?? customJobByKey('other'));
  const hours = Number(size.match(/^\d+/)?.[0]) || 0;

  // The two numbers the whole section is about: ours, and the going rate.
  const vanoCents = getHouseholdPriceCents('custom', size) ?? VANO_HOURLY_CENTS * hours;
  const marketCents = activeJob.marketHourlyCents * hours;
  const saveCents = Math.max(0, marketCents - vanoCents);
  const savePct = marketCents > 0 ? Math.round((saveCents / marketCents) * 100) : 0;

  // Re-key the headline on the amount so it springs as hours/job change.
  const priceKey = `${vanoCents}-${marketCents}`;

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    const phoneClean = phone.trim().replace(/\s+/g, '');
    if (!phoneClean || !/^\+?[\d\s\-().]{7,15}$/.test(phoneClean)) {
      setPhoneError(true);
      setError('Please enter a valid phone number.');
      return;
    }
    if (!address.trim()) {
      setAddressError(true);
      setError('Please add your address so your helper can find you.');
      return;
    }
    if (!vanoCents) {
      setError('Pick how long the job needs.');
      return;
    }
    setLoading(true); setError(null);
    haptic(12);
    // The job description admin/helpers see: the customer's words, or the
    // recognised type as a fallback so it's never blank.
    const note = jobText.trim() || activeJob.label;
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('create-household-payment-checkout', {
        body: {
          category:         'custom',
          when_label:       when,
          size_label:       size,
          extra_label:      activeJob.label,
          scheduled:        false,
          note,
          customer_name:    'Guest', // name collected by Stripe at checkout
          customer_phone:   phoneClean,
          customer_email:   null,
          customer_address: address.trim(),
          ...(coords ? { customer_lat: coords.lat, customer_lng: coords.lng } : {}),
          city,
          ...(referralCode ? { referral_code: referralCode } : {}),
        },
      });
      if (fnErr || !data?.checkout_url) {
        throw new Error((data as { error?: string } | null)?.error || fnErr?.message || 'Something went wrong.');
      }
      saveBookingMemory({
        phone: phoneClean,
        address: address.trim(),
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        city,
        lastCategory: 'custom',
        lastSize: size,
      });
      window.location.href = data.checkout_url as string;
    } catch (err: unknown) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  // Swap the text placeholder to match the picked job (without clobbering
  // anything the customer has already typed).
  useEffect(() => {
    setError(null);
  }, [selectedKey, jobText, size]);

  return (
    <div className="mt-10 rounded-3xl border border-border/60 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-1 sm:px-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl leading-none" aria-hidden="true">🧰</span>
          <h3
            className="text-xl font-bold text-foreground"
            style={{ fontFamily: 'Bricolage Grotesque, Plus Jakarta Sans, system-ui, sans-serif' }}
          >
            Need something else? Name the job.
          </h3>
        </div>
        <p className="text-sm text-muted-foreground ml-7">
          Any job, priced fairly by the hour — see exactly how it stacks up against the going rate.
        </p>
      </div>

      <form onSubmit={handleBook} className="px-5 pb-5 pt-3 sm:px-6 space-y-5">
        {/* Popular jobs — one tap fills the type and a sensible duration. The
            free-text box below covers everything else via the recogniser. */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">Popular — or just describe it below</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_CUSTOM_JOBS.map((j) => (
              <Pill
                key={j.key}
                active={selectedKey === j.key}
                onClick={() => { setSelectedKey(j.key); setSize(`${j.typicalHours} hours`); }}
              >
                <span className="mr-1" aria-hidden="true">{j.emoji}</span>{j.label}
              </Pill>
            ))}
          </div>
        </div>

        {/* Free-text detail — the recogniser reads this live and snaps it to a
            known job: the zero-cost stand-in for the AI brain. */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-1.5">Or describe any job — we'll get it</p>
          {/* Tiny worked example so people know the shape to type: who they
              are, the job, and when. Kills the "what do I even write?" pause. */}
          <p className="text-[12px] text-muted-foreground/80 italic mb-2">
            e.g. “Hi, I’m John — I’d like someone to cut the grass this Saturday.”
          </p>
          <textarea
            value={jobText}
            onChange={(e) => { setJobText(e.target.value); setSelectedKey(null); if (error) setError(null); }}
            placeholder={customJobByKey(selectedKey ?? 'other').example ?? 'Tell us what you need done'}
            rows={2}
            maxLength={400}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-base placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-transparent transition-[border-color,box-shadow] duration-150 resize-none"
          />
          <AnimatePresence>
            {!selectedKey && textMatch && (
              <motion.button
                key={textMatch.key}
                type="button"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                onClick={() => { setSelectedKey(textMatch.key); setSize(`${textMatch.typicalHours} hours`); haptic(8); }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sage/10 border border-sage/30 px-3 py-1.5 text-[12px] font-medium text-sage-dark hover:bg-sage/15 transition-colors"
              >
                <Sparkles size={12} aria-hidden="true" />
                Looks like {textMatch.emoji} {textMatch.label} · tap to budget ~{textMatch.typicalHours} hr
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Duration */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">Roughly how long?</p>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <Pill key={d} active={size === d} onClick={() => setSize(d)}>{d}</Pill>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            You're booking the time — if a job runs over, it's a quick add-on, never a surprise.
          </p>
        </div>

        {/* ── The comparison: our price vs the going rate, side by side ── */}
        <div className="rounded-2xl border border-sage/30 bg-sage-light/50 p-4">
          <div className="flex items-stretch gap-3">
            {/* VANO */}
            <div className="flex-1 rounded-xl bg-white border border-sage/40 p-3.5 text-center shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sage-dark">VANO · fair price</p>
              <AnimatePresence mode="popLayout">
                <motion.p
                  key={`v-${priceKey}`}
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 16 }}
                  className="mt-1 text-3xl font-extrabold tracking-tight text-foreground tabular-nums leading-none"
                >
                  {fmt(vanoCents)}
                </motion.p>
              </AnimatePresence>
              <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">€18/hr × {hours} hr</p>
            </div>

            {/* MARKET */}
            <div className="flex-1 rounded-xl bg-white/60 border border-border/60 p-3.5 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Typical local rate</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-muted-foreground/70 tabular-nums leading-none line-through decoration-muted-foreground/40">
                {fmt(marketCents)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">≈ €{activeJob.marketHourlyCents / 100}/hr × {hours} hr</p>
            </div>
          </div>

          {/* Saving */}
          <AnimatePresence initial={false}>
            {saveCents > 0 && (
              <motion.div
                key="save"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 flex items-center justify-center gap-1.5 text-sm font-bold text-sage-dark"
              >
                <Sparkles size={14} aria-hidden="true" />
                You save {fmt(saveCents)} — that's {savePct}% under the going rate
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-2.5 text-center text-[11px] text-muted-foreground leading-relaxed">
            Same €18/hr whatever the job — that's what keeps it fair for your student too.{' '}
            <span className="font-medium text-foreground/70">Price not right for the work?</span>{' '}
            <a href={teamTelHref} className="font-semibold text-foreground underline underline-offset-2 whitespace-nowrap">
              Call {TEAM_PHONE_DISPLAY}
            </a>{' '}and we'll sort a fair quote.
          </p>
        </div>

        {/* Contact + location */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">Your phone</p>
          <input
            type="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); if (phoneError) setPhoneError(false); if (error) setError(null); }}
            placeholder="08x xxx xxxx"
            autoComplete="tel" inputMode="tel" autoCapitalize="off" autoCorrect="off"
            className={cn(
              'w-full rounded-xl border bg-white px-4 py-3 text-base placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:border-transparent transition-[border-color,box-shadow] duration-150',
              phoneError ? 'border-destructive focus:ring-destructive/30' : 'border-border focus:ring-foreground/20',
            )}
          />
          <p className="text-[11px] text-muted-foreground mt-1.5">We'll text you when someone accepts</p>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">Where?</p>
          <AddressPicker
            value={address}
            coords={coords}
            error={addressError}
            onAddress={(addr, lat, lng, locality) => {
              setAddress(addr);
              setCoords({ lat, lng });
              if (addressError) setAddressError(false);
              if (error) setError(null);
              const area = deriveArea(locality, { lat, lng });
              if (area) setCity(area);
            }}
            onTextChange={(t) => { setAddress(t); setCoords(null); if (addressError) setAddressError(false); if (error) setError(null); }}
            onBlur={() => {}}
            placeholder="Address or Eircode…"
            showMapPreview={false}
          />
        </div>

        {/* When */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40 mb-2.5">When?</p>
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
            {timeSlots.map((opt) => (
              <Pill key={opt} active={when === opt} accent={opt === 'Now'} onClick={() => setWhen(opt)}>{opt}</Pill>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="space-y-2.5">
          <motion.div whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
            <Button
              type="submit"
              disabled={loading || !phone.trim() || !vanoCents}
              className="w-full rounded-full gap-2 font-semibold text-[15px] h-12 tabular-nums"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Booking…</>
                : <><Zap className="w-4 h-4" />Book this job · {fmt(vanoCents)}</>}
            </Button>
          </motion.div>

          {error && <p className="text-center text-xs text-destructive">{error}</p>}

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
            No payment now — pay once your helper accepts · money-back guarantee
          </p>

          <a
            href={teamTelHref}
            className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Phone size={12} aria-hidden="true" /> Prefer to talk it through? Call {TEAM_PHONE_DISPLAY}
          </a>
        </div>
      </form>
    </div>
  );
};
