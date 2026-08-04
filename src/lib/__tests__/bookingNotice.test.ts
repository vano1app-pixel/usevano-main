import { describe, expect, it } from 'vitest';
// The REAL server module the edge functions run — same cross-check pattern as
// the price tables: checkout enforces this floor, so it can't be a mirror
// that drifts from what the sheet shows.
import {
  MIN_NOTICE_HOURS,
  MIN_NOTICE_MS,
  applyNoticeFloor,
  earliestStart,
  noticeLabel,
} from '../../../supabase/functions/_shared/bookingNotice';
import { MIN_NOTICE_HOURS as SHEET_MIN_NOTICE_HOURS } from '../../components/household/CategoryGrid';

// A fixed instant so the tests don't depend on when they run: 11:07 on a
// summer Thursday in Dublin (IST, UTC+1).
const AT_11_07 = Date.parse('2026-07-30T10:07:00Z');

describe('minimum notice — "now" was a promise supply could not keep', () => {
  it('the sheet and the server agree on the floor', () => {
    // The chips are the polite version of the rule; the server IS the rule.
    // If these drift, the sheet offers a slot checkout will silently move.
    expect(SHEET_MIN_NOTICE_HOURS).toBe(MIN_NOTICE_HOURS);
    expect(MIN_NOTICE_HOURS).toBe(3);
    expect(MIN_NOTICE_MS).toBe(3 * 60 * 60 * 1000);
  });

  it('the earliest start is at least the full notice, rounded UP to a half hour', () => {
    // Rounding must never shave the floor — 11:07 + 3h = 14:07 → 14:30, not 14:00.
    const e = earliestStart(AT_11_07);
    expect(e.getTime() - AT_11_07).toBeGreaterThanOrEqual(MIN_NOTICE_MS);
    expect(e.toISOString()).toBe('2026-07-30T13:30:00.000Z'); // 14:30 Dublin
    // …but an exact boundary is left alone: 11:00 + 3h is 14:00, not 14:30.
    // Blind rounding cost the customer half an hour of waiting for nothing.
    expect(earliestStart(Date.parse('2026-07-30T10:00:00Z')).toISOString()).toBe('2026-07-30T13:00:00.000Z');
    expect(earliestStart(Date.parse('2026-07-30T10:30:00Z')).toISOString()).toBe('2026-07-30T13:30:00.000Z');
    // Sweep a whole day of booking times: never under the floor, always :00/:30.
    for (let m = 0; m < 24 * 60; m += 7) {
      const now = AT_11_07 + m * 60_000;
      const start = earliestStart(now);
      expect(start.getTime() - now, `booked at +${m}m`).toBeGreaterThanOrEqual(MIN_NOTICE_MS);
      expect([0, 30]).toContain(start.getUTCMinutes());
      expect(start.getUTCSeconds()).toBe(0);
    }
  });

  it('LIFTS anything too soon instead of rejecting it', () => {
    // A booking must never die because someone asked for it too soon — the
    // WhatsApp door and old cached bundles both send times we have to absorb.
    for (const req of [null, undefined, '', 'not-a-date', new Date(AT_11_07).toISOString(),
      new Date(AT_11_07 + 60 * 60 * 1000).toISOString()]) {
      const r = applyNoticeFloor(req as string | null, AT_11_07);
      expect(r.moved, `${req}`).toBe(true);
      expect(Date.parse(r.scheduledAt) - AT_11_07).toBeGreaterThanOrEqual(MIN_NOTICE_MS);
    }
  });

  it('leaves a genuinely later booking exactly where the customer put it', () => {
    const tomorrow9 = new Date(AT_11_07 + 22 * 60 * 60 * 1000).toISOString();
    const r = applyNoticeFloor(tomorrow9, AT_11_07);
    expect(r.moved).toBe(false);
    expect(r.scheduledAt).toBe(tomorrow9);
    // Exactly on the floor counts as fine, not moved.
    const onTheLine = earliestStart(AT_11_07).toISOString();
    expect(applyNoticeFloor(onTheLine, AT_11_07).moved).toBe(false);
  });

  it('labels a floored booking in Dublin time, not the server’s UTC', () => {
    // An edge function in another region would otherwise tell an Irish
    // customer their 2:30pm job is at 1:30pm for half the year.
    expect(noticeLabel('2026-07-30T13:30:00.000Z', AT_11_07)).toBe('Today 2:30pm');
    expect(noticeLabel('2026-07-30T08:00:00.000Z', AT_11_07)).toBe('Today 9am');
    expect(noticeLabel('2026-07-31T08:00:00.000Z', AT_11_07)).toBe('Tomorrow 9am');
    // Winter — Dublin is UTC, so the same UTC stamp reads an hour earlier.
    const janNow = Date.parse('2026-01-15T10:00:00Z');
    expect(noticeLabel('2026-01-15T14:30:00.000Z', janNow)).toBe('Today 2:30pm');
    // Junk never renders as "Invalid Date" on a customer's screen.
    expect(noticeLabel('nonsense', AT_11_07)).toBe('Flexible');
  });

  it('every floored booking gets a label that says a real time', () => {
    // The pairing that matters: whatever checkout stamps, the label must
    // describe it — never "Now", never "flexible".
    for (let m = 0; m < 24 * 60; m += 37) {
      const now = AT_11_07 + m * 60_000;
      const { scheduledAt, moved } = applyNoticeFloor(null, now);
      expect(moved).toBe(true);
      const label = noticeLabel(scheduledAt, now);
      expect(label, `booked at +${m}m`).toMatch(/^(Today|Tomorrow|\w{3} \d+ \w{3}) \d{1,2}(:\d{2})?(am|pm)$/);
      expect(label.toLowerCase()).not.toContain('now');
    }
  });
});
