// Extra time — the honest answer to "what if the job takes longer than the
// booked time?" (owner report 2026-07-30, alongside the tick-box pricing fix).
//
// The tick-box builder books the next quarter-hour UP from the ticked
// estimate, so the booked time always covers what was described. Reality
// still overruns: the ticks were optimistic, or the place is worse than the
// photos. Before this existed there were only two bad outcomes — the student
// eats the extra hour for free, or they leave the job half-done. Both cost us
// the customer.
//
// THE MODEL, and it is deliberately the simplest thing that can be true:
//   • The HELPER asks, on the job screen, for +30 min or +1 hr.
//   • The CUSTOMER approves it on /track. Nothing happens without that tap.
//     There is no auto-approval, no silent overage, no "we'll bill you after".
//   • The extra is ALWAYS paid DIRECTLY to the helper (Revolut/cash) at the
//     end, in both pay modes, and VANO takes NO fee on it. That keeps this
//     entirely out of Stripe — no second charge, no capture, no hold to
//     reconcile — and it is the legally simple shape: the customer paying the
//     worker for extra work they agreed to on the doorstep.
//   • price_estimate_cents is NEVER rewritten. That number is what was quoted
//     and (under card-pay) what was charged; every fee, refund and capture
//     path reads it. The agreed extra lives beside it in booking_data.
//
// Pure TypeScript, no Deno APIs, so src/lib/__tests__ imports it directly and
// cross-checks the frontend mirror (src/lib/extraTime.ts) — same lock-step
// pattern as the price tables.

import { computePriceCents, type Category } from './householdPricing.ts';

/** The only increments a helper can ask for. Two options, both a real chunk
 *  of work — a "+5 min" button would just be a haggling surface on someone's
 *  doorstep. */
export const EXTRA_TIME_OPTIONS = [30, 60] as const;

/** Ceiling on the TOTAL extra time approved across a booking. Past two hours
 *  the honest answer is a second booking, not a bigger one — and an unbounded
 *  accumulator is how a job quietly doubles in price. */
export const EXTRA_TIME_MAX_MINUTES = 120;

/**
 * Categories where extra time makes sense: the ones priced BY THE HOUR, where
 * "another half hour" has an obvious, already-agreed rate.
 *
 * Explicitly listed rather than inferred. Laundry is priced per bag and a dog
 * walk is priced per walk — asking a customer to approve "+30 min" on those
 * would be inventing a rate at the door, which is exactly what every other
 * price surface in this repo refuses to do.
 */
// `handyman` is deliberately absent: it is a legacy TaskShowcase slug priced
// at its own €25/hr, and the frontend's canonical table has no entry for it —
// so the two modules could not agree on what an extra half hour costs. The
// cross-check test is what surfaced that; don't add it back without giving
// src/lib/householdPricing.ts a real handyman rate.
export const EXTRA_TIME_CATEGORIES = [
  'cleaning', 'outdoor-cleaning',
  'garden', 'lawn-mowing',
  'moving', 'moving-help',
  'tutoring', 'tutoring-grinds',
  'business', 'custom',
];

/** The hourly rate to charge extra time at, read from the SAME price table
 *  the booking was quoted from (never a second copy of €22). Two hours ÷ 2
 *  because `business` has no '1 hour' entry — its minimum shift is 2 hours. */
export function extraTimeRateCents(category: string): number | null {
  if (!EXTRA_TIME_CATEGORIES.includes(category)) return null;
  const twoHours = computePriceCents(category as Category, '2 hours', '');
  return twoHours && twoHours > 0 ? Math.round(twoHours / 2) : null;
}

/** Price of an extra-time request, or null if this category/increment can't
 *  be priced — in which case the button is never offered. */
export function extraTimeCents(category: string, minutes: number): number | null {
  if (!(EXTRA_TIME_OPTIONS as readonly number[]).includes(minutes)) return null;
  const rate = extraTimeRateCents(category);
  return rate == null ? null : Math.round((rate * minutes) / 60);
}

/** The live request on a booking, as stamped into booking_data.extra_time. */
export interface ExtraTimeRequest {
  minutes: number;
  cents: number;
  requested_at: string;
  status: 'pending' | 'approved' | 'declined';
  decided_at?: string | null;
}

/** Shape of the extra-time fields we read off booking_data. */
export interface ExtraTimeState {
  extra_time?: ExtraTimeRequest | null;
  extra_time_minutes?: number | null;
  extra_time_cents?: number | null;
}

/** Total extra time already APPROVED on a booking (0 when none). */
export function approvedExtraMinutes(bd: ExtraTimeState | null | undefined): number {
  const n = Number(bd?.extra_time_minutes ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Total extra money already approved, in cents (0 when none). */
export function approvedExtraCents(bd: ExtraTimeState | null | undefined): number {
  const n = Number(bd?.extra_time_cents ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** The request awaiting the customer's tap, or null. */
export function pendingExtraTime(bd: ExtraTimeState | null | undefined): ExtraTimeRequest | null {
  const r = bd?.extra_time;
  return r && r.status === 'pending' ? r : null;
}

/** Can the helper still ask for `minutes` more? Guards the increment, the
 *  category, the running cap and the one-request-at-a-time rule — the SERVER
 *  runs this, the job screen just mirrors it to grey out a button. */
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

/** "30 min" / "1 hr" / "1 hr 30 min" — mirrors src/lib/jobBuilder's wording so
 *  the SMS, the job screen and the tracking page all say the same thing. */
export function extraTimeText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const hrs = Math.floor(m / 60);
  const rest = m % 60;
  const parts: string[] = [];
  if (hrs > 0) parts.push(`${hrs} hr${hrs === 1 ? '' : 's'}`);
  if (rest > 0 || hrs === 0) parts.push(`${rest} min`);
  return parts.join(' ');
}
