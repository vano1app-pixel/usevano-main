import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Auto-match a House Autopilot subscription to opted-in helpers.
//
// Fired fire-and-forget by stripe-webhook the moment a new plan subscription
// lands (and callable again by admin to re-offer). INTERNAL ONLY — the caller
// must present the service-role key.
//
// Finds approved + available helpers in the plan's city who opted in to
// Autopilot work, records an offer for each, and pings them (WhatsApp + email)
// with a signed one-tap claim link. First to claim becomes the regular (see
// accept-autopilot-plan). City-level match: the subscription doesn't store
// structured services, so the helper sees the plan's config and self-selects.

const MAX_OFFERS = Number(Deno.env.get('AUTOPILOT_MAX_OFFERS')) || 25;
const OFFER_TTL_HOURS = 48; // a regular-client offer isn't same-day urgent

// ── Signed claim token (same HMAC scheme as accept-job's _shared/acceptToken) ──
function secretKey(): string {
  return (Deno.env.get('ACCEPT_LINK_SECRET')?.trim()) || (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
}
function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hmac(part: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secretKey()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(part)));
}
async function signPlanToken(payload: { p: string; h: string; e: number }): Promise<string> {
  const part = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  return `${part}.${b64urlEncode(await hmac(part))}`;
}

// ── Twilio WhatsApp (no-op unless configured) ──
function normalizeIrishPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const c = raw.replace(/[\s\-().]/g, '').trim();
  if (!c) return null;
  if (c.startsWith('+')) return /^\+\d{8,15}$/.test(c) ? c : null;
  if (c.startsWith('00')) { const x = '+' + c.slice(2); return /^\+\d{8,15}$/.test(x) ? x : null; }
  if (/^08[3-9]\d{7}$/.test(c)) return '+353' + c.slice(1);
  if (/^8[3-9]\d{7}$/.test(c)) return '+353' + c;
  return null;
}
async function sendWhatsApp(to: string | null | undefined, body: string): Promise<boolean> {
  const e164 = normalizeIrishPhone(to);
  if (!e164) return false;
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  const waFrom = (Deno.env.get('TWILIO_WHATSAPP_FROM') || Deno.env.get('TWILIO_WA_FROM'))?.trim();
  if (!sid || !token || !waFrom) return false;
  const from = waFrom.startsWith('whatsapp:') ? waFrom : `whatsapp:${waFrom}`;
  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: `whatsapp:${e164}`, From: from, Body: body }).toString(),
    });
    return resp.ok;
  } catch { return false; }
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Internal-only: the caller must be the service-role key (stripe-webhook / admin).
  if ((req.headers.get('Authorization') ?? '') !== `Bearer ${serviceKey}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { plan_id } = await req.json().catch(() => ({})) as { plan_id?: string };
    if (!plan_id) return new Response('plan_id required', { status: 400 });

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: plan } = await supabase
      .from('household_plan_subscriptions')
      .select('id, plan, city, config, customer_name, status, assigned_helper_id')
      .eq('id', plan_id).maybeSingle() as {
        data: { id: string; plan: string; city: string | null; config: string | null; customer_name: string | null; status: string; assigned_helper_id: string | null } | null;
      };

    if (!plan) return new Response(JSON.stringify({ ok: false, reason: 'not_found' }), { headers: { 'Content-Type': 'application/json' } });
    if (plan.status !== 'active' || plan.assigned_helper_id) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Approved + available helpers who opted in to Autopilot, in the plan's city
    // (fall back to all cities if none local), least-busy first.
    const pick = async (byCity: boolean) => {
      let q = supabase.from('household_helpers')
        .select('id, name, phone, email')
        .eq('status', 'approved').eq('is_available', true).eq('autopilot_opt_in', true)
        .order('accepted_count', { ascending: true }).limit(MAX_OFFERS);
      if (byCity && plan.city) q = q.eq('city', plan.city);
      const { data } = await q;
      return (data ?? []) as Array<{ id: string; name: string | null; phone: string | null; email: string | null }>;
    };
    let helpers = plan.city ? await pick(true) : [];
    if (helpers.length === 0) helpers = await pick(false);

    if (helpers.length === 0) {
      // Nobody opted in yet — leave it for the admin to assign manually.
      return new Response(JSON.stringify({ ok: true, offered: 0, noHelpers: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    const expiresAt = new Date(Date.now() + OFFER_TTL_HOURS * 3600 * 1000).toISOString();
    await supabase.from('autopilot_plan_offers').upsert(
      helpers.map((h) => ({ plan_id, helper_id: h.id, status: 'pending', expires_at: expiresAt })),
      { onConflict: 'plan_id,helper_id' },
    );

    const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
    const cityLabel = plan.city ?? 'your area';
    const summary = plan.config ? plan.config.split(' · ').slice(0, 2).join(' · ') : 'House Autopilot';
    const expEpoch = Math.floor(Date.parse(expiresAt) / 1000);
    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
    const resendFrom = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';

    const results = await Promise.allSettled(helpers.map(async (h) => {
      const tok = await signPlanToken({ p: plan_id, h: h.id, e: expEpoch });
      const claimUrl = `${supabaseUrl}/functions/v1/accept-autopilot-plan?t=${tok}`;
      const first = (h.name ?? 'there').split(' ')[0];

      await sendWhatsApp(h.phone, `VANO: New REGULAR client in ${cityLabel} — ${summary}. Same client every week/month, yours to keep. Tap to claim (first gets it): ${claimUrl}`);

      if (resendKey && h.email) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: resendFrom, to: [h.email],
            subject: `New regular client — ${cityLabel} (House Autopilot)`,
            html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">A regular client 🔁</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 8px;color:#111827;font-size:15px;">Hi ${first}!</p>
    <p style="margin:0 0 6px;color:#374151;font-size:15px;line-height:1.6;">A new <strong>House Autopilot</strong> client in <strong>${cityLabel}</strong> wants a regular helper — the same friendly face every week/month.</p>
    <p style="margin:0 0 22px;color:#6b7280;font-size:14px;">${summary} · first to claim keeps the client</p>
    <a href="${claimUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;">Claim this regular →</a>
  </div>
</div>
</body></html>`,
            text: `Hi ${first}! A new House Autopilot regular client in ${cityLabel}: ${summary}. Same client every week/month, yours to keep. Tap to claim (first gets it): ${claimUrl}`,
          }),
        }).catch(() => {});
      }
      return true;
    }));

    const notified = results.filter((r) => r.status === 'fulfilled').length;
    console.log(`[dispatch-autopilot-plan] offered plan ${plan_id} to ${helpers.length} helper(s) in ${cityLabel}`);
    return new Response(JSON.stringify({ ok: true, offered: helpers.length, notified, city: plan.city }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[dispatch-autopilot-plan] unhandled', e);
    return new Response('Error', { status: 500 });
  }
});
