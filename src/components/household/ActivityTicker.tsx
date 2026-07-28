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

// NO seed/invented activity — ever (same rule as ReviewCarousel). "Cleaning
// booked in Salthill · 6 min ago" is a factual claim; showing invented
// bookings as recent activity is fake social proof (a misleading commercial
// practice), so the ticker renders ONLY rows from the real-activity RPC and
// stays hidden until enough genuine bookings exist.

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
  const [items,  setItems]  = useState<TickerItem[]>([]);
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
        // Non-PII activity via a SECURITY DEFINER RPC (category + area + time
        // only) — the anon role can no longer read household_bookings directly,
        // so the ticker can never leak a customer name, address or phone.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any).rpc('recent_household_activity');

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
        // DB unavailable — the ticker simply stays hidden
      }
    })();
  }, []);

  // Nothing genuine to show yet — show nothing. Never pad with fiction.
  if (items.length === 0) return null;

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
      {/* w-max is load-bearing: animate-scroll-left translates by -50% of the
          element's OWN width. Without it the track is viewport-width, the loop
          travels half a screen and visibly snaps back. */}
      <div
        className="flex w-max animate-scroll-left whitespace-nowrap py-2.5"
        style={{ animationPlayState: paused ? 'paused' : 'running' }}
      >
        {doubled.map((item, i) => (
          <span
            key={i}
            aria-hidden={i >= doubled.length / 2 || undefined}
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
