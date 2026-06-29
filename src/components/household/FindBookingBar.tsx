import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { loadBookingMemory } from '@/lib/bookingMemory';
import { categoryLabel, statusLabel, formatBookingDate } from '@/lib/bookingLabels';

interface BookingResult {
  id: string;
  category: string;
  status: string;
  scheduled_date: string | null;
  created_at: string;
}

export const FindBookingBar: React.FC = () => {
  const navigate  = useNavigate();
  // Prefilled for returning customers — one tap from "where's my booking?"
  const [phone,   setPhone]   = useState(() => loadBookingMemory()?.phone ?? '');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BookingResult[] | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const clean = phone.trim().replace(/\s+/g, '');
    if (!clean) return;
    setLoading(true); setError(null); setResults(null);

    const { data, error: err } = await supabase.functions.invoke<BookingResult[]>(
      'find-booking-by-phone',
      { body: { customer_phone: clean } },
    );

    setLoading(false);
    if (err || !data) { setError('Could not find a booking. Check your number and try again.'); return; }
    if ((data as unknown as { error?: string }).error) {
      setError((data as unknown as { error: string }).error);
      return;
    }
    const list = Array.isArray(data) ? data : [];
    if (list.length === 0) { setError('No bookings found for that number.'); return; }
    // If only one result, go straight to tracking
    if (list.length === 1) { navigate(`/track/${list[0].id}`); return; }
    setResults(list);
  }

  return (
    <section className="px-4 py-24 bg-background border-t border-border/40">
      <div className="max-w-lg mx-auto">
        <div className="flex justify-center mb-3">
          <p className="eyebrow">Track a booking</p>
        </div>
        <h2 className="text-xl font-bold text-foreground text-center mb-1">
          Find your booking
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-6">
          Enter the phone number you booked with to find your booking.
        </p>

        <form onSubmit={lookup} className="flex gap-2">
          <div className="relative flex-1 group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 group-focus-within:text-foreground/60 transition-colors duration-150" />
            <input
              type="tel"
              value={phone}
              onChange={e => { setPhone(e.target.value); setError(null); setResults(null); }}
              placeholder="08x xxx xxxx"
              autoComplete="tel"
              inputMode="tel"
              enterKeyHint="search"
              autoCapitalize="off"
              autoCorrect="off"
              className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-[border-color,box-shadow] duration-150"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !phone.trim()}
            className={cn(
              'group flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold min-w-[92px]',
              'bg-foreground text-background',
              'hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed',
              'transition-[opacity,transform] duration-150 active:scale-[0.97]',
            )}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Find</span><ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" /></>}
          </button>
        </form>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-3 text-center text-sm text-destructive"
            >
              {error}
            </motion.p>
          )}

          {results && results.length > 1 && (
            <motion.div
              initial="hidden" animate="show" exit={{ opacity: 0 }}
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } } }}
              className="mt-4 space-y-2"
            >
              <motion.p
                variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                className="text-xs text-muted-foreground font-medium"
              >
                Select your booking:
              </motion.p>
              {results.map(b => {
                const st = statusLabel(b.status);
                const cat = categoryLabel(b.category);
                const date = formatBookingDate(b.scheduled_date);
                return (
                  <motion.button
                    key={b.id}
                    variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                    onClick={() => navigate(`/track/${b.id}`)}
                    className="w-full flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-left hover:bg-secondary/40 hover:border-foreground/20 transition-colors duration-150"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{cat}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{date}</p>
                    </div>
                    <span className={cn('text-xs font-semibold', st.colour)}>{st.label}</span>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};
