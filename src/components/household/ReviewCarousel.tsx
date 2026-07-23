import React, { useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';

interface Review {
  text:      string;
  name:      string;
  area:      string;
  color:     string;
  stars:     number;
  /** True only for ratings pulled from real completed bookings. */
  verified?: boolean;
  /** Where the review was left. 'vano' = in-app post-booking rating (the
   *  only live source today). 'google' / 'trustpilot' are rendered with a
   *  "Left on X" byline the moment those feeds are wired (Google needs the
   *  Places API key; Trustpilot their business API) — the display side is
   *  ready so wiring a feed is purely additive. */
  source?:   'vano' | 'google' | 'trustpilot';
}

// NO seed/invented testimonials — ever. The section renders ONLY ratings
// pulled from household_ratings (one per paid booking) and stays hidden until
// the first real one lands. Publishing made-up quotes under a "Real customers"
// heading is a blacklisted commercial practice (fake reviews, Consumer Rights
// Act 2022 / UCPD) — if the section looks empty, the fix is more happy
// customers, not fiction.

const REAL_COLORS = [
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-teal-100 text-teal-700',
  'bg-rose-100 text-rose-700',
];

function relativeTime(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7)  return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

/** Genuine ratings only — the hook starts empty and the section stays hidden
 *  until the first verified review arrives. */
function useReviews(): Review[] {
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('household_ratings')
      .select('rating, comment, created_at, reviewer_name, area')
      .gte('rating', 4)
      .not('comment', 'is', null)
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data }: { data: { rating: number; comment: string | null; created_at: string; reviewer_name: string | null; area: string | null }[] | null }) => {
        if (cancelled || !data) return;
        const real: Review[] = data
          .filter(r => (r.comment ?? '').trim().length >= 8)
          .map((r, i) => ({
            text:     r.comment!.trim(),
            // Real attribution when the booking carried a name (first name
            // only, written at rating time) — anonymous quick-bookers show
            // as "VANO customer" with their area, never a made-up name.
            name:     r.reviewer_name?.trim() || 'VANO customer',
            area:     r.area?.trim()
              ? `${r.area.trim()} · ${relativeTime(r.created_at)}`
              : relativeTime(r.created_at),
            color:    REAL_COLORS[i % REAL_COLORS.length],
            stars:    r.rating,
            verified: true,
            source:   'vano' as const,
          }));
        if (real.length > 0) setReviews(real);
      });
    return () => { cancelled = true; };
  }, []);

  return reviews;
}

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${color}`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < count ? 'fill-gold text-gold' : 'fill-foreground/10 text-foreground/10'}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function Byline({ r }: { r: Review }) {
  // Platform-labelled reviews say exactly where they were left; in-app
  // ratings keep the "Verified booking" tick (they come from real paid
  // bookings, which the external platforms can't verify).
  const platform =
    r.source === 'google' ? { label: 'Left on Google', color: 'text-[#4285F4]' }
    : r.source === 'trustpilot' ? { label: 'Left on Trustpilot', color: 'text-[#00B67A]' }
    : null;
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-foreground leading-tight">{r.name} · {r.area}</p>
      {platform ? (
        <p className={`flex items-center gap-1 text-[10px] font-medium mt-0.5 ${platform.color}`}>
          <Star className="w-3 h-3 flex-shrink-0 fill-current" aria-hidden="true" />
          {platform.label}
        </p>
      ) : r.verified ? (
        <p className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium mt-0.5">
          <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Verified booking
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Galway customer</p>
      )}
    </div>
  );
}

function ReviewCard({ r }: { r: Review }) {
  return (
    <article className="bg-white rounded-2xl shadow-tinted p-5 flex flex-col gap-4 border border-border/40 w-72 flex-shrink-0">
      <Stars count={r.stars} />
      <p className="text-foreground/80 text-sm leading-relaxed flex-1">"{r.text}"</p>
      <div className="flex items-center gap-2.5 mt-auto">
        <Avatar name={r.name} color={r.color} />
        <Byline r={r} />
      </div>
    </article>
  );
}

// Infinite horizontal ticker
function ReviewTicker({ reviews }: { reviews: Review[] }) {
  // Duplicate reviews so the loop looks seamless
  const items = [...reviews, ...reviews];

  return (
    <div
      className="overflow-hidden"
      aria-hidden="true"
      style={{
        // Feather the edges so cards melt in/out instead of a hard cut
        maskImage: 'linear-gradient(to right, transparent, black 5%, black 95%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 5%, black 95%, transparent)',
      }}
    >
      <motion.div
        className="flex gap-4 py-1"
        animate={{ x: ['0%', '-50%'] }}
        transition={{
          duration: 35,
          ease: 'linear',
          repeat: Infinity,
        }}
        style={{ width: 'max-content' }}
      >
        {items.map((r, i) => (
          <ReviewCard key={`${r.name}-${i}`} r={r} />
        ))}
      </motion.div>
    </div>
  );
}

const INTERVAL = 4000;

export const ReviewCarousel: React.FC = () => {
  const reviews = useReviews();
  const [index, setIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restart the rotation whenever the list changes (real reviews arriving).
  // No reviews yet → no timer (and the section renders nothing below).
  useEffect(() => {
    setIndex(0);
    if (reviews.length === 0) return;
    timer.current = setInterval(() => {
      setIndex(i => (i + 1) % reviews.length);
    }, INTERVAL);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [reviews]);

  function goTo(i: number) {
    if (timer.current) clearInterval(timer.current);
    setIndex(i);
    timer.current = setInterval(() => {
      setIndex(j => (j + 1) % reviews.length);
    }, INTERVAL);
  }

  // Nothing genuine to show yet — show nothing. Never pad with fiction.
  if (reviews.length === 0) return null;

  const review = reviews[index] ?? reviews[0];

  return (
    <section className="py-16 lg:py-20 overflow-hidden">
      <div className="px-4 max-w-6xl mx-auto mb-8">
        <p className="eyebrow mb-3">Real customers · Galway</p>
        <h2 className="display-lg text-foreground">People love it</h2>
      </div>

      {/* Desktop: infinite scrolling ticker */}
      <div className="hidden lg:block px-4">
        <ReviewTicker reviews={reviews} />
      </div>

      {/* Mobile: auto-rotating single card */}
      <div className="lg:hidden px-4">
        <div className="relative overflow-hidden" style={{ minHeight: 190 }}>
          <AnimatePresence mode="wait">
            <motion.article
              key={index}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-2xl shadow-tinted p-5 flex flex-col gap-4 border border-border/40"
            >
              <Stars count={review.stars} />
              <p className="text-foreground/80 text-sm leading-relaxed">"{review.text}"</p>
              <div className="flex items-center gap-2.5">
                <Avatar name={review.name} color={review.color} />
                <Byline r={review} />
              </div>
            </motion.article>
          </AnimatePresence>
        </div>

        <div className="flex justify-center gap-2 mt-4">
          {reviews.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Review ${i + 1}`}
              className={`relative rounded-full transition-all duration-300 after:absolute after:-inset-2 after:content-[''] ${
                i === index ? 'w-5 h-2 bg-foreground' : 'w-2 h-2 bg-border hover:bg-foreground/40 hover:scale-125'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
