import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Called when helper taps "I arrived" in StudentJobDetail.
// Sends the customer a "your helper is here" email.
// Guards: valid JWT, caller must be the booking's assigned student.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Shopping run', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'General help',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const ok  = (data: Record<string, unknown>) =>
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

    const { data: booking } = await supabase
      .from('household_bookings')
      .select('id, status, customer_name, customer_email, category, student_id, city')
      .eq('id', booking_id)
      .eq('student_id', user.id)
      .maybeSingle() as { data: Record<string, string | null> | null };

    if (!booking) return ok({ ok: true, emailed: false, reason: 'booking_not_found' });
    if (!booking.customer_email) return ok({ ok: true, emailed: false, reason: 'no_customer_email' });

    // Get helper first name
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

    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
    if (!resendKey) return ok({ ok: true, emailed: false, reason: 'no_api_key' });

    const from     = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    const siteUrl  = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
    const trackUrl = `${siteUrl}/track/${booking_id}`;
    const catLabel = CATEGORY_LABELS[booking.category as string] ?? String(booking.category);
    const custName = String(booking.customer_name || 'there');
    const ref      = booking_id.slice(-8).toUpperCase();

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;">Arrived</p>
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">${helperFirstName} is at your door 📍</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
      <strong>${helperFirstName}</strong> has arrived for your <strong>${catLabel}</strong>. They're ready to get started!
    </p>
    <a href="${trackUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 28px;border-radius:100px;text-decoration:none;">Open tracking →</a>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref} · Questions? <a href="https://wa.me/353899817111" style="color:#9ca3af;">WhatsApp us</a></p>
  </div>
</div>
</body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [booking.customer_email as string],
        subject: `${helperFirstName} has arrived — VANO`,
        html,
        text: `Hi ${custName}, ${helperFirstName} has arrived for your ${catLabel} and is ready to start. Track: ${trackUrl}. Ref: ${ref}`,
      }),
    });

    if (!res.ok) console.warn('[notify-household-arrived] Resend error', res.status, await res.text());
    return ok({ ok: true, emailed: res.ok });

  } catch (err) {
    console.error('[notify-household-arrived] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
