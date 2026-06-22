import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Links a helper application row to the signed-in user's account by matching
// their verified email. Called by the dashboard the first time an approved
// helper logs in, so there's no manual linking.
//
// Safety: a user can only claim an UNLINKED helper row whose email matches
// their OWN authenticated email (verified by Supabase auth on login). It never
// reassigns a row that's already linked to someone.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Identify the caller from their JWT.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.id || !user.email) return json(401, { error: 'Not signed in' });

    const email = user.email.toLowerCase();
    const supabase = createClient(url, serviceKey);

    // Already linked? Nothing to do.
    const { data: mine } = await supabase
      .from('household_helpers').select('id').eq('user_id', user.id).maybeSingle();
    if (mine?.id) return json(200, { linked: true, helper_id: mine.id });

    // Find an unlinked helper application with this exact email (latest one).
    const { data: match } = await supabase
      .from('household_helpers')
      .select('id')
      .eq('email', email)
      .is('user_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!match?.id) return json(200, { linked: false });

    // Claim it — the `is('user_id', null)` guard makes this race-safe.
    const { data: linked } = await supabase
      .from('household_helpers')
      .update({ user_id: user.id })
      .eq('id', match.id)
      .is('user_id', null)
      .select('id')
      .maybeSingle();

    return json(200, { linked: !!(linked as { id?: string } | null)?.id, helper_id: (linked as { id?: string } | null)?.id ?? null });
  } catch (err) {
    console.error('[link-helper-account] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
