import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Daily sweep for the instant-live helper flow. A helper goes live the moment
// their student email + €2 fee are done; ID verification (Stripe Identity)
// finishes in the background inside a grace window (household_helpers
// .id_grace_until). This pulls anyone whose grace lapsed without a verified ID
// to status 'id_overdue' — off the platform (no job offers, not on the homepage)
// until they finish. Completing the ID check reinstates them
// (stripe-identity-webhook). Idempotent and re-checks every row, so it's safe to
// run repeatedly and harmless to call unauthenticated.

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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const nowIso = new Date().toISOString();

    // Live helpers whose ID grace window lapsed and who still haven't verified.
    // The id_grace_until guard means legacy helpers (null grace) are never touched.
    const { data: overdue, error } = await supabase
      .from('household_helpers')
      .select('id, name, email')
      .eq('status', 'approved')
      .eq('id_verified', false)
      .not('id_grace_until', 'is', null)
      .lt('id_grace_until', nowIso);

    if (error) {
      console.error('[suspend-unverified-helpers] query failed', error);
      return json(500, { error: 'query failed' });
    }

    const rows = (overdue ?? []) as Array<{ id: string; name: string | null; email: string | null }>;
    const resendKey  = Deno.env.get('RESEND_API_KEY')?.trim();
    const resendFrom = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    const siteUrl    = (Deno.env.get('SITE_URL') ?? 'https://vanojobs.com').replace(/\/$/, '');

    let suspended = 0;
    for (const h of rows) {
      // Re-assert status='approved' on the update so an admin action that lands
      // between the read and the write wins the race (we never flip a row an
      // admin just changed).
      const { error: updErr } = await supabase
        .from('household_helpers')
        .update({ status: 'id_overdue' })
        .eq('id', h.id)
        .eq('status', 'approved');
      if (updErr) { console.error('[suspend-unverified-helpers] update failed', h.id, updErr); continue; }
      suspended++;

      // Tell them why they dropped off and how to get back on — fire and forget.
      if (resendKey && h.email) {
        const firstName = (h.name ?? '').split(' ')[0] || 'there';
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: resendFrom,
            to: [h.email],
            subject: 'Finish your ID check to get back on VANO',
            html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">One quick step to get back on</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${firstName},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      We've paused your VANO helper profile because your ID check is still
      outstanding. It's the one thing that lets customers trust a helper in their
      home — so we hold everyone to it. Finish the 2-minute check and you're
      straight back on, picking up jobs.
    </p>
    <a href="${siteUrl}/verify-helper?id=${h.id}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:12px 22px;border-radius:100px;text-decoration:none;">Finish my ID check</a>
    <p style="margin:18px 0 4px;color:#374151;font-size:14px;">Stuck or think this is a mistake?</p>
    <a href="https://wa.me/353899817111" style="display:inline-block;background:#25d366;color:#fff;font-size:14px;font-weight:600;padding:12px 22px;border-radius:100px;text-decoration:none;margin-top:6px;">💬 WhatsApp us</a>
  </div>
</div>
</body></html>`,
            text: `Hi ${firstName}, we've paused your VANO helper profile because your ID check is still outstanding. Finish the 2-minute check at ${siteUrl}/verify-helper?id=${h.id} and you're straight back on. Stuck? WhatsApp +353 89 981 7111`,
          }),
        }).catch(() => {/* non-critical */});
      }
    }

    return json(200, { ok: true, scanned: rows.length, suspended });
  } catch (err) {
    console.error('[suspend-unverified-helpers] unhandled', err);
    return json(500, { error: 'unexpected error' });
  }
});
