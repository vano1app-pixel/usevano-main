import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { assertSupabaseEnvForBuild, getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabaseEnv';

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

assertSupabaseEnvForBuild();

const url = getSupabaseUrl();
const key = getSupabaseAnonKey();

/**
 * Auth email templates: enable “Send Email” hook in Supabase Dashboard → Authentication → Hooks
 * and point it to your deployed `auth-email-hook` Edge Function URL for branded (VANO) mail.
 */
export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});