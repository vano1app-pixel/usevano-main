import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deliveroo-style progress emails — sent every ~10 minutes while a helper
// is on the way. Calculates real distance between helper and customer using
// the Haversine formula and gives an ETA.
//
// Schedule this function to run every 10 minutes:
//   Supabase Dashboard → Edge Functions → send-household-progress-emails
//   → Schedule → Cron: */10 * * * *
//
// Or call it manually at: POST /functions/v1/send-household-progress-emails
// with Authorization: Bearer <service_role_key>

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function etaDescription(km: number): { line: string; subjectDist: string } {
  if (km < 0.12) {
    return { line: "They're just around the corner — should be with you any moment!", subjectDist: 'almost there' };
  }
  // Assume 15 km/h average (urban walking/cycling mix)
  const etaMins = Math.ceil(km / 15 * 60);
  if (km < 1) {
    const meters = Math.round(km * 1000 / 50) * 50; // round to nearest 50m
    return {
      line: `Your helper is about ${meters}m away — should arrive in roughly ${etaMins} minute${etaMins === 1 ? '' : 's'}.`,
      subjectDist: `${meters}m away`,
    };
  }
  return {
    line: `Your helper is about ${km.toFixed(1)} km away — estimated arrival in ${etaMins} minute${etaMins === 1 ? '' : 's'}.`,
    subjectDist: `${km.toFixed(1)} km away`,
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'General help',
};

serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey   = Deno.env.get('RESEND_API_KEY')?.trim();
  const from        = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
  const siteUrl     = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');

  if (!resendKey) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_resend_key' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // All on_way bookings with both helper and customer coordinates
  const { data: bookings, error } = await supabase
    .from('household_bookings')
    .select('id, customer_name, customer_email, customer_lat, customer_lng, worker_lat, worker_lng, worker_location_updated_at, category, student_id, city, last_progress_email_at')
    .eq('status', 'on_way')
    .not('worker_lat', 'is', null)
    .not('worker_lng', 'is', null)
    .not('customer_lat', 'is', null)
    .not('customer_lng', 'is', null)
    .not('customer_email', 'is', null);

  if (error) {
    console.error('[progress-emails] query error', error);
    return new Response('DB error', { status: 500 });
  }

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  // The helper's phone streams a GPS fix every ~15s. If that stream died (app
  // killed, permission revoked, phone dead) the last-known point goes stale,
  // and "Sam is 500m away — arriving in ~2 min" would repeat for hours from a
  // frozen coordinate. Only email when the fix is recent enough to be "live".
  const GPS_FRESH_MS = 8 * 60 * 1000;
  const gpsFreshCutoff = new Date(Date.now() - GPS_FRESH_MS).toISOString();
  let sent = 0;

  for (const b of (bookings ?? [])) {
    // Throttle: skip if we already sent one in the last 10 minutes
    if (b.last_progress_email_at && b.last_progress_email_at > tenMinutesAgo) continue;

    // Stale GPS → don't send a "live" ETA from a frozen point. A missing
    // timestamp is treated as stale (can't prove it's live).
    if (!b.worker_location_updated_at || b.worker_location_updated_at < gpsFreshCutoff) continue;

    const km = haversineKm(
      Number(b.worker_lat), Number(b.worker_lng),
      Number(b.customer_lat), Number(b.customer_lng),
    );

    const { line: etaLine, subjectDist } = etaDescription(km);
    const catLabel  = CATEGORY_LABELS[b.category as string] ?? String(b.category);
    const custName  = String(b.customer_name || 'there');
    const trackUrl  = `${siteUrl}/track/${b.id}`;
    const ref       = String(b.id).slice(-8).toUpperCase();

    // Look up helper first name
    let helperFirst = 'Your helper';
    if (b.student_id) {
      const { data: helper } = await supabase
        .from('household_helpers')
        .select('name')
        .eq('user_id', b.student_id)
        .maybeSingle() as { data: { name?: string } | null };
      if (helper?.name) {
        helperFirst = helper.name.split(' ')[0];
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', b.student_id)
          .maybeSingle() as { data: { display_name?: string } | null };
        if (profile?.display_name) helperFirst = profile.display_name.split(' ')[0];
      }
    }

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:28px 32px 20px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;">Live update · ${catLabel}</p>
    <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">📍 ${helperFirst} is ${subjectDist}</p>
  </div>
  <div style="padding:24px 32px;">
    <p style="margin:0 0 12px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">${etaLine}</p>
    <a href="${trackUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:100px;text-decoration:none;">See live map →</a>
    <p style="margin:16px 0 0;color:#d1d5db;font-size:11px;">Ref: ${ref} · You'll get one update every ~10 minutes</p>
  </div>
</div>
</body></html>`;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [b.customer_email as string],
          subject: `${helperFirst} is ${subjectDist} — VANO`,
          html,
          text: `Hi ${custName}, ${etaLine} Track here: ${trackUrl}`,
        }),
      });
      if (res.ok) {
        await supabase
          .from('household_bookings')
          .update({ last_progress_email_at: new Date().toISOString() })
          .eq('id', b.id);
        sent++;
      } else {
        console.warn('[progress-emails] Resend error for', b.id, res.status);
      }
    } catch (e) {
      console.warn('[progress-emails] send threw for', b.id, e);
    }
  }

  console.log(`[progress-emails] sent ${sent} / checked ${(bookings ?? []).length}`);
  return new Response(
    JSON.stringify({ ok: true, sent, checked: (bookings ?? []).length }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
