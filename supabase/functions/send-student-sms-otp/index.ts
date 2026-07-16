import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Texts a 6-digit verification code to a helper's phone (WhatsApp preferred,
// SMS fallback) — the reliable alternative to email, which can land in spam.
// Codes are stored hashed in helper_email_otps (the same table the email flow
// uses), so verify-student-email-otp checks them unchanged and flips
// student_email_verified. The phone is read from the helper's own record —
// never taken from the client — so a code can only ever go to the number on
// the application.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OTP_TTL_MS    = 10 * 60 * 1000; // 10 minutes
const RESEND_GAP_MS = 30 * 1000;      // min seconds between sends per helper

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// E.164, matching the dispatch/notify senders (Irish-friendly).
function normalizeIrishPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-().]/g, '').trim();
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
  if (cleaned.startsWith('00')) { const c = '+' + cleaned.slice(2); return /^\+\d{8,15}$/.test(c) ? c : null; }
  if (/^08[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned.slice(1);
  if (/^8[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned;
  return null;
}

// SMS is tried FIRST here (unlike dispatch, which prefers WhatsApp): an OTP
// goes to a brand-new applicant who hasn't opted into our WhatsApp, and a
// free-form WhatsApp message to a non-opted-in number is accepted by Twilio
// (200/queued) but then silently undelivered — the same dead-end as the spam
// filter. Plain SMS reaches a cold number. WhatsApp is the fallback for when
// only it is configured. Returns the channel that sent, or null.
async function sendText(e164: string, body: string): Promise<'sms' | 'whatsapp' | null> {
  const sid   = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  if (!sid || !token) return null;
  const auth = `Basic ${btoa(`${sid}:${token}`)}`;
  const post = (params: Record<string, string>) =>
    fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });

  // 1) Plain SMS — reliable to a cold number.
  if (Deno.env.get('VANO_SMS_ENABLED')?.trim() === 'true') {
    const from = (Deno.env.get('TWILIO_SMS_FROM') || Deno.env.get('TWILIO_FROM_NUMBER'))?.trim();
    if (from && !from.startsWith('whatsapp:')) {
      try {
        const resp = await post({ To: e164, From: from, Body: body });
        if (resp.ok) return 'sms';
        console.warn('[send-student-sms-otp][sms] twilio error', resp.status, (await resp.text()).slice(0, 200));
      } catch (e) { console.warn('[send-student-sms-otp][sms] exception', e); }
    }
  }

  // 2) WhatsApp fallback (works if the number is opted-in / a template is used).
  const waFrom = Deno.env.get('TWILIO_WHATSAPP_FROM')?.trim();
  if (waFrom) {
    const from = waFrom.startsWith('whatsapp:') ? waFrom : `whatsapp:${waFrom}`;
    try {
      const resp = await post({ To: `whatsapp:${e164}`, From: from, Body: body });
      if (resp.ok) return 'whatsapp';
      console.warn('[send-student-sms-otp][whatsapp] twilio error', resp.status, (await resp.text()).slice(0, 200));
    } catch (e) { console.warn('[send-student-sms-otp][whatsapp] exception', e); }
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { helper_id } = await req.json() as { helper_id?: string };
    if (!helper_id) return json(400, { error: 'Missing application id.' });

    const { data: helper } = await supabase
      .from('household_helpers').select('id, phone').eq('id', helper_id).maybeSingle();
    if (!helper) return json(404, { error: 'Application not found.' });

    const e164 = normalizeIrishPhone((helper as { phone?: string }).phone);
    if (!e164) return json(400, { error: "That phone number doesn't look right — fix it in your profile, or use email." });

    // Rate limit — one code per 30s per helper (shared with the email flow;
    // 'acct:' rows are the separate account-session codes — not counted).
    const { data: recent } = await supabase
      .from('helper_email_otps').select('created_at')
      .eq('helper_id', helper_id).not('email', 'like', 'acct:%')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (recent && Date.now() - new Date(recent.created_at as string).getTime() < RESEND_GAP_MS) {
      return json(429, { error: 'Please wait a moment before requesting another code.' });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await sha256Hex(`${helper_id}:${code}`);

    // One live code per helper — clear old ones first (never the 'acct:'
    // account-session codes, which belong to student-account-otp).
    await supabase.from('helper_email_otps').delete().eq('helper_id', helper_id).not('email', 'like', 'acct:%');
    const { error: insErr } = await supabase.from('helper_email_otps').insert({
      helper_id, email: e164, code_hash, // `email` col is NOT NULL — store the phone the code went to
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    });
    if (insErr) { console.error('[send-student-sms-otp] insert failed', insErr); return json(500, { error: 'Could not send code.' }); }

    const channel = await sendText(e164, `${code} is your VANO verification code. It expires in 10 minutes.`);
    if (!channel) {
      // Never leave an orphan code the helper can't receive.
      await supabase.from('helper_email_otps').delete().eq('helper_id', helper_id);
      return json(502, { error: 'We could not text the code right now. Try email, or WhatsApp us and we will verify you.' });
    }

    return json(200, { success: true, channel });
  } catch (err) {
    console.error('[send-student-sms-otp] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
