import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Partner "you just earned €X" emails — the passive-income heartbeat.
//
// Sweeps referral_commissions rows with notified_at IS NULL, groups them per
// partner code, and emails the code's owner one digest per run: what landed
// (job + helper first name + amount), plus their lifetime total and a link to
// the tracker on /account. Rows are STAMPED BEFORE sending (same at-most-once
// convention as gap_nudged_at) so a crash can never double-email; codes with
// no owner_email are stamped too so they don't pile up forever.
//
// Fail-soft everywhere: no RESEND_API_KEY → clean no-op; a single partner's
// email failure never blocks the rest.
//
// verify_jwt = false — called by the scheduler (suggested cadence: hourly,
// e.g. 25 * * * *). Same no-auth pattern as remind-confirm-completion.

const EMOJI: Record<string, string> = {
  cleaning: '🧹', shopping: '🧺', 'dog-walk': '🐾', garden: '🌿',
  moving: '📦', tutoring: '📚', custom: '✨',
};
const LABEL: Record<string, string> = {
  cleaning: 'Cleaning', shopping: 'Laundry', 'dog-walk': 'Pet care',
  garden: 'Garden', moving: 'Moving', tutoring: 'Tutoring', custom: 'Custom job',
};

const euros = (cents: number) => {
  const v = cents / 100;
  return Number.isInteger(v) ? `€${v}` : `€${v.toFixed(2)}`;
};

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const resendKey  = Deno.env.get('RESEND_API_KEY')?.trim();
    const resendFrom = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    const siteUrl    = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');

    // Fresh, un-notified commission rows (oldest first so digests read in order).
    const { data: rows, error } = await supabase
      .from('referral_commissions')
      .select('id, code_id, helper_id, booking_id, amount_cents, created_at')
      .is('notified_at', null)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ processed: 0, emailed: 0 }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Stamp FIRST — at-most-once beats at-least-once for money emails.
    const ids = rows.map((r) => r.id as string);
    const { error: stampErr } = await supabase
      .from('referral_commissions')
      .update({ notified_at: new Date().toISOString() })
      .in('id', ids);
    if (stampErr) throw stampErr; // nothing sent yet — next run retries cleanly

    // Enrich: partner codes (owner email), helper first names, job categories.
    const codeIds    = [...new Set(rows.map((r) => r.code_id as string))];
    const helperIds  = [...new Set(rows.map((r) => r.helper_id).filter(Boolean))] as string[];
    const bookingIds = [...new Set(rows.map((r) => r.booking_id).filter(Boolean))] as string[];
    const [codesRes, helpersRes, bookingsRes, totalsRes] = await Promise.all([
      supabase.from('referral_codes').select('id, code, owner_email, owner_name').in('id', codeIds),
      helperIds.length  ? supabase.from('household_helpers').select('id, name').in('id', helperIds)   : Promise.resolve({ data: [] }),
      bookingIds.length ? supabase.from('household_bookings').select('id, category').in('id', bookingIds) : Promise.resolve({ data: [] }),
      supabase.from('referral_commissions').select('code_id, amount_cents').in('code_id', codeIds),
    ]);
    const codeOf = new Map(((codesRes.data ?? []) as { id: string; code: string; owner_email: string | null; owner_name: string | null }[]).map((c) => [c.id, c]));
    const nameOf = new Map(((helpersRes.data ?? []) as { id: string; name: string | null }[]).map((h) => [h.id, (h.name ?? '').trim().split(/\s+/)[0] || 'a student']));
    const catOf  = new Map(((bookingsRes.data ?? []) as { id: string; category: string | null }[]).map((b) => [b.id, b.category ?? 'custom']));
    const lifetime = new Map<string, number>();
    for (const t of (totalsRes.data ?? []) as { code_id: string; amount_cents: number }[]) {
      lifetime.set(t.code_id, (lifetime.get(t.code_id) ?? 0) + (t.amount_cents ?? 0));
    }

    // One digest per partner.
    const byCode = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = r.code_id as string;
      if (!byCode.has(k)) byCode.set(k, []);
      byCode.get(k)!.push(r);
    }

    let emailed = 0, skippedNoEmail = 0;
    for (const [codeId, group] of byCode) {
      const codeRow = codeOf.get(codeId);
      const to = codeRow?.owner_email?.trim();
      if (!to || !resendKey) { skippedNoEmail++; continue; }

      const newCents = group.reduce((s, r) => s + ((r.amount_cents as number) ?? 0), 0);
      const lines = group.map((r) => {
        const cat = r.booking_id ? (catOf.get(r.booking_id as string) ?? 'custom') : 'custom';
        const who = r.helper_id ? nameOf.get(r.helper_id as string) ?? 'a student' : 'a student';
        return `${EMOJI[cat] ?? '✨'} ${LABEL[cat] ?? 'Job'} by ${who} — +${euros((r.amount_cents as number) ?? 0)}`;
      });
      const total = lifetime.get(codeId) ?? newCents;
      const firstName = (codeRow?.owner_name ?? '').trim().split(/\s+/)[0];

      const text =
        `${firstName ? `Hi ${firstName}, y` : 'Y'}our VANO referrals just earned you ${euros(newCents)} — automatically.\n\n` +
        `${lines.join('\n')}\n\n` +
        `Total earned so far: ${euros(total)}\n\n` +
        `See your live tracker (code ${codeRow?.code ?? ''}): ${siteUrl}/account\n\n` +
        `Every time a student you invited completes a job, you earn your share — nothing to do.\n— VANO`;

      const html =
        `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#14181f;">` +
        `<p style="font-size:15px;margin:0 0 6px;">${firstName ? `Hi ${firstName},` : 'Hi,'}</p>` +
        `<h2 style="font-size:22px;margin:0 0 14px;">Your referrals just earned you <span style="color:#5a8a5c;">${euros(newCents)}</span> 🎉</h2>` +
        `<div style="background:#faf8f3;border:1px solid #eee7d9;border-radius:12px;padding:14px 16px;margin-bottom:14px;">` +
        lines.map((l) => `<p style="margin:4px 0;font-size:14px;">${l}</p>`).join('') +
        `</div>` +
        `<p style="font-size:14px;margin:0 0 4px;">Total earned so far: <strong>${euros(total)}</strong></p>` +
        `<p style="font-size:14px;margin:0 0 18px;">It landed automatically — students you invited keep working, you keep earning.</p>` +
        `<a href="${siteUrl}/account" style="display:inline-block;background:#101828;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:999px;">See my live tracker</a>` +
        `<p style="font-size:12px;color:#98a2b3;margin-top:22px;">VANO · same-day student help in Galway · your partner code: ${codeRow?.code ?? ''}</p>` +
        `</div>`;

      try {
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: resendFrom, to: [to], subject: `You just earned ${euros(newCents)} with VANO 🎉`, text, html }),
        });
        if (resp.ok) emailed++;
        else console.warn('[notify-partner-commissions] resend error', resp.status, (await resp.text()).slice(0, 200));
      } catch (e) {
        console.warn('[notify-partner-commissions] send failed', e);
      }
    }

    return new Response(
      JSON.stringify({ processed: rows.length, partners: byCode.size, emailed, skipped_no_email: skippedNoEmail }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[notify-partner-commissions] unhandled', err);
    return new Response(JSON.stringify({ error: 'Unexpected error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
