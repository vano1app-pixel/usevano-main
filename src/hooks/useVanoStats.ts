import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Lowkey platform stats — "N students · N jobs booked" (owner call
// 2026-07-23, replacing the helpers-online pill). One module-cached request
// serves the nav (lg+) and the hero's phone line; both hide entirely until
// real positive numbers arrive, so the landing page never shows a zero or
// waits on this call.

export interface VanoStats {
  students: number | null;
  jobs: number | null;
  /** True once the request settled (success OR error). */
  ready: boolean;
}

let cached: VanoStats = { students: null, jobs: null, ready: false };
let inflight: Promise<void> | null = null;

function fetchStats(): Promise<void> {
  if (cached.ready) return Promise.resolve();
  if (!inflight) {
    inflight = supabase.functions
      .invoke('public-stats', { body: {} })
      .then(({ data }: { data: { students?: number | null; jobs?: number | null } | null }) => {
        cached = {
          students: typeof data?.students === 'number' ? data.students : null,
          jobs:     typeof data?.jobs === 'number' ? data.jobs : null,
          ready: true,
        };
        inflight = null;
      })
      .catch(() => {
        cached = { students: null, jobs: null, ready: true }; // fail-soft: line stays hidden
        inflight = null;
      });
  }
  return inflight;
}

export function useVanoStats(): VanoStats {
  const [stats, setStats] = useState<VanoStats>(cached);

  useEffect(() => {
    if (cached.ready) { setStats(cached); return; }
    let cancelled = false;
    fetchStats().then(() => { if (!cancelled) setStats(cached); });
    return () => { cancelled = true; };
  }, []);

  return stats;
}

/** "126 students · 480 jobs booked" — null when either number is missing/zero. */
export function formatVanoStats(s: VanoStats): string | null {
  if (!s.ready || !s.students || !s.jobs || s.students <= 0 || s.jobs <= 0) return null;
  return `${s.students} students · ${s.jobs} jobs booked`;
}
