import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Called by StudentDashboard after a helper claims a booking.
// Sends the customer a "your helper has accepted" email via Resend.
// Requires a valid user JWT — verifies the caller is the assigned student.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Shopping run',
  'dog-walk': 'Dog walk',
  garden: 'Garden help',
  moving: 'Moving help',
  cleaning: 'Cleaning',
  other: 'General help',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

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

    // Only proceed if this user is actually the student assigned to the booking
    const { data: booking } = await supabase
      .from('household_bookings')
      .select('id, customer_name, customer_email, category, scheduled_date, student_id')
      .eq('id', booking_id)
      .eq('student_id', user.id)
      .maybeSingle() as { data: Record<string, string> | null };

    if (!booking?.customer_email) {
      return new Response(JSON.stringify({ ok: true, emailed: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
    if (!resendKey) {
      return new Response(JSON.stringify({ ok: true, emailed: false, reason: 'no_api_key' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get helper's display name from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle() as { data: { display_name?: string } | null };

    const helperName    = profile?.display_name || 'Your helper';
    const customerName  = booking.customer_name || 'there';
    const toEmail       = booking.customer_email;
    const categoryLabel = CATEGORY_LABELS[booking.category] ?? booking.category;
    const when          = booking.scheduled_date || '';

    const from     = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    const siteUrl  = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
    const trackUrl = `${siteUrl}/track/${booking_id}`;

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">${helperName} accepted your job!</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${customerName},</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
      <strong>${helperName}</strong> has accepted your <strong>${categoryLabel}</strong>${when ? ' for ' + when : ''}.
      You can message them and track progress in real time below.
    </p>
    <a href="${trackUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;">Track &amp; Message →</a>
  </div>
</div>
</body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [toEmail],
        subject: `${helperName} accepted — VANO`,
        html,
        text: `Hi ${customerName}, ${helperName} accepted your ${categoryLabel}${when ? ' for ' + when : ''}. Track here: ${trackUrl}`,
      }),
    });

    if (!res.ok) console.warn('[notify-household-accepted] Resend error', res.status, await res.text());

    return new Response(JSON.stringify({ ok: true, emailed: res.ok }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[notify-household-accepted] unhandled', err);
    return new Response(JSON.stringify({ error: 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
