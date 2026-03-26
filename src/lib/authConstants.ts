/**
 * Production site URL for OAuth / password-reset redirects (allow list in Supabase).
 * Email OTP sign-up does **not** use `emailRedirectTo` — use `signUp({ options: { emailRedirectTo: undefined } })`.
 */
export const AUTH_EMAIL_REDIRECT =
  (import.meta.env.VITE_AUTH_EMAIL_REDIRECT_URL as string | undefined)?.trim() || 'https://vanojobs.com';
