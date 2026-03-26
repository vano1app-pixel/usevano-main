import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { assertSupabaseEnvForBuild, getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabaseEnv';

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

assertSupabaseEnvForBuild();

const url = getSupabaseUrl();
const key = getSupabaseAnonKey();

/**
 * Auth email:
 * - Supabase Dashboard → Authentication → Providers → Email: enable **Email OTP** (6-digit code) for sign-in/sign-up.
 *   Prefer OTP-only confirmation so users verify in-app instead of magic links.
 * - URL configuration: set **Site URL** to `https://vanojobs.com` and add the same under **Redirect URLs**
 *   (plus `http://localhost:8080/**` for local dev). `signUp` uses `emailRedirectTo` from `VITE_AUTH_EMAIL_REDIRECT_URL`
 *   (defaults to production) for any fallback email actions.
 * - Optional: “Send Email” hook → `auth-email-hook` Edge Function for branded mail.
 */
export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Recovery links still use hash on /reset-password; OTP signup does not rely on redirects.
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});