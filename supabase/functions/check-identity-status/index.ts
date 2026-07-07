import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Webhook-independent backstop for the ID check. The verify page calls this
// when a helper returns from Stripe Identity (and while it shows "we're
// confirming"): we fetch the verification session straight from Stripe's API
// and record the outcome — the same close-the-loop trick confirm-signup-payment
// uses for the €2. So even if the identity webhook is missing/misconfigured in
// the Stripe dashboard, a completed ID check still lands.
//
// Reads only the helper's OWN stored identity_session_id (never a client-
// supplied session), so it can't be pointed at someone else's session.

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
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { helper_id } = await req.json() as { helper_id?: string };
    if (!helper_id) return json(400, { error: 'Missing application id.' });

    const { data: helper } = await supabase
      .from('household_helpers')
      .select('id, id_verified, identity_session_id, application_data')
      .eq('id', helper_id)
      .maybeSingle();
    if (!helper) return json(404, { error: 'Application not found.' });
    if ((helper as { id_verified?: boolean }).id_verified) return json(200, { verified: true, status: 'verified' });

    const sessionId = (helper as { identity_session_id?: string | null }).identity_session_id;
    if (!sessionId) return json(200, { verified: false, status: 'none' });

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json(503, { error: 'Verification not configured.' });

    const r = await fetch(
      `https://api.stripe.com/v1/identity/verification_sessions/${encodeURIComponent(sessionId)}?expand[]=verified_outputs`,
      { headers: { Authorization: `Bearer ${stripeKey}` } },
    );
    if (!r.ok) {
      console.error('[check-identity-status] stripe retrieve failed', r.status);
      return json(502, { error: 'Could not check with Stripe right now.' });
    }
    const vs = await r.json() as {
      status?: string;
      verified_outputs?: {
        name?: { first_name?: string; last_name?: string };
        dob?: { day?: number; month?: number; year?: number };
      };
    };

    const stripeStatus = vs.status ?? 'processing';
    if (stripeStatus !== 'verified') {
      // Keep our status column honest so the webhook + this backstop agree.
      const mapped = ['requires_input', 'processing', 'canceled'].includes(stripeStatus) ? stripeStatus : 'processing';
      await supabase.from('household_helpers').update({ identity_status: mapped }).eq('id', helper_id);
      return json(200, { verified: false, status: mapped });
    }

    // Verified — mirror the webhook: badge on, lock name (+DOB) to the ID.
    const update: Record<string, unknown> = { id_verified: true, identity_status: 'verified' };
    const vo = vs.verified_outputs;
    const fullName = [vo?.name?.first_name, vo?.name?.last_name]
      .map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
    if (fullName) update.name = fullName;
    const d = vo?.dob;
    if (d?.year && d?.month && d?.day) {
      const dob = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
      const appData = ((helper as { application_data?: Record<string, unknown> }).application_data) ?? {};
      update.application_data = { ...appData, id_dob: dob };
    }
    const { error: updErr } = await supabase.from('household_helpers').update(update).eq('id', helper_id);
    if (updErr) { console.error('[check-identity-status] update failed', updErr); return json(500, { error: 'Could not save verification.' }); }

    return json(200, { verified: true, status: 'verified' });
  } catch (err) {
    console.error('[check-identity-status] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
