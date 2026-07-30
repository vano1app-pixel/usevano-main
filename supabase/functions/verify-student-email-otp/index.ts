import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signBoostToken } from "../_shared/accountToken.ts";

// Checks a 6-digit code against helper_email_otps and, on success, flips
// household_helpers.student_email_verified. Pairs with send-student-email-otp.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_ATTEMPTS = 5;

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const { helper_id, code } = await req.json() as { helper_id?: string; code?: string };
    const cleanCode = code?.trim();
    if (!helper_id || !cleanCode || !/^\d{6}$/.test(cleanCode)) {
      return json(400, { error: 'Enter the 6-digit code from your email.' });
    }

    // 'acct:'-prefixed rows are student-account-otp's account-session codes
    // sharing this table — never ours to check (their hash is salted
    // differently anyway, so a cross-read could only burn attempts).
    const { data: otp } = await supabase
      .from('helper_email_otps')
      .select('id, email, code_hash, expires_at, attempts')
      .eq('helper_id', helper_id)
      .not('email', 'like', 'acct:%')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otp) return json(400, { error: 'No code found — request a new one.' });
    if (new Date(otp.expires_at as string).getTime() < Date.now()) {
      return json(400, { error: 'That code expired — request a new one.' });
    }
    if ((otp.attempts as number) >= MAX_ATTEMPTS) {
      return json(429, { error: 'Too many attempts — request a new code.' });
    }

    const expected = await sha256Hex(`${helper_id}:${cleanCode}`);
    if (expected !== (otp.code_hash as string)) {
      await supabase.from('helper_email_otps').update({ attempts: (otp.attempts as number) + 1 }).eq('id', otp.id as string);
      return json(400, { error: 'That code is incorrect. Try again.' });
    }

    // Success — mark verified and clear codes. The verified ADDRESS is written
    // to the row too: the flag means "the email on this row was verified"
    // (update-helper-profile un-verifies on email change for the same reason),
    // so verifying a different address than the stored one must not leave the
    // flag pointing at an unverified email. The '@' guard matters: SMS-sent
    // codes store the PHONE in the otp `email` column (it's NOT NULL), and
    // writing that back would overwrite the helper's real email address.
    const updates: Record<string, unknown> = { student_email_verified: true };
    if (typeof otp.email === 'string' && otp.email.includes('@')) updates.email = otp.email.trim().toLowerCase();

    // Signup spam gate: fresh applications are born approved but UNAVAILABLE
    // with application_data.pending_email_verify set — this first verified
    // code is what flips them live and earns the welcome message. Helpers
    // without the flag (everyone pre-gate, or re-verifying a changed email)
    // keep their availability exactly as it is.
    const { data: helper } = await supabase
      .from('household_helpers')
      .select('id, status, application_data')
      .eq('id', helper_id)
      .maybeSingle();
    const appData = (helper?.application_data ?? {}) as Record<string, unknown>;
    const goingLive = appData.pending_email_verify === true;
    if (goingLive) {
      const { pending_email_verify: _cleared, ...restAppData } = appData;
      updates.is_available = true;
      updates.application_data = restAppData;
    }

    const { error: updErr } = await supabase
      .from('household_helpers').update(updates).eq('id', helper_id);
    if (updErr) { console.error('[verify-student-email-otp] update failed', updErr); return json(500, { error: 'Could not save verification.' }); }
    await supabase.from('helper_email_otps').delete().eq('helper_id', helper_id).not('email', 'like', 'acct:%');

    // The "you're in" welcome moved here from create-helper-application: it
    // only ever goes to a signup that proved its contact details (rate-limited
    // + status-gated inside notify-helper-approved itself). Fire and forget.
    if (goingLive && helper?.status === 'approved') {
      fetch(`${supabaseUrl}/functions/v1/notify-helper-approved`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ helper_id }),
      }).catch(() => {/* non-critical */});
    }

    // Boost session (2026-07-30): the inbox is proven, so mint the NARROW
    // boost token that lets the "get more jobs" screen save availability +
    // kit/languages extras via update-helper-profile — and nothing more
    // (it is refused for phone/email/photo/payout edits). Fail-soft: a
    // signing hiccup must never fail the verification itself.
    let boostToken: string | null = null;
    try { boostToken = await signBoostToken(helper_id); } catch { /* non-critical */ }

    return json(200, {
      success: true, verified: true,
      ...(goingLive ? { went_live: true } : {}),
      ...(boostToken ? { boost_token: boostToken } : {}),
    });
  } catch (err) {
    console.error('[verify-student-email-otp] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
