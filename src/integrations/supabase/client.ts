import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { assertSupabaseEnvForBuild, getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabaseEnv';

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

assertSupabaseEnvForBuild();

const url = getSupabaseUrl();
const key = getSupabaseAnonKey();

/**
 * Auth email (OTP sign-up):
 * - Providers → Email: **Enable email confirmations**, set **Email OTP** / expiry as needed.
 * - Email Templates → **Confirm signup**: body must include `{{ .Token }}` (OTP), not only `{{ .ConfirmationURL }}`,
 *   or confirmation emails will not show a code.
 * - URL configuration: **Site URL** `https://vanojobs.com` + **Redirect URLs** for `/reset-password` and OAuth.
 * - `signUp` passes `emailRedirectTo: undefined` so Supabase does not treat confirmation as magic-link-only.
 * - Free tier: ~3 auth emails/hour — rate limits look like silent failures; check Auth logs.
 * - If a custom **Send Email** hook is enabled, it must succeed or disable it to use Supabase’s mailer.
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