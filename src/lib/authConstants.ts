import { getSiteOrigin } from '@/lib/siteUrl';

/**
 * Production site URL for OAuth / password-reset allow list in Supabase.
 * Email OTP sign-up does **not** use `emailRedirectTo` — use `signUp({ options: { emailRedirectTo: undefined } })`.
 */
export const AUTH_EMAIL_REDIRECT = getSiteOrigin();
