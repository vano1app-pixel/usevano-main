import { getSupabaseProjectRef } from '@/lib/supabaseEnv';
import { supabase } from '@/integrations/supabase/client';

// When a Supabase edge-function call gets a 401/403 from the gateway,
// the most common root cause in production is an env mismatch — the
// Vercel build has VITE_SUPABASE_URL pointing at project A but
// VITE_SUPABASE_PUBLISHABLE_KEY / the minted JWT tied to project B.
// A fresh sign-in doesn't recover this because Auth itself might be
// working fine against project B while every function call lands on
// project A's gateway (or vice versa).
//
// This helper decodes the current session's access_token (base64, no
// signature check needed — we're reading claims client-side for a
// diagnostic, not trusting them) and compares its `iss` claim against
// the project the app is configured for. A mismatch is logged to the
// console AND returned as a short string that callers can append to
// a user-facing toast, since mobile Safari users can't easily open
// dev tools.

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // atob doesn't handle URL-safe base64 (-, _) or missing padding.
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    return JSON.parse(atob(b64 + pad)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function projectRefFromIss(iss: string | undefined): string | null {
  if (!iss) return null;
  const m = iss.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m?.[1]?.toLowerCase() ?? null;
}

export async function diagnoseAuthFailure(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const configuredRef = getSupabaseProjectRef();

  if (!token) {
    // No token at all — this is the "really signed out" case, not an
    // env mismatch. Pre-checks in each handler handle this path, but
    // keep the message for completeness.
    console.warn('[authDiagnose] no access_token; user signed out');
    return 'No active session — please sign in.';
  }

  const payload = decodeJwtPayload(token);
  const iss = payload?.iss as string | undefined;
  const jwtRef = projectRefFromIss(iss);

  if (jwtRef && configuredRef && jwtRef !== configuredRef) {
    const msg = `Env mismatch: token from "${jwtRef}" but app points at "${configuredRef}". Fix VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY on Vercel to the same project, then redeploy.`;
    console.error('[authDiagnose]', msg, { iss, configuredRef });
    return `Config issue: your Vercel env points at project "${configuredRef}" but your session is from "${jwtRef}". Ask the admin to fix Supabase env vars.`;
  }

  // JWT iss matches config (or we couldn't parse it). Gateway still
  // 401'd — likeliest cause is a JWT_SECRET rotation that a fresh
  // sign-in would fix, OR an invalid publishable key being sent as
  // the `apikey` header.
  console.warn(
    '[authDiagnose] token iss matches configured project; gateway still rejected — probably rotated JWT_SECRET or invalid publishable key',
    { jwtRef, configuredRef },
  );
  return null;
}
