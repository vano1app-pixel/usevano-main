import { describe, expect, it } from 'vitest';
import {
  EXTRA_TIME_CATEGORIES,
  EXTRA_TIME_MAX_MINUTES,
  EXTRA_TIME_OPTIONS,
  approvedExtraCents,
  approvedExtraMinutes,
  canRequestExtraTime,
  extraTimeCents,
  extraTimeRateCents,
  extraTimeText,
  pendingExtraTime,
} from '../extraTime';
// The REAL server module the edge functions run — same cross-check pattern as
// the price tables and serviceAreas: the frontend mirror can never drift.
import {
  EXTRA_TIME_CATEGORIES as SERVER_CATEGORIES,
  EXTRA_TIME_MAX_MINUTES as SERVER_MAX,
  EXTRA_TIME_OPTIONS as SERVER_OPTIONS,
  canRequestExtraTime as serverCanRequest,
  extraTimeCents as serverExtraTimeCents,
  extraTimeText as serverExtraTimeText,
} from '../../../supabase/functions/_shared/extraTime';
import { VALID_CATEGORIES } from '../../../supabase/functions/_shared/householdPricing';
import { HOURLY_RATE_CENTS } from '../householdPricing';

describe('extra time — the "this job is bigger than booked" handshake', () => {
  it('the frontend mirror and the server rules are identical', () => {
    expect(EXTRA_TIME_CATEGORIES).toEqual(SERVER_CATEGORIES);
    expect([...EXTRA_TIME_OPTIONS]).toEqual([...SERVER_OPTIONS]);
    expect(EXTRA_TIME_MAX_MINUTES).toBe(SERVER_MAX);
  });

  it('prices every category × increment identically on both tables', () => {
    for (const category of VALID_CATEGORIES) {
      for (const minutes of [15, 30, 45, 60, 90]) {
        expect(extraTimeCents(category, minutes), `${category} +${minutes}`)
          .toBe(serverExtraTimeCents(category, minutes));
      }
    }
  });

  it('is offered ONLY where the job is priced by the hour', () => {
    // Laundry is per bag and a dog walk is per walk — "+30 min" there would be
    // inventing a rate on someone's doorstep, which every other price surface
    // in this repo refuses to do.
    expect(extraTimeRateCents('shopping')).toBeNull();
    expect(extraTimeRateCents('dog-walk')).toBeNull();
    expect(extraTimeRateCents('post-office')).toBeNull();
    expect(extraTimeCents('shopping', 30)).toBeNull();
    // Legacy slug at its own €25/hr with no frontend entry — see the comment
    // on EXTRA_TIME_CATEGORIES. The two tables could not agree, so it's out.
    expect(extraTimeRateCents('handyman')).toBeNull();
    for (const category of EXTRA_TIME_CATEGORIES) {
      const rate = extraTimeRateCents(category);
      expect(rate, `${category} must be priceable on BOTH tables`).not.toBeNull();
      expect(rate as number, category).toBeGreaterThan(0);
    }
  });

  it('charges extra time at the SAME hourly rate the job was booked at', () => {
    // Not a second copy of €22 — it reads the canonical table, so a rate
    // change can never leave extra time behind at the old price.
    for (const category of ['cleaning', 'garden', 'moving', 'tutoring', 'custom']) {
      expect(extraTimeRateCents(category), category).toBe(HOURLY_RATE_CENTS[category]);
      expect(extraTimeCents(category, 60)).toBe(HOURLY_RATE_CENTS[category]);
      expect(extraTimeCents(category, 30)).toBe(Math.round(HOURLY_RATE_CENTS[category] / 2));
    }
    // Business keeps its premium (no '1 hour' entry — 2-hour minimum shift).
    expect(extraTimeRateCents('business')).toBe(2800);
    // Legacy alias slugs price exactly like the category they're an alias of.
    expect(extraTimeRateCents('lawn-mowing')).toBe(extraTimeRateCents('garden'));
    expect(extraTimeRateCents('outdoor-cleaning')).toBe(extraTimeRateCents('cleaning'));
    expect(extraTimeRateCents('moving-help')).toBe(extraTimeRateCents('moving'));
    expect(extraTimeRateCents('tutoring-grinds')).toBe(extraTimeRateCents('tutoring'));
  });

  it('only the two real increments are accepted', () => {
    expect([...EXTRA_TIME_OPTIONS]).toEqual([30, 60]);
    for (const bad of [0, -30, 5, 15, 45, 61, 120, NaN]) {
      expect(extraTimeCents('cleaning', bad), `${bad}`).toBeNull();
    }
  });

  it('caps the total extra on one booking — a job can never quietly double', () => {
    const at = (mins: number) => ({ extra_time_minutes: mins, extra_time_cents: mins * 37 });
    expect(canRequestExtraTime('cleaning', at(60), 60).ok).toBe(true);   // 120 = the cap exactly
    expect(canRequestExtraTime('cleaning', at(90), 60).ok).toBe(false);  // 150 > cap
    expect(canRequestExtraTime('cleaning', at(EXTRA_TIME_MAX_MINUTES), 30).ok).toBe(false);
    // …and the server agrees, case for case.
    for (const already of [0, 30, 60, 90, 120]) {
      for (const minutes of [30, 60]) {
        expect(canRequestExtraTime('cleaning', at(already), minutes).ok, `${already}+${minutes}`)
          .toBe(serverCanRequest('cleaning', at(already), minutes).ok);
      }
    }
  });

  it('refuses a second request while one is still waiting on the customer', () => {
    const waiting = {
      extra_time: { minutes: 30, cents: 1100, requested_at: '2026-07-30T10:00:00Z', status: 'pending' as const },
    };
    expect(canRequestExtraTime('cleaning', waiting, 30).ok).toBe(false);
    expect(pendingExtraTime(waiting)?.minutes).toBe(30);
    // An answered request is not a blocker — the helper can ask again.
    const answered = { extra_time: { ...waiting.extra_time, status: 'approved' as const } };
    expect(pendingExtraTime(answered)).toBeNull();
    expect(canRequestExtraTime('cleaning', answered, 30).ok).toBe(true);
    expect(pendingExtraTime({ extra_time: { ...waiting.extra_time, status: 'declined' } })).toBeNull();
  });

  it('reads approved totals fail-soft — junk booking_data is zero, never NaN', () => {
    expect(approvedExtraMinutes(null)).toBe(0);
    expect(approvedExtraMinutes({})).toBe(0);
    expect(approvedExtraCents(undefined)).toBe(0);
    expect(approvedExtraMinutes({ extra_time_minutes: -5 })).toBe(0);
    expect(approvedExtraCents({ extra_time_cents: Number.NaN })).toBe(0);
    expect(approvedExtraCents({ extra_time_cents: 1100 })).toBe(1100);
    expect(approvedExtraMinutes({ extra_time_minutes: 30 })).toBe(30);
    // A booking that never saw an extra-time request is untouched by all of it.
    expect(canRequestExtraTime('cleaning', {}, 30)).toEqual({ ok: true, cents: 1100 });
  });

  it('says the duration the same way on both sides of the handshake', () => {
    expect(extraTimeText(30)).toBe('30 min');
    expect(extraTimeText(60)).toBe('1 hr');
    expect(extraTimeText(90)).toBe('1 hr 30 min');
    expect(extraTimeText(120)).toBe('2 hrs');
    for (const m of [0, 30, 45, 60, 90, 120]) {
      expect(extraTimeText(m), `${m}`).toBe(serverExtraTimeText(m));
    }
  });
});
