import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { boundedPhotoUrl } from '@/lib/boundedPhoto';
import {
  BENCH_COLUMNS,
  BENCH_FILTERS,
  BENCH_LIMIT,
  type BenchHelper,
  benchCaption,
  benchFirstName,
  isBenchCatchAll,
} from '@/lib/helperBench';

/**
 * The faces behind "an ID-verified student" — shown INSIDE the booking sheet,
 * at the moment the customer is deciding whether to trust a stranger with
 * their home. Everything else on the site already leads with a face (homepage
 * cards, /helpers/:id, the /track helper card); this was the one screen that
 * asked for the booking and showed nobody.
 *
 * Three rules, in order of importance:
 *
 * 1. HONEST. The query is the mirror of dispatch's offer query
 *    (src/lib/helperBench.ts ↔ _shared/helperMatch.ts, lock-stepped by test),
 *    so every face shown is genuinely someone who would receive this offer.
 *    The caption counts only rows we actually got back, and never promises
 *    WHICH helper comes — the job goes to whoever accepts first.
 *
 * 2. FAIL-SOFT. No photos, a thin city, a slow or failed query, RLS trouble:
 *    the component renders NOTHING and the sheet is exactly what it was
 *    before. Nothing about booking may depend on this resolving. It also
 *    renders nothing rather than a shimmer — a skeleton inside a decision
 *    sheet reads as "something is broken", which is the opposite of the job.
 *
 * 3. iOS-SAFE. Helper photos are full-resolution phone uploads. Every one is
 *    bounded off-DOM through boundedPhotoUrl before an <img> mounts — the
 *    same rule that keeps the join photo from black-screening Safari — and
 *    each avatar is a small, fixed, object-cover box.
 */
export const HelperBench: React.FC<{ category: string; city: string | null }> = ({ category, city }) => {
  const [helpers, setHelpers] = useState<BenchHelper[]>([]);

  useEffect(() => {
    let cancelled = false;
    setHelpers([]);
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any)
          .from('household_helpers')
          .select(BENCH_COLUMNS.join(', '))
          .eq('status', BENCH_FILTERS.status)
          .eq('is_available', BENCH_FILTERS.is_available)
          .eq('id_verified', BENCH_FILTERS.id_verified)
          .not('photo_url', 'is', null)
          .neq('photo_url', '');
        // Catch-all categories go to everyone, exactly as dispatch does.
        if (!isBenchCatchAll(category)) q = q.contains('categories', [category]);
        if (city && city.trim()) q = q.eq('city', city.trim());
        // Same order as the real offer: ✓-Verified first, then fair rotation.
        const { data, error } = await q
          .order('vano_verified', { ascending: false })
          .order('accepted_count', { ascending: true })
          .limit(BENCH_LIMIT);
        if (cancelled || error || !Array.isArray(data) || data.length === 0) return;

        const rows = data as BenchHelper[];
        const bounded = await Promise.all(rows.map(async (h) => ({
          ...h,
          photo_url: (await boundedPhotoUrl(h.photo_url, 128)) ?? h.photo_url,
        })));
        if (!cancelled) setHelpers(bounded);
      } catch {
        /* fail-soft: the sheet is complete without us */
      }
    })();
    return () => { cancelled = true; };
  }, [category, city]);

  if (helpers.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="rounded-2xl border border-sage/20 bg-sage-light/40 px-4 py-3 mb-5"
    >
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2 flex-shrink-0">
          {helpers.map((h) => (
            <img
              key={h.id}
              src={h.photo_url ?? ''}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              // A broken URL must leave a tidy gap, never a torn icon.
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              className="w-9 h-9 rounded-full object-cover object-[center_20%] ring-2 ring-white bg-secondary/50"
            />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          {/* The caption WRAPS rather than truncates: on a 390px phone with
              four avatars beside it, `truncate` cut the sentence to "4
              ID-verified student…", which is the one line this whole
              component exists to say. Two lines is a fair trade. */}
          <p className="text-[13px] font-semibold text-sage-dark leading-snug flex items-start gap-1">
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-[1px]" aria-hidden="true" />
            <span>{benchCaption(helpers.length, city)}</span>
          </p>
          <p className="text-[11px] text-foreground/60 mt-0.5 truncate">
            {helpers.map((h) => benchFirstName(h.name)).join(', ')}
            {/* Only ever rendered from rows that carry a real rating. */}
            {(() => {
              const rated = helpers.filter((h) => typeof h.average_rating === 'number' && (h.rating_count ?? 0) > 0);
              if (rated.length === 0) return null;
              const avg = rated.reduce((s, h) => s + (h.average_rating as number), 0) / rated.length;
              return (
                <span className="inline-flex items-center gap-0.5 ml-1 font-semibold text-foreground/70">
                  · <Star className="w-3 h-3 fill-gold text-gold" aria-hidden="true" />{avg.toFixed(1)}
                </span>
              );
            })()}
          </p>
        </div>
      </div>
    </motion.div>
  );
};
