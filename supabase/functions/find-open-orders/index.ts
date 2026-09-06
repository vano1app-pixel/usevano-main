import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { approxAreaLabel } from "../_shared/serviceAreas.ts";
import { CATEGORY_LABELS } from "../_shared/householdPricing.ts";
import { buildSearchTags, matchesQuery, timeTags } from "../_shared/searchTags.ts";
import { haversineKm, isNum } from "../_shared/geo.ts";
import { isReviewDemoBooking, isReviewDemoHelperPhone } from "../_shared/reviewDemo.ts";

// ── The Find screen's feed (2026-09-06) ──────────────────────────────────────
// A signed-in, approved, ID-verified helper asks "what's open near me?" and
// gets the live orders sorted by distance, then pay, then recency — with a
// prefix search over the job's tags ("cleaning tonight", "dog walk salthill").
// This is the open-jobs board grown up: same trust rule (the LIST never
// carries the address, the customer's name/phone or the note), but keyed on
// a Supabase session instead of a signed link, and with distance.
//
// Side effect: when the app sends the helper's position we stamp it on the
// helper row (last_lat/last_lng) so dispatch can offer nearby jobs first.
// Never in the background — this only runs while Find is open.
//
// Review demo: the demo helper sees ONLY demo orders; real helpers never do.

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

export interface OpenOrder {
  id: string;
  category: string;
  label: string;
  area: string;
  size_label: string | null;
  extra_label: string | null;
  earn_cents: number;
  fee_note: 'You keep 100%';
  created_at: string;
  scheduled_at: string | null;
  when_label: string;
  distance_km: number | null;
  approx_lat: number | null;
  approx_lng: number | null;
  customer_rep: { paid_jobs?: number; unpaid_reports?: number; stars?: number } | null;
  tags: string[];
  kit_required: string[];
}

const DUBLIN = 'Europe/Dublin';
function whenLabel(scheduledAt: string | null, now: Date): string {
  if (!scheduledAt) return 'Now';
  const d = new Date(scheduledAt);
  const day = (x: Date) => new Intl.DateTimeFormat('en-IE', { timeZone: DUBLIN, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
  const time = new Intl.DateTimeFormat('en-IE', { timeZone: DUBLIN, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  if (day(d) === day(now)) return `Today ${time}`;
  if (day(d) === day(new Date(now.getTime() + 86_400_000))) return `Tomorrow ${time}`;
  const wd = new Intl.DateTimeFormat('en-IE', { timeZone: DUBLIN, weekday: 'short' }).format(d);
  return `${wd} ${time}`;
}

/** ~100 m grid: enough to place a pin on the right street corner, never the house. */
const approx = (v: number | null) => (isNum(v) ? Math.round(v * 1000) / 1000 : null);

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');
  if (req.method !== 'POST') return bad(405, 'Method not allowed');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Sign in to see orders');
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await authClient.auth.getUser();
    if (userErr || !user) return bad(401, 'Sign in to see orders');

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({})) as {
      lat?: number; lng?: number; radius_km?: number; q?: string; category?: string; min_cents?: number; when?: 'now' | 'today' | 'any';
    };
    const lat = isNum(body.lat) ? body.lat : null;
    const lng = isNum(body.lng) ? body.lng : null;
    const radiusKm = Math.min(50, Math.max(1, isNum(body.radius_km) ? body.radius_km : 5));
    const q = typeof body.q === 'string' ? body.q.trim().slice(0, 80) : '';
    const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null;
    const minCents = isNum(body.min_cents) ? Math.max(0, body.min_cents) : 0;
    const when = body.when === 'now' || body.when === 'today' ? body.when : 'any';

    const { data: helper } = await supabase
      .from('household_helpers')
      .select('id, status, id_verified, phone, last_lat, last_lng, categories')
      .eq('user_id', user.id)
      .maybeSingle() as { data: { id: string; status: string; id_verified: boolean | null; phone: string | null; last_lat: number | null; last_lng: number | null; categories: string[] | null } | null };

    const demoHelper = !!helper && isReviewDemoHelperPhone(helper.phone);
    let eligible = false;
    let reason: 'not_verified' | 'not_approved' | 'no_helper' | null = null;
    if (!helper) reason = 'no_helper';
    else if (helper.status !== 'approved' && !demoHelper) reason = 'not_approved';
    else if (!helper.id_verified && !demoHelper) reason = 'not_verified';
    else eligible = true;

    // Stamp the position (fail-soft) — this is the only place it's written.
    let helperPos: { lat: number; lng: number } | null = null;
    if (helper && lat !== null && lng !== null) {
      helperPos = { lat, lng };
      supabase.from('household_helpers')
        .update({ last_lat: lat, last_lng: lng, location_updated_at: new Date().toISOString() })
        .eq('id', helper.id)
        .then(({ error }) => { if (error) console.warn('[find-open-orders] position stamp failed', error); });
    } else if (helper && isNum(helper.last_lat) && isNum(helper.last_lng)) {
      helperPos = { lat: helper.last_lat, lng: helper.last_lng };
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - 48 * 3600_000).toISOString();
    const horizon = new Date(now.getTime() + 12 * 3600_000).toISOString();
    const { data: rows, error: qErr } = await supabase
      .from('household_bookings')
      .select('id, category, city, customer_lat, customer_lng, customer_address, price_estimate_cents, created_at, scheduled_at, booking_data, search_tags, area_label')
      .eq('status', 'pending')
      .is('student_id', null)
      .gte('created_at', cutoff)
      .or(`scheduled_at.is.null,scheduled_at.lte.${horizon}`)
      .order('created_at', { ascending: false })
      .limit(200);
    if (qErr) { console.error('[find-open-orders] query failed', qErr); return bad(500, 'Could not load orders'); }

    const orders: OpenOrder[] = [];
    for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
      const bd = (r.booking_data ?? {}) as Record<string, unknown>;
      // The demo wall: demo rows only for the demo helper, never for anyone else.
      if (isReviewDemoBooking(bd) !== demoHelper) continue;
      const cat = (r.category as string | null) ?? 'other';
      const cLat = r.customer_lat as number | null;
      const cLng = r.customer_lng as number | null;
      const area = (r.area_label as string | null) ?? approxAreaLabel({
        lat: cLat, lng: cLng, address: (r.customer_address as string | null) ?? null, city: (r.city as string | null) ?? null,
      });
      const scheduledAt = (r.scheduled_at as string | null) ?? null;
      const tags = (r.search_tags as string[] | null) ?? buildSearchTags({
        category: cat, size_label: bd.size_label as string | null, extra_label: bd.extra_label as string | null,
        area, city: r.city as string | null, scheduled_at: scheduledAt,
      }, now);
      // Time tags are relative — recompute so "tonight" is true tonight.
      const liveTags = [...new Set([...tags.filter((t) => !['now', 'today', 'tonight', 'tomorrow', 'asap', 'morning', 'afternoon', 'evening', 'weekend'].includes(t)), ...timeTags(scheduledAt, now)])];
      const earn = (r.price_estimate_cents as number | null) ?? 0;
      const label = [CATEGORY_LABELS[cat] ?? 'Job', bd.extra_label ? String(bd.extra_label).slice(0, 60) : null].filter(Boolean).join(' · ');
      const distance = helperPos && isNum(cLat) && isNum(cLng) ? haversineKm(helperPos.lat, helperPos.lng, cLat, cLng) : null;

      if (category && cat !== category) continue;
      if (earn < minCents) continue;
      if (when === 'now' && !liveTags.includes('now')) continue;
      if (when === 'today' && !liveTags.includes('today')) continue;
      if (distance !== null && distance > radiusKm) continue;
      if (q && !matchesQuery(q, [...liveTags, label, area])) continue;

      const rep = (bd.customer_rep ?? null) as OpenOrder['customer_rep'];
      orders.push({
        id: r.id as string,
        category: cat,
        label,
        area,
        size_label: typeof bd.size_label === 'string' ? bd.size_label : null,
        extra_label: typeof bd.extra_label === 'string' ? (bd.extra_label as string).slice(0, 80) : null,
        earn_cents: earn,
        fee_note: 'You keep 100%',
        created_at: r.created_at as string,
        scheduled_at: scheduledAt,
        when_label: whenLabel(scheduledAt, now),
        distance_km: distance === null ? null : Math.round(distance * 10) / 10,
        approx_lat: approx(cLat),
        approx_lng: approx(cLng),
        customer_rep: rep && typeof rep === 'object' ? rep : null,
        tags: liveTags,
        kit_required: Array.isArray(bd.kit_required) ? (bd.kit_required as string[]) : [],
      });
    }

    orders.sort((a, b) => {
      const da = a.distance_km ?? Infinity, db = b.distance_km ?? Infinity;
      if (da !== db) return da - db;
      if (a.earn_cents !== b.earn_cents) return b.earn_cents - a.earn_cents;
      return b.created_at.localeCompare(a.created_at);
    });

    return new Response(
      JSON.stringify({ orders, radius_km: radiusKm, eligible, ...(reason ? { reason } : {}), helper: helperPos, generated_at: now.toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[find-open-orders] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
