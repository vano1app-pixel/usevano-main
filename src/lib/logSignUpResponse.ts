import type { AuthResponse } from '@supabase/supabase-js';

/**
 * Logs the full signUp result for debugging (OTP vs magic link, rate limits, hooks).
 * Session tokens are redacted if a session is returned.
 */
export function logSignUpResponse(result: AuthResponse): void {
  const { data, error } = result;
  const session = data?.session
    ? {
        ...data.session,
        access_token: data.session.access_token ? '[redacted]' : undefined,
        refresh_token: data.session.refresh_token ? '[redacted]' : undefined,
      }
    : null;

  console.log('[auth] signUp response', {
    data: data ? { user: data.user, session } : null,
    error,
  });
}
