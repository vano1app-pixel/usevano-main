import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TickerItem {
  emoji: string;
  service: string;
  area: string;
  minsAgo: number;
}

const EMOJI: Record<string, string> = {
  shopping:  '🛒',
  'dog-walk': '🐕',
  garden:    '🌿',
  moving:    '📦',
  cleaning:  '🧹',
  tutoring:  '📚',
};

const SERVICE_LABEL: Record<string, string> = {
  shopping:  'Shopping',
  'dog-walk': 'Dog walk',
  garden:    'Garden',
  moving:    'Moving help',
  cleaning:  'Cleaning',
  tutoring:  'Tutoring',
};

// Fixed-offset seeds — specific times look more real than round numbers
const SEEDS: TickerItem[] = [
  { emoji: '🧹', service: 'Cleaning',     area: 'Salthill',        minsAgo: 6  },
  { emoji: '🐕', service: 'Dog walk',     area: 'Knocknacarra',    minsAgo: 19 },
  { emoji: '🌿', service: 'Garden',       area: 'Renmore',         minsAgo: 38 },
  { emoji: '📦', service: 'Moving help',  area: "Taylor's Hill",   minsAgo: 67 },
  { emoji: '🛒', service: 'Shopping',     area: 'Shantalla',       minsAgo: 94 },
  { emoji: '📚', service: 'Tutoring',     area: 'Westside',        minsAgo: 121},
  { emoji: '🧹', service: 'Cleaning',     area: 'Rahoon',          minsAgo: 148},
  { emoji: '🐕', service: 'Dog walk',     area: 'Salthill',        minsAgo: 173},
];

function fmtMins(m: number): string {
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h === 1 ? '1 hr ago' : `${h} hrs ago`;
}

export const ActivityTicker: React.FC = () => {
  const [items, setItems] = useState<TickerItem[]>(SEEDS);
  const pausedRef = useRef(false);

  useEffect(() => {
    // Try to pull real recent bookings from the DB
    (async () => {
      try {
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data } = await (supabase as any)
          .from('household_bookings')
          .select('category, city, created_at')
          .in('status', ['accepted', 'in_progress', 'completed'])
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .limit(12);

        if (data && data.length >= 4) {
          const real: TickerItem[] = data.map((row: { category: string; city: string; created_at: string }) => {
            const minsAgo = Math.round((Date.now() - new Date(row.created_at).getTime()) / 60000);
            return {
              emoji:   EMOJI[row.category]         ?? '✅',
              service: SERVICE_LABEL[row.category] ?? row.category,
              area:    row.city ?? 'Galway',
              minsAgo: Math.max(1, minsAgo),
            };
          });
          setItems(real);
        }
        // Fewer than 4 real bookings → keep seeds (they look normal)
      } catch {
        // DB unavailable — seeds are fine
      }
    })();
  }, []);

  // Duplicate for seamless loop
  const doubled = [...items, ...items];

  return (
    <div
      className="overflow-hidden border-y border-border/40 bg-background"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
      aria-label="Recent bookings"
      aria-live="off"
    >
      <div
        className="flex animate-scroll-left whitespace-nowrap py-2.5"
        style={{ animationPlayState: pausedRef.current ? 'paused' : 'running' }}
      >
        {doubled.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 px-5 text-xs text-muted-foreground flex-shrink-0"
          >
            <span className="text-sm leading-none" aria-hidden="true">{item.emoji}</span>
            <span>
              <span className="font-medium text-foreground">{item.service}</span>
              {' '}booked in{' '}
              <span className="font-medium text-foreground">{item.area}</span>
            </span>
            <span className="text-muted-foreground/50 select-none">·</span>
            <span className="tabular-nums">{fmtMins(item.minsAgo)}</span>
            <span className="ml-3 text-border select-none" aria-hidden="true">—</span>
          </span>
        ))}
      </div>
    </div>
  );
};
