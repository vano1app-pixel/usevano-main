// Frontend mirror of supabase/functions/_shared/extraTime.ts — the "this job
// is bigger than it was booked for" flow (2026-07-30).
//
// Read the server module for the reasoning; the short version is:
//   • the helper ASKS for +30 min or +1 hr on the job screen,
//   • the customer APPROVES it on /track — never automatic, never silent,
//   • the extra is paid DIRECTLY to the helper at the end, in both pay modes,
//     with NO Vano fee on it, so nothing touches Stripe,
//   • price_estimate_cents is never rewritten; the agreed extra lives beside
//     it in booking_data.
//
// The SERVER decides both the price and whether a request is allowed. Every
// number here is display-only, and src/lib/__tests__/extraTime.test.ts fails
// if the two modules ever disagree on any category × increment.

import { getHouseholdPriceCents } from './householdPricing';

export const EXTRA_TIME_OPTIONS = [30, 60] as const;
export const EXTRA_TIME_MAX_MINUTES = 120;

export const EXTRA_TIME_CATEGORIES = [
  'cleaning', 'outdoor-cleaning',
  'garden', 'lawn-mowing',
  'moving', 'moving-help',
  'tutoring', 'tutoring-grinds',
  'business', 'custom',
];

/**
 * The alias slugs (legacy TaskShowcase bookings) that the SERVER table prices
 * through a shared branch — `garden || lawn-mowing`, `cleaning ||
 * outdoor-cleaning` and so on. The frontend table is keyed on the quick-book
 * slugs only, so it needs the mapping spelled out or the mirror would quote
 * null where the server quotes €22. extraTime.test.ts compares every category
 * in VALID_CATEGORIES against the real server module, which is how this list
 * was found in the first place.
 */
const HOURLY_ALIASES: Record<string, string> = {
  'outdoor-cleaning': 'cleaning',
  'lawn-mowing':      'garden',
  'moving-help':      'moving',
  'tutoring-grinds':  'tutoring',
};

export function extraTimeRateCents(category: string): number | null {
  if (!EXTRA_TIME_CATEGORIES.includes(category)) return null;
  const twoHours = getHouseholdPriceCents(HOURLY_ALIASES[category] ?? category, '2 hours');
  return twoHours && twoHours > 0 ? Math.round(twoHours / 2) : null;
}

export function extraTimeCents(category: string, minutes: number): number | null {
  if (!(EXTRA_TIME_OPTIONS as readonly number[]).includes(minutes)) return null;
  const rate = extraTimeRateCents(category);
  return rate == null ? null : Math.round((rate * minutes) / 60);
}

export interface ExtraTimeRequest {
  minutes: number;
  cents: number;
  requested_at: string;
  status: 'pending' | 'approved' | 'declined';
  decided_at?: string | null;
}

export interface ExtraTimeState {
  extra_time?: ExtraTimeRequest | null;
  extra_time_minutes?: number | null;
  extra_time_cents?: number | null;
}

export function approvedExtraMinutes(bd: ExtraTimeState | null | undefined): number {
  const n = Number(bd?.extra_time_minutes ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function approvedExtraCents(bd: ExtraTimeState | null | undefined): number {
  const n = Number(bd?.extra_time_cents ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export function pendingExtraTime(bd: ExtraTimeState | null | undefined): ExtraTimeRequest | null {
  const r = bd?.extra_time;
  return r && r.status === 'pending' ? r : null;
}

export function canRequestExtraTime(
  category: string,
  bd: ExtraTimeState | null | undefined,
  minutes: number,
): { ok: true; cents: number } | { ok: false; reason: string } {
  const cents = extraTimeCents(category, minutes);
  if (cents == null) return { ok: false, reason: 'Extra time is not available for this job.' };
  if (pendingExtraTime(bd)) return { ok: false, reason: 'You already have a request waiting for the customer.' };
  if (approvedExtraMinutes(bd) + minutes > EXTRA_TIME_MAX_MINUTES) {
    return { ok: false, reason: `Extra time is capped at ${EXTRA_TIME_MAX_MINUTES / 60} hours — anything more should be a fresh booking.` };
  }
  return { ok: true, cents };
}

export function extraTimeText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const hrs = Math.floor(m / 60);
  const rest = m % 60;
  const parts: string[] = [];
  if (hrs > 0) parts.push(`${hrs} hr${hrs === 1 ? '' : 's'}`);
  if (rest > 0 || hrs === 0) parts.push(`${rest} min`);
  return parts.join(' ');
}
