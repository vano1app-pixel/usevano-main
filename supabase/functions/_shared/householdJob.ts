// Shared job-type logic for the household flow (Deno edge functions).
//
// "Timed" categories are booked and paid by the hour, so they get a
// job_ends_at countdown: the legacy tiles (cleaning, tutoring, garden,
// moving) AND `custom` — every search-bar booking lands as `custom` with an
// hourly size_label ("2 hours", "30 min"), so it's timed too. Without it the
// entire live front door would silently skip the countdown. One-off jobs
// (laundry, dog-walk) finish when the household taps "mark done".

export const TIMED_CATEGORIES = new Set([
  'cleaning', 'tutoring', 'garden', 'moving', 'custom',
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
//   quick-book size_label : "1 hour", "2 hours", "1.75 hours", "30 min",
//                           "4+ hours", "half day"
//   multi-step ids        : "1hr", "2hr", "half-day", "30min"
//
// THE DECIMAL MATTERS. The hour pattern used to be `(\d+)`, which cannot match
// "1.75" — so the scanner skipped past the "1." and matched the FRACTION:
// "1.5 hours" parsed as 5 hours and "1.75 hours" as 75. That fed
// bookedDurationMinutes → job_ends_at, so every tick-box booking with a
// fractional size has been giving the helper a wildly wrong countdown since
// half-hour steps shipped (2026-07-27). Found while adding quarter-hours;
// householdJob.test.ts now pins every label both price tables can produce.
function parseMinutes(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes('half')) return 240; // half day
  const hr = s.match(/(\d+(?:\.\d+)?)\s*\+?\s*(hr|hour|hours|h)\b/) ?? s.match(/^(\d+(?:\.\d+)?)hr$/);
  if (hr) return Math.round(parseFloat(hr[1]) * 60);
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

/**
 * Human duration for a size label — "1 hr 45 min" from "1.75 hours".
 *
 * The tick-box builder computes quarter-hour labels as DECIMALS because every
 * price parser in this repo reads a leading number, but nobody books "1.75
 * hours". Anything that isn't a duration ("2 bags", "Small area") comes back
 * untouched. Mirrors durationText in src/lib/jobBuilder.ts.
 */
export function durationText(sizeLabel: string): string {
  const m = parseMinutes(sizeLabel);
  if (m == null) return sizeLabel;
  const hrs = Math.floor(m / 60);
  const rest = m % 60;
  const parts: string[] = [];
  if (hrs > 0) parts.push(`${hrs} hr${hrs === 1 ? '' : 's'}`);
  if (rest > 0 || hrs === 0) parts.push(`${rest} min`);
  return parts.join(' ');
}
