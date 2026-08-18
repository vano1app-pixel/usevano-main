import { describe, expect, it } from 'vitest';
// The REAL server judgment module (pure TS, no Deno APIs) — same pattern as
// opsTriage/pricing: the rules the helper-copilot runs in production are the
// rules under test, not a copy.
import {
  FUNNEL_CLOCKS,
  LOW_RATING_MIN_COUNT,
  LOW_RATING_THRESHOLD,
  type HelperSnapshot,
  isSendable,
  nextSendPerHelper,
  triageFunnel,
  triageHelper,
} from '../../../supabase/functions/_shared/helperFunnel';

const NOW = Date.parse('2026-08-18T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

/** A fully-live, fully-complete helper: the zero-signal baseline. Every test
 *  below breaks exactly one thing, so a signal can only come from that break. */
const base = (over: Partial<HelperSnapshot> = {}): HelperSnapshot => ({
  id: 'h1',
  name: 'Aoife Ryan',
  phone: '+353871234567',
  email: 'aoife@atu.ie',
  city: 'Galway',
  created_at: hoursAgo(500),
  status: 'approved',
  is_available: true,
  pending_email_verify: false,
  student_email_verified: true,
  id_verified: true,
  verified_plan_active: true,
  identity_status: 'verified',
  identity_started_at: hoursAgo(400),
  photo_url: 'https://cdn/x.jpg',
  bio: 'Second year nursing at ATU.',
  categories: ['cleaning'],
  payment_handle: 'aoifer',
  accepted_count: 12,
  average_rating: 4.9,
  rating_count: 8,
  last_accepted_at: hoursAgo(30),
  garda_vetting_ok: false,
  garda_vetted: false,
  nudge_log: {},
  ...over,
});

const kinds = (h: HelperSnapshot) => triageHelper(h, NOW).map((s) => s.kind);
const find = (h: HelperSnapshot, kind: string) => triageHelper(h, NOW).find((s) => s.kind === kind);

describe('helperFunnel — the quiet baseline', () => {
  it('a complete, earning, verified helper raises nothing at all', () => {
    expect(triageHelper(base(), NOW)).toEqual([]);
  });

  it('a rejected applicant is never chased, however broken their row', () => {
    expect(triageHelper(base({
      status: 'rejected', id_verified: false, photo_url: null, payment_handle: null,
      pending_email_verify: true, is_available: false,
    }), NOW)).toEqual([]);
  });
});

describe('stage 0 — signed up, inbox never proven', () => {
  it('stays silent inside the grace window', () => {
    const h = base({ pending_email_verify: true, is_available: false, created_at: hoursAgo(FUNNEL_CLOCKS.EMAIL_UNVERIFIED_H - 1) });
    expect(kinds(h)).toEqual([]);
  });

  it('warns at the clock and escalates to critical at the day mark', () => {
    const warn = base({ pending_email_verify: true, is_available: false, created_at: hoursAgo(FUNNEL_CLOCKS.EMAIL_UNVERIFIED_H) });
    expect(find(warn, 'email_unverified')?.severity).toBe('warn');
    const crit = base({ pending_email_verify: true, is_available: false, created_at: hoursAgo(FUNNEL_CLOCKS.EMAIL_UNVERIFIED_CRIT_H) });
    expect(find(crit, 'email_unverified')?.severity).toBe('critical');
  });

  it('says ONLY that — nothing else is worth saying to an unproven inbox', () => {
    // Everything else about this row is also broken; none of it may surface.
    const h = base({
      pending_email_verify: true, is_available: false, created_at: hoursAgo(72),
      photo_url: null, payment_handle: null, bio: null, id_verified: false, accepted_count: 0,
    });
    expect(kinds(h)).toEqual(['email_unverified']);
  });
});

describe('stage 1 — live but not dispatchable (the expensive bottleneck)', () => {
  it('chases a never-opened ID check, critical after a day', () => {
    const warn = base({ id_verified: false, identity_status: null, created_at: hoursAgo(FUNNEL_CLOCKS.ID_UNSTARTED_H) });
    expect(find(warn, 'id_unstarted')?.severity).toBe('warn');
    const crit = base({ id_verified: false, identity_status: null, created_at: hoursAgo(FUNNEL_CLOCKS.ID_UNSTARTED_H + 40) });
    expect(find(crit, 'id_unstarted')?.severity).toBe('critical');
  });

  it('is silent before the clock', () => {
    const h = base({ id_verified: false, identity_status: null, created_at: hoursAgo(FUNNEL_CLOCKS.ID_UNSTARTED_H - 1) });
    expect(kinds(h)).not.toContain('id_unstarted');
  });

  it.each(['created', 'requires_input', 'processing', 'pending'])(
    'treats an in-flight session (%s) as abandoned, not unstarted', (status) => {
      const h = base({ id_verified: false, identity_status: status, identity_started_at: hoursAgo(FUNNEL_CLOCKS.ID_ABANDONED_H) });
      expect(kinds(h)).toContain('id_abandoned');
      expect(kinds(h)).not.toContain('id_unstarted');
    });

  it('an unrecognised identity status falls back to the friendlier "start it" nudge', () => {
    // Fail-soft direction: worst case we tell someone to start something they
    // half-started, which is recoverable. The reverse would be a dead end.
    const h = base({ id_verified: false, identity_status: 'some_new_stripe_state', created_at: hoursAgo(48) });
    expect(kinds(h)).toContain('id_unstarted');
  });

  it('never chases the ID check once it has passed', () => {
    expect(kinds(base({ id_verified: true }))).not.toContain('id_unstarted');
  });
});

describe('stage 2 — dispatchable, but the profile blocks or undersells them', () => {
  it('flags a missing photo — the trust problem in its purest form', () => {
    expect(kinds(base({ photo_url: null }))).toContain('no_photo');
    expect(kinds(base({ photo_url: '   ' }))).toContain('no_photo');
  });

  it('flags a missing Revolut tag as critical — direct-pay cannot pay them', () => {
    expect(find(base({ payment_handle: null }), 'no_payment_handle')?.severity).toBe('critical');
  });

  it('flags verified-but-never-accepted only after the churn cliff', () => {
    const early = base({ accepted_count: 0, last_accepted_at: null, created_at: hoursAgo(FUNNEL_CLOCKS.NEVER_ACCEPTED_H - 1) });
    expect(kinds(early)).not.toContain('never_accepted');
    const late = base({ accepted_count: 0, last_accepted_at: null, created_at: hoursAgo(FUNNEL_CLOCKS.NEVER_ACCEPTED_H) });
    expect(kinds(late)).toContain('never_accepted');
  });

  it('never calls someone dormant who has never worked (that is never_accepted)', () => {
    const h = base({ accepted_count: 0, last_accepted_at: null, created_at: hoursAgo(200 * 24) });
    expect(kinds(h)).toContain('never_accepted');
    expect(kinds(h)).not.toContain('dormant');
  });

  it('flags a helper who was earning and went quiet', () => {
    expect(kinds(base({ last_accepted_at: hoursAgo(FUNNEL_CLOCKS.DORMANT_H) }))).toContain('dormant');
    expect(kinds(base({ last_accepted_at: hoursAgo(FUNNEL_CLOCKS.DORMANT_H - 1) }))).not.toContain('dormant');
  });

  it('none of stage 2 fires while the helper is still un-ID-verified', () => {
    // They cannot be sent a job at all, so a photo nudge would be noise —
    // one blocker at a time, in funnel order.
    const h = base({ id_verified: false, identity_status: null, photo_url: null, payment_handle: null, bio: null, created_at: hoursAgo(500) });
    expect(kinds(h)).toEqual(['id_unstarted']);
  });
});

describe('stage 3 — owner-only signals', () => {
  it('surfaces a Garda-vetting opt-in that was never actioned', () => {
    const h = base({ garda_vetting_ok: true, garda_vetted: false });
    expect(kinds(h)).toContain('garda_optin_unactioned');
    expect(kinds(base({ garda_vetting_ok: true, garda_vetted: true }))).not.toContain('garda_optin_unactioned');
    expect(kinds(base({ garda_vetting_ok: false }))).not.toContain('garda_optin_unactioned');
  });

  it('flags a low rating only once there are enough ratings to mean anything', () => {
    const thin = base({ average_rating: 2.0, rating_count: LOW_RATING_MIN_COUNT - 1 });
    expect(kinds(thin)).not.toContain('low_rating');
    const real = base({ average_rating: LOW_RATING_THRESHOLD - 0.1, rating_count: LOW_RATING_MIN_COUNT });
    expect(find(real, 'low_rating')?.severity).toBe('critical');
    expect(kinds(base({ average_rating: LOW_RATING_THRESHOLD, rating_count: 10 }))).not.toContain('low_rating');
  });

  it('surfaces plan-eligible helpers to the board but never to a text', () => {
    const h = base({ verified_plan_active: false });
    const sig = find(h, 'verified_plan_ready');
    expect(sig?.actor).toBe('owner');
    expect(sig?.message).toBeNull();
    expect(isSendable(sig!, h, NOW)).toBe(false);
  });
});

// ── The safety contract. This is the invariant that stops an AI agent with a
// Twilio key from becoming a spam cannon: the SHAPE of a signal decides
// whether anything can be sent, and it is checked here for every rule that
// exists, not for a hand-picked few. ───────────────────────────────────────
describe('NO-SURPRISE-SEND INVARIANT', () => {
  /** Every distinct signal this module can emit, gathered from rows built to
   *  trip each rule. Add a rule → add a row here or the coverage check fails. */
  const everySignal = () => {
    const rows: HelperSnapshot[] = [
      base({ pending_email_verify: true, is_available: false, created_at: hoursAgo(48) }),
      base({ id: 'h2', id_verified: false, identity_status: null, created_at: hoursAgo(48) }),
      base({ id: 'h3', id_verified: false, identity_status: 'processing', identity_started_at: hoursAgo(48) }),
      base({ id: 'h4', photo_url: null }),
      base({ id: 'h5', payment_handle: null }),
      base({ id: 'h6', accepted_count: 0, last_accepted_at: null, created_at: hoursAgo(200) }),
      base({ id: 'h7', last_accepted_at: hoursAgo(60 * 24) }),
      base({ id: 'h8', bio: null }),
      base({ id: 'h9', garda_vetting_ok: true }),
      base({ id: 'h10', average_rating: 2.5, rating_count: 9 }),
      base({ id: 'h11', verified_plan_active: false }),
    ];
    return triageFunnel(rows, NOW);
  };

  it('covers every rule in the module', () => {
    expect(new Set(everySignal().map((s) => s.kind))).toEqual(new Set([
      'email_unverified', 'id_unstarted', 'id_abandoned', 'no_photo',
      'no_payment_handle', 'never_accepted', 'dormant', 'thin_profile',
      'garda_optin_unactioned', 'low_rating', 'verified_plan_ready',
    ]));
  });

  it('an owner signal ALWAYS has a null message and can never be sent', () => {
    for (const s of everySignal().filter((x) => x.actor === 'owner')) {
      expect(s.message, `${s.kind} must not carry a message`).toBeNull();
      expect(isSendable(s, base(), NOW), `${s.kind} must not be sendable`).toBe(false);
    }
  });

  it('a sendable signal ALWAYS carries a cap, a cooldown and a link', () => {
    for (const s of everySignal().filter((x) => x.message !== null)) {
      expect(s.actor, `${s.kind}`).toBe('helper');
      expect(s.max_sends, `${s.kind} needs a send cap`).toBeGreaterThan(0);
      expect(s.cooldown_hours, `${s.kind} needs a cooldown`).toBeGreaterThan(0);
      expect(s.link, `${s.kind} needs somewhere to send them`).toBeTruthy();
    }
  });

  it('every message is addressed to a real person and points at vanojobs.com', () => {
    for (const s of everySignal().filter((x) => x.message !== null)) {
      expect(s.message, `${s.kind}`).toContain('Aoife');     // first name only
      expect(s.message, `${s.kind}`).toContain('vanojobs.com');
      expect(s.message!.length, `${s.kind} is too long for one SMS burst`).toBeLessThan(480);
    }
  });

  it('a missing name degrades to a greeting, never to "undefined"', () => {
    const s = triageHelper(base({ name: null, photo_url: null }), NOW).find((x) => x.kind === 'no_photo');
    expect(s?.message).not.toMatch(/undefined|null/);
  });
});

describe('cooldowns and caps', () => {
  const sig = (h: HelperSnapshot) => find(h, 'no_photo')!;

  it('sends the first time', () => {
    const h = base({ photo_url: null });
    expect(isSendable(sig(h), h, NOW)).toBe(true);
  });

  it('holds inside the cooldown and releases after it', () => {
    const s = sig(base({ photo_url: null }));
    const inside = base({ photo_url: null, nudge_log: { no_photo: { sends: 1, last_sent_at: hoursAgo(s.cooldown_hours - 1) } } });
    expect(isSendable(s, inside, NOW)).toBe(false);
    const outside = base({ photo_url: null, nudge_log: { no_photo: { sends: 1, last_sent_at: hoursAgo(s.cooldown_hours) } } });
    expect(isSendable(s, outside, NOW)).toBe(true);
  });

  it('stops for good at the cap, however old the last send', () => {
    const s = sig(base({ photo_url: null }));
    const capped = base({ photo_url: null, nudge_log: { no_photo: { sends: s.max_sends, last_sent_at: hoursAgo(10_000) } } });
    expect(isSendable(s, capped, NOW)).toBe(false);
  });
});

describe('the agent queue', () => {
  it('sends at most ONE message per helper per run, the most important one', () => {
    // Missing photo (warn), missing tag (critical) and never accepted (warn).
    const h = base({ photo_url: null, payment_handle: null, accepted_count: 0, last_accepted_at: null, created_at: hoursAgo(300) });
    const queue = nextSendPerHelper([h], NOW);
    expect(queue).toHaveLength(1);
    expect(queue[0].signal.kind).toBe('no_payment_handle');
  });

  it('an owner signal outranking everything does not silence the helper', () => {
    // low_rating is critical and owner-only; the photo nudge must still go.
    const h = base({ average_rating: 2.0, rating_count: 9, photo_url: null });
    const queue = nextSendPerHelper([h], NOW);
    expect(queue.map((q) => q.signal.kind)).toEqual(['no_photo']);
  });

  it('drops a helper entirely when their only signals are capped out', () => {
    const h = base({ photo_url: null, nudge_log: { no_photo: { sends: 99, last_sent_at: hoursAgo(9999) } } });
    expect(nextSendPerHelper([h], NOW)).toEqual([]);
  });

  it('one malformed row can never blind the board', () => {
    const bad = { id: 'broken' } as unknown as HelperSnapshot;
    const good = base({ id: 'ok', photo_url: null });
    expect(triageFunnel([bad, good], NOW).some((s) => s.helper_id === 'ok')).toBe(true);
  });

  it('ranks critical above warn above info', () => {
    const rows = [
      base({ id: 'info', last_accepted_at: hoursAgo(60 * 24) }),
      base({ id: 'crit', payment_handle: null }),
      base({ id: 'warn', photo_url: null }),
    ];
    expect(triageFunnel(rows, NOW).map((s) => s.severity)).toEqual(['critical', 'warn', 'info']);
  });
});
