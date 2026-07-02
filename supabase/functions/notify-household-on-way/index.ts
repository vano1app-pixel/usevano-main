import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  renderHouseholdEmail, emailP, escapeHtml, categoryLabel, greetName,
  sendHouseholdEmail,
} from "../_shared/householdEmail.ts";

// Tells the customer their helper is on the way across every channel we have:
// WhatsApp/SMS (the main channel for phone-only quick-book customers), email
// (when they left one) and a web push, plus an admin WhatsApp ping. Called
// fire-and-forget from StudentJobDetail when status advances to on_way.
//
// CORS, the web-push trigger and the SMS sender are inlined (rather than pulled
// from ../_shared); the customer email renders through the shared branded
// template (../_shared/householdEmail.ts).
//
// Guards: valid student JWT, caller is the assigned student, booking already in
// on_way status (the DB update happens before this is called).

// -- Inlined CORS ------------------------------------------------------------
const FALLBACK_ORIGINS = [
  'https://vanojobs.com', 'https://www.vanojobs.com',
  'http://localhost:5173', 'http://localhost:4173',
];
const ALLOWED_HEADERS = [
  'authorization','x-client-info','apikey','content-type',
  'x-supabase-client-platform','x-supabase-client-platform-version',
  'x-supabase-client-runtime','x-supabase-client-runtime-version',
].join(', ');
function getAllowlist(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  if (!raw) return FALLBACK_ORIGINS;
  return raw.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
}
function allowsVercelPreview(origin: string): boolean {
  try { return new URL(origin).hostname.endsWith('-vano1app-pixels-projects.vercel.app'); } catch { return false; }
}
function matchOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const n = origin.replace(/\/$/, '');
  if (getAllowlist().includes(n)) return n;
  if (allowsVercelPreview(n)) return n;
  return null;
}
function buildCorsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': matchOrigin(req) ?? 'null',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    Vary: 'Origin',
  };
}
function isOriginAllowed(req: Request): boolean {
  if (!req.headers.get('Origin')) return true;
  return matchOrigin(req) !== null;
}

// -- Inlined web-push trigger ------------------------------------------------
async function sendHouseholdPush(bookingId: string, status: 'accepted' | 'on_way' | 'arrived' | 'completed'): Promise<void> {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return;
    await fetch(`${url}/functions/v1/send-household-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ booking_id: bookingId, status }),
    });
  } catch (err) {
    console.error('sendHouseholdPush failed (non-fatal):', err);
  }
}

// -- Inlined SMS / WhatsApp via Twilio (mirrors notify-household-accepted) ----
function normalizeIrishPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-().]/g, '').trim();
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
  if (cleaned.startsWith('00')) {
    const c = '+' + cleaned.slice(2);
    return /^\+\d{8,15}$/.test(c) ? c : null;
  }
  if (/^08[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned.slice(1);
  if (/^8[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned;
  return null;
}
async function sendSms(to: string | null | undefined, body: string): Promise<boolean> {
  const sid   = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  if (!sid || !token) return false;
  const e164 = normalizeIrishPhone(to);
  if (!e164) return false;
  // WhatsApp preferred (no Irish carrier filtering, higher open rates).
  const waFrom = Deno.env.get('TWILIO_WHATSAPP_FROM')?.trim();
  if (waFrom) {
    const fromWa = waFrom.startsWith('whatsapp:') ? waFrom : `whatsapp:${waFrom}`;
    try {
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: `whatsapp:${e164}`, From: fromWa, Body: body }).toString(),
      });
      if (!resp.ok) console.warn('[on-way:whatsapp] twilio error', resp.status, (await resp.text()).slice(0, 200));
      return resp.ok;
    } catch (e) { console.warn('[on-way:whatsapp] twilio exception', e); return false; }
  }
  // SMS fallback - off until a carrier-trusted Irish number is configured.
  if (Deno.env.get('VANO_SMS_ENABLED')?.trim() !== 'true') return false;
  const fromSms = (Deno.env.get('TWILIO_SMS_FROM') || Deno.env.get('TWILIO_FROM_NUMBER'))?.trim();
  if (!fromSms || fromSms.startsWith('whatsapp:')) return false;
  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: e164, From: fromSms, Body: body }).toString(),
    });
    if (!resp.ok) console.warn('[on-way:sms] twilio error', resp.status, (await resp.text()).slice(0, 200));
    return resp.ok;
  } catch (e) { console.warn('[on-way:sms] twilio exception', e); return false; }
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!isOriginAllowed(req)) return new Response(JSON.stringify({ error: 'Forbidden origin' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const ok = (data: Record<string, unknown>) =>
    new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return bad(401, 'Invalid session');

    const { booking_id } = await req.json().catch(() => ({})) as { booking_id?: string };
    if (!booking_id) return bad(400, 'booking_id required');

    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller is the assigned student AND the booking is in on_way.
    const { data: booking } = await supabase
      .from('household_bookings')
      .select('id, status, customer_name, customer_email, customer_phone, category, scheduled_date, student_id, city, price_estimate_cents')
      .eq('id', booking_id)
      .eq('status', 'on_way')
      .eq('student_id', user.id)
      .maybeSingle() as { data: Record<string, string | null | number> | null };

    if (!booking) return ok({ ok: true, emailed: false, reason: 'booking_not_on_way' });

    // Web push first - reaches phone-only customers who never gave an email.
    void sendHouseholdPush(booking_id, 'on_way');

    // Helper name - household_helpers first, profiles fallback.
    let helperName = 'Your helper';
    let helperFirstName = 'Your helper';
    if (booking.student_id) {
      const { data: helper } = await supabase
        .from('household_helpers').select('name').eq('user_id', booking.student_id).maybeSingle() as { data: { name?: string } | null };
      if (helper?.name) {
        helperName = helper.name;
        helperFirstName = helper.name.split(' ')[0];
      } else {
        const { data: profile } = await supabase
          .from('profiles').select('display_name').eq('user_id', booking.student_id).maybeSingle() as { data: { display_name?: string } | null };
        if (profile?.display_name) {
          helperName = profile.display_name;
          helperFirstName = profile.display_name.split(' ')[0];
        }
      }
    }

    const resendKey  = Deno.env.get('RESEND_API_KEY')?.trim();
    const siteUrl    = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
    const trackUrl   = `${siteUrl}/track/${booking_id}`;
    const catLabel   = categoryLabel(booking.category as string);
    const custName   = greetName(booking.customer_name as string | null);
    const ref        = booking_id.slice(-8).toUpperCase();

    // -- SMS / WhatsApp the customer - main channel for phone-only customers --
    {
      const phone = booking.customer_phone as string | null;
      if (phone) {
        await sendSms(phone, `VANO: ${helperFirstName} is on the way for your ${catLabel}! See their live location: ${trackUrl}`);
      }
    }

    // -- Customer email (only when they left one) ----------------------------
    let emailed = false;
    if (resendKey && booking.customer_email) {
      // HTML-safe variants for interpolation (raw values stay in text/subject).
      const custNameHtml   = escapeHtml(custName);
      const helperNameHtml = escapeHtml(helperFirstName);
      const catLabelHtml   = escapeHtml(catLabel);

      const html = renderHouseholdEmail({
        preheader: `Watch ${helperFirstName} approach on the live map — tap to track.`,
        eyebrow: 'On the way',
        heading: `${helperNameHtml} is heading to you 🚶`,
        bodyHtml: [
          emailP(`Hi ${custNameHtml},`),
          emailP(`<strong>${helperNameHtml}</strong> is on their way for your <strong>${catLabelHtml}</strong>.`),
          emailP(`You can see their <strong>live location on the map</strong> and message them directly below.`, { last: true }),
        ].join(''),
        ctas: [{ label: 'Track live location →', url: trackUrl }],
        footerNote: `Ref: ${ref}`,
      });

      emailed = await sendHouseholdEmail({
        to: booking.customer_email as string,
        subject: `${helperFirstName} is on the way — VANO`,
        html,
        text: `Hi ${custName}, ${helperFirstName} is on their way for your ${catLabel}. Track their live location: ${trackUrl}`,
      });
    }

    // -- Admin WhatsApp ping -------------------------------------------------
    fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'helper_on_way',
        helper_name: helperName,
        customer_name: booking.customer_name,
        category: booking.category,
        city: booking.city,
        booking_id,
      }),
    }).catch(() => {});

    return ok({ ok: true, emailed });
  } catch (err) {
    console.error('[notify-household-on-way] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
