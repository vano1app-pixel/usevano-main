import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Small social-proof chip shown on the landing hero.
 *
 * Reads from `analytics_events` — which has admin-only SELECT via RLS for
 * authenticated users but ALSO a publicly-readable view would be needed for
 * anon visitors. Rather than open RLS on the raw events table, we count via
 * an RPC (`public_recent_match_count`) added alongside this component. If
 * the RPC fails or isn't deployed yet, the component silently renders nothing.
 *
 * Counts any event that represents a business reaching out to a freelancer:
 *   - quote_sent
 *   - direct_hire_sent
 *   - vano_match_sent
 *   - quote_broadcast_sent (counted once per broadcast, not per target)
 */
export const LiveMatchesCounter: React.FC = () => {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('public_recent_match_count' as any);
        if (cancelled) return;
        if (error || typeof data !== 'number') {
          setCount(null);
          return;
        }
        setCount(data);
      } catch {
        if (!cancelled) setCount(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Don't render until we have a meaningful number — a "0 matches this week"
  // chip on a new platform is worse than no chip at all.
  if (count === null || count < 3) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1 text-[11px] font-semibold text-primary">
      <Sparkles size={11} className="text-primary" />
      {count} matches this week
    </span>
  );
};
