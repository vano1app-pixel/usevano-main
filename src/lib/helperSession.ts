import { supabase } from '@/integrations/supabase/client';

// The helper's Supabase session, minted by the phone gate (2026-09-06).
//
// student-account-otp's verify answer now carries `session: { token_hash,
// type: 'magiclink' }` beside the HMAC account_token. Turning it into a real
// session here is what lets a phone-verified helper open Find, claim and work
// a job inside the app with no second login. FAIL-SOFT: a missing or bad
// token just means the account page behaves as it always did.

export interface MintedSession { token_hash: string; type: 'magiclink' }

export async function adoptHelperSession(session: MintedSession | null | undefined): Promise<boolean> {
  if (!session?.token_hash) return false;
  try {
    const { error } = await supabase.auth.verifyOtp({ token_hash: session.token_hash, type: 'magiclink' });
    if (error) { console.warn('[helperSession] verifyOtp failed', error.message); return false; }
    return true;
  } catch (e) {
    console.warn('[helperSession] adopt failed', e);
    return false;
  }
}

export async function hasSupabaseSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}
