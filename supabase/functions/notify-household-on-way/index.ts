import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { sendHouseholdPush } from "../_shared/householdPush.ts";

// Sends the customer a "helper is on the way" email + admin WhatsApp ping.
// Called fire-and-forget from StudentJobDetail when status advances to on_way.
// Guards:
//   - Caller must supply a valid user JWT
//   - Caller must be the booking's assigned student
//   - Booking must already be in on_way status (DB update happened first)

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'General help',
};

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!isOriginAllowed(req)) return new Response(JSON.stringify({ error: 'Forbidden origin' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const ok = (data: Record<string, unknown>) =>
    new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return bad(401, 'Invalid session');

    const { booking_id } = await req.json().catch(() => ({})) as { booking_id?: string };
    if (!booking_id) return bad(400, 'booking_id required');

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch booking — verify caller is the assigned student AND status is on_way
    const { data: booking } = await supabase
      .from('household_bookings')
      .select('id, status, customer_name, customer_email, category, scheduled_date, student_id, city, price_estimate_cents')
      .eq('id', booking_id)
      .eq('status', 'on_way')
      .eq('student_id', user.id)
      .maybeSingle() as { data: Record<string, string | null | number> | null };

    if (!booking) return ok({ ok: true, emailed: false, reason: 'booking_not_on_way' });

    // Best-effort web push — fire before the no-email early-return so it still
    // reaches phone-only customers who never gave us an email.
    void sendHouseholdPush(booking_id, 'on_way');

    if (!booking.customer_email) return ok({ ok: true, emailed: false, reason: 'no_customer_email' });

    // Get helper name — check household_helpers first, fall back to profiles
    let helperName = 'Your helper';
    let helperFirstName = 'Your helper';
    if (booking.student_id) {
      const { data: helper } = await supabase
        .from('household_helpers')
        .select('name')
        .eq('user_id', booking.student_id)
        .maybeSingle() as { data: { name?: string } | null };
      if (helper?.name) {
        helperName = helper.name;
        helperFirstName = helper.name.split(' ')[0];
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', booking.student_id)
          .maybeSingle() as { data: { display_name?: string } | null };
        if (profile?.display_name) {
          helperName = profile.display_name;
          helperFirstName = profile.display_name.split(' ')[0];
        }
      }
    }

    const resendKey  = Deno.env.get('RESEND_API_KEY')?.trim();
    const from       = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    const siteUrl    = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
    const trackUrl   = `${siteUrl}/track/${booking_id}`;
    const catLabel   = CATEGORY_LABELS[booking.category as string] ?? String(booking.category);
    const custName   = String(booking.customer_name || 'there');
    const ref        = booking_id.slice(-8).toUpperCase();

    // ── Customer email ──────────────────────────────────────────────────────
    let emailed = false;
    if (resendKey) {
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;">On the way</p>
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">${helperFirstName} is heading to you 🚶</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 8px;color:#374151;font-size:15px;line-height:1.6;">
      <strong>${helperFirstName}</strong> is on their way for your <strong>${catLabel}</strong>.
    </p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
      You can see their <strong>live location on the map</strong> and message them directly below.
    </p>
    <a href="${trackUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 28px;border-radius:100px;text-decoration:none;">Track live location →</a>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref}</p>
  </div>
</div>
</body></html>`;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [booking.customer_email as string],
          subject: `${helperFirstName} is on the way — VANO`,
          html,
          text: `Hi ${custName}, ${helperFirstName} is on their way for your ${catLabel}. Track their live location: ${trackUrl}`,
        }),
      });
      emailed = res.ok;
      if (!res.ok) console.warn('[notify-on-way] Resend error', res.status, await res.text());
    }

    // ── Admin WhatsApp ping ─────────────────────────────────────────────────
    fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'helper_on_way',
        helper_name: helperName,
        customer_name: booking.customer_name,
        category: booking.category,
        city: booking.city,
        booking_id,
      }),
    }).catch(() => {});

    return ok({ ok: true, emailed });
  } catch (err) {
    console.error('[notify-household-on-way] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
