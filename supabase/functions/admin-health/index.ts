import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Owner-only system health check. Answers the one question that matters after
// the "pings silently vanished" history: are the channels that find & confirm
// workers actually configured and working right now?
//
// Reports (NEVER secret values — only configured/working booleans):
//   - WhatsApp / SMS / email / push / payments: configured + live where cheap
//     to verify (Twilio + Stripe credential pings).
//   - Supply gaps that quietly lose reach: approved helpers with no phone
//     (no WhatsApp/SMS) or no user_id (no push until first tap).
//   - Live pipeline: open unassigned jobs, accepted-but-unpaid jobs, and the
//     most recent dispatch's fan-out (how many workers it reached).
//
// Auth: same gate as the admin UI — the caller must be signed in as ADMIN_EMAIL.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const has = (k: string) => !!(Deno.env.get(k)?.trim());

// Bounded external check — never let a slow/failing provider hang the page.
async function ping(url: string, headers: Record<string, string>): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(url, { headers, signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

  // ── Auth: signed-in admin only ──────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const adminEmail = (Deno.env.get('ADMIN_EMAIL')?.trim() || 'vano1app@gmail.com').toLowerCase();
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user || (user.email ?? '').toLowerCase() !== adminEmail) return json({ error: 'Forbidden' }, 403);

  const sb = createClient(supabaseUrl, serviceKey);

  // ── Channel configuration ───────────────────────────────────────────────
  const twilioSid   = has('TWILIO_ACCOUNT_SID');
  const twilioToken = has('TWILIO_AUTH_TOKEN');
  const waFrom      = has('TWILIO_WHATSAPP_FROM') || has('TWILIO_WA_FROM');
  const smsFrom     = has('TWILIO_SMS_FROM') || has('TWILIO_FROM_NUMBER');
  const smsEnabled  = Deno.env.get('VANO_SMS_ENABLED')?.trim() === 'true';

  const whatsappConfigured = twilioSid && twilioToken && waFrom;
  const smsConfigured      = twilioSid && twilioToken && smsFrom && smsEnabled;

  // Live credential pings (only if the basics are present).
  let twilioLive: boolean | null = null;
  if (twilioSid && twilioToken) {
    const sid = Deno.env.get('TWILIO_ACCOUNT_SID')!.trim();
    const tok = Deno.env.get('TWILIO_AUTH_TOKEN')!.trim();
    twilioLive = await ping(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      Authorization: `Basic ${btoa(`${sid}:${tok}`)}`,
    });
  }
  let stripeLive: boolean | null = null;
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')?.trim();
  if (stripeKey) stripeLive = await ping('https://api.stripe.com/v1/balance', { Authorization: `Bearer ${stripeKey}` });

  // ── Supply + pipeline data ──────────────────────────────────────────────
  const safeCount = async (p: Promise<{ count: number | null }>): Promise<number> => {
    try { return (await p).count ?? 0; } catch { return 0; }
  };

  const approvedAvailable = await safeCount(sb.from('household_helpers').select('id', { count: 'exact', head: true }).eq('status', 'approved').eq('is_available', true) as never);
  const approvedNoPhone   = await safeCount(sb.from('household_helpers').select('id', { count: 'exact', head: true }).eq('status', 'approved').eq('is_available', true).is('phone', null) as never);
  const approvedNoUserId  = await safeCount(sb.from('household_helpers').select('id', { count: 'exact', head: true }).eq('status', 'approved').eq('is_available', true).is('user_id', null) as never);
  const openUnassigned    = await safeCount(sb.from('household_bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('student_id', null) as never);
  const acceptedUnpaid    = await safeCount(sb.from('household_bookings').select('id', { count: 'exact', head: true }).eq('status', 'accepted').is('paid_at', null) as never);

  // ── Needs-your-attention: the money/stuck states the self-healing sweeps
  //    escalate to a human. Non-zero here means something needs a decision.
  const stuckPaid = await safeCount(sb.from('household_bookings').select('id', { count: 'exact', head: true }).not('stalled_escalated_at', 'is', null).in('status', ['accepted', 'on_way', 'pending']).not('paid_at', 'is', null) as never);
  const failedPayouts = await safeCount(sb.from('household_payouts').select('id', { count: 'exact', head: true }).eq('status', 'failed') as never);
  const openDisputes = await safeCount(sb.from('household_bookings').select('id', { count: 'exact', head: true }).not('disputed_at', 'is', null).is('refunded_at', null).neq('status', 'cancelled') as never);

  // Most recent dispatch fan-out (proxy: latest offer by expires_at).
  let lastDispatch: { ref: string; category: string | null; city: string | null; workers: number } | null = null;
  try {
    const { data: lastOff } = await sb.from('household_job_offers').select('booking_id').order('expires_at', { ascending: false }).limit(1).maybeSingle() as { data: { booking_id: string } | null };
    if (lastOff?.booking_id) {
      const workers = await safeCount(sb.from('household_job_offers').select('id', { count: 'exact', head: true }).eq('booking_id', lastOff.booking_id) as never);
      const { data: bk } = await sb.from('household_bookings').select('category, city').eq('id', lastOff.booking_id).maybeSingle() as { data: { category: string | null; city: string | null } | null };
      lastDispatch = { ref: lastOff.booking_id.slice(-8).toUpperCase(), category: bk?.category ?? null, city: bk?.city ?? null, workers };
    }
  } catch { /* offers table empty or column missing — leave null */ }

  return json({
    ok: true,
    checkedAt: new Date().toISOString(),
    channels: {
      ownerWhatsApp: { configured: whatsappConfigured && has('ADMIN_WA_NUMBER'), live: twilioLive, note: has('ADMIN_WA_NUMBER') ? null : 'ADMIN_WA_NUMBER not set — owner pages fall back to email' },
      workerWhatsApp: { configured: whatsappConfigured, live: twilioLive, note: whatsappConfigured ? null : 'Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM' },
      workerSms: { configured: smsConfigured, live: twilioLive, note: smsConfigured ? null : (smsEnabled ? 'Set TWILIO_SMS_FROM' : 'Off — set VANO_SMS_ENABLED=true to enable SMS fallback') },
      email: { configured: has('RESEND_API_KEY'), live: null, note: has('RESEND_API_KEY') ? null : 'Set RESEND_API_KEY' },
      push: { configured: has('VAPID_PUBLIC_KEY') && has('VAPID_PRIVATE_KEY'), live: null, note: null },
      payments: { configured: !!stripeKey, live: stripeLive, note: stripeKey ? null : 'Set STRIPE_SECRET_KEY' },
      adminEmail: { configured: has('ADMIN_EMAIL'), live: null, note: null },
    },
    supply: {
      approvedAvailable,
      approvedNoPhone,   // can't get WhatsApp/SMS
      approvedNoUserId,  // can't get push until first one-tap
    },
    pipeline: {
      openUnassigned,
      acceptedUnpaid,
      lastDispatch,
    },
    attention: {
      stuckPaid,       // paid jobs the stalled-sweep escalated — hand-assign or refund
      failedPayouts,   // helper transfers that hit the retry cap
      openDisputes,    // money-back reports awaiting a decision
    },
  });
});
