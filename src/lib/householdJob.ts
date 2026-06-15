// Job-type helpers shared by the helper (StudentJobDetail) and customer
// (TrackBooking) screens. Mirrors supabase/functions/_shared/householdJob.ts.
//
// Timed jobs run a countdown from the booked duration and auto-complete when it
// ends. One-off jobs are completed by the household tapping "mark done".

export const TIMED_CATEGORIES = new Set([
  'cleaning', 'tutoring', 'garden', 'moving', 'handyman', 'wait-delivery',
]);

export function isTimedCategory(category: string): boolean {
  return TIMED_CATEGORIES.has(category);
}

// "1:23:45" or "4:09" (drops the hours segment under an hour). Clamps at zero.
export function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
