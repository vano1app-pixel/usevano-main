import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type FunnelSignal,
  type HelperSnapshot,
  nextSendPerHelper,
  triageFunnel,
} from "../_shared/helperFunnel.ts";

// ── The helper copilot (2026-08-18) ────────────────────────────────────────
// The supply-side twin of ops-copilot. ops-copilot watches live BOOKINGS and
// is read-only; this watches the HELPER FUNNEL and, in nudge mode, acts.
//
//   ?action=board  → admin JWT. Read-only. The whole supply funnel, ranked:
//                    who is stuck where, and the one move that unblocks them.
//   ?action=nudge  → cron/service key. ACTS: sends one personal message to
//                    each stuck helper over the existing WhatsApp/SMS/email
//                    channels. Pass { dry_run: true } to see exactly what it
//                    would send, and to whom, without spending a cent.
//
// THE SAFETY MODEL — read this before changing anything here. This is the
// first function in the codebase that lets a MODEL choose words that go out
// over Twilio, so the authority is split three ways and only one third of it
// is the model's:
//   1. WHO + WHY is decided by _shared/helperFunnel.ts — deterministic,
//      unit-tested rules. The model never picks a recipient.
//   2. WHETHER is decided by helper_nudge_log — per-helper, per-signal caps
//      and cooldowns, stamped only AFTER a successful send.
//   3. Only the WORDING is Gemini's, and even that is validated: it must keep
//      the link, stay inside the length cap, and every input index must come
//      back exactly once. Anything off → the deterministic text sends instead.
// Signals whose actor is 'owner' carry message:null and are never sendable,
// which is what keeps money asks (the €2/month tick) and judgment calls
// (a low rating, a Garda-vetting opt-in) on the board and out of a text —
// nudge-helper-onboarding has deliberately never SMS-pushed the paid plan
// and this function must not become the loophole that does.
//
// Fail-soft everywhere, like parse-custom-job and whatsapp-inbound: no
// Gemini key, a timeout, a malformed reply — the rules still run and the
// deterministic message still sends.
//
// verify_jwt = false (pinned in config.toml); auth is enforced per action
// inside. Suggested cadence: 0 */4 * * * — the clocks are in hours, so a
// tighter loop just burns reads.

/** Hard ceiling on messages per run — bounds Twilio spend even if a bad
 *  query or a schema change suddenly makes 300 helpers look stuck. */
const MAX_SENDS_PER_RUN = 25;
/** How many helper rows a single run considers. */
const HELPER_SCAN_LIMIT = 500;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_TIMEOUT_MS = 12_000;
/** Rewritten copy longer than this stops being a text and starts being an
 *  essay; the deterministic originals all sit well under it. */
const MAX_MESSAGE_CHARS = 480;

const FALLBACK_ORIGINS = ['https://vanojobs.com','https://www.vanojobs.com','http://localhost:5173','http://localhost:4173','http://localhost:8080'];
const NATIVE_APP_ORIGINS = ['capacitor://localhost', 'https://localhost', 'ionic://localhost'];
const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type, x-vano-cron';

function matchOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const n = origin.replace(/\/$/, '');
  const list = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  const allowed = [...(list.length ? list : FALLBACK_ORIGINS), ...NATIVE_APP_ORIGINS];
  if (allowed.includes(n)) return n;
  try { if (new URL(n).hostname.endsWith('-vano1app-pixels-projects.vercel.app')) return n; } catch { /* not a URL */ }
  return null;
}
function buildCorsHeaders(req: Request) {
  return { 'Access-Control-Allow-Origin': matchOrigin(req) ?? 'null', 'Access-Control-Allow-Headers': ALLOWED_HEADERS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}
function isOriginAllowed(req: Request) { return !req.headers.get('Origin') || matchOrigin(req) !== null; }

/** Irish/E.164 normalisation — mirrors nudge-helper-onboarding exactly. */
function normalizeIrishPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const c = raw.replace(/[\s\-().]/g, '').trim();
  if (!c) return null;
  if (c.startsWith('+')) return /^\+\d{8,15}$/.test(c) ? c : null;
  if (c.startsWith('00')) { const v = '+' + c.slice(2); return /^\+\d{8,15}$/.test(v) ? v : null; }
  if (/^08[3-9]\d{7}$/.test(c)) return '+353' + c.slice(1);
  if (/^8[3-9]\d{7}$/.test(c)) return '+353' + c;
  return null;
}

/** WhatsApp AND SMS, not either/or — same reasoning as the existing nudge
 *  cron: a cold number never sees free-form WhatsApp, and opted-in helpers
 *  read WhatsApp first. Returns the channels that actually accepted. */
async function sendText(to: string | null | undefined, body: string): Promise<string[]> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  const e164 = normalizeIrishPhone(to);
  if (!sid || !token || !e164) return [];
  const post = (params: Record<string, string>) =>
    fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
  const ok: string[] = [];
  const waFrom = Deno.env.get('TWILIO_WHATSAPP_FROM')?.trim();
  if (waFrom) {
    const from = waFrom.startsWith('whatsapp:') ? waFrom : `whatsapp:${waFrom}`;
    try { if ((await post({ To: `whatsapp:${e164}`, From: from, Body: body })).ok) ok.push('whatsapp'); } catch { /* try sms */ }
  }
  if (Deno.env.get('VANO_SMS_ENABLED')?.trim() === 'true') {
    const smsFrom = (Deno.env.get('TWILIO_SMS_FROM') || Deno.env.get('TWILIO_FROM_NUMBER'))?.trim();
    if (smsFrom && !smsFrom.startsWith('whatsapp:')) {
      try { if ((await post({ To: e164, From: smsFrom, Body: body })).ok) ok.push('sms'); } catch { /* keep whatsapp result */ }
    }
  }
  return ok;
}

async function sendEmail(to: string | null | undefined, subject: string, text: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY')?.trim();
  if (!key || !to) return false;
  const from = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    return r.ok;
  } catch { return false; }
}

// ── Gemini pass 1: rewrite the nudges (WORDING ONLY) ───────────────────────
/** Returns a message per input index, or null to use every deterministic
 *  original. Per-item validation failures fall back per item; an index
 *  problem distrusts the whole reply (same honesty guard as ops-copilot). */
async function geminiRewrite(
  items: Array<{ name: string; kind: string; city: string | null; link: string; message: string }>,
): Promise<Array<string | null> | null> {
  const key = Deno.env.get('GEMINI_API_KEY')?.trim();
  if (!key || items.length === 0) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);
  try {
    const resp = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages: [
          {
            role: 'system',
            content: [
              "You write short messages to student helpers for VANO, a same-day home-help service in Galway, Ireland.",
              "VANO's voice: short, direct, warm, slightly premium. No emoji, no exclamation-mark spam, no corporate jargon, no hype.",
              "You are given a draft message per helper. Rewrite each so it reads like a real person wrote it to that one student.",
              "HARD RULES — a message breaking any of these is discarded:",
              "1. Keep the exact link, unchanged.",
              "2. Never invent facts, prices, earnings, deadlines, job counts, or promises that are not in the draft.",
              "3. Never ask for money, card details, or a subscription.",
              "4. Under 400 characters. One paragraph. Plain text.",
              "5. Keep the draft's actual ask — the same single next step.",
              "Return one rewritten message per input index, every index exactly once.",
            ].join('\n'),
          },
          { role: 'user', content: JSON.stringify(items.map((it, i) => ({ i, first_name: it.name, city: it.city, situation: it.kind, link: it.link, draft: it.message }))) },
        ],
        temperature: 0.6,
        tools: [{
          type: 'function',
          function: {
            name: 'write_messages',
            description: 'Return one rewritten message per input index, every index exactly once.',
            parameters: {
              type: 'object',
              properties: {
                messages: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      i: { type: 'integer', description: 'The index from the input.' },
                      text: { type: 'string', description: 'The rewritten message, under 400 characters, containing the link.' },
                    },
                    required: ['i', 'text'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['messages'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'write_messages' } },
      }),
    });
    if (!resp.ok) { console.warn('[helper-copilot] gemini non-2xx', resp.status); return null; }
    const data = await resp.json().catch(() => null);
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    const parsed = JSON.parse(args) as { messages?: Array<{ i?: number; text?: string }> };
    const list = Array.isArray(parsed.messages) ? parsed.messages : null;
    if (!list) return null;

    const out: Array<string | null> = new Array(items.length).fill(null);
    const seen = new Set<number>();
    for (const m of list) {
      const i = typeof m.i === 'number' ? m.i : -1;
      // Index integrity is all-or-nothing: a duplicated or out-of-range index
      // means the reply can't be trusted to be about the people we asked about.
      if (i < 0 || i >= items.length || seen.has(i)) return null;
      seen.add(i);
      const text = typeof m.text === 'string' ? m.text.trim() : '';
      // Content validation is PER ITEM — one bad rewrite shouldn't cost the
      // other 24 their personalisation.
      if (!text || text.length > MAX_MESSAGE_CHARS || !text.includes(items[i].link)) continue;
      out[i] = text;
    }
    if (seen.size !== items.length) return null;
    return out;
  } catch (e) {
    console.warn('[helper-copilot] gemini rewrite skipped', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Gemini pass 2: re-rank + rephrase the OWNER board (never the messages) ──
async function geminiRankBoard(signals: FunnelSignal[]): Promise<FunnelSignal[] | null> {
  const key = Deno.env.get('GEMINI_API_KEY')?.trim();
  if (!key || signals.length === 0) return null;
  const capped = signals.slice(0, 40);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);
  try {
    const resp = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages: [
          {
            role: 'system',
            content: [
              "You triage the student-helper supply funnel for VANO, a same-day home-help service in Galway.",
              "You are given detected issues. Rank them by what most deserves the founder's next five minutes, and rewrite each action line.",
              "Weigh: a helper who cannot be sent ANY job is worth more than a cosmetic profile gap; a trust gap that customers can see outranks an internal one; several issues on one helper are one conversation, so say so.",
              "You may only reorder and rephrase. Never invent an issue, never drop one, never change who it is about.",
              "Action lines: max 18 words, imperative, concrete.",
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify(capped.map((s, i) => ({
              i, kind: s.kind, severity: s.severity, actor: s.actor,
              age_hours: s.age_hours, helper: s.helper_name, city: s.city,
              summary: s.summary, action: s.action,
            }))),
          },
        ],
        temperature: 0.3,
        tools: [{
          type: 'function',
          function: {
            name: 'rank_issues',
            description: 'Return every issue index exactly once, most urgent first, each with an action line.',
            parameters: {
              type: 'object',
              properties: {
                ranked: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      i: { type: 'integer', description: 'The issue index from the input.' },
                      action: { type: 'string', description: 'What the owner should do, max 18 words.' },
                    },
                    required: ['i', 'action'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['ranked'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'rank_issues' } },
      }),
    });
    if (!resp.ok) { console.warn('[helper-copilot] board rank non-2xx', resp.status); return null; }
    const data = await resp.json().catch(() => null);
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    const parsed = JSON.parse(args) as { ranked?: Array<{ i?: number; action?: string }> };
    const ranked = Array.isArray(parsed.ranked) ? parsed.ranked : null;
    if (!ranked) return null;
    const seen = new Set<number>();
    const out: FunnelSignal[] = [];
    for (const r of ranked) {
      const i = typeof r.i === 'number' ? r.i : -1;
      if (i < 0 || i >= capped.length || seen.has(i)) return null;
      seen.add(i);
      const b = capped[i];
      const action = typeof r.action === 'string' && r.action.trim() && r.action.length <= 220 ? r.action.trim() : b.action;
      out.push({ ...b, action });
    }
    if (seen.size !== capped.length) return null;
    return [...out, ...signals.slice(40)];
  } catch (e) {
    console.warn('[helper-copilot] board rank skipped', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Snapshot assembly ──────────────────────────────────────────────────────
type Db = ReturnType<typeof createClient>;

/** Read every non-rejected helper and shape them for the rules module. The
 *  rules never touch the database; this is the only place that knows the
 *  schema — including that garda_vetting_ok/garda_vetted live inside the
 *  application_data JSON rather than in columns of their own. */
async function loadSnapshots(supabase: Db): Promise<HelperSnapshot[]> {
  const { data: rows, error } = await supabase
    .from('household_helpers')
    .select('id, user_id, name, phone, email, city, created_at, status, is_available, student_email_verified, id_verified, verified_plan_active, identity_status, photo_url, bio, categories, payment_handle, accepted_count, average_rating, rating_count, application_data')
    .neq('status', 'rejected')
    .order('created_at', { ascending: false })
    .limit(HELPER_SCAN_LIMIT);
  if (error) { console.error('[helper-copilot] helper query failed', error); throw new Error('Could not read helpers'); }

  const helpers = (rows ?? []) as Array<Record<string, unknown>>;
  const ids = helpers.map((h) => h.id as string);

  // Already-said history, keyed helper → kind.
  const logByHelper = new Map<string, Record<string, { sends: number; last_sent_at: string | null }>>();
  if (ids.length) {
    const { data: logs } = await supabase
      .from('helper_nudge_log')
      .select('helper_id, kind, sends, last_sent_at')
      .in('helper_id', ids) as { data: Array<{ helper_id: string; kind: string; sends: number; last_sent_at: string | null }> | null };
    for (const l of logs ?? []) {
      const bucket = logByHelper.get(l.helper_id) ?? {};
      bucket[l.kind] = { sends: l.sends ?? 0, last_sent_at: l.last_sent_at };
      logByHelper.set(l.helper_id, bucket);
    }
  }

  // last_accepted_at isn't a column — derive it. household_bookings.student_id
  // holds the helper's AUTH user_id (accept-job sets it from the token), so
  // the join goes through user_id, not the helper row id.
  const userIds = helpers.map((h) => h.user_id as string | null).filter(Boolean) as string[];
  const lastAcceptedByUser = new Map<string, string>();
  if (userIds.length) {
    const { data: bookings } = await supabase
      .from('household_bookings')
      .select('student_id, accepted_at')
      .in('student_id', userIds)
      .not('accepted_at', 'is', null)
      .order('accepted_at', { ascending: false })
      .limit(2000) as { data: Array<{ student_id: string; accepted_at: string }> | null };
    for (const b of bookings ?? []) {
      if (!lastAcceptedByUser.has(b.student_id)) lastAcceptedByUser.set(b.student_id, b.accepted_at);
    }
  }

  return helpers.map((h) => {
    const app = (h.application_data ?? {}) as Record<string, unknown>;
    const uid = h.user_id as string | null;
    return {
      id: h.id as string,
      name: (h.name as string | null) ?? null,
      phone: (h.phone as string | null) ?? null,
      email: (h.email as string | null) ?? null,
      city: (h.city as string | null) ?? null,
      created_at: h.created_at as string,
      status: (h.status as string | null) ?? null,
      is_available: (h.is_available as boolean | null) ?? null,
      pending_email_verify: app.pending_email_verify === true,
      student_email_verified: (h.student_email_verified as boolean | null) ?? null,
      id_verified: (h.id_verified as boolean | null) ?? null,
      verified_plan_active: (h.verified_plan_active as boolean | null) ?? null,
      identity_status: (h.identity_status as string | null) ?? null,
      identity_started_at: typeof app.identity_started_at === 'string' ? app.identity_started_at : null,
      photo_url: (h.photo_url as string | null) ?? null,
      bio: (h.bio as string | null) ?? null,
      categories: (h.categories as string[] | null) ?? null,
      payment_handle: (h.payment_handle as string | null) ?? null,
      accepted_count: (h.accepted_count as number | null) ?? 0,
      average_rating: (h.average_rating as number | null) ?? null,
      rating_count: (h.rating_count as number | null) ?? 0,
      last_accepted_at: uid ? (lastAcceptedByUser.get(uid) ?? null) : null,
      garda_vetting_ok: app.garda_vetting_ok === true,
      garda_vetted: app.garda_vetted === true,
      nudge_log: logByHelper.get(h.id as string) ?? {},
    } satisfies HelperSnapshot;
  });
}

const EMAIL_SUBJECTS: Record<string, string> = {
  email_unverified:  'One step left to go live on VANO',
  id_unstarted:      'Your free ID check unlocks VANO jobs',
  id_abandoned:      'Your VANO ID check didn’t finish',
  no_photo:          'Add a photo to your VANO profile',
  no_payment_handle: 'Add your Revolut tag so customers can pay you',
  never_accepted:    'Not had a VANO job yet? Two quick fixes',
  dormant:           'Still up for VANO work?',
  thin_profile:      'One line makes your VANO profile land',
};

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');
  if (req.method !== 'POST') return bad(405, 'Method not allowed');

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
  const siteUrl     = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
  const action      = new URL(req.url).searchParams.get('action') ?? 'board';
  const supabase    = createClient(supabaseUrl, serviceKey);
  const now         = Date.now();

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* empty body is fine */ }

  try {
    // ── BOARD: admin-only, read-only ───────────────────────────────────────
    if (action === 'board') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');
      const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(authHeader.replace('Bearer ', ''));
      if (claimsError || !claimsData?.claims) return bad(401, 'Unauthorized');
      const callerId = typeof claimsData.claims.sub === 'string' ? claimsData.claims.sub : null;
      if (!callerId) return bad(401, 'Unauthorized');
      const { data: roleRow } = await supabase
        .from('user_roles').select('id').eq('user_id', callerId).eq('role', 'admin').maybeSingle();
      if (!roleRow) return bad(403, 'Admin access required');

      const snapshots = await loadSnapshots(supabase);
      const rules = triageFunnel(snapshots, now, siteUrl);
      const ranked = await geminiRankBoard(rules);
      const signals = ranked ?? rules;
      return ok({
        brain: ranked ? 'ai' : 'rules',
        helpers_scanned: snapshots.length,
        counts: {
          critical: signals.filter((s) => s.severity === 'critical').length,
          warn:     signals.filter((s) => s.severity === 'warn').length,
          info:     signals.filter((s) => s.severity === 'info').length,
          owner:    signals.filter((s) => s.actor === 'owner').length,
        },
        signals,
      });
    }

    // ── NUDGE: cron/service key, ACTS ──────────────────────────────────────
    if (action !== 'nudge') return bad(400, 'Unknown action');

    // Spend gate — identical to nudge-helper-onboarding: the service key for
    // manual runs, or the vault cron secret validated through the
    // service-role-only check_cron_key RPC. The public keys can't fire this.
    const authHeader = req.headers.get('Authorization') ?? '';
    let authorized = authHeader === `Bearer ${serviceKey}`;
    if (!authorized) {
      const cronKey = req.headers.get('X-Vano-Cron')?.trim() ?? '';
      if (cronKey) {
        try {
          const { data } = await supabase.rpc('check_cron_key', { candidate: cronKey });
          authorized = data === true;
        } catch (e) { console.warn('[helper-copilot] cron-key check failed', e); }
      }
    }
    if (!authorized) return bad(401, 'unauthorized');

    const dryRun = body.dry_run === true;

    const snapshots = await loadSnapshots(supabase);
    // One message per helper per run, most important signal only.
    const queue = nextSendPerHelper(snapshots, now, siteUrl).slice(0, MAX_SENDS_PER_RUN);
    if (queue.length === 0) {
      return ok({ ok: true, dry_run: dryRun, scanned: snapshots.length, queued: 0, sent: 0, results: [] });
    }

    // Wording pass. message/link are non-null for everything in the queue —
    // nextSendPerHelper only returns sendable signals — but narrow anyway.
    const items = queue.map(({ snapshot, signal }) => ({
      name: (snapshot.name ?? '').trim().split(/\s+/)[0] || 'there',
      kind: signal.kind,
      city: snapshot.city,
      link: signal.link ?? siteUrl,
      message: signal.message ?? '',
    }));
    const rewritten = await geminiRewrite(items);

    const results: Array<Record<string, unknown>> = [];
    let sent = 0;
    for (let i = 0; i < queue.length; i++) {
      const { snapshot, signal } = queue[i];
      const aiText = rewritten?.[i] ?? null;
      const text = aiText ?? signal.message!;
      const channels: string[] = [];

      if (dryRun) {
        results.push({ helper_id: snapshot.id, name: snapshot.name, kind: signal.kind, severity: signal.severity, ai_written: !!aiText, would_send: text, channels: ['dry_run'] });
        continue;
      }

      channels.push(...await sendText(snapshot.phone, text));
      const subject = EMAIL_SUBJECTS[signal.kind] ?? 'A quick VANO update';
      if (await sendEmail(snapshot.email, subject, text)) channels.push('email');

      // Stamp only on a real delivery. A Twilio outage must not burn the
      // helper's cap — they'd silently never hear from us again.
      if (channels.length > 0) {
        sent++;
        const prior = snapshot.nudge_log?.[signal.kind]?.sends ?? 0;
        const { error: logErr } = await supabase
          .from('helper_nudge_log')
          .upsert({
            helper_id: snapshot.id,
            kind: signal.kind,
            sends: prior + 1,
            last_sent_at: new Date().toISOString(),
            last_channel: channels.join('+'),
            last_message: text.slice(0, 1000),
            last_ai: !!aiText,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'helper_id,kind' });
        if (logErr) console.error('[helper-copilot] nudge log write failed', signal.kind, logErr);
      }
      results.push({ helper_id: snapshot.id, name: snapshot.name, kind: signal.kind, severity: signal.severity, ai_written: !!aiText, channels });
    }

    return ok({
      ok: true,
      dry_run: dryRun,
      brain: rewritten ? 'ai' : 'rules',
      scanned: snapshots.length,
      queued: queue.length,
      sent,
      results,
    });
  } catch (e) {
    console.error('[helper-copilot] failed', e);
    return bad(500, e instanceof Error ? e.message : 'Copilot failed');
  }
});
