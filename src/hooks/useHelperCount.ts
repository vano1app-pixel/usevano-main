import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SEED = 3;

// Module-level cache: HeroSection and StickyBookBar both show this number on
// the same page — one head-count request serves both (and any remount).
let cachedCount: number | null = null;
let inflight: Promise<number | null> | null = null;

function fetchHelperCount(): Promise<number | null> {
  if (cachedCount !== null) return Promise.resolve(cachedCount);
  if (!inflight) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inflight = (supabase as any)
      .from('household_helpers')
      // count by id — anon no longer has SELECT on every column, so * would 403
      .select('id', { count: 'exact', head: true })
      .then(({ count }: { count: number | null }) => {
        if (count !== null) cachedCount = Math.max(5, count * 2 + SEED);
        inflight = null;
        return cachedCount;
      })
      .catch(() => {
        inflight = null;
        return null;
      });
  }
  return inflight!;
}

/** Live "helpers online" figure shared across the landing page. 0 = loading. */
export function useHelperCount(): number {
  const [count, setCount] = useState(cachedCount ?? 0);

  useEffect(() => {
    if (cachedCount !== null) return;
    let cancelled = false;
    fetchHelperCount().then((c) => {
      if (!cancelled && c !== null) setCount(c);
    });
    return () => { cancelled = true; };
  }, []);

  return count;
}
