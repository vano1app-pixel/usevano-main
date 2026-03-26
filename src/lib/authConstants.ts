/**
 * Must match Supabase → Authentication → URL configuration (redirect allow list).
 * Sign-up uses this as `emailRedirectTo` for any email action that still references a URL.
 */
export const AUTH_EMAIL_REDIRECT =
  (import.meta.env.VITE_AUTH_EMAIL_REDIRECT_URL as string | undefined)?.trim() || 'https://vanojobs.com';
