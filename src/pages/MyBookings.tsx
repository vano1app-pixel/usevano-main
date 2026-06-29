import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, ArrowRight, CalendarCheck, Plus, RotateCw, WifiOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { loadBookingMemory } from '@/lib/bookingMemory';
import { isValidPhone } from '@/lib/validation';
import {
  categoryLabel, statusLabel, formatBookingDate, ACTIVE_STATUSES,
} from '@/lib/bookingLabels';

interface BookingResult {
  id: string;
  category: string;
  status: string;
  scheduled_date: string | null;
  created_at: string;
}

const BookingRow: React.FC<{ b: BookingResult; onClick: () => void }> = ({ b, onClick }) => {
  const st = statusLabel(b.status);
  return (
    <motion.button
      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
      onClick={onClick}
      className="surface-float flex w-full items-center justify-between gap-3 rounded-2xl border border-black/5 bg-white px-4 py-3.5 text-left transition-transform duration-150 active:scale-[0.99]"
    >
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground truncate">{categoryLabel(b.category)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{formatBookingDate(b.scheduled_date)}</p>
      </div>
      <span className="flex items-center gap-2 flex-shrink-0">
        <span className={cn('text-xs font-semibold', st.colour)}>{st.label}</span>
        <ArrowRight className="w-4 h-4 text-muted-foreground/40" aria-hidden="true" />
      </span>
    </motion.button>
  );
};

const MyBookings: React.FC = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState(() => loadBookingMemory()?.phone ?? '');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [bookings, setBookings] = useState<BookingResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A genuine load failure (network / function down) is kept separate from a
  // real empty result, so we never tell a customer with active bookings that
  // they have none just because a request blipped.
  const [loadError, setLoadError] = useState(false);

  const fetchBookings = useCallback(async (raw: string) => {
    const clean = raw.trim().replace(/\s+/g, '');
    if (!clean) return;
    setLoading(true); setError(null); setLoadError(false);
    const { data, error: err } = await supabase.functions.invoke<BookingResult[]>(
      'find-booking-by-phone', { body: { customer_phone: clean } },
    );
    setLoading(false);
    if (err || !data) {
      // Transport / function failure — retryable, don't masquerade as "empty".
      setLoadError(true);
      return;
    }
    if ((data as unknown as { error?: string }).error) {
      // The function answered but with no match for this number.
      setBookings([]);
      return;
    }
    setBookings(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { if (phone) void fetchBookings(phone); }, [phone, fetchBookings]);

  const active = (bookings ?? []).filter(b => ACTIVE_STATUSES.has(b.status));
  const past = (bookings ?? []).filter(b => !ACTIVE_STATUSES.has(b.status));

  const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPhone(input)) { setError('Please enter a valid phone number.'); return; }
    setPhone(input.trim().replace(/\s+/g, ''));
  }

  return (
    <div className="min-h-[100dvh] bg-cream">
      <SEOHead title="Your bookings" description="Track your VANO bookings — find a helper, follow their arrival, and see your history." url="https://vanojobs.com/bookings" />
      <HouseholdNav />

      {/* Mobile: content sits at the top under the nav. Desktop: the flex column
          centres in the viewport so the short lookup/empty card lands in the
          optical middle instead of floating over a sea of empty cream. A long
          booking list just grows the column past the viewport and top-aligns. */}
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col px-4 pt-24 pb-28 md:justify-center md:pb-32">
        <header className="mb-6">
          <p className="eyebrow mb-3">Your account</p>
          <h1 className="display-lg text-foreground">Your bookings</h1>
        </header>

        {loading && (
          <div className="space-y-2.5" aria-busy="true" aria-label="Loading your bookings">
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer surface-float flex items-center justify-between rounded-2xl border border-black/5 bg-white px-4 py-3.5">
                <div className="space-y-2">
                  <div className="h-3.5 w-32 rounded-full bg-foreground/10" />
                  <div className="h-2.5 w-20 rounded-full bg-foreground/[0.07]" />
                </div>
                <div className="h-3 w-16 rounded-full bg-foreground/[0.07]" />
              </div>
            ))}
          </div>
        )}

        {!loading && bookings && bookings.length > 0 && (
          <motion.div initial="hidden" animate="show" variants={listVariants} className="space-y-6">
            {active.length > 0 && (
              <section>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 mb-2.5">Active</h2>
                <div className="space-y-2.5">
                  {active.map(b => <BookingRow key={b.id} b={b} onClick={() => navigate(`/track/${b.id}`)} />)}
                </div>
              </section>
            )}
            {past.length > 0 && (
              <section>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 mb-2.5">Past</h2>
                <div className="space-y-2.5">
                  {past.map(b => <BookingRow key={b.id} b={b} onClick={() => navigate(`/track/${b.id}`)} />)}
                </div>
              </section>
            )}
          </motion.div>
        )}

        {/* Load failure — distinct from empty, with a retry */}
        {!loading && loadError && (
          <div className="rounded-3xl border border-border/60 bg-white surface-float p-7 text-center">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
              <WifiOff className="w-6 h-6" aria-hidden="true" />
            </span>
            <h2 className="text-base font-bold text-foreground">Couldn't load your bookings</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Check your connection and try again.</p>
            <button
              onClick={() => phone && fetchBookings(phone)}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors"
            >
              <RotateCw className="w-4 h-4" aria-hidden="true" /> Try again
            </button>
          </div>
        )}

        {/* Empty / no-phone — a composed state, not a blank screen */}
        {!loading && !loadError && (!bookings || bookings.length === 0) && (
          <div className="rounded-3xl border border-border/60 bg-white surface-float p-7 text-center">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sage/10 text-sage-dark">
              <CalendarCheck className="w-6 h-6" aria-hidden="true" />
            </span>
            <h2 className="text-base font-bold text-foreground">
              {bookings ? 'No bookings found' : 'Find your bookings'}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {bookings
                ? "We couldn't find any bookings for that number."
                : 'Enter the phone number you booked with to see your bookings here.'}
            </p>

            <form onSubmit={handleLookup} className="mt-5 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" aria-hidden="true" />
                <input
                  type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="search"
                  value={input}
                  onChange={e => { setInput(e.target.value); if (error) setError(null); }}
                  placeholder="08x xxx xxxx"
                  className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                disabled={!input.trim()}
                className="btn-gold flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-navy disabled:opacity-40"
              >
                Find
              </button>
            </form>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

            <button
              onClick={() => navigate('/home')}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-sage-dark hover:text-sage"
            >
              <Plus className="w-4 h-4" aria-hidden="true" /> Book something new
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default MyBookings;
