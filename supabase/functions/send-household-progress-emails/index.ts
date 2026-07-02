import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  renderHouseholdEmail, emailP, escapeHtml, categoryLabel, greetName,
  sendHouseholdEmail,
} from "../_shared/householdEmail.ts";

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

serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey   = Deno.env.get('RESEND_API_KEY')?.trim();
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
    .select('id, customer_name, customer_email, customer_lat, customer_lng, worker_lat, worker_lng, category, student_id, city, last_progress_email_at')
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
  let sent = 0;

  for (const b of (bookings ?? [])) {
    // Throttle: skip if we already sent one in the last 10 minutes
    if (b.last_progress_email_at && b.last_progress_email_at > tenMinutesAgo) continue;

    const km = haversineKm(
      Number(b.worker_lat), Number(b.worker_lng),
      Number(b.customer_lat), Number(b.customer_lng),
    );

    const { line: etaLine, subjectDist } = etaDescription(km);
    const catLabel  = categoryLabel(b.category as string);
    const custName  = greetName(b.customer_name as string | null);
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

    // HTML-safe variants for interpolation (raw values stay in text/subject).
    const custNameHtml    = escapeHtml(custName);
    const helperFirstHtml = escapeHtml(helperFirst);

    const html = renderHouseholdEmail({
      preheader: `${helperFirst} is ${subjectDist} — follow the last stretch on the live map.`,
      eyebrow: `Live update · ${escapeHtml(catLabel)}`,
      heading: `📍 ${helperFirstHtml} is ${subjectDist}`,
      bodyHtml: [
        emailP(`Hi ${custNameHtml},`),
        emailP(etaLine, { last: true }),
      ].join(''),
      ctas: [{ label: 'See live map →', url: trackUrl }],
      footerNote: `Ref: ${ref} · You'll get one update every ~10 minutes`,
    });

    try {
      const sendOk = await sendHouseholdEmail({
        to: b.customer_email as string,
        subject: `${helperFirst} is ${subjectDist} — VANO`,
        html,
        text: `Hi ${custName}, ${etaLine} Track here: ${trackUrl}`,
      });
      if (sendOk) {
        await supabase
          .from('household_bookings')
          .update({ last_progress_email_at: new Date().toISOString() })
          .eq('id', b.id);
        sent++;
      } else {
        console.warn('[progress-emails] Resend send failed for', b.id);
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
