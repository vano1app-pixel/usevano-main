import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { assertSupabaseEnvForBuild, getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabaseEnv';

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

assertSupabaseEnvForBuild();

const url = getSupabaseUrl();
const key = getSupabaseAnonKey();

export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});