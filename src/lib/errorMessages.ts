/**
 * Maps database/auth errors to user-friendly messages.
 * Prevents leaking schema details, constraint names, or internal info.
 */
export function getUserFriendlyError(error: unknown): string {
  const err = error as { code?: string; message?: string };
  const code = err?.code;
  const msg = err?.message?.toLowerCase() || '';

  // Postgres error codes
  if (code === '23505') return 'This action has already been completed.';
  if (code === '23503') return 'Invalid reference. Please check your input.';
  if (code === '23502') return 'A required field is missing.';
  if (code === '42501') return 'You do not have permission to perform this action.';
  if (code === '23514') return 'Input does not meet the required constraints.';

  // Auth-specific messages (safe to surface)
  if (msg.includes('invalid login credentials')) return 'Invalid email or password.';
  if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
    return 'Please verify your email. Enter the code we sent you, or request a new one from the sign-in screen.';
  }
  if (msg.includes('user already registered')) return 'An account with this email already exists. Try signing in instead.';
  if (msg.includes('invalid otp') || msg.includes('token has expired') || msg.includes('otp expired')) {
    return 'Invalid or expired verification code. Request a new code and try again.';
  }
  if (
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('over_email_send_rate_limit') ||
    msg.includes('email rate limit')
  ) {
    return 'Too many emails or attempts. Wait a few minutes and try again (free-tier projects have hourly limits).';
  }
  if (msg.includes('network') || msg.includes('fetch')) return 'Connection problem. Check your internet and try again.';
  if (msg.includes('jwt') || msg.includes('session')) return 'Your session expired. Please sign in again.';
  if (msg.includes('password') && msg.includes('length')) return 'Password must be at least 6 characters.';
  if (msg.includes('password')) return 'Password does not meet requirements.';

  // Storage errors
  if (msg.includes('payload too large') || msg.includes('file size')) return 'File is too large.';
  if (msg.includes('mime type') || msg.includes('not allowed')) return 'This file type is not supported.';

  // Generic fallback
  return 'Something went wrong. Please try again.';
}
