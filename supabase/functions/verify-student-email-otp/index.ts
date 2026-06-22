import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { helper_id, code } = await req.json() as { helper_id?: string; code?: string };
    const cleanCode = code?.trim();
    if (!helper_id || !cleanCode || !/^\d{6}$/.test(cleanCode)) {
      return json(400, { error: 'Enter the 6-digit code from your email.' });
    }

    const { data: otp } = await supabase
      .from('helper_email_otps')
      .select('id, code_hash, expires_at, attempts')
      .eq('helper_id', helper_id)
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

    // Success — mark verified and clear codes
    const { error: updErr } = await supabase
      .from('household_helpers').update({ student_email_verified: true }).eq('id', helper_id);
    if (updErr) { console.error('[verify-student-email-otp] update failed', updErr); return json(500, { error: 'Could not save verification.' }); }
    await supabase.from('helper_email_otps').delete().eq('helper_id', helper_id);

    return json(200, { success: true, verified: true });
  } catch (err) {
    console.error('[verify-student-email-otp] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
