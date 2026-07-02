import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  renderHouseholdEmail, emailBox, emailP, escapeHtml, categoryLabel,
  greetName, sendHouseholdEmail, BRAND,
} from "../_shared/householdEmail.ts";

// Hourly cron: one-time "how was your helper?" reminder for completed
// bookings that never got rated. Sent 24h–7d after completion; each
// booking is marked via rating_reminder_sent_at so it's only ever
// considered once.
//
// Schedule (pg_cron): 15 * * * *  → POST /functions/v1/remind-household-rating

const DAY_MS = 24 * 60 * 60 * 1000;

serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  // Sending goes through sendHouseholdEmail(), which owns the from-address
  // (brand-domain default — the old sandbox fallback bounces for non-owners).
  const resendKey   = Deno.env.get('RESEND_API_KEY')?.trim();
  const siteUrl     = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');

  if (!resendKey) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_resend_key' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: bookings, error } = await supabase
    .from('household_bookings')
    .select('id, customer_name, customer_email, category, student_id')
    .eq('status', 'completed')
    .not('customer_email', 'is', null)
    .is('rating_reminder_sent_at', null)
    .limit(50);

  if (error) {
    console.error('[remind-rating] query error', error);
    return new Response('DB error', { status: 500 });
  }
  if (!bookings || bookings.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ids = bookings.map((b: { id: string }) => b.id);

  // When did each complete?
  const { data: updates } = await supabase
    .from('household_job_updates')
    .select('booking_id, created_at')
    .eq('status', 'completed')
    .in('booking_id', ids);
  const completedAt = new Map<string, number>();
  for (const u of (updates ?? []) as { booking_id: string; created_at: string }[]) {
    completedAt.set(u.booking_id, new Date(u.created_at).getTime());
  }

  // Which are already rated?
  const { data: ratings } = await supabase
    .from('household_ratings')
    .select('booking_id')
    .in('booking_id', ids);
  const rated = new Set(((ratings ?? []) as { booking_id: string }[]).map(r => r.booking_id));

  const now = Date.now();
  let sent = 0;
  const closeOut: string[] = []; // mark handled without sending

  for (const b of bookings as { id: string; customer_name: string | null; customer_email: string; category: string | null; student_id: string | null }[]) {
    const doneAt = completedAt.get(b.id);

    // Already rated, no completion timestamp, or too old — close out silently
    if (rated.has(b.id) || !doneAt || now - doneAt > 7 * DAY_MS) {
      closeOut.push(b.id);
      continue;
    }
    // Too fresh — leave for a later run
    if (now - doneAt < DAY_MS) continue;

    let helperFirst = 'your helper';
    if (b.student_id) {
      const { data: helper } = await supabase
        .from('household_helpers')
        .select('name')
        .eq('user_id', b.student_id)
        .maybeSingle() as { data: { name?: string } | null };
      if (helper?.name) helperFirst = helper.name.split(' ')[0];
    }

    const custName = greetName(b.customer_name); // never "Hi Guest"
    const catLabel = categoryLabel(b.category);
    const trackUrl = `${siteUrl}/track/${b.id}`;
    // Star deep-links preserved exactly — TrackBooking prefills ?rate=N.
    const stars = [1, 2, 3, 4, 5].map(n =>
      `<a href="${trackUrl}?rate=${n}" style="text-decoration:none;font-size:30px;line-height:1;color:#f5b301;padding:0 3px;">&#9733;</a>`
    ).join('');

    // HTML-safe variants for interpolation (raw values stay in text/subject).
    const custNameHtml   = escapeHtml(custName);
    const helperNameHtml = escapeHtml(helperFirst);
    const catLabelHtml   = escapeHtml(catLabel);
    const html = renderHouseholdEmail({
      preheader: `Tap a star for ${helperFirst} — takes 10 seconds and helps them get more work.`,
      eyebrow: 'Quick favour',
      heading: `How was ${helperNameHtml}?`,
      bodyHtml: [
        emailP(`Hi ${custNameHtml},`),
        emailP(`Quick one — how did <strong>${helperNameHtml}</strong> do on your <strong>${catLabelHtml}</strong>?`),
        emailBox(`
      <p style="margin:0 0 4px;text-align:center;">${stars}</p>
      <p style="margin:8px 0 0;color:${BRAND.faint};font-size:12px;text-align:center;">Tap a star — takes 10 seconds and helps ${helperNameHtml} get more work.</p>`),
      ].join(''),
      footerNote: `We'll only ask once. Thanks for using VANO.`,
    });

    const sentOk = await sendHouseholdEmail({
      to: b.customer_email,
      subject: `How was ${helperFirst}? — VANO`,
      html,
      text: `Hi ${custName}, quick one — how did ${helperFirst} do on your ${catLabel}? Rate them here (takes 10 seconds): ${trackUrl}?rate=5 — We'll only ask once. Thanks for using VANO.`,
    });
    if (!sentOk) continue; // Resend error/exception already logged — retry on a later run

    closeOut.push(b.id);
    sent++;
  }

  if (closeOut.length > 0) {
    await supabase
      .from('household_bookings')
      .update({ rating_reminder_sent_at: new Date().toISOString() })
      .in('id', closeOut);
  }

  return new Response(JSON.stringify({ ok: true, sent, closed: closeOut.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
