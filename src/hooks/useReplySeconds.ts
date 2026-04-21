import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Fetches the median reply time (in seconds) for a single freelancer,
// backed by a module-level in-memory cache so a board that renders 20
// StudentCards doesn't fan out into 20 sequential RPC calls every time
// the list re-mounts. TTL is generous (10 min) — reply times are a
// rolling aggregate over the freelancer's last 50 messages, so a 10-
// minute-old read is fine.
//
// The RPC (see migration 20260415140000) returns null when the
// freelancer has fewer than 5 reply pairs; we propagate that null so
// the caller can choose what to show (e.g. hide the chip entirely, or
// render a "New on Vano" pill instead).

interface CacheEntry {
  secs: number | null;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
// Dedup in-flight requests so mounting 10 cards for the same user
// (rare but possible during list-re-render storms) still only hits
// the RPC once.
const inflight = new Map<string, Promise<number | null>>();

const TTL_MS = 10 * 60 * 1000;

async function fetchReplySeconds(userId: string): Promise<number | null> {
  const existing = inflight.get(userId);
  if (existing) return existing;
  const p = (async () => {
    try {
      const { data, error } = await supabase.rpc(
        'freelancer_median_reply_seconds' as never,
        { p_freelancer_id: userId } as never,
      );
      if (error) return null;
      return typeof data === 'number' ? data : null;
    } catch {
      return null;
    } finally {
      inflight.delete(userId);
    }
  })();
  inflight.set(userId, p);
  return p;
}

export function useReplySeconds(userId: string | null | undefined): number | null {
  const [secs, setSecs] = useState<number | null>(() => {
    if (!userId) return null;
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.fetchedAt < TTL_MS) return hit.secs;
    return null;
  });

  useEffect(() => {
    if (!userId) return;
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.fetchedAt < TTL_MS) {
      setSecs(hit.secs);
      return;
    }
    let cancelled = false;
    void fetchReplySeconds(userId).then((v) => {
      if (cancelled) return;
      cache.set(userId, { secs: v, fetchedAt: Date.now() });
      setSecs(v);
    });
    return () => { cancelled = true; };
  }, [userId]);

  return secs;
}

/** Converts the raw seconds into a short human label: "Replies in
 *  ~12m" / "Replies in ~2h" / "Replies in ~1d". Returns null when
 *  the input is null so the caller can decide to render nothing. */
export function formatReplyTime(secs: number | null | undefined): string | null {
  if (secs == null || secs <= 0) return null;
  if (secs < 60 * 60) {
    const mins = Math.max(1, Math.round(secs / 60));
    return `Replies in ~${mins}m`;
  }
  if (secs < 60 * 60 * 24) {
    const hours = Math.max(1, Math.round(secs / (60 * 60)));
    return `Replies in ~${hours}h`;
  }
  const days = Math.max(1, Math.round(secs / (60 * 60 * 24)));
  return `Replies in ~${days}d`;
}
