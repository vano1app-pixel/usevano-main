import { describe, expect, it } from 'vitest';
// The REAL server judgment module (pure TS, no Deno APIs) — same pattern as
// the pricing cross-checks: the rules the copilot runs in production are the
// rules under test, not a copy.
import {
  CLOCKS,
  type BookingSnapshot,
  triageBoard,
  triageBooking,
} from '../../../supabase/functions/_shared/opsTriage';

const NOW = Date.parse('2026-07-30T12:00:00Z');
const minAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const base = (over: Partial<BookingSnapshot>): BookingSnapshot => ({
  id: 'b1',
  status: 'pending',
  category: 'cleaning',
  city: 'Galway',
  customer_name: 'Mary',
  customer_phone: '+353871234567',
  created_at: minAgo(10),
  scheduled_at: null,
  accepted_at: null,
  paid_at: null,
  payment_requested_at: null,
  helper_finished_at: null,
  job_ends_at: null,
  disputed_at: null,
  refunded_at: null,
  student_id: null,
  ...over,
});

const kinds = (b: BookingSnapshot) => triageBooking(b, NOW).map((s) => s.kind);

describe('opsTriage — the copilot flags exactly what a human should look at', () => {
  it('a healthy young board is quiet (no noise = the whole point)', () => {
    expect(kinds(base({}))).toEqual([]); // fresh pending
    expect(kinds(base({ status: 'awaiting_payment', created_at: minAgo(5) }))).toEqual([]);
    expect(kinds(base({
      status: 'accepted', student_id: 'u1', paid_at: minAgo(5),
      payment_requested_at: minAgo(6), accepted_at: minAgo(7),
    }))).toEqual([]);
    expect(kinds(base({ status: 'cancelled', disputed_at: minAgo(999) }))).toEqual([]);
  });

  it('no-helper escalates warn → critical on the pinned clocks', () => {
    expect(kinds(base({ created_at: minAgo(CLOCKS.NO_HELPER_WARN_MIN - 1) }))).toEqual([]);
    const warn = triageBooking(base({ created_at: minAgo(CLOCKS.NO_HELPER_WARN_MIN) }), NOW);
    expect(warn[0]?.kind).toBe('no_helper');
    expect(warn[0]?.severity).toBe('warn');
    const crit = triageBooking(base({ created_at: minAgo(CLOCKS.NO_HELPER_CRIT_MIN) }), NOW);
    expect(crit[0]?.severity).toBe('critical');
  });

  it("a future-scheduled job isn't 'unclaimed' before its dispatch window opens", () => {
    // Booked 3 h ago for tomorrow — dispatch hasn't even fanned out yet.
    const tomorrow = new Date(NOW + 24 * 60 * 60_000).toISOString();
    expect(kinds(base({ created_at: minAgo(180), scheduled_at: tomorrow }))).toEqual([]);
    // Same age, but the job starts in 10 min (window opened 80 min ago) → fire.
    const soon = new Date(NOW + 10 * 60_000).toISOString();
    expect(kinds(base({ created_at: minAgo(180), scheduled_at: soon }))).toContain('no_helper');
  });

  it('fee unpaid after accept escalates on the pinned clocks', () => {
    const acc = (m: number) => base({
      status: 'accepted', student_id: 'u1', accepted_at: minAgo(m + 1),
      payment_requested_at: minAgo(m), helper_name: 'Seán',
    });
    expect(kinds(acc(CLOCKS.FEE_UNPAID_WARN_MIN - 1))).toEqual([]);
    expect(triageBooking(acc(CLOCKS.FEE_UNPAID_WARN_MIN), NOW)[0]?.severity).toBe('warn');
    expect(triageBooking(acc(CLOCKS.FEE_UNPAID_CRIT_MIN), NOW)[0]?.severity).toBe('critical');
  });

  it('paid ASAP job with a helper not moving fires at the pinned clock', () => {
    const b = base({
      status: 'accepted', student_id: 'u1',
      paid_at: minAgo(CLOCKS.NOT_MOVING_ASAP_MIN), payment_requested_at: minAgo(70),
    });
    expect(kinds(b)).toContain('helper_not_moving');
    // On-way tapped → quiet.
    expect(kinds({ ...b, last_on_way_at: minAgo(5), status: 'accepted' })).toEqual([]);
  });

  it('scheduled job past start without movement escalates by lateness', () => {
    const started = (late: number) => base({
      status: 'accepted', student_id: 'u1', paid_at: minAgo(120),
      scheduled_at: minAgo(late),
    });
    const warn = triageBooking(started(CLOCKS.NOT_MOVING_SCHED_GRACE_MIN), NOW);
    expect(warn[0]?.kind).toBe('helper_not_moving');
    expect(warn[0]?.severity).toBe('warn');
    expect(triageBooking(started(45), NOW)[0]?.severity).toBe('critical');
  });

  it('journey + doorstep stalls fire on their clocks', () => {
    expect(kinds(base({ status: 'on_way', student_id: 'u1', last_on_way_at: minAgo(CLOCKS.ON_WAY_STALLED_MIN) })))
      .toContain('on_way_stalled');
    expect(kinds(base({ status: 'arrived', student_id: 'u1', last_arrived_at: minAgo(CLOCKS.ARRIVED_NOT_STARTED_MIN) })))
      .toContain('arrived_not_started');
    expect(kinds(base({ status: 'in_progress', student_id: 'u1', job_ends_at: minAgo(CLOCKS.OVERRUN_MIN) })))
      .toContain('overrunning');
  });

  it('SOS is critical, fires in every status, and outranks everything', () => {
    const sos = base({ status: 'in_progress', student_id: 'u1', sos_active: true, helper_name: 'Aoife' });
    const signals = triageBooking(sos, NOW);
    expect(signals[0]?.kind).toBe('sos_active');
    expect(signals[0]?.severity).toBe('critical');
    // Board sort: an SOS beats an older critical no-helper.
    const board = triageBoard([base({ created_at: minAgo(500) }), sos], NOW);
    expect(board[0]?.kind).toBe('sos_active');
  });

  it('completed direct-pay without a settle-up confirmation is flagged (info), card-pay is not', () => {
    const done = base({
      status: 'completed', student_id: 'u1', direct_pay: true,
      helper_finished_at: minAgo(60), price_estimate_cents: 3600,
    });
    expect(kinds(done)).toContain('settle_unconfirmed');
    expect(kinds({ ...done, paid_to_helper: true })).toEqual([]);
    expect(kinds({ ...done, card_pay: true })).toEqual([]);
  });

  it('card-pay money stuck behind missing bank details is a warn', () => {
    const stuck = base({
      status: 'completed', student_id: 'u1', direct_pay: true, card_pay: true,
      payout_pending_unonboarded: true, price_estimate_cents: 3600, helper_name: 'Seán',
    });
    const s = triageBooking(stuck, NOW).find((x) => x.kind === 'payout_blocked');
    expect(s?.severity).toBe('warn');
    expect(s?.summary).toContain('€36');
  });

  it('a malformed row never takes down the board', () => {
    const broken = { id: 'x' } as unknown as BookingSnapshot;
    expect(() => triageBoard([broken, base({ created_at: minAgo(100) })], NOW)).not.toThrow();
    expect(triageBoard([broken, base({ created_at: minAgo(100) })], NOW).length).toBeGreaterThan(0);
  });

  it('board sorts criticals before warns before infos, older first within a tier', () => {
    const board = triageBoard([
      base({ id: 'i1', status: 'in_progress', student_id: 'u1', job_ends_at: minAgo(60) }),      // info
      base({ id: 'w1', created_at: minAgo(CLOCKS.NO_HELPER_WARN_MIN) }),                          // warn (young)
      base({ id: 'w2', created_at: minAgo(CLOCKS.NO_HELPER_WARN_MIN + 20) }),                     // warn (older)
      base({ id: 'c1', created_at: minAgo(CLOCKS.NO_HELPER_CRIT_MIN) }),                          // critical
    ], NOW);
    expect(board.map((s) => s.booking_id)).toEqual(['c1', 'w2', 'w1', 'i1']);
  });
});
