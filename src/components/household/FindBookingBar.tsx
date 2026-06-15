import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { loadBookingMemory } from '@/lib/bookingMemory';

interface BookingResult {
  id: string;
  category: string;
  status: string;
  scheduled_date: string | null;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Laundry', 'grocery-shopping': 'Grocery shopping',
  'dog-walk': 'Dog walk', 'dog-walking': 'Dog walking',
  garden: 'Garden help', 'lawn-mowing': 'Lawn mowing',
  moving: 'Moving help', 'moving-help': 'Moving help',
  cleaning: 'Cleaning', 'outdoor-cleaning': 'Outdoor cleaning',
  tutoring: 'Tutoring', 'tutoring-grinds': 'Tutoring & grinds',
  'post-office': 'Post office run', 'pharmacy-run': 'Pharmacy run',
  'furniture-assembly': 'Furniture assembly', 'tech-help': 'Tech help',
  'wait-delivery': 'Wait for delivery', 'midnight-lift': 'Midnight Lift',
  handyman: 'Handyman', plumbing: 'Plumbing help',
};

const STATUS_LABEL: Record<string, { label: string; colour: string }> = {
  awaiting_payment: { label: 'Awaiting payment', colour: 'text-amber-600' },
  pending:          { label: 'Finding helper…',  colour: 'text-blue-600' },
  accepted:         { label: 'Helper on the way',colour: 'text-emerald-600' },
  on_way:           { label: 'On the way',        colour: 'text-emerald-600' },
  arrived:          { label: 'Helper arrived',    colour: 'text-emerald-600' },
  in_progress:      { label: 'In progress',       colour: 'text-emerald-600' },
  completed:        { label: 'Completed',          colour: 'text-foreground/50' },
  cancelled:        { label: 'Cancelled',          colour: 'text-destructive/70' },
};

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
    <section className="px-4 py-10 bg-background border-t border-border/40">
      <div className="max-w-lg mx-auto">
        <p className="eyebrow mb-3 text-center justify-center">Track a booking</p>
        <h2 className="text-xl font-bold text-foreground text-center mb-1">
          Find your booking
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-6">
          Enter the phone number you booked with to find your booking.
        </p>

        <form onSubmit={lookup} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <input
              type="tel"
              value={phone}
              onChange={e => { setPhone(e.target.value); setError(null); setResults(null); }}
              placeholder="08x xxx xxxx"
              autoComplete="tel"
              className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !phone.trim()}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold',
              'bg-foreground text-background',
              'hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed',
              'transition-opacity duration-150',
            )}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Find</span><ArrowRight className="w-4 h-4" /></>}
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
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-4 space-y-2"
            >
              <p className="text-xs text-muted-foreground font-medium">Select your booking:</p>
              {results.map(b => {
                const st = STATUS_LABEL[b.status] ?? { label: b.status, colour: 'text-muted-foreground' };
                const cat = CATEGORY_LABELS[b.category] ?? b.category;
                const date = b.scheduled_date
                  ? new Date(b.scheduled_date).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' })
                  : 'Flexible';
                return (
                  <button
                    key={b.id}
                    onClick={() => navigate(`/track/${b.id}`)}
                    className="w-full flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-left hover:bg-secondary/40 hover:border-foreground/20 transition-colors duration-150"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{cat}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{date}</p>
                    </div>
                    <span className={cn('text-xs font-semibold', st.colour)}>{st.label}</span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};
