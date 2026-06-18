import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { AddressPicker } from '@/components/household/AddressPicker';
import { haptic } from '@/lib/haptics';
import { loadBookingMemory, saveBookingMemory } from '@/lib/bookingMemory';
import { getReferralCode } from '@/lib/referral';
import { deriveArea } from '@/lib/areaFromAddress';
import { getHouseholdPriceCents } from '@/lib/householdPricing';
import { CUSTOM_JOBS, matchCustomJob, customJobByKey, VANO_HOURLY_CENTS } from '@/lib/customJobs';

/**
 * "Name any job" — deliberately tiny. The customer types what they need in one
 * box and the fair price drops in right underneath (€18/hr labour rate, so it
 * can never go under minimum wage whatever the task). A keyword matcher names
 * the job instantly; the Gemini brain (parse-custom-job, debounced) quietly
 * refines the job + a realistic duration so the price is sensible without them
 * touching a thing. Books through the ONE create-household-payment-checkout flow.
 */

const DURATIONS = ['1 hour', '2 hours', '3 hours', '4 hours', '5 hours', '6 hours', '7 hours', '8 hours'];

function fmt(cents: number): string {
  const eur = cents / 100;
  return Number.isInteger(eur) ? `€${eur}` : `€${eur.toFixed(2)}`;
}

export const CustomJobBuilder: React.FC = () => {
  const remembered = useMemo(() => loadBookingMemory(), []);
  const referralCode = useMemo(() => getReferralCode(), []);

  const [jobText, setJobText] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [size, setSize] = useState('2 hours');
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

  // Instant keyword read names the job; the AI refines it below.
  const textMatch = matchCustomJob(jobText);
  const activeJob = selectedKey ? customJobByKey(selectedKey) : (textMatch ?? customJobByKey('other'));
  const hours = Number(size.match(/^\d+/)?.[0]) || 0;

  const vanoCents = getHouseholdPriceCents('custom', size) ?? VANO_HOURLY_CENTS * hours;
  const marketCents = activeJob.marketHourlyCents * hours;
  const hasJob = jobText.trim().length >= 2;

  // Debounced AI read that auto-applies a confident result, so the right job +
  // duration (and therefore the price) just appear as they type. Fail-soft: any
  // problem leaves the instant keyword matcher in charge.
  useEffect(() => {
    const text = jobText.trim();
    if (selectedKey || text.length < 6) return;
    let cancelled = false;
    const id = window.setTimeout(async () => {
      try {
        const { data } = await supabase.functions.invoke('parse-custom-job', {
          body: { text, jobs: CUSTOM_JOBS.map((j) => ({ key: j.key, label: j.label, typicalHours: j.typicalHours })) },
        });
        if (cancelled) return;
        const d = data as { ok?: boolean; jobKey?: string; hours?: number; confidence?: number } | null;
        if (d?.ok && d.jobKey && d.jobKey !== 'other' && (d.confidence ?? 0) >= 0.45) {
          setSelectedKey(d.jobKey);
          if (d.hours) setSize(`${Math.min(8, Math.max(1, Math.round(d.hours)))} hours`);
        }
      } catch { /* keyword matcher stays in charge */ }
    }, 650);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [jobText, selectedKey]);

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!jobText.trim()) { setError('Tell us what you need done.'); return; }
    const phoneClean = phone.trim().replace(/\s+/g, '');
    if (!phoneClean || !/^\+?[\d\s\-().]{7,15}$/.test(phoneClean)) {
      setPhoneError(true); setError('Please enter a valid phone number.'); return;
    }
    if (!address.trim()) {
      setAddressError(true); setError('Please add your address so your helper can find you.'); return;
    }
    setLoading(true); setError(null);
    haptic(12);
    const note = jobText.trim() || activeJob.label;
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('create-household-payment-checkout', {
        body: {
          category:         'custom',
          when_label:       'Now',
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

  return (
    <div className="mt-6 rounded-2xl border border-border/60 bg-white shadow-sm p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg leading-none" aria-hidden="true">🧰</span>
        <h3 className="text-base font-bold text-foreground">Need something else? Just name it.</h3>
      </div>

      <form onSubmit={handleBook} className="space-y-3">
        {/* The box — type the job; the price drops in right underneath */}
        <textarea
          value={jobText}
          onChange={(e) => { setJobText(e.target.value); setSelectedKey(null); if (error) setError(null); }}
          placeholder="Describe your job — e.g. paint my spare bedroom"
          rows={2}
          maxLength={400}
          className="w-full rounded-xl border border-border bg-white px-4 py-3 text-base placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-transparent resize-none"
        />

        {/* Live price, right under the box */}
        {hasJob && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-sage/30 bg-sage-light/50 px-3.5 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base flex-shrink-0" aria-hidden="true">{activeJob.emoji}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight truncate">{activeJob.label}</p>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  fair €18/hr{marketCents > vanoCents ? <> · <span className="line-through">{fmt(marketCents)}</span> typical</> : null}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <select
                value={size}
                onChange={(e) => { setSize(e.target.value); if (error) setError(null); }}
                aria-label="How long"
                className="rounded-lg border border-border bg-white text-xs font-medium px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-foreground/20"
              >
                {DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <motion.span
                key={vanoCents}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                className="text-xl font-extrabold tabular-nums text-foreground"
              >
                {fmt(vanoCents)}
              </motion.span>
            </div>
          </div>
        )}

        {/* Phone */}
        <input
          type="tel"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); if (phoneError) setPhoneError(false); if (error) setError(null); }}
          placeholder="Your phone — 08x xxx xxxx"
          autoComplete="tel" inputMode="tel" autoCapitalize="off" autoCorrect="off"
          className={cn(
            'w-full rounded-xl border bg-white px-4 py-3 text-base placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:border-transparent',
            phoneError ? 'border-destructive focus:ring-destructive/30' : 'border-border focus:ring-foreground/20',
          )}
        />

        {/* Address */}
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

        {/* CTA */}
        <Button
          type="submit"
          disabled={loading || !phone.trim() || !jobText.trim()}
          className="w-full rounded-full gap-2 font-semibold text-[15px] h-12 tabular-nums"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" />Booking…</>
            : <><Zap className="w-4 h-4" />Book{hasJob ? ` · ${fmt(vanoCents)}` : ' this job'}</>}
        </Button>

        {error && <p className="text-center text-xs text-destructive">{error}</p>}
        <p className="text-center text-[11px] text-muted-foreground">
          No payment now — pay once your helper accepts · money-back guarantee
        </p>
      </form>
    </div>
  );
};
