import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { NOT_DEMO_FILTER } from "../_shared/reviewDemo.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Hourly cron: one-time "how was your helper?" reminder for completed
// bookings that never got rated. Sent 24h–7d after completion; each
// booking is marked via rating_reminder_sent_at so it's only ever
// considered once.
//
// Schedule (pg_cron): 15 * * * *  → POST /functions/v1/remind-household-rating

const CATEGORY_LABELS: Record<string, string> = {
  business: 'Business temp staff', shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'General help',
};

const DAY_MS = 24 * 60 * 60 * 1000;

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

  const { data: bookings, error } = await supabase
    .from('household_bookings')
    .select('id, customer_name, customer_email, category, student_id')
    .or(NOT_DEMO_FILTER)
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

    // Claim BEFORE sending (guarded on the stamp still being null) so a crash
    // or redeploy mid-loop can't re-send this "we'll only ask once" email on
    // the next run. If the send fails we revert the stamp so it retries.
    const { data: claimed } = await supabase
      .from('household_bookings')
      .update({ rating_reminder_sent_at: new Date().toISOString() })
      .eq('id', b.id)
      .is('rating_reminder_sent_at', null)
      .select('id')
      .maybeSingle() as { data: { id: string } | null };
    if (!claimed) continue; // another run already handled it

    let helperFirst = 'your helper';
    if (b.student_id) {
      const { data: helper } = await supabase
        .from('household_helpers')
        .select('name')
        .eq('user_id', b.student_id)
        .maybeSingle() as { data: { name?: string } | null };
      if (helper?.name) helperFirst = helper.name.split(' ')[0];
    }

    const custName = b.customer_name || 'there';
    const catLabel = CATEGORY_LABELS[b.category ?? 'other'] ?? 'job';
    const trackUrl = `${siteUrl}/track/${b.id}`;
    const stars = [1, 2, 3, 4, 5].map(n =>
      `<a href="${trackUrl}?rate=${n}" style="text-decoration:none;font-size:30px;line-height:1;color:#f5b301;padding:0 3px;">&#9733;</a>`
    ).join('');

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
      Quick one — how did <strong>${helperFirst}</strong> do on your <strong>${catLabel}</strong>?
    </p>
    <div style="background:#eef3ef;border:1px solid #d5e2d8;border-radius:14px;padding:20px;text-align:center;margin:0 0 20px;">
      <p style="margin:0 0 4px;">${stars}</p>
      <p style="margin:8px 0 0;color:#6b7280;font-size:12px;">Tap a star — takes 10 seconds and helps ${helperFirst} get more work.</p>
    </div>
    <p style="margin:0;color:#9ca3af;font-size:12px;">We'll only ask once. Thanks for using VANO.</p>
  </div>
</div>
</body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [b.customer_email],
        subject: `How was ${helperFirst}? — VANO`,
        html,
        text: `Hi ${custName}, quick one — how did ${helperFirst} do on your ${catLabel}? Rate them here (takes 10 seconds): ${trackUrl}?rate=5 — We'll only ask once. Thanks for using VANO.`,
      }),
    });
    if (!res.ok) {
      console.warn('[remind-rating] Resend error', res.status, await res.text());
      // Revert the claim so a later run retries this one.
      await supabase.from('household_bookings')
        .update({ rating_reminder_sent_at: null })
        .eq('id', b.id);
      continue;
    }

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
