import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TickerItem {
  emoji: string;
  service: string;
  area: string;
  slug: string | null;  // core category slug → tapping books it; null = not tappable
  baseMinsAgo: number;  // age at the moment the item was fetched
  fetchedAt: number;    // Date.now() when minsAgo was captured
}

const EMOJI: Record<string, string> = {
  shopping:   '🧺',
  'dog-walk': '🐕',
  garden:     '🌿',
  moving:     '📦',
  cleaning:   '🧹',
  laundry:    '🧺',
  tutoring:   '📚',
  custom:     '✨',
};

const SERVICE_LABEL: Record<string, string> = {
  shopping:   'Laundry',
  'dog-walk': 'Dog walk',
  garden:     'Garden',
  moving:     'Moving help',
  cleaning:   'Cleaning',
  laundry:    'Laundry',
  tutoring:   'Tutoring',
  custom:     'Home help', // quick-search bookings land as `custom` — never show the raw slug
};

// Tapping an activity item opens the quick-book sheet for that category —
// only for the categories the sheet actually offers.
const BOOKABLE = new Set(['shopping', 'dog-walk', 'garden', 'moving', 'cleaning']);

// Honest fallback for quiet periods: real facts about the service, NOT
// invented bookings. Fabricated "Cleaning · Salthill · 6 min ago" items are
// fake social proof — the exact trust-burner this brand can't afford.
const FACTS: Array<{ emoji: string; text: string }> = [
  { emoji: '🛡️', text: 'Students are ID-checked before their first job' },
  { emoji: '💶', text: '€18/hr flat — no hidden fees' },
  { emoji: '👀', text: 'You see your helper before they arrive' },
  { emoji: '💳', text: 'Pay only after a helper accepts' },
  { emoji: '✅', text: 'Money-back guarantee on every job' },
  { emoji: '⚡', text: 'Same-day help across Galway' },
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

function bookCategory(slug: string) {
  window.dispatchEvent(new CustomEvent('vano:select-category', { detail: { slug } }));
}

export const ActivityTicker: React.FC<{ dark?: boolean }> = ({ dark = false }) => {
  // null = still loading (render nothing yet — never a fabricated frame).
  const [items,  setItems]  = useState<TickerItem[] | null>(null);
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

        if (data && data.length >= 3) {
          const fetchedAt = Date.now();
          const real: TickerItem[] = data.map((row: { category: string; city: string; created_at: string }) => ({
            emoji:       EMOJI[row.category]         ?? '✅',
            service:     SERVICE_LABEL[row.category] ?? row.category,
            area:        row.city ?? 'Galway',
            slug:        BOOKABLE.has(row.category) ? row.category : null,
            baseMinsAgo: Math.max(1, Math.round((fetchedAt - new Date(row.created_at).getTime()) / 60000)),
            fetchedAt,
          }));
          setItems(real);
          return;
        }
      } catch {
        /* DB unavailable — fall through to facts */
      }
      setItems([]); // quiet period / no DB → facts mode
    })();
  }, []);

  if (items === null) return null; // loading — show nothing rather than anything invented

  const factsMode = items.length === 0;
  const doubled = factsMode ? [...FACTS, ...FACTS] : [...items, ...items];

  const mutedText  = dark ? 'text-white/50'  : 'text-muted-foreground';
  const strongText = dark ? 'font-medium text-white/80' : 'font-medium text-foreground';
  const dotText    = dark ? 'text-white/20 select-none' : 'text-muted-foreground/50 select-none';
  const dashText   = dark ? 'ml-3 text-white/20 select-none' : 'ml-3 text-border select-none';

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
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      onTouchCancel={() => setPaused(false)}
      aria-label={factsMode ? "Why VANO" : "Recent bookings"}
      aria-live="off"
    >
      <div
        className="flex animate-scroll-left whitespace-nowrap py-2.5"
        style={{ animationPlayState: paused ? 'paused' : 'running' }}
      >
        {factsMode
          ? (doubled as typeof FACTS).map((f, i) => (
              <span key={i} className={`inline-flex items-center gap-1.5 px-5 text-xs flex-shrink-0 ${mutedText}`}>
                <span className="text-sm leading-none" aria-hidden="true">{f.emoji}</span>
                <span className={strongText}>{f.text}</span>
                <span className={dashText} aria-hidden="true">—</span>
              </span>
            ))
          : (doubled as TickerItem[]).map((item, i) => {
              const body = (
                <>
                  <span className="text-sm leading-none" aria-hidden="true">{item.emoji}</span>
                  <span>
                    <span className={strongText}>{item.service}</span>
                    {' '}booked in{' '}
                    <span className={strongText}>{item.area}</span>
                  </span>
                  <span className={dotText}>·</span>
                  <span className="tabular-nums">{fmtMins(currentMins(item, nowMs))}</span>
                  <span className={dashText} aria-hidden="true">—</span>
                </>
              );
              // Real bookings for a bookable category are tappable — "book this too".
              return item.slug ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => bookCategory(item.slug!)}
                  className={`inline-flex items-center gap-1.5 px-5 text-xs flex-shrink-0 cursor-pointer transition-opacity hover:opacity-75 ${mutedText}`}
                  aria-label={`Book a ${item.service.toLowerCase()} like this one`}
                >
                  {body}
                </button>
              ) : (
                <span key={i} className={`inline-flex items-center gap-1.5 px-5 text-xs flex-shrink-0 ${mutedText}`}>
                  {body}
                </span>
              );
            })}
      </div>
    </div>
  );
};
