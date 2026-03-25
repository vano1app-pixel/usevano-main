/**
 * Maps database/auth errors to user-friendly messages.
 * Prevents leaking schema details, constraint names, or internal info.
 */
export function getUserFriendlyError(error: any): string {
  const code = error?.code;
  const msg = error?.message?.toLowerCase() || '';

  // Postgres error codes
  if (code === '23505') return 'This action has already been completed.';
  if (code === '23503') return 'Invalid reference. Please check your input.';
  if (code === '23502') return 'A required field is missing.';
  if (code === '42501') return 'You do not have permission to perform this action.';
  if (code === '23514') return 'Input does not meet the required constraints.';

  // Auth-specific messages (safe to surface)
  if (msg.includes('invalid login credentials')) return 'Invalid email or password.';
  if (msg.includes('email not confirmed')) return 'Please verify your email first.';
  if (msg.includes('user already registered')) return 'An account with this email already exists.';
  if (msg.includes('invalid otp') || msg.includes('token has expired')) return 'Invalid or expired verification code.';
  if (msg.includes('rate limit') || msg.includes('too many requests')) return 'Too many attempts. Please wait and try again.';
  if (msg.includes('password')) return 'Password does not meet requirements.';

  // Storage errors
  if (msg.includes('payload too large') || msg.includes('file size')) return 'File is too large.';
  if (msg.includes('mime type') || msg.includes('not allowed')) return 'This file type is not supported.';

  // Generic fallback
  return 'Something went wrong. Please try again.';
}
