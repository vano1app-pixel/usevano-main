import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Module-level cache: HeroSection and StickyBookBar both show presence on the
// same page — one head-count request serves both (and any remount).
let cachedCount = 0;
let resolved = false;
let inflight: Promise<void> | null = null;

/**
 * Below this, a literal "N helpers online" reads as a *thin* marketplace to a
 * first-time customer — "two people, in all of Galway?" — which manufactures
 * the exact "will anyone actually come?" fear we're trying to kill. So under
 * this floor we show a qualitative availability signal instead of the number.
 * Raise it as supply grows; once it's comfortably cleared, the real count is
 * the stronger social proof and shows automatically.
 */
export const REASSURING_MIN = 5;

export interface HelperPresence {
  /** Approved + available helper count. 0 until/unless the request resolves. */
  count: number;
  /** False until the head-count request settles (success OR error) — lets the
   *  UI tell "still loading" apart from "resolved to a low/zero count", so it
   *  never shimmers forever when supply is genuinely thin. */
  ready: boolean;
}

function fetchHelperCount(): Promise<void> {
  if (resolved) return Promise.resolve();
  if (!inflight) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inflight = (supabase as any)
      .from('household_helpers')
      // Honest "helpers online" = approved + available helpers. Count by id —
      // anon doesn't have SELECT on every column, so * would 403.
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .eq('is_available', true)
      .then(({ count }: { count: number | null }) => {
        cachedCount = count ?? 0;
        resolved = true;
        inflight = null;
      })
      .catch(() => {
        // Unknown supply — treat as resolved (count 0) so the UI falls back to
        // the honest qualitative signal instead of a stuck skeleton.
        cachedCount = 0;
        resolved = true;
        inflight = null;
      });
  }
  return inflight!;
}

/**
 * Live helper presence shared across the landing page. Returns both the count
 * and whether the request has settled, so callers can avoid quoting a thin
 * number to a nervous first-time customer (see REASSURING_MIN).
 */
export function useHelperCount(): HelperPresence {
  const [presence, setPresence] = useState<HelperPresence>(
    resolved ? { count: cachedCount, ready: true } : { count: 0, ready: false },
  );

  useEffect(() => {
    if (resolved) {
      setPresence({ count: cachedCount, ready: true });
      return;
    }
    let cancelled = false;
    fetchHelperCount().then(() => {
      if (!cancelled) setPresence({ count: cachedCount, ready: true });
    });
    return () => { cancelled = true; };
  }, []);

  return presence;
}
