// The helper-funnel JUDGMENT RULES — where every student is stuck on the way
// from "tapped Join" to "earning regularly", and what the ONE next move is.
// Pure TypeScript, no Deno APIs: vitest imports this module directly
// (src/lib/__tests__/helperFunnel.test.ts) so every threshold is pinned by a
// test, exactly like the pricing tables and _shared/opsTriage.ts.
//
// WHY THIS EXISTS (2026-08-18): _shared/opsTriage.ts is the brain for the
// DEMAND side — one live booking at a time, "what needs a human right now".
// Nothing was the brain for the SUPPLY side. `nudge-helper-onboarding` chases
// two drop-offs with fixed templates and fixed clocks, and everything else in
// the funnel (no photo, no Revolut tag, verified-but-never-accepted, an
// opted-in Garda vetting nobody actioned) was invisible. That matters twice
// over: a thin, faceless helper pool is exactly what the customer's "I don't
// trust students" complaint is made of, and a student who never gets their
// first job never comes back.
//
// SAME CONTRACT AS opsTriage: detection is DETERMINISTIC and lives here, so
// "is this helper flagged?" is a testable fact and never a model's mood. The
// helper-copilot edge function feeds snapshots in and (optionally) hands the
// output to Gemini, which may only RE-RANK and RE-PHRASE — it can never
// invent a helper, drop a signal, or change who gets contacted.
//
// Fail-soft throughout: a missing field means fewer signals, never a throw.

/** Compact snapshot of one helper — prepared by the edge function's queries;
 *  this module never touches the database. All times are ISO strings. */
export interface HelperSnapshot {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  created_at: string;
  /** 'pending' | 'approved' | 'rejected' — applying now auto-approves. */
  status: string | null;
  /** The live switch. False + pending_email_verify = never confirmed email. */
  is_available: boolean | null;
  /** application_data.pending_email_verify — signup exists, inbox unproven. */
  pending_email_verify?: boolean | null;

  // ── The three verification flags behind the ✓ tick ──────────────────────
  student_email_verified: boolean | null;
  id_verified: boolean | null;
  verified_plan_active: boolean | null;
  /** Stripe Identity session state: null/'' = never started. */
  identity_status: string | null;
  /** When the identity session was created (start of the ID check attempt). */
  identity_started_at?: string | null;

  // ── Profile completeness (what a nervous customer actually looks at) ─────
  photo_url: string | null;
  bio: string | null;
  categories: string[] | null;
  /** Revolut tag. Under direct-pay a helper without one cannot be paid. */
  payment_handle?: string | null;

  // ── Earning history ─────────────────────────────────────────────────────
  accepted_count: number | null;
  average_rating: number | null;
  rating_count: number | null;
  /** Most recent accepted booking, ISO — null if they've never taken a job. */
  last_accepted_at?: string | null;

  // ── Trust upgrades ──────────────────────────────────────────────────────
  /** Helper ticked "open to Garda vetting" on the post-verify boost screen.
   *  NOT a column — update-helper-profile whitelists it into the
   *  application_data JSON, so the edge function lifts it out before calling
   *  in here. Same for garda_vetted, which the owner stamps when it's done. */
  garda_vetting_ok?: boolean | null;
  garda_vetted?: boolean | null;

  /** Per-signal send history, keyed by signal kind — from helper_nudge_log.
   *  { id_unstarted: { sends: 2, last_sent_at: '…' } } */
  nudge_log?: Record<string, { sends: number; last_sent_at: string | null }>;
}

export type Severity = 'critical' | 'warn' | 'info';

/** Who acts on this signal.
 *  - 'helper'  → the agent may message the student directly.
 *  - 'owner'   → board only. Judgment, money or a promise Vano must keep;
 *                an automated text would be wrong or spammy. NEVER sent. */
export type Actor = 'helper' | 'owner';

export interface FunnelSignal {
  helper_id: string;
  /** Stable machine key for the rule that fired ("id_unstarted"…). Also the
   *  cooldown key in helper_nudge_log — renaming one resets its history. */
  kind: string;
  severity: Severity;
  actor: Actor;
  /** How long this has been true, in hours (the "how stale is this"). */
  age_hours: number;
  /** Owner-facing: what's wrong. */
  summary: string;
  /** Owner-facing: the single next action. */
  action: string;
  /** The deterministic message to SEND the helper. null for owner signals —
   *  a null message is the hard guarantee that nothing is auto-sent. Gemini
   *  may rewrite this text but may never fill it in when it is null. */
  message: string | null;
  /** Where the message points them. */
  link: string | null;
  /** Don't re-send this signal to this helper within N hours. */
  cooldown_hours: number;
  /** Stop after N sends of this signal, ever. */
  max_sends: number;
  // Context the board renders alongside.
  helper_name: string | null;
  helper_phone: string | null;
  helper_email: string | null;
  city: string | null;
}

// ── Rule clocks (hours). Exported so the test pins them and any future
// tuning is a conscious, tested change. ────────────────────────────────────
export const FUNNEL_CLOCKS = {
  /** Signed up this long ago, email code never entered → they never went live. */
  EMAIL_UNVERIFIED_H: 2,
  EMAIL_UNVERIFIED_CRIT_H: 24,
  /** Live but never opened the ID check. Dispatch cannot offer them a job at
   *  all, so this is the single most expensive hour in the whole funnel. */
  ID_UNSTARTED_H: 3,
  ID_UNSTARTED_CRIT_H: 24,
  /** Identity session created/processing but never finished. */
  ID_ABANDONED_H: 6,
  /** ID-verified with no photo — customers meet a blank square. */
  NO_PHOTO_H: 1,
  /** ID-verified, direct-pay, no Revolut tag: they cannot be paid. */
  NO_HANDLE_H: 2,
  /** Dispatchable this long and still zero accepted jobs — the churn cliff. */
  NEVER_ACCEPTED_H: 72,
  /** Was earning, then went quiet. */
  DORMANT_H: 21 * 24,
  /** Bio missing — cosmetic, chased last and gently. */
  THIN_PROFILE_H: 48,
} as const;

/** Below this, a rating is a quality problem the owner should look at. */
export const LOW_RATING_THRESHOLD = 4.0;
/** …but only once there are enough ratings for it to mean anything. */
export const LOW_RATING_MIN_COUNT = 3;

const HOUR = 3_600_000;

function hoursSince(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((nowMs - t) / HOUR);
}

const firstName = (name: string | null): string =>
  (name ?? '').trim().split(/\s+/)[0] || 'there';

/** Identity states that mean "started but not finished". Anything outside
 *  this set (and outside verified) is treated as never-started, which is the
 *  fail-soft direction: worst case we send the friendlier "start it" nudge. */
const ID_IN_FLIGHT = new Set(['created', 'requires_input', 'processing', 'pending']);

/** Sort weight — criticals first, then warns, oldest fire first within a
 *  tier. Owner signals never outrank a critical helper signal: the funnel's
 *  job is to unblock students, and the board reads top-down. */
export function funnelWeight(s: FunnelSignal): number {
  const sev = s.severity === 'critical' ? 2_000_000 : s.severity === 'warn' ? 1_000_000 : 0;
  return sev + Math.min(s.age_hours, 999_999);
}

/** True when this signal is still allowed to be SENT to the helper right now
 *  — actor, a non-null message, the per-signal cap and the cooldown all pass.
 *  The agent calls this; the board does not (the board shows everything). */
export function isSendable(s: FunnelSignal, snap: HelperSnapshot, nowMs: number): boolean {
  if (s.actor !== 'helper' || !s.message) return false;
  const log = snap.nudge_log?.[s.kind];
  if (!log) return true;
  if (log.sends >= s.max_sends) return false;
  const since = hoursSince(log.last_sent_at, nowMs);
  if (since === null) return true;
  return since >= s.cooldown_hours;
}

/** All signals for one helper snapshot. Deterministic; never throws. */
export function triageHelper(h: HelperSnapshot, nowMs: number, siteUrl = 'https://vanojobs.com'): FunnelSignal[] {
  const out: FunnelSignal[] = [];
  const site = siteUrl.replace(/\/+$/, '');
  const ctx = {
    helper_id: h.id,
    helper_name: h.name ?? null,
    helper_phone: h.phone ?? null,
    helper_email: h.email ?? null,
    city: h.city ?? null,
  };
  const you = firstName(h.name);

  const push = (
    kind: string,
    severity: Severity,
    actor: Actor,
    age: number | null,
    summary: string,
    action: string,
    message: string | null,
    link: string | null,
    cooldown_hours: number,
    max_sends: number,
  ) => {
    out.push({
      ...ctx, kind, severity, actor,
      age_hours: Math.max(0, age ?? 0),
      summary, action, message, link, cooldown_hours, max_sends,
    });
  };

  // A rejected helper is out of the funnel entirely — never chase them.
  if (h.status === 'rejected') return out;

  const ageH = hoursSince(h.created_at, nowMs);

  // ── STAGE 0: signed up, inbox never proven → they never went live ───────
  // create-helper-application inserts approved-but-unavailable with
  // pending_email_verify; the email OTP flips is_available. Until then this
  // person does not exist to dispatch and has had zero contact from us.
  if (h.pending_email_verify && h.is_available !== true) {
    if (ageH !== null && ageH >= FUNNEL_CLOCKS.EMAIL_UNVERIFIED_H) {
      const crit = ageH >= FUNNEL_CLOCKS.EMAIL_UNVERIFIED_CRIT_H;
      push('email_unverified', crit ? 'critical' : 'warn', 'helper', ageH,
        `Signed up ${ageH}h ago and never entered the email code — not live, invisible to dispatch`,
        `Text them the /verify-helper link; if the college address bounced, check for a typo`,
        `Hi ${you} — it's VANO. You're one step from being live: enter the code we emailed you and you can start taking jobs. Spam folder is the usual culprit — or tap "Prefer a text?" and we'll send it to your phone instead. ${site}/verify-helper`,
        `${site}/verify-helper`, 24, 3);
    }
    // Nothing else is worth saying to someone who hasn't confirmed an inbox.
    return out;
  }

  const live = h.status === 'approved' && h.is_available === true;

  // ── STAGE 1: live but NOT dispatchable — the expensive bottleneck ───────
  // dispatch-household-job only ever offers jobs to id_verified helpers, so
  // an un-ID'd helper earns nothing and we look empty to customers.
  if (live && h.id_verified !== true) {
    const inFlight = ID_IN_FLIGHT.has((h.identity_status ?? '').toLowerCase());
    if (inFlight) {
      const since = hoursSince(h.identity_started_at ?? h.created_at, nowMs);
      if (since !== null && since >= FUNNEL_CLOCKS.ID_ABANDONED_H) {
        push('id_abandoned', 'critical', 'helper', since,
          `Started the ID check ${since}h ago and never finished it (${h.identity_status})`,
          `Text them — a dropped Stripe Identity session is usually a bad-lighting photo, not a change of mind`,
          `${you}, you got most of the way through your VANO ID check and it didn't finish. It takes about 60 seconds to redo — good light, no hat, and use your phone camera. It's free, and it's the only thing between you and job offers: ${site}/verify-helper`,
          `${site}/verify-helper`, 36, 3);
      }
    } else if (ageH !== null && ageH >= FUNNEL_CLOCKS.ID_UNSTARTED_H) {
      const crit = ageH >= FUNNEL_CLOCKS.ID_UNSTARTED_CRIT_H;
      push('id_unstarted', crit ? 'critical' : 'warn', 'helper', ageH,
        `Live for ${ageH}h but has never opened the ID check — cannot be sent a single job`,
        `Text them: the ID check is free and is the job unlock, not paperwork`,
        `Hi ${you} — VANO here. You're approved, but we can't send you any jobs yet: every helper does a free 60-second ID check first (it's what lets us promise households an ID-verified student). Do it here and you'll start getting offers today: ${site}/verify-helper`,
        `${site}/verify-helper`, 24, 4);
    }
  }

  // ── STAGE 2: dispatchable, but the profile undersells or blocks them ────
  if (live && h.id_verified === true) {
    // No photo. This is the trust problem in its purest form — the booking
    // sheet, the homepage cards and /helpers/:id all lead with a face.
    if (!h.photo_url || !h.photo_url.trim()) {
      const since = hoursSince(h.created_at, nowMs);
      if (since !== null && since >= FUNNEL_CLOCKS.NO_PHOTO_H) {
        push('no_photo', 'warn', 'helper', since,
          `ID-verified with no photo — customers see a blank square where a face should be`,
          `Ask for a photo; helpers with one are picked noticeably more often`,
          `${you}, your VANO profile has no photo yet. Households pick the helpers they can see — a clear, well-lit photo of your face is the single biggest thing you can do to get booked. Add it in 20 seconds: ${site}/student-account`,
          `${site}/student-account`, 72, 3);
      }
    }

    // No Revolut tag. Under direct-pay the customer pays the helper straight
    // out — without a handle the pay card has nothing to deep-link to.
    if (!h.payment_handle || !h.payment_handle.trim()) {
      const since = hoursSince(h.created_at, nowMs);
      if (since !== null && since >= FUNNEL_CLOCKS.NO_HANDLE_H) {
        push('no_payment_handle', 'critical', 'helper', since,
          `ID-verified with no Revolut tag — the customer's pay card has nowhere to send money`,
          `Get their Revolut tag on file before they take a job, not after`,
          `${you} — one thing missing on your VANO profile: your Revolut tag. You keep 100% of the job price and the customer pays you directly at the end, so without a tag they can't pay you properly. Add it here: ${site}/student-account`,
          `${site}/student-account`, 48, 3);
      }
    }

    // Verified, dispatchable, and still has never taken a job. They are being
    // offered work and not converting — the biggest silent churn source.
    if ((h.accepted_count ?? 0) === 0 && ageH !== null && ageH >= FUNNEL_CLOCKS.NEVER_ACCEPTED_H) {
      push('never_accepted', 'warn', 'helper', ageH,
        `Verified and dispatchable for ${Math.floor(ageH / 24)}d with zero accepted jobs`,
        `Ask what's stopping them — wrong categories, wrong area, or offers arriving at bad times`,
        `Hi ${you} — you're fully verified on VANO but haven't taken a job yet. Two things that usually fix it: widen the jobs you'll do and the areas you cover (${site}/student-account), and grab offers fast — they go to the first helper who taps accept. Anything in the way, just reply to this message.`,
        `${site}/student-account`, 7 * 24, 2);
    }

    // Was earning, then went quiet.
    const quiet = hoursSince(h.last_accepted_at, nowMs);
    if ((h.accepted_count ?? 0) > 0 && quiet !== null && quiet >= FUNNEL_CLOCKS.DORMANT_H) {
      const days = Math.floor(quiet / 24);
      push('dormant', 'info', 'helper', quiet,
        `${h.accepted_count} jobs done, but nothing accepted in ${days} days`,
        `A light "still around?" — dormant helpers make the pool look thinner than it is`,
        `${you}, it's been a while — you've done ${h.accepted_count} job${h.accepted_count === 1 ? '' : 's'} on VANO and we've got work going out in ${h.city ?? 'Galway'} most days. Still up for it? Make sure you're switched to available: ${site}/student-account`,
        `${site}/student-account`, 21 * 24, 2);
    }

    // Bio missing — chased last, and only once.
    if (!h.bio || !h.bio.trim()) {
      const since = hoursSince(h.created_at, nowMs);
      if (since !== null && since >= FUNNEL_CLOCKS.THIN_PROFILE_H) {
        push('thin_profile', 'info', 'helper', since,
          `No bio — the profile reads as a stranger instead of a student`,
          `One line about themselves; it's what a nervous first-time customer reads`,
          `${you} — quick one. Your VANO profile has no intro line yet. One sentence ("2nd year nursing at ATU, been cleaning since school") makes households far more comfortable booking you. Add it here: ${site}/student-account`,
          `${site}/student-account`, 14 * 24, 1);
      }
    }
  }

  // ── STAGE 3: OWNER-ONLY signals. No message, ever — these need judgment,
  // money, or a promise Vano itself has to keep. ─────────────────────────
  //
  // Garda vetting: the boost screen has collected this opt-in since the
  // verified plan shipped and NOTHING in the codebase read it back. Every
  // one of these is a helper who volunteered for the strongest trust badge
  // available and heard nothing back — and it's the gate on the elderly /
  // vulnerable-customer segment.
  if (live && h.garda_vetting_ok === true && h.garda_vetted !== true) {
    push('garda_optin_unactioned', 'warn', 'owner', ageH,
      `Opted in to Garda vetting and it has never been actioned`,
      `Start the vetting — this is the badge that unlocks older and vulnerable customers`,
      null, null, 0, 0);
  }

  // A real quality problem, once there's enough signal to say so.
  if ((h.rating_count ?? 0) >= LOW_RATING_MIN_COUNT
      && typeof h.average_rating === 'number'
      && h.average_rating < LOW_RATING_THRESHOLD) {
    push('low_rating', 'critical', 'owner', ageH,
      `Rating ${h.average_rating.toFixed(1)} across ${h.rating_count} jobs — below the ${LOW_RATING_THRESHOLD.toFixed(1)} bar`,
      `Call them before the next booking; a bad helper costs more than an empty slot`,
      null, null, 0, 0);
  }

  // Both free checks passed, no blue tick. Deliberately owner/board-only and
  // deliberately message:null — nudge-helper-onboarding has never SMS-pushed
  // the paid plan on purpose (chasing money by text is a spam smell), and
  // this agent must not become the loophole that does.
  if (live && h.student_email_verified === true && h.id_verified === true && h.verified_plan_active !== true) {
    push('verified_plan_ready', 'info', 'owner', ageH,
      `Both free checks passed — eligible for the ✓ Verified plan, not subscribed`,
      `Board only. Do NOT auto-text the paid plan; it belongs in-app on /verify-helper`,
      null, null, 0, 0);
  }

  return out;
}

/** The whole board, ranked. Deterministic; never throws. */
export function triageFunnel(helpers: HelperSnapshot[], nowMs: number, siteUrl?: string): FunnelSignal[] {
  const all: FunnelSignal[] = [];
  for (const h of helpers) {
    try { all.push(...triageHelper(h, nowMs, siteUrl)); }
    catch { /* one malformed row must never blind the whole board */ }
  }
  return all.sort((a, b) => funnelWeight(b) - funnelWeight(a));
}

/** The agent's queue: the single highest-value SENDABLE signal per helper.
 *  One message per helper per run, always — a student who is missing a photo
 *  AND a Revolut tag AND has never accepted gets ONE text about the most
 *  important of the three, not three texts. */
export function nextSendPerHelper(
  helpers: HelperSnapshot[],
  nowMs: number,
  siteUrl?: string,
): Array<{ snapshot: HelperSnapshot; signal: FunnelSignal }> {
  const byId = new Map(helpers.map((h) => [h.id, h]));
  const picked = new Map<string, FunnelSignal>();
  for (const s of triageFunnel(helpers, nowMs, siteUrl)) {
    if (picked.has(s.helper_id)) continue;           // ranked — first wins
    const snap = byId.get(s.helper_id);
    if (!snap || !isSendable(s, snap, nowMs)) continue;
    picked.set(s.helper_id, s);
  }
  return [...picked.entries()].map(([id, signal]) => ({ snapshot: byId.get(id)!, signal }));
}
