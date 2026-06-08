import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Called by StudentDashboard after a helper claims a booking.
// Sends the customer a "your helper is confirmed" email via Resend.
// Requires a valid user JWT — verifies the caller is the assigned student.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Shopping run', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'General help',
};

const SLOT_LABELS: Record<string, string> = {
  morning: 'morning (8am–12pm)',
  afternoon: 'afternoon (12–5pm)',
  evening: 'evening (5–8pm)',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const ok = (data: Record<string, unknown>) =>
    new Response(JSON.stringify(data), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

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

    // Only proceed if this user is actually the assigned student
    const { data: booking } = await supabase
      .from('household_bookings')
      .select('id, customer_name, customer_email, category, scheduled_date, time_slot, student_id')
      .eq('id', booking_id)
      .eq('student_id', user.id)
      .maybeSingle() as { data: Record<string, string | null> | null };

    if (!booking?.customer_email) return ok({ ok: true, emailed: false, reason: 'no_customer_email' });

    // Get helper name — household_helpers first, profiles fallback
    let helperFirstName = 'Your helper';
    const { data: helper } = await supabase
      .from('household_helpers')
      .select('name')
      .eq('user_id', user.id)
      .maybeSingle() as { data: { name?: string } | null };
    if (helper?.name) {
      helperFirstName = helper.name.split(' ')[0];
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle() as { data: { display_name?: string } | null };
      if (profile?.display_name) helperFirstName = profile.display_name.split(' ')[0];
    }

    const resendKey  = Deno.env.get('RESEND_API_KEY')?.trim();
    if (!resendKey) return ok({ ok: true, emailed: false, reason: 'no_api_key' });

    const from       = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    const siteUrl    = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
    const trackUrl   = `${siteUrl}/track/${booking_id}`;
    const catLabel   = CATEGORY_LABELS[booking.category as string] ?? String(booking.category);
    const custName   = String(booking.customer_name || 'there');
    const ref        = booking_id.slice(-8).toUpperCase();

    const dateStr = booking.scheduled_date === 'today' ? 'today'
      : booking.scheduled_date === 'tomorrow' ? 'tomorrow'
      : booking.scheduled_date ?? '';
    const slotStr = booking.time_slot ? ` ${SLOT_LABELS[booking.time_slot as string] ?? booking.time_slot}` : '';
    const whenLine = dateStr ? `${dateStr}${slotStr}` : '';

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;">Helper confirmed</p>
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">${helperFirstName} is on your job ✓</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 8px;color:#374151;font-size:15px;line-height:1.6;">
      <strong>${helperFirstName}</strong> has accepted your <strong>${catLabel}</strong>${whenLine ? ' for <strong>' + whenLine + '</strong>' : ''}.
    </p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
      You'll get another message when they're on their way — including a <strong>live map</strong> so you can track exactly where they are.
    </p>
    <a href="${trackUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 28px;border-radius:100px;text-decoration:none;">Track booking →</a>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref} · Questions? WhatsApp us: <a href="https://wa.me/353899817111" style="color:#9ca3af;">+353 89 981 7111</a></p>
  </div>
</div>
</body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [booking.customer_email as string],
        subject: `${helperFirstName} is on your ${catLabel} — VANO`,
        html,
        text: `Hi ${custName}, ${helperFirstName} has accepted your ${catLabel}${whenLine ? ' for ' + whenLine : ''}. You'll get a live map when they're on their way. Track: ${trackUrl}. Ref: ${ref}`,
      }),
    });

    if (!res.ok) console.warn('[notify-household-accepted] Resend error', res.status, await res.text());

    return ok({ ok: true, emailed: res.ok });
  } catch (err) {
    console.error('[notify-household-accepted] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
