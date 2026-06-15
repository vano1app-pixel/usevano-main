// Shared job-type logic for the household flow (Deno edge functions).
//
// Only four live categories are "timed" (booked and paid by the hour, with the
// helper working at the customer's home): cleaning, tutoring, garden, moving.
// Everything else (laundry, dog-walk) is one-off and finishes when the
// household taps "mark done".

export const TIMED_CATEGORIES = new Set([
  'cleaning', 'tutoring', 'garden', 'moving',
]);

export function isTimedCategory(category: string): boolean {
  return TIMED_CATEGORIES.has(category);
}

// Which booking_data field holds the multi-step booked duration, per category.
// (The quick-book grid stores a human "size_label" instead — handled below.)
const DURATION_FIELD: Record<string, string> = {
  cleaning: 'cleaningDuration',
  garden: 'gardenDuration',
  moving: 'movingDuration',
};

// Parse any of the duration shapes the two booking paths produce into minutes:
//   quick-book size_label : "1 hour", "2 hours", "30 min", "4+ hours", "half day"
//   multi-step ids        : "1hr", "2hr", "half-day", "30min"
function parseMinutes(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes('half')) return 240; // half day
  const hr = s.match(/(\d+)\s*\+?\s*(hr|hour|hours|h)\b/) ?? s.match(/^(\d+)hr$/);
  if (hr) return parseInt(hr[1], 10) * 60;
  const min = s.match(/(\d+)\s*(min|mins|minute|minutes)\b/) ?? s.match(/^(\d+)min$/);
  if (min) return parseInt(min[1], 10);
  return null;
}

// Booked duration in minutes, or null when there's no parseable duration.
export function bookedDurationMinutes(
  category: string,
  data: Record<string, unknown> | null | undefined,
): number | null {
  if (!data) return null;
  const sizeLabel = data.size_label;
  if (typeof sizeLabel === 'string') {
    const m = parseMinutes(sizeLabel);
    if (m) return m;
  }
  const field = DURATION_FIELD[category];
  if (field && typeof data[field] === 'string') return parseMinutes(data[field] as string);
  return null;
}
