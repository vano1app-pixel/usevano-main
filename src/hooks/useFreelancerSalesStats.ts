import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Pulls aggregate sales stats (closed_won count + paid bonus total
// in cents) for a single freelancer. Backed by an in-memory cache
// with a 10-minute TTL so a board of cards doesn't fan out into N
// RPC calls every re-mount. Any freelancer who isn't in digital
// sales gets (0, 0) back — the card-side render hides the chip on
// zero so non-sales freelancers never see a misleading "0 deals"
// badge.
//
// See migration 20260421150000 — the RPC is SECURITY DEFINER with
// aggregate-only return, so it's safe to call for any freelancer
// even from a public page.

export interface SalesStats {
  closedCount: number;
  paidBonusCents: number;
}

interface CacheEntry {
  stats: SalesStats | null;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<SalesStats | null>>();
const TTL_MS = 10 * 60 * 1000;

async function fetchStats(userId: string): Promise<SalesStats | null> {
  const existing = inflight.get(userId);
  if (existing) return existing;
  const p = (async () => {
    try {
      const { data, error } = await supabase.rpc(
        'freelancer_sales_stats' as never,
        { p_freelancer_id: userId } as never,
      );
      if (error) return { closedCount: 0, paidBonusCents: 0 };
      // `data` is typed as `never` via the `as never` cast above (the
      // generated DB types don't know about the RPC yet). Re-cast to
      // `unknown` then narrow manually — PostgREST returns a single-
      // row TABLE result as either an object or a 1-element array
      // depending on client settings, so accept both shapes.
      const raw = data as unknown;
      if (raw == null) return { closedCount: 0, paidBonusCents: 0 };
      const row: unknown = Array.isArray(raw) ? raw[0] : raw;
      if (row == null || typeof row !== 'object') {
        return { closedCount: 0, paidBonusCents: 0 };
      }
      return {
        closedCount: Number(
          (row as { closed_won_count?: number | string }).closed_won_count ?? 0,
        ),
        paidBonusCents: Number(
          (row as { paid_bonus_cents_total?: number | string }).paid_bonus_cents_total ?? 0,
        ),
      };
    } catch {
      return null;
    } finally {
      inflight.delete(userId);
    }
  })();
  inflight.set(userId, p);
  return p;
}

export function useFreelancerSalesStats(userId: string | null | undefined): SalesStats | null {
  const [stats, setStats] = useState<SalesStats | null>(() => {
    if (!userId) return null;
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.fetchedAt < TTL_MS) return hit.stats;
    return null;
  });

  useEffect(() => {
    if (!userId) return;
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.fetchedAt < TTL_MS) {
      setStats(hit.stats);
      return;
    }
    let cancelled = false;
    void fetchStats(userId).then((v) => {
      if (cancelled) return;
      cache.set(userId, { stats: v, fetchedAt: Date.now() });
      setStats(v);
    });
    return () => { cancelled = true; };
  }, [userId]);

  return stats;
}

/** Short "3 closed · €2,400 earned" label for the card. Returns
 *  null when the freelancer has zero closed wins so non-sales
 *  freelancers (and brand-new sales freelancers) don't see a
 *  discouraging "0 deals" chip. */
export function formatSalesStats(stats: SalesStats | null): string | null {
  if (!stats) return null;
  if (stats.closedCount === 0) return null;
  const countLabel = `${stats.closedCount} closed`;
  if (stats.paidBonusCents <= 0) return countLabel;
  const euros = stats.paidBonusCents / 100;
  const pretty = euros >= 1000
    ? `€${(euros / 1000).toFixed(euros < 10000 ? 1 : 0).replace(/\.0$/, '')}k`
    : `€${Math.round(euros).toLocaleString('en-IE')}`;
  return `${countLabel} · ${pretty} earned`;
}
