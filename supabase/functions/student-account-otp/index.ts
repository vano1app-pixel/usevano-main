import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowRequest, clientIp } from "../_shared/rateLimit.ts";
import { signAccountToken, ACCOUNT_TOKEN_TTL_SECONDS } from "../_shared/accountToken.ts";

// The SMS gate on /student-account (phone-gate hardening, July 2026).
//
// Knowing a helper's phone number used to be enough to load and edit their
// whole profile. Now the page proves possession of the phone first:
//   { action:'send',   phone }        → 6-digit code texted to the number ON
//                                        the helper's own row (SMS first,
//                                        WhatsApp fallback — same rationale as
//                                        send-student-sms-otp: OTPs must reach
//                                        cold numbers)
//   { action:'verify', phone, code }  → checks the code, mints a 30-minute
//                                        HMAC-signed account_token that every
//                                        phone-authed helper function requires
//
// Codes live in helper_email_otps with an 'acct:' prefix in the (NOT NULL)
// email column and an 'acct:'-salted hash, so they can never be confused with
// (or validated by) the student-email verification flow sharing the table.

const OTP_TTL_MS    = 10 * 60 * 1000; // codes last 10 minutes
const RESEND_GAP_MS = 30 * 1000;      // min gap between sends per helper
const MAX_ATTEMPTS  = 5;

// ── Inlined CORS (origin-gated — this endpoint spends SMS money) ─────────────
const FALLBACK_ORIGINS = [
  'https://vanojobs.com', 'https://www.vanojobs.com',
  'http://localhost:5173', 'http://localhost:4173',
];
const ALLOWED_HEADERS = [
  'authorization','x-client-info','apikey','content-type',
  'x-supabase-client-platform','x-supabase-client-platform-version',
  'x-supabase-client-runtime','x-supabase-client-runtime-version',
].join(', ');
const NATIVE_APP_ORIGINS = ['capacitor://localhost', 'https://localhost', 'ionic://localhost'];
function getAllowlist(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  const base = !raw
    ? FALLBACK_ORIGINS
    : raw.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  return [...base, ...NATIVE_APP_ORIGINS];
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}
function isOriginAllowed(req: Request): boolean {
  if (!req.headers.get('Origin')) return true;
  return matchOrigin(req) !== null;
}
// ─────────────────────────────────────────────────────────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// E.164, matching send-student-sms-otp (Irish-friendly).
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

// One Twilio send + a short delivery probe. Twilio ACCEPTS a message (201,
// status "queued") before it knows whether it can be delivered — WhatsApp in
// particular dies invisibly AFTER queuing (63016: freeform message outside the
// 24h session window, 63031: sender messaging its own number), which made this
// function report "sent" while nothing ever arrived (July 2026: the owner's
// account-gate codes silently vanished exactly this way). So after a queued
// send, poll the message status briefly: failed/undelivered = a miss, letting
// the caller fall to the next channel or answer honestly, and the warn line
// puts the REAL Twilio error_code in the function logs.
async function sendViaTwilio(
  sid: string,
  auth: string,
  label: string,
  params: Record<string, string>,
): Promise<boolean> {
  const base = `https://api.twilio.com/2010-04-01/Accounts/${sid}`;
  try {
    const resp = await fetch(`${base}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    if (!resp.ok) {
      console.warn(`[student-account-otp][${label}] twilio error`, resp.status, (await resp.text()).slice(0, 200));
      return false;
    }
    const created = await resp.json().catch(() => null) as { sid?: string } | null;
    if (!created?.sid) return true; // accepted but unreadable — assume in flight
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 700));
      try {
        const check = await fetch(`${base}/Messages/${created.sid}.json`, { headers: { Authorization: auth } });
        if (!check.ok) return true; // probe unavailable — don't punish the send
        const msg = await check.json().catch(() => null) as { status?: string; error_code?: number | null } | null;
        const status = msg?.status ?? '';
        if (status === 'failed' || status === 'undelivered' || status === 'canceled') {
          console.warn(`[student-account-otp][${label}] delivery failed`, status, 'error_code:', msg?.error_code);
          return false;
        }
        if (status === 'sent' || status === 'delivered' || status === 'read') return true;
      } catch { return true; }
    }
    return true; // still queued after ~3s — assume in flight
  } catch (e) {
    console.warn(`[student-account-otp][${label}] exception`, e);
    return false;
  }
}

// SMS first, WhatsApp fallback — identical rationale + shape to
// send-student-sms-otp (an OTP must reach a cold, non-opted-in number).
async function sendText(e164: string, body: string): Promise<'sms' | 'whatsapp' | null> {
  const sid   = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  if (!sid || !token) return null;
  const auth = `Basic ${btoa(`${sid}:${token}`)}`;

  if (Deno.env.get('VANO_SMS_ENABLED')?.trim() === 'true') {
    const from = (Deno.env.get('TWILIO_SMS_FROM') || Deno.env.get('TWILIO_FROM_NUMBER'))?.trim();
    if (from && !from.startsWith('whatsapp:')) {
      if (await sendViaTwilio(sid, auth, 'sms', { To: e164, From: from, Body: body })) return 'sms';
    }
  }

  const waFrom = Deno.env.get('TWILIO_WHATSAPP_FROM')?.trim();
  if (waFrom) {
    // A WhatsApp sender can never message its own number (Twilio 63031) — and
    // the owner's helper row carries the business number, so without this
    // guard their own account gate burns the send on a doomed channel.
    if (waFrom.replace(/\D/g, '') === e164.replace(/\D/g, '')) {
      console.warn('[student-account-otp][whatsapp] skipped: destination is the WhatsApp sender itself');
    } else {
      const from = waFrom.startsWith('whatsapp:') ? waFrom : `whatsapp:${waFrom}`;
      if (await sendViaTwilio(sid, auth, 'whatsapp', { To: `whatsapp:${e164}`, From: from, Body: body })) return 'whatsapp';
    }
  }
  return null;
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (!isOriginAllowed(req)) return json(403, { error: 'Forbidden origin' });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({})) as { action?: string; phone?: string; code?: string };
    const action = body.action === 'verify' ? 'verify' : body.action === 'send' ? 'send' : null;
    const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!action || !rawPhone) return json(400, { error: 'action and phone are required' });

    // Shared IP throttle across both actions — this is an unauthenticated
    // endpoint keyed by phone, so enumeration + SMS-pumping both need a lid.
    if (!await allowRequest(supabase, 'student-account-otp', clientIp(req), 20, 600)) {
      return json(429, { error: 'Too many attempts — please wait a minute and try again.' });
    }

    // Resolve the helper by phone — exact variants first, digits fallback —
    // the same matching find-helper-by-phone uses, so the two never disagree
    // about which account a number belongs to.
    const phone = rawPhone.replace(/[\s\-().]/g, '');
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) return json(400, { error: 'Invalid phone number' });
    const variants = new Set<string>([phone]);
    if (phone.startsWith('+353')) {
      variants.add('0' + phone.slice(4));
      variants.add(phone.slice(1));
    } else if (phone.startsWith('353')) {
      variants.add('+' + phone);
      variants.add('0' + phone.slice(3));
    } else if (phone.startsWith('0')) {
      variants.add('+353' + phone.slice(1));
      variants.add('353' + phone.slice(1));
    }

    let { data: helper } = await supabase
      .from('household_helpers')
      .select('id, phone')
      .in('phone', [...variants])
      .neq('status', 'suspended')
      .limit(1)
      .maybeSingle() as { data: { id: string; phone: string | null } | null };
    if (!helper) {
      const last9 = digits.slice(-9);
      const { data: rows } = await supabase
        .from('household_helpers')
        .select('id, phone')
        .neq('status', 'suspended');
      helper = (rows ?? []).find((r: { id: string; phone: string | null }) =>
        (r.phone ?? '').replace(/\D/g, '').endsWith(last9)) ?? null;
    }
    if (!helper) return json(404, { error: "That number doesn't match any helper account." });

    const acctRows = () =>
      supabase.from('helper_email_otps').select('id, code_hash, expires_at, attempts, created_at')
        .eq('helper_id', helper!.id).like('email', 'acct:%');

    if (action === 'send') {
      const e164 = normalizeIrishPhone(helper.phone);
      if (!e164) return json(400, { error: "The number on your account can't receive texts — WhatsApp us on +353 89 981 7111 and we'll fix it." });

      // Per-helper cap (SMS costs money; also bounds harassment of one number).
      if (!await allowRequest(supabase, 'student-account-otp-helper', helper.id, 5, 3600)) {
        return json(429, { error: 'Too many codes requested — try again in an hour, or WhatsApp us.' });
      }
      const { data: recent } = await acctRows().order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (recent && Date.now() - new Date(recent.created_at as string).getTime() < RESEND_GAP_MS) {
        return json(429, { error: 'Please wait a moment before requesting another code.' });
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const code_hash = await sha256Hex(`acct:${helper.id}:${code}`);

      // One live account code per helper — scoped so we never stomp a live
      // student-email verification code sharing the table.
      await supabase.from('helper_email_otps').delete().eq('helper_id', helper.id).like('email', 'acct:%');
      const { error: insErr } = await supabase.from('helper_email_otps').insert({
        helper_id: helper.id,
        email: `acct:${e164}`, // NOT NULL column — records where the code went
        code_hash,
        expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      });
      if (insErr) { console.error('[student-account-otp] insert failed', insErr); return json(500, { error: 'Could not send code.' }); }

      const channel = await sendText(e164, `${code} is your VANO account code. It expires in 10 minutes. Never share it.`);
      if (!channel) {
        await supabase.from('helper_email_otps').delete().eq('helper_id', helper.id).like('email', 'acct:%');
        return json(502, { error: "We couldn't text you right now. Try again shortly, or WhatsApp +353 89 981 7111." });
      }
      return json(200, { success: true, channel });
    }

    // action === 'verify'
    const cleanCode = body.code?.trim();
    if (!cleanCode || !/^\d{6}$/.test(cleanCode)) return json(400, { error: 'Enter the 6-digit code from your text.' });

    const { data: otp } = await acctRows().order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!otp) return json(400, { error: 'No code found — request a new one.' });
    if (new Date(otp.expires_at as string).getTime() < Date.now()) {
      return json(400, { error: 'That code expired — request a new one.' });
    }
    if ((otp.attempts as number) >= MAX_ATTEMPTS) {
      return json(429, { error: 'Too many attempts — request a new code.' });
    }
    const expected = await sha256Hex(`acct:${helper.id}:${cleanCode}`);
    if (expected !== (otp.code_hash as string)) {
      await supabase.from('helper_email_otps').update({ attempts: (otp.attempts as number) + 1 }).eq('id', otp.id as string);
      return json(400, { error: 'That code is incorrect. Try again.' });
    }

    await supabase.from('helper_email_otps').delete().eq('helper_id', helper.id).like('email', 'acct:%');
    const account_token = await signAccountToken(helper.id);
    return json(200, {
      success: true,
      account_token,
      helper_id: helper.id,
      expires_at_ms: Date.now() + ACCOUNT_TOKEN_TTL_SECONDS * 1000,
    });
  } catch (err) {
    console.error('[student-account-otp] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
