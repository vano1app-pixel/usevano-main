import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Admin endpoint to mark a household job complete.
//
// Verifies the caller is an admin, then delegates to capture-household-payment
// via the internal service-role path so the status flip, released payout, 15%
// platform fee, duplicate-payout idempotency and notifications all live in ONE
// place. (Previously this diverged: a 5% fee, no idempotency guard, and a
// redundant Stripe capture — which could create a second payout at the wrong
// amount if the customer also marked the job complete.)

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string): Response =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');
  if (req.method !== 'POST') return bad(405, 'Method not allowed');

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify the JWT and resolve the caller.
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return bad(401, 'Unauthorized');
    const callerId = claimsData.claims.sub as string;

    // Admin role check (service-role client bypasses RLS on user_roles).
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', callerId)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleRow) return bad(403, 'Admin access required');

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id.trim() : null;
    if (!bookingId) return bad(400, 'booking_id required');

    // Single source of truth for completion (status flip + released payout +
    // idempotency + emails). Internal service-role path — no helper JWT needed.
    const resp = await fetch(`${supabaseUrl}/functions/v1/capture-household-payment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'x-internal-complete': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: bookingId }),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[admin-complete] capture failed', resp.status, payload);
      return bad(resp.status === 409 ? 409 : 502, (payload as { error?: string })?.error ?? 'Could not complete the job.');
    }

    // Best-effort audit note attributing the completion to this admin.
    await supabase.from('household_job_updates')
      .insert({ booking_id: bookingId, status: 'completed', note: `Completed by admin (${callerId.slice(0, 8)}).` })
      .then(() => {}, () => {});

    return new Response(
      JSON.stringify({ success: true, ...payload }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[admin-complete] unhandled error', err);
    return bad(500, 'Unexpected error');
  }
});
