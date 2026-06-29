import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Module-level cache: the hero presence pill (and any other consumer) shares a
// single head-count request across mounts — one request serves them all.
let cachedCount = 0;
let resolved = false;
let inflight: Promise<void> | null = null;

// REASSURING_MIN + the pill tier logic live in a pure module (helperPresence)
// so they're unit-tested without dragging in the Supabase client. Re-exported
// here so existing `@/hooks/useHelperCount` imports keep working.
export { REASSURING_MIN } from '@/lib/helperPresence';

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
