import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Scheduled sweep that emails a hirer whose held Vano Pay payment is
// approaching its 14-day auto-release — "your €X auto-releases in N
// days, release now if the work's done or flag a problem."
//
// Why this exists: without a reminder, a hirer who forgot to click
// Release can silently watch the 14-day window lapse, the cron
// auto-releases to the freelancer, and any unresolved issue becomes
// unrecoverable. The reminder gives them one nudge while they still
// have time to dispute. Day-10 is the chosen window:
//   - far enough from checkout (day 0) that real work has happened
//   - far enough from auto-release (day 14) that flagging a problem
//     is still actionable — the refund flow has 4 days to resolve
//   - close enough to the deadline to actually prompt action
//
// Invoked by Supabase cron — suggested daily (see VANO_PAY_ESCROW.md).
// Idempotent on replay via the reminder_sent_at column — a row that
// was emailed yesterday won't be emailed again today.
//
// verify_jwt=false. Scheduler + service-role operator only; no user-
// facing request path.

const BATCH_LIMIT = 50;
const RESEND_TIMEOUT_MS = 15_000;

// Day-10 target: we want to send the reminder when the row has
// roughly 3-4 days of window left. Query for rows whose
// auto_release_at falls inside a 48-hour band so a daily cron will
// catch every row exactly once even if a run is skipped — the
// reminder_sent_at guard de-dupes the overlap day.
const WINDOW_MIN_HOURS_REMAINING = 72;   // 3 days
const WINDOW_MAX_HOURS_REMAINING = 120;  // 5 days

type PaymentRow = {
  id: string;
  conversation_id: string | null;
  amount_cents: number;
  fee_cents: number;
  currency: string;
  auto_release_at: string;
  business_id: string;
  freelancer_id: string;
  description: string | null;
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

serve(async (_req) => {
  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')?.trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
    const fromAddr = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    const replyTo = Deno.env.get('LISTING_NOTIFY_EMAIL')?.trim() || 'vano1app@gmail.com';

    const supabase = createClient(supabaseUrl, serviceKey);

    const nowMs = Date.now();
    const windowMin = new Date(nowMs + WINDOW_MIN_HOURS_REMAINING * 3600 * 1000).toISOString();
    const windowMax = new Date(nowMs + WINDOW_MAX_HOURS_REMAINING * 3600 * 1000).toISOString();

    const { data: due, error: queryError } = await supabase
      .from('vano_payments')
      .select('id, conversation_id, amount_cents, fee_cents, currency, auto_release_at, business_id, freelancer_id, description')
      .eq('status', 'paid')
      .is('reminder_sent_at', null)
      .is('dispute_reason', null)
      .gte('auto_release_at', windowMin)
      .lte('auto_release_at', windowMax)
      .limit(BATCH_LIMIT);

    if (queryError) {
      console.error('[remind-held-payments] query failed', queryError);
      return new Response(JSON.stringify({ error: 'query_failed' }), { status: 500 });
    }

    const rows = (due ?? []) as PaymentRow[];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ reminded: 0, checked: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!RESEND_API_KEY) {
      console.warn('[remind-held-payments] RESEND_API_KEY not set — skipping send');
      return new Response(JSON.stringify({ skipped: true, reason: 'no_resend_key', checked: rows.length }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // One round-trip to profiles for the hirer emails + freelancer
    // display names. Both sides are under auth.users; email is not on
    // profiles so we resolve via a SECURITY DEFINER RPC that the
    // service role can hit. Fallback: if we can't resolve an email,
    // stamp reminder_sent_at anyway so we don't retry forever.
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.business_id, r.freelancer_id])));
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', userIds);

    const nameByUserId = new Map<string, string>();
    for (const p of (profiles ?? []) as Array<{ user_id: string; display_name: string | null }>) {
      if (p.display_name) nameByUserId.set(p.user_id, p.display_name);
    }

    // Resolve hirer emails via admin API — service role can read them.
    const { data: emailRows } = await supabase
      .rpc('get_user_emails' as never, { user_ids: rows.map((r) => r.business_id) } as never);
    const emailByUserId = new Map<string, string>();
    for (const r of ((emailRows ?? []) as Array<{ user_id: string; email: string | null }>)) {
      if (r.email) emailByUserId.set(r.user_id, r.email);
    }

    let reminded = 0;
    let skipped = 0;

    for (const row of rows) {
      const hirerEmail = emailByUserId.get(row.business_id);
      if (!hirerEmail) {
        // No email on file — stamp the row so we don't retry
        // indefinitely and log so ops can spot the pattern.
        console.warn('[remind-held-payments] no email for hirer', row.business_id);
        await supabase
          .from('vano_payments')
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', row.id);
        skipped++;
        continue;
      }

      const freelancerName = nameByUserId.get(row.freelancer_id) ?? 'the freelancer';
      const amountEuro = `€${(row.amount_cents / 100).toFixed(2)}`;
      const releaseAt = new Date(row.auto_release_at);
      const msLeft = releaseAt.getTime() - nowMs;
      const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
      const releaseDate = releaseAt.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
      const threadUrl = row.conversation_id
        ? `${siteUrl}/messages?open=${row.conversation_id}`
        : `${siteUrl}/messages`;
      const dashboardUrl = `${siteUrl}/business-dashboard`;

      const subject = `Your ${amountEuro} on Vano auto-releases in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
      const text =
        `Your ${amountEuro} payment to ${freelancerName} on Vano is held and auto-releases on ${releaseDate} (${daysLeft} day${daysLeft === 1 ? '' : 's'} away).\n\n` +
        (row.description ? `Description: ${row.description}\n\n` : '') +
        `If the work is done, you can release it now from the thread:\n${threadUrl}\n\n` +
        `If anything's off, flag a problem from the same thread and we'll refund the full amount.\n\n` +
        `Auto-release is automatic after ${daysLeft} more day${daysLeft === 1 ? '' : 's'} — your protection window closes then.\n\n` +
        `— The Vano team\n${siteUrl}\n`;

      const html =
        `<p>Your <strong>${amountEuro}</strong> payment to <strong>${escapeHtml(freelancerName)}</strong> on Vano is held and auto-releases on <strong>${releaseDate}</strong> (${daysLeft} day${daysLeft === 1 ? '' : 's'} away).</p>` +
        (row.description ? `<p style="color:#555">Description: ${escapeHtml(row.description)}</p>` : '') +
        `<p>If the work is done, release it now from the thread:</p>` +
        `<p><a href="${threadUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;">Open thread</a></p>` +
        `<p>If anything's off, flag a problem from the same thread and we'll refund the full amount.</p>` +
        `<p style="color:#555;font-size:13px">Auto-release is automatic after ${daysLeft} more day${daysLeft === 1 ? '' : 's'} — your protection window closes then.</p>` +
        `<p style="color:#888;font-size:12px">Dashboard: <a href="${dashboardUrl}">${dashboardUrl}</a></p>` +
        `<p style="color:#888;font-size:12px">— The Vano team · <a href="${siteUrl}">${siteUrl}</a></p>`;

      try {
        const resp = await fetchWithTimeout(
          'https://api.resend.com/emails',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: fromAddr,
              to: [hirerEmail],
              reply_to: replyTo,
              subject,
              text,
              html,
            }),
          },
          RESEND_TIMEOUT_MS,
        );

        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          console.error('[remind-held-payments] resend error', row.id, resp.status, errText.slice(0, 300));
          // Don't stamp reminder_sent_at — let tomorrow's cron retry
          // (the 48-hour window means there's at least one more shot).
          continue;
        }

        await supabase
          .from('vano_payments')
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', row.id);
        reminded++;
      } catch (err) {
        console.error('[remind-held-payments] send threw', row.id, err);
      }
    }

    return new Response(JSON.stringify({
      checked: rows.length,
      reminded,
      skipped,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[remind-held-payments] unhandled', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
  }
});
