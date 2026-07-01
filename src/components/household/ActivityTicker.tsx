import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TickerItem {
  emoji: string;
  service: string;
  area: string;
  baseMinsAgo: number; // age at the moment the item was fetched/seeded
  fetchedAt: number;   // Date.now() when minsAgo was captured
}

const EMOJI: Record<string, string> = {
  shopping:   '🛒',
  'dog-walk': '🐕',
  garden:     '🌿',
  moving:     '📦',
  cleaning:   '🧹',
  laundry:    '🧺',
  tutoring:   '📚',
  custom:     '✨',
};

const SERVICE_LABEL: Record<string, string> = {
  shopping:   'Shopping',
  'dog-walk': 'Dog walk',
  garden:     'Garden',
  moving:     'Moving help',
  cleaning:   'Cleaning',
  laundry:    'Laundry',
  tutoring:   'Tutoring',
  custom:     'Home help', // quick-search bookings land as `custom` — never show the raw slug
};

// Seeds use non-round offsets so they don't feel generated.
// fetchedAt is set at module load so the ages advance in real time.
const NOW = Date.now();
const SEEDS: TickerItem[] = [
  { emoji: '🧹', service: 'Cleaning',    area: 'Salthill',      baseMinsAgo: 6,   fetchedAt: NOW },
  { emoji: '🐕', service: 'Dog walk',    area: 'Knocknacarra',  baseMinsAgo: 19,  fetchedAt: NOW },
  { emoji: '🌿', service: 'Garden',      area: 'Renmore',       baseMinsAgo: 38,  fetchedAt: NOW },
  { emoji: '📦', service: 'Moving help', area: "Taylor's Hill", baseMinsAgo: 67,  fetchedAt: NOW },
  { emoji: '🛒', service: 'Shopping',    area: 'Shantalla',     baseMinsAgo: 94,  fetchedAt: NOW },
  // No tutoring seed — tutoring is online/adults-only now, so an area-tagged
  // in-person framing would misrepresent the service.
  { emoji: '🧺', service: 'Laundry',     area: 'Westside',      baseMinsAgo: 121, fetchedAt: NOW },
  { emoji: '🧹', service: 'Cleaning',    area: 'Rahoon',        baseMinsAgo: 148, fetchedAt: NOW },
  { emoji: '🐕', service: 'Dog walk',    area: 'Salthill',      baseMinsAgo: 173, fetchedAt: NOW },
];

function currentMins(item: TickerItem, nowMs: number): number {
  const elapsed = Math.floor((nowMs - item.fetchedAt) / 60000);
  return item.baseMinsAgo + elapsed;
}

function fmtMins(m: number): string {
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h === 1 ? '1 hr ago' : `${h} hrs ago`;
}

export const ActivityTicker: React.FC<{ dark?: boolean }> = ({ dark = false }) => {
  const [items,  setItems]  = useState<TickerItem[]>(SEEDS);
  const [paused, setPaused] = useState(false);
  // Tick every minute so displayed ages advance in real time
  const [nowMs,  setNowMs]  = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from('household_bookings')
          .select('category, city, created_at')
          .in('status', ['accepted', 'in_progress', 'completed'])
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .limit(12);

        if (data && data.length >= 4) {
          const fetchedAt = Date.now();
          const real: TickerItem[] = data.map((row: { category: string; city: string; created_at: string }) => ({
            emoji:       EMOJI[row.category]         ?? '✅',
            service:     SERVICE_LABEL[row.category] ?? row.category,
            area:        row.city ?? 'Galway',
            baseMinsAgo: Math.max(1, Math.round((fetchedAt - new Date(row.created_at).getTime()) / 60000)),
            fetchedAt,
          }));
          setItems(real);
        }
      } catch {
        // DB unavailable — seeds age correctly on their own
      }
    })();
  }, []);

  const doubled = [...items, ...items];

  return (
    <div
      className={dark
        ? "overflow-hidden border-y border-white/10 bg-navy"
        : "overflow-hidden border-y border-border/70 bg-cream"}
      style={{
        // Feather the left/right edges so items melt in and out instead of a hard cut
        maskImage: 'linear-gradient(to right, transparent, black 6%, black 94%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 6%, black 94%, transparent)',
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="Recent bookings"
      aria-live="off"
    >
      <div
        className="flex animate-scroll-left whitespace-nowrap py-2.5"
        style={{ animationPlayState: paused ? 'paused' : 'running' }}
      >
        {doubled.map((item, i) => (
          <span
            key={i}
            className={dark
              ? "inline-flex items-center gap-1.5 px-5 text-xs text-white/50 flex-shrink-0"
              : "inline-flex items-center gap-1.5 px-5 text-xs text-muted-foreground flex-shrink-0"}
          >
            <span className="text-sm leading-none" aria-hidden="true">{item.emoji}</span>
            <span>
              <span className={dark ? "font-medium text-white/80" : "font-medium text-foreground"}>{item.service}</span>
              {' '}booked in{' '}
              <span className={dark ? "font-medium text-white/80" : "font-medium text-foreground"}>{item.area}</span>
            </span>
            <span className={dark ? "text-white/20 select-none" : "text-muted-foreground/50 select-none"}>·</span>
            <span className="tabular-nums">{fmtMins(currentMins(item, nowMs))}</span>
            <span className={dark ? "ml-3 text-white/20 select-none" : "ml-3 text-border select-none"} aria-hidden="true">—</span>
          </span>
        ))}
      </div>
    </div>
  );
};
