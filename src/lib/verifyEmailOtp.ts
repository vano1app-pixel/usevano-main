import type { AuthError, SupabaseClient } from '@supabase/supabase-js';

/**
 * Confirms email with the 6-digit code. Tries `signup` first, then `email`,
 * because Supabase may issue confirmation OTPs under either type depending on project settings.
 */
export async function verifySignupOrEmailOtp(
  supabase: SupabaseClient,
  params: { email: string; token: string },
): Promise<{ error: AuthError | null }> {
  const { email, token } = params;
  const clean = token.replace(/\s/g, '');

  const { error: err1 } = await supabase.auth.verifyOtp({
    email,
    token: clean,
    type: 'signup',
  });
  if (!err1) return { error: null };

  const { error: err2 } = await supabase.auth.verifyOtp({
    email,
    token: clean,
    type: 'email',
  });
  if (!err2) return { error: null };

  return { error: err1 };
}
