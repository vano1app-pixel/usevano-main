import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type BookingSnapshot,
  type TriageSignal,
  triageBoard,
} from "../_shared/opsTriage.ts";

// ── The ops copilot (2026-07-30) ──────────────────────────────────────────
// Reads the whole live board — every non-terminal booking, its helper, its
// latest movement updates, unresolved SOS events and stuck payouts — runs
// the deterministic judgment rules in _shared/opsTriage.ts, and returns a
// ranked "what needs a human right now" list for the admin dashboard.
//
// STRICTLY READ-ONLY: this function never writes a row, never sends a
// message, never moves money. The acting safety nets (sweep-stalled-jobs,
// remind-unpaid-bookings, no-helper-fallback…) keep doing the acting; the
// copilot's job is the window BEFORE they fire, where a human phone call
// still saves the booking. That read-only property is what makes it safe to
// call as often as the dashboard likes.
//
// AI layer: when GEMINI_API_KEY is set, the deterministic signals are handed
// to Gemini to (a) re-rank by what most deserves the owner's next five
// minutes and (b) rewrite the action lines with cross-booking context ("two
// of these are the same helper — one call covers both"). FAIL-SOFT like
// every AI in this codebase (parse-custom-job, whatsapp-inbound): any
// error, timeout or malformed reply returns the rule-ranked list unchanged,
// with `brain: 'rules'` so the UI is honest about which brain answered.
// The AI can REORDER and REPHRASE but can never invent or drop a signal —
// detection stays deterministic and testable.
//
// Auth mirrors admin-partner-payouts: caller JWT → getClaims → user_roles
// must contain role='admin'. verify_jwt is pinned false in config.toml.

const FALLBACK_ORIGINS = ['https://vanojobs.com','https://www.vanojobs.com','http://localhost:5173','http://localhost:4173','http://localhost:8080'];
const NATIVE_APP_ORIGINS = ['capacitor://localhost', 'https://localhost', 'ionic://localhost'];
const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';
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

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GEMINI_MODEL = 'gemini-2.0-flash';

/** Gemini pass: re-rank + rephrase the deterministic signals. Returns null on
 *  ANY problem — the caller then serves the rule-ranked list unchanged. */
async function geminiRank(signals: TriageSignal[]): Promise<TriageSignal[] | null> {
  const key = Deno.env.get('GEMINI_API_KEY')?.trim();
  if (!key || signals.length === 0) return null;
  // Cap the payload — past ~40 items ranking precision stops mattering.
  const capped = signals.slice(0, 40);
  const compact = capped.map((s, i) => ({
    i,
    kind: s.kind,
    severity: s.severity,
    age_min: s.age_min,
    category: s.category,
    city: s.city,
    helper: s.helper_name,
    customer: s.customer_name,
    summary: s.summary,
  }));
  const system =
    'You are the operations brain for VANO, a same-day student-help service in Galway, Ireland. ' +
    'You are given a list of pre-detected issues on live bookings (index i). Rank them by what most ' +
    'deserves the owner\'s next five minutes: safety first, then money about to be lost, then customer ' +
    'experience, then housekeeping — and within that, prefer issues where one action fixes several ' +
    '(same helper or same customer appearing twice). For each, write a short action line (max 18 words, ' +
    'plain Irish-English, no fluff) saying exactly what to do. Never invent issues and never drop any: ' +
    'return every index exactly once. Always call the tool.';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(compact) },
        ],
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
    if (!resp.ok) { console.warn('[ops-copilot] gemini non-2xx', resp.status); return null; }
    const data = await resp.json().catch(() => null);
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    const parsed = JSON.parse(args) as { ranked?: Array<{ i?: number; action?: string }> };
    const ranked = Array.isArray(parsed.ranked) ? parsed.ranked : null;
    if (!ranked) return null;
    // THE HONESTY GUARD: the model may only permute + rephrase. Every index
    // exactly once, or we distrust the whole reply and fall back to rules.
    const seen = new Set<number>();
    const out: TriageSignal[] = [];
    for (const r of ranked) {
      const i = typeof r.i === 'number' ? r.i : -1;
      if (i < 0 || i >= capped.length || seen.has(i)) return null;
      seen.add(i);
      const base = capped[i];
      const action = typeof r.action === 'string' && r.action.trim().length > 0 && r.action.length <= 220
        ? r.action.trim()
        : base.action;
      out.push({ ...base, action });
    }
    if (seen.size !== capped.length) return null;
    // Anything past the cap keeps its rule order at the tail.
    return [...out, ...signals.slice(40)];
  } catch (e) {
    console.warn('[ops-copilot] gemini pass skipped', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');
  if (req.method !== 'POST') return bad(405, 'Method not allowed');

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return bad(401, 'Unauthorized');
    const callerId = typeof claimsData.claims.sub === 'string' ? claimsData.claims.sub : null;
    if (!callerId) return bad(401, 'Unauthorized');

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await supabase
      .from('user_roles').select('id').eq('user_id', callerId).eq('role', 'admin').maybeSingle();
    if (!roleRow) return bad(403, 'Admin access required');

    // ── Gather the live board ──────────────────────────────────────────
    // Non-terminal bookings, plus the last 48 h of completed ones (their
    // settle-up / payout signals are still live money questions).
    const cutoff48 = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: liveRows, error: liveErr } = await supabase
      .from('household_bookings')
      .select('id, status, category, city, customer_name, customer_phone, created_at, scheduled_at, accepted_at, paid_at, payment_requested_at, helper_finished_at, job_ends_at, disputed_at, refunded_at, student_id, price_estimate_cents, booking_data')
      .in('status', ['awaiting_payment', 'pending', 'accepted', 'on_way', 'arrived', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(200);
    if (liveErr) { console.error('[ops-copilot] live query failed', liveErr); return bad(500, 'Could not read the board'); }
    const { data: doneRows } = await supabase
      .from('household_bookings')
      .select('id, status, category, city, customer_name, customer_phone, created_at, scheduled_at, accepted_at, paid_at, payment_requested_at, helper_finished_at, job_ends_at, disputed_at, refunded_at, student_id, price_estimate_cents, booking_data')
      .eq('status', 'completed')
      .gte('created_at', cutoff48)
      .order('created_at', { ascending: false })
      .limit(100);

    const rows = [...(liveRows ?? []), ...(doneRows ?? [])] as Array<Record<string, unknown>>;
    const ids = rows.map((r) => r.id as string);
    const studentIds = [...new Set(rows.map((r) => r.student_id as string | null).filter(Boolean))] as string[];

    // Helpers (name + phone + payout readiness) keyed by user_id.
    const helpersByUser = new Map<string, { name: string | null; phone: string | null; payouts_enabled: boolean }>();
    if (studentIds.length) {
      const { data: helpers } = await supabase
        .from('household_helpers')
        .select('user_id, name, phone, stripe_payouts_enabled')
        .in('user_id', studentIds);
      for (const h of (helpers ?? []) as Array<{ user_id: string | null; name: string | null; phone: string | null; stripe_payouts_enabled: boolean | null }>) {
        if (h.user_id) helpersByUser.set(h.user_id, { name: h.name, phone: h.phone, payouts_enabled: !!h.stripe_payouts_enabled });
      }
    }

    // Movement updates (latest on_way / arrived per booking).
    const lastUpdate = new Map<string, { on_way?: string; arrived?: string }>();
    if (ids.length) {
      const { data: updates } = await supabase
        .from('household_job_updates')
        .select('booking_id, status, created_at')
        .in('booking_id', ids)
        .in('status', ['on_way', 'arrived'])
        .order('created_at', { ascending: true });
      for (const u of (updates ?? []) as Array<{ booking_id: string; status: string; created_at: string }>) {
        const e = lastUpdate.get(u.booking_id) ?? {};
        if (u.status === 'on_way') e.on_way = u.created_at;
        if (u.status === 'arrived') e.arrived = u.created_at;
        lastUpdate.set(u.booking_id, e);
      }
    }

    // Unresolved SOS events (service-role-only table; fail-soft if absent).
    const sosSet = new Set<string>();
    try {
      const { data: sos } = await supabase
        .from('helper_sos_events')
        .select('booking_id, resolved_at')
        .is('resolved_at', null)
        .limit(50);
      for (const s of (sos ?? []) as Array<{ booking_id: string | null }>) {
        if (s.booking_id) sosSet.add(s.booking_id);
      }
    } catch { /* table may not exist in an environment — no SOS signals */ }

    // Card-pay payouts stuck pending (helper likely un-onboarded).
    const pendingPayout = new Set<string>();
    if (ids.length) {
      const { data: payouts } = await supabase
        .from('household_payouts')
        .select('booking_id, status')
        .in('booking_id', ids)
        .eq('status', 'pending');
      for (const p of (payouts ?? []) as Array<{ booking_id: string }>) pendingPayout.add(p.booking_id);
    }

    const snapshots: BookingSnapshot[] = rows.map((r) => {
      const bd = (r.booking_data ?? {}) as Record<string, unknown>;
      const helper = r.student_id ? helpersByUser.get(r.student_id as string) : undefined;
      const upd = lastUpdate.get(r.id as string) ?? {};
      return {
        id: r.id as string,
        status: r.status as string,
        category: (r.category as string | null) ?? null,
        city: (r.city as string | null) ?? null,
        customer_name: (r.customer_name as string | null) ?? null,
        customer_phone: (r.customer_phone as string | null) ?? null,
        created_at: r.created_at as string,
        scheduled_at: (r.scheduled_at as string | null) ?? null,
        accepted_at: (r.accepted_at as string | null) ?? null,
        paid_at: (r.paid_at as string | null) ?? null,
        payment_requested_at: (r.payment_requested_at as string | null) ?? null,
        helper_finished_at: (r.helper_finished_at as string | null) ?? null,
        job_ends_at: (r.job_ends_at as string | null) ?? null,
        disputed_at: (r.disputed_at as string | null) ?? null,
        refunded_at: (r.refunded_at as string | null) ?? null,
        student_id: (r.student_id as string | null) ?? null,
        direct_pay: bd.direct_pay === true,
        card_pay: bd.card_pay === true,
        paid_to_helper: typeof bd.paid_to_helper === 'boolean' ? bd.paid_to_helper : null,
        helper_first_name: (bd.helper_first_name as string | null) ?? null,
        price_estimate_cents: (r.price_estimate_cents as number | null) ?? null,
        last_on_way_at: upd.on_way ?? null,
        last_arrived_at: upd.arrived ?? null,
        helper_name: helper?.name ?? null,
        helper_phone: helper?.phone ?? null,
        payout_pending_unonboarded: bd.card_pay === true && pendingPayout.has(r.id as string) && !(helper?.payouts_enabled ?? false),
        sos_active: sosSet.has(r.id as string),
      };
    });

    const ruleRanked = triageBoard(snapshots, Date.now());
    const aiRanked = await geminiRank(ruleRanked);

    return new Response(
      JSON.stringify({
        items: aiRanked ?? ruleRanked,
        brain: aiRanked ? 'gemini' : 'rules',
        board: { live: (liveRows ?? []).length, recent_completed: (doneRows ?? []).length },
        generated_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[ops-copilot] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
