import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// One-tap claim of a House Autopilot regular client (verify_jwt = false).
//
// The helper taps the signed link from dispatch-autopilot-plan; the first to
// claim is assigned as the plan's regular helper. The HMAC token (same scheme
// as accept-job) proves the link is genuine and unexpired; the atomic assign
// (update … where assigned_helper_id IS NULL) keeps exactly one winner.
// Redirects into the SPA's dashboard so it renders in every in-app browser.

function secretKey(): string {
  return (Deno.env.get('ACCEPT_LINK_SECRET')?.trim()) || (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
}
function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hmac(part: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secretKey()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(part)));
}
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
async function verifyToken(token: string): Promise<{ p: string; h: string; e: number } | null> {
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const part = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!sig) return null;
  let ok = false;
  try { ok = timingSafeEqual(b64urlDecode(sig), await hmac(part)); } catch { return null; }
  if (!ok) return null;
  let payload: { p: string; h: string; e: number };
  try { payload = JSON.parse(new TextDecoder().decode(b64urlDecode(part))); } catch { return null; }
  if (!payload?.p || !payload?.h || typeof payload.e !== 'number') return null;
  if (Date.now() / 1000 > payload.e) return null;
  return payload;
}

function redirect(siteUrl: string, status: string): Response {
  return new Response(null, { status: 303, headers: { Location: `${siteUrl}/student-dashboard?autopilot=${status}` } });
}

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
  const supabase = createClient(supabaseUrl, serviceKey);

  const token = new URL(req.url).searchParams.get('t') ?? '';
  const payload = await verifyToken(token);
  if (!payload) return redirect(siteUrl, 'expired');
  const { p: planId, h: helperId } = payload;

  // Helper must still be approved AND opted in to Autopilot work.
  const { data: helper } = await supabase
    .from('household_helpers').select('status, autopilot_opt_in, name')
    .eq('id', helperId).maybeSingle() as { data: { status: string; autopilot_opt_in: boolean; name: string | null } | null };
  if (!helper || helper.status !== 'approved' || !helper.autopilot_opt_in) return redirect(siteUrl, 'expired');

  const { data: plan } = await supabase
    .from('household_plan_subscriptions')
    .select('id, status, assigned_helper_id, customer_name, city, plan')
    .eq('id', planId).maybeSingle() as {
      data: { id: string; status: string; assigned_helper_id: string | null; customer_name: string | null; city: string | null; plan: string } | null;
    };
  if (!plan || plan.status !== 'active') return redirect(siteUrl, 'gone');
  if (plan.assigned_helper_id) return redirect(siteUrl, plan.assigned_helper_id === helperId ? 'mine' : 'taken');

  // Atomic assign — first to claim wins.
  const { data: claimed } = await supabase
    .from('household_plan_subscriptions')
    .update({ assigned_helper_id: helperId, assigned_at: new Date().toISOString() })
    .eq('id', planId).is('assigned_helper_id', null).eq('status', 'active')
    .select('id').maybeSingle();
  if (!claimed) return redirect(siteUrl, 'taken');

  // Close out the offers: this helper accepted, the rest expire.
  await supabase.from('autopilot_plan_offers').update({ status: 'accepted' }).eq('plan_id', planId).eq('helper_id', helperId);
  await supabase.from('autopilot_plan_offers').update({ status: 'expired' }).eq('plan_id', planId).neq('helper_id', helperId).eq('status', 'pending');

  // Tell the admin who took it so scheduling continues — best-effort.
  fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'new_booking',
      customer_name: `Autopilot regular CLAIMED by ${helper.name ?? 'helper'} — for ${plan.customer_name ?? 'customer'}`,
      category: `plan:${plan.plan}`,
      city: plan.city,
      scheduled_date: 'Helper claimed — confirm & schedule the first visit',
      booking_id: planId,
    }),
  }).catch(() => {});

  console.log(`[accept-autopilot-plan] plan ${planId} claimed by helper ${helperId}`);
  return redirect(siteUrl, 'claimed');
});
