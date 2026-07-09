import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Emails a 6-digit code to a helper's college address to verify they're a
// student. Paired with verify-student-email-otp. Codes are stored hashed in
// helper_email_otps (service-role only) and expire after 10 minutes.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OTP_TTL_MS   = 10 * 60 * 1000; // 10 minutes
const RESEND_GAP_MS = 30 * 1000;     // min seconds between sends per helper

// Personal-provider domains that can never be a college address. The join
// form only soft-warns on these ("the email OTP is the real enforcement") —
// so this sender is where the enforcement actually lives. Hard-blocking
// every non-college domain would need a college-domain database we'd get
// wrong; blocking known personal providers is safe.
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.ie', 'yahoo.co.uk',
  'hotmail.com', 'hotmail.ie', 'hotmail.co.uk', 'outlook.com', 'outlook.ie',
  'live.com', 'live.ie', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com',
  'aol.com', 'msn.com',
]);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { helper_id, email } = await req.json() as { helper_id?: string; email?: string };

    const cleanEmail = email?.trim().toLowerCase();
    if (!helper_id || !cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return json(400, { error: 'A valid college email is required.' });
    }
    if (PERSONAL_EMAIL_DOMAINS.has(cleanEmail.split('@')[1] ?? '')) {
      return json(400, { error: "That's a personal address — the student check needs your official college email (it usually ends in .ie or .edu)." });
    }

    // Helper must exist (don't leak which ids are valid beyond a generic 404)
    const { data: helper } = await supabase
      .from('household_helpers').select('id, name').eq('id', helper_id).maybeSingle();
    if (!helper) return json(404, { error: 'Application not found.' });

    // Rate limit — one code per 30s per helper
    const { data: recent } = await supabase
      .from('helper_email_otps').select('created_at')
      .eq('helper_id', helper_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (recent && Date.now() - new Date(recent.created_at as string).getTime() < RESEND_GAP_MS) {
      return json(429, { error: 'Please wait a moment before requesting another code.' });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await sha256Hex(`${helper_id}:${code}`);

    // One live code per helper — clear old ones first
    await supabase.from('helper_email_otps').delete().eq('helper_id', helper_id);
    const { error: insErr } = await supabase.from('helper_email_otps').insert({
      helper_id, email: cleanEmail, code_hash,
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    });
    if (insErr) { console.error('[send-student-email-otp] insert failed', insErr); return json(500, { error: 'Could not send code.' }); }

    // The email IS this flow — a code that never arrives is a hard-stuck
    // helper. So unlike the courtesy emails elsewhere, a failed send here is
    // surfaced as an error (and the orphan code cleared so Resend can retry
    // cleanly), never silently reported as success.
    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
    const from = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    if (!resendKey) {
      console.error('[send-student-email-otp] RESEND_API_KEY not set — cannot email codes');
      await supabase.from('helper_email_otps').delete().eq('helper_id', helper_id);
      return json(503, { error: 'Email sending is not set up right now — text us on WhatsApp and we will verify you manually.' });
    }
    try {
      const resendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: [cleanEmail],
          subject: `${code} is your VANO verification code`,
          html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:440px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:28px 32px;"><p style="margin:0;color:#fff;font-size:20px;font-weight:700;">Verify your student email</p></div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Enter this code in VANO to confirm you're a student:</p>
    <p style="margin:0 0 16px;font-size:34px;font-weight:800;letter-spacing:8px;color:#111827;">${code}</p>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
  </div>
</div></body></html>`,
          text: `Your VANO verification code is ${code}. It expires in 10 minutes.`,
        }),
      });
      if (!resendResp.ok) {
        const detail = await resendResp.text().catch(() => '');
        console.error('[send-student-email-otp] resend rejected send', resendResp.status, detail.slice(0, 300));
        await supabase.from('helper_email_otps').delete().eq('helper_id', helper_id);
        return json(502, { error: 'We could not send the email. Check the address is right, or text us on WhatsApp.' });
      }
    } catch (sendErr) {
      console.error('[send-student-email-otp] resend failed', sendErr);
      await supabase.from('helper_email_otps').delete().eq('helper_id', helper_id);
      return json(502, { error: 'We could not send the email. Try again in a moment, or text us on WhatsApp.' });
    }

    return json(200, { success: true });
  } catch (err) {
    console.error('[send-student-email-otp] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
