// The ops copilot's JUDGMENT RULES — what deserves the owner's attention on a
// live booking, and how urgently. Pure TypeScript, no Deno APIs: vitest
// imports this module directly (src/lib/__tests__/opsTriage.test.ts) so every
// rule threshold is pinned by a test, exactly like the pricing tables.
//
// WHY THIS EXISTS (2026-07-30): the safety-net crons (sweep-stalled-jobs,
// remind-unpaid-bookings, no-helper-fallback…) each watch ONE failure mode
// with FIXED clocks, and they ACT (release, cancel, refund). This module is
// the layer above them: it reads the whole live board at once and answers
// "what should a human look at right now, and why" — BEFORE the blunt-
// instrument cron fires. It never writes anything; it is deliberately a
// read-only brain. The ops-copilot edge function feeds it snapshots and
// (optionally) hands its output to Gemini for ranking + phrasing — but the
// DETECTION is deterministic and lives here, so "is this flagged?" is always
// a testable fact, never a model's mood. Fail-soft philosophy throughout:
// missing fields simply mean fewer signals, never a throw.
//
// The thresholds deliberately sit EARLIER than the acting crons' clocks
// (e.g. fee unpaid warns at 45 min; the 2h release is the cron's move) —
// the copilot's whole point is the window where a human phone call can
// still save the booking.

/** Compact snapshot of one live booking — prepared by the edge function's
 *  queries; the module never touches the database. All times ISO strings. */
export interface BookingSnapshot {
  id: string;
  status: string;
  category: string | null;
  city: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
  scheduled_at: string | null;
  accepted_at: string | null;
  paid_at: string | null;
  payment_requested_at: string | null;
  helper_finished_at: string | null;
  job_ends_at: string | null;
  disputed_at: string | null;
  refunded_at: string | null;
  student_id: string | null;
  /** From booking_data — only the keys the rules read. */
  direct_pay?: boolean;
  card_pay?: boolean;
  paid_to_helper?: boolean | null;
  helper_first_name?: string | null;
  price_estimate_cents?: number | null;
  /** Latest job_updates row per status, ISO time (on_way / arrived / started). */
  last_on_way_at?: string | null;
  last_arrived_at?: string | null;
  /** Assigned helper context (joined by the function). */
  helper_name?: string | null;
  helper_phone?: string | null;
  /** Card-pay only: is there a payout row stuck pending with no bank on file? */
  payout_pending_unonboarded?: boolean;
  /** Unresolved helper_sos_events row exists for this booking. */
  sos_active?: boolean;
}

export type Severity = 'critical' | 'warn' | 'info';

export interface TriageSignal {
  booking_id: string;
  /** Stable machine key for the rule that fired ("no_helper", "fee_unpaid"…). */
  kind: string;
  severity: Severity;
  /** Minutes the situation has been true — the "how long has this been on fire". */
  age_min: number;
  /** Human line: what's wrong. */
  summary: string;
  /** Human line: the single next action a human should take. */
  action: string;
  /** Context the UI renders alongside (category, names, phones, money). */
  category: string | null;
  city: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  helper_name: string | null;
  helper_phone: string | null;
}

// ── Rule clocks (minutes). Each sits EARLIER than the acting cron it
// front-runs — see the header comment. Exported so the test pins them and a
// future tuning is a conscious, tested change. ─────────────────────────────
export const CLOCKS = {
  /** awaiting_payment born this long ago with no card auth → customer stuck
   *  at the Stripe step (remind-unpaid's abandoned sweep cancels at 75). */
  AUTH_STALLED_MIN: 30,
  /** pending + unassigned this long → nobody accepting (warn), then critical
   *  (no-helper-fallback refunds unpaid stuck jobs at 120). */
  NO_HELPER_WARN_MIN: 45,
  NO_HELPER_CRIT_MIN: 90,
  /** accepted + pay link out this long, still unpaid (helper released at 120). */
  FEE_UNPAID_WARN_MIN: 45,
  FEE_UNPAID_CRIT_MIN: 90,
  /** paid, ASAP job, helper still hasn't tapped on-way. */
  NOT_MOVING_ASAP_MIN: 60,
  /** paid, scheduled job past its start, helper still hasn't moved. */
  NOT_MOVING_SCHED_GRACE_MIN: 15,
  /** on-way this long without arriving (Galway is a 25-minute town). */
  ON_WAY_STALLED_MIN: 45,
  /** arrived this long without the 4-digit start code being entered. */
  ARRIVED_NOT_STARTED_MIN: 25,
  /** in_progress this long past the booked end. */
  OVERRUN_MIN: 45,
  /** helper finished, customer still hasn't confirmed (48h auto-confirm is
   *  the backstop; a human nudge at 20h usually beats it). */
  CONFIRM_STUCK_MIN: 20 * 60,
} as const;

const MS = 60_000;

function minutesSince(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((nowMs - t) / MS);
}

const euro = (cents: number | null | undefined): string =>
  typeof cents === 'number' && cents > 0 ? `€${(cents / 100).toFixed(2).replace(/\.00$/, '')}` : '';

/** Severity sort weight — SOS above everything (a safety press must never
 *  queue behind an old stuck booking, however stale), then criticals, then
 *  warns, oldest fire first within each tier. */
export function signalWeight(s: TriageSignal): number {
  if (s.kind === 'sos_active') return 4_000_000 + Math.min(s.age_min, 999_999);
  const sev = s.severity === 'critical' ? 2_000_000 : s.severity === 'warn' ? 1_000_000 : 0;
  return sev + Math.min(s.age_min, 999_999);
}

/** All signals for one booking snapshot. Deterministic; never throws. */
export function triageBooking(b: BookingSnapshot, nowMs: number): TriageSignal[] {
  const out: TriageSignal[] = [];
  const ctx = {
    booking_id: b.id,
    category: b.category ?? null,
    city: b.city ?? null,
    customer_name: b.customer_name ?? null,
    customer_phone: b.customer_phone ?? null,
    helper_name: b.helper_name ?? b.helper_first_name ?? null,
    helper_phone: b.helper_phone ?? null,
  };
  const helper = ctx.helper_name ?? 'the helper';
  const customer = (b.customer_name && b.customer_name !== 'Guest' ? b.customer_name : null) ?? 'the customer';
  const push = (kind: string, severity: Severity, age: number | null, summary: string, action: string) => {
    out.push({ ...ctx, kind, severity, age_min: Math.max(0, age ?? 0), summary, action });
  };

  if (b.status === 'cancelled') return out;

  // ── SOS: always critical, always first, regardless of status. The page
  // already went to the owner's phone — this keeps it on the board until
  // the helper taps "I'm safe now". ──────────────────────────────────────
  if (b.sos_active) {
    push('sos_active', 'critical', minutesSince(b.created_at, nowMs),
      `🆘 ${helper} pressed SOS on this job and hasn't marked safe`,
      `Call ${helper} now${ctx.helper_phone ? ` (${ctx.helper_phone})` : ''}; the /track map has their last position`);
  }

  // ── Dispute on a live booking. ─────────────────────────────────────────
  if (b.disputed_at && !b.refunded_at && b.status !== 'completed') {
    push('disputed', 'critical', minutesSince(b.disputed_at, nowMs),
      `${customer} reported a problem — booking is disputed`,
      `Read the report and settle it before any completion path fires`);
  }

  switch (b.status) {
    case 'awaiting_payment': {
      const age = minutesSince(b.created_at, nowMs);
      if (age !== null && age >= CLOCKS.AUTH_STALLED_MIN) {
        push('awaiting_payment_stalled', 'warn', age,
          `${customer} started booking ${age} min ago and never finished the card step`,
          `WhatsApp them the secure link — the booking self-cancels at 75 min`);
      }
      break;
    }

    case 'pending': {
      if (b.student_id) break; // being re-assigned; the accept flow owns it
      // A future-scheduled job isn't "unclaimed" until its dispatch window
      // opened — measure from the later of created_at / (scheduled_at − 90m).
      const sched = b.scheduled_at ? Date.parse(b.scheduled_at) : NaN;
      const windowOpen = Number.isFinite(sched) ? sched - 90 * MS : NaN;
      const startIso = Number.isFinite(windowOpen) && windowOpen > Date.parse(b.created_at)
        ? new Date(windowOpen).toISOString()
        : b.created_at;
      const age = minutesSince(startIso, nowMs);
      if (age !== null && age >= CLOCKS.NO_HELPER_CRIT_MIN) {
        push('no_helper', 'critical', age,
          `No helper has taken this ${b.category ?? 'job'} in ${age} min`,
          `Ring your reliable ${b.city ?? ''} helpers directly — auto-refund fires at 2 h`);
      } else if (age !== null && age >= CLOCKS.NO_HELPER_WARN_MIN) {
        push('no_helper', 'warn', age,
          `Still unclaimed after ${age} min (${b.category ?? 'job'}${b.city ? `, ${b.city}` : ''})`,
          `Nudge a couple of helpers by name before the customer gives up`);
      }
      break;
    }

    case 'accepted': {
      // Fee unpaid: the pay link is out but the customer hasn't confirmed.
      if (!b.paid_at && b.payment_requested_at) {
        const age = minutesSince(b.payment_requested_at, nowMs);
        if (age !== null && age >= CLOCKS.FEE_UNPAID_CRIT_MIN) {
          push('fee_unpaid', 'critical', age,
            `${helper} accepted ${age} min ago — ${customer} still hasn't paid`,
            `Call ${customer}${ctx.customer_phone ? ` (${ctx.customer_phone})` : ''} — ${helper} is released back to the pool at 2 h`);
        } else if (age !== null && age >= CLOCKS.FEE_UNPAID_WARN_MIN) {
          push('fee_unpaid', 'warn', age,
            `Unpaid ${age} min after accept (${euro(b.price_estimate_cents) || 'job'} ${b.category ?? ''})`,
            `WhatsApp ${customer} the pay link personally — it converts better than the bot`);
        }
      }
      // Paid but the helper isn't moving.
      if (b.paid_at && !b.last_on_way_at) {
        const sched = b.scheduled_at ? Date.parse(b.scheduled_at) : NaN;
        if (Number.isFinite(sched)) {
          const late = Math.floor((nowMs - sched) / MS);
          if (late >= CLOCKS.NOT_MOVING_SCHED_GRACE_MIN) {
            push('helper_not_moving', late >= 45 ? 'critical' : 'warn', late,
              `${helper} hasn't left for a job that started ${late} min ago`,
              `Call ${helper}${ctx.helper_phone ? ` (${ctx.helper_phone})` : ''} — the stall sweep will re-open it soon`);
          }
        } else {
          const age = minutesSince(b.paid_at, nowMs);
          if (age !== null && age >= CLOCKS.NOT_MOVING_ASAP_MIN) {
            push('helper_not_moving', 'warn', age,
              `Paid ${age} min ago (ASAP job) and ${helper} hasn't tapped on-my-way`,
              `Check in with ${helper} — a quick "all good?" text usually unsticks it`);
          }
        }
      }
      break;
    }

    case 'on_way': {
      const age = minutesSince(b.last_on_way_at ?? b.accepted_at, nowMs);
      if (age !== null && age >= CLOCKS.ON_WAY_STALLED_MIN) {
        push('on_way_stalled', 'warn', age,
          `${helper} has been "on the way" for ${age} min`,
          `Check the /track map, then call ${helper} if the dot isn't moving`);
      }
      break;
    }

    case 'arrived': {
      const age = minutesSince(b.last_arrived_at, nowMs);
      if (age !== null && age >= CLOCKS.ARRIVED_NOT_STARTED_MIN) {
        push('arrived_not_started', 'warn', age,
          `${helper} arrived ${age} min ago but the start code was never entered`,
          `Likely a code mix-up at the door — call either side and read the code from /track`);
      }
      break;
    }

    case 'in_progress': {
      if (b.helper_finished_at) {
        const age = minutesSince(b.helper_finished_at, nowMs);
        if (age !== null && age >= CLOCKS.CONFIRM_STUCK_MIN) {
          push('confirm_stuck', 'info', age,
            `${helper} finished ${Math.round(age / 60)} h ago — ${customer} hasn't confirmed`,
            `A friendly nudge beats the 48 h auto-confirm; ask how the job went`);
        }
      } else if (b.job_ends_at) {
        const over = minutesSince(b.job_ends_at, nowMs);
        if (over !== null && over >= CLOCKS.OVERRUN_MIN) {
          push('overrunning', 'info', over,
            `Job is ${over} min past its booked end and not marked finished`,
            `Check ${helper} is OK and whether the job grew — the customer may owe more time`);
        }
      }
      break;
    }

    case 'completed': {
      // Direct settle-up never confirmed — the money step direct-pay depends on.
      if (b.direct_pay && !b.card_pay && b.paid_to_helper == null) {
        const age = minutesSince(b.helper_finished_at ?? b.job_ends_at, nowMs);
        push('settle_unconfirmed', 'info', age ?? 0,
          `Completed, but ${helper} hasn't confirmed being paid ${euro(b.price_estimate_cents)}`,
          `Ask ${helper} to tap the did-you-get-paid card — unconfirmed cash goes stale fast`);
      }
      // Card-pay money stuck: VANO holds it, helper has no bank on file.
      if (b.card_pay && b.payout_pending_unonboarded) {
        push('payout_blocked', 'warn', 0,
          `${euro(b.price_estimate_cents)} is waiting for ${helper} — no bank details yet`,
          `Text ${helper} the payout-setup link; money sitting still is trust burning`);
      }
      break;
    }
  }

  return out;
}

/** Triage the whole board: all signals across all snapshots, sorted most
 *  urgent first (criticals, then warns, then infos; older fires first). */
export function triageBoard(snapshots: BookingSnapshot[], nowMs: number): TriageSignal[] {
  const all: TriageSignal[] = [];
  for (const b of snapshots) {
    try {
      all.push(...triageBooking(b, nowMs));
    } catch {
      // A malformed row must never take down the board — skip it.
    }
  }
  return all.sort((a, z) => signalWeight(z) - signalWeight(a));
}
