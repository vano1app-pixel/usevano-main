// Shared job-type logic for the household flow (Deno edge functions).
//
// Timed categories run a countdown from the booked duration and auto-complete
// when it ends. One-off categories are completed by the household tapping
// "mark done". Only cleaning, garden and moving actually store a booked
// duration today, so the other timed categories simply won't get a job_ends_at
// (they fall back to a manual finish / household mark-done).

export const TIMED_CATEGORIES = new Set([
  'cleaning', 'tutoring', 'garden', 'moving', 'handyman', 'wait-delivery',
]);

export function isTimedCategory(category: string): boolean {
  return TIMED_CATEGORIES.has(category);
}

// Which booking_data field holds the booked duration, per category.
const DURATION_FIELD: Record<string, string> = {
  cleaning: 'cleaningDuration',
  garden: 'gardenDuration',
  moving: 'movingDuration',
};

// Parse a booked duration id ('1hr', '2hr', '3hr', '4hr', 'half-day', '30min')
// into minutes. Returns null when there's no parseable booked duration.
export function bookedDurationMinutes(
  category: string,
  data: Record<string, unknown> | null | undefined,
): number | null {
  const field = DURATION_FIELD[category];
  if (!field || !data) return null;
  const raw = data[field];
  if (typeof raw !== 'string') return null;
  if (raw === 'half-day') return 240;
  const hr = raw.match(/^(\d+)hr$/);
  if (hr) return parseInt(hr[1], 10) * 60;
  const min = raw.match(/^(\d+)min$/);
  if (min) return parseInt(min[1], 10);
  return null;
}
