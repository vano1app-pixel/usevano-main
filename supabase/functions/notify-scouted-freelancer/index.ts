import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Outreach to a freshly-scouted web freelancer. Sends a single email
// via Resend with their personalised claim link so they can convert
// into a real Vano profile.
//
// Idempotent: only runs when the scout is still status='new'. A second
// invocation for the same id is a no-op so the growth loop can safely
// retry without spamming the real person.
//
// Called internally by ai-find-freelancer right after it upserts the
// scouted_freelancers row. verify_jwt=false — we rely on the status
// guard + the fact that callers pass the service-role key.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ScoutRow = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_instagram: string | null;
  contact_linkedin: string | null;
  claim_token: string;
  brief_snapshot: string | null;
  status: string;
};

function bad(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Very light first-name pick for the greeting. Scout names come
// from the LLM extracting search results, so they're sometimes a full
// name ("Jane Doe"), sometimes a handle ("@janedoe"), sometimes
// already just a first name. Take the first whitespace-separated
// token, strip a leading @, fall back to "there".
function firstName(raw: string | null | undefined): string {
  if (!raw) return 'there';
  const cleaned = raw.trim().replace(/^@/, '');
  const first = cleaned.split(/\s+/)[0];
  return first && first.length > 0 ? first : 'there';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
    const rawSite = Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com';
    const siteUrl = rawSite
      .replace(/^https?:\/\/www\.vanojobs\.com/i, 'https://vanojobs.com')
      .replace(/\/+$/, '');
    const fromAddr = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    const replyTo = Deno.env.get('LISTING_NOTIFY_EMAIL')?.trim() || 'vano1app@gmail.com';

    const body = await req.json().catch(() => ({}));
    const scoutId = typeof body?.scout_id === 'string' ? body.scout_id : null;
    if (!scoutId) return bad(400, 'scout_id required');

    const supabase = createClient(supabaseUrl, serviceKey);

    // Idempotent claim: flip 'new' → 'outreach_sent' up front. The
    // channel isn't known yet (depends on which contact fields are
    // populated) so we leave it null on this first atomic update and
    // set it below once we've decided the path. If the update returns
    // zero rows, another invocation already handled this scout (or
    // it's been claimed since) and we must not proceed.
    const nowIso = new Date().toISOString();
    const { data: claimed } = await supabase
      .from('scouted_freelancers')
      .update({ status: 'outreach_sent' })
      .eq('id', scoutId)
      .eq('status', 'new')
      .select('id, name, contact_email, contact_instagram, contact_linkedin, claim_token, brief_snapshot, status')
      .maybeSingle();

    if (!claimed) {
      return new Response(JSON.stringify({ skipped: true, reason: 'already_processed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const scout = claimed as ScoutRow;
    const hasEmail = !!scout.contact_email;
    const hasSocial = !!scout.contact_instagram || !!scout.contact_linkedin;

    // No email path: can't reach them via Resend, but we still record
    // truth on the row so the hirer's results UI can tell them whether
    // a manual DM is needed ('manual' — scraped an IG/LinkedIn handle
    // the hirer can use) or the pick has no reachable contacts at all
    // ('none'). Previously this rolled status back to 'new' and left
    // the hirer's UI claiming an invite had been sent when it had
    // not — that was the lying-UI bug.
    if (!hasEmail) {
      const fallbackChannel = hasSocial ? 'manual' : 'none';
      await supabase
        .from('scouted_freelancers')
        .update({
          outreach_channel: fallbackChannel,
          outreach_sent_at: nowIso,
        })
        .eq('id', scout.id);
      return new Response(JSON.stringify({
        sent: false,
        channel: fallbackChannel,
        reason: 'no_email',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Email path: stamp the channel + timestamp now, before we send,
    // so the hirer UI reflects "email queued" even if Resend is slow.
    // On send failure we roll BOTH status and channel back to 'new'/null
    // so a retry can try again with an unchanged row shape.
    await supabase
      .from('scouted_freelancers')
      .update({
        outreach_channel: 'email',
        outreach_sent_at: nowIso,
      })
      .eq('id', scout.id);

    const claimUrl = `${siteUrl}/claim/${scout.claim_token}`;
    const greetingName = firstName(scout.name);
    const briefSnippet = scout.brief_snapshot
      ? scout.brief_snapshot.slice(0, 240).trim()
      : null;

    const subject = `A client on Vano wanted to hire you`;

    const text =
      `Hi ${greetingName},\n\n` +
      `A client on Vano (${siteUrl}) was looking for a freelancer, and our AI picked you out of the open web. ` +
      `You don't have a Vano profile yet — claim one in under a minute to reply:\n\n` +
      `${claimUrl}\n\n` +
      (briefSnippet ? `What they're looking for:\n"${briefSnippet}"\n\n` : '') +
      `Why freelancers use Vano:\n` +
      `- Get paid safely through Vano Pay — clients tap, money lands in your bank in 1–2 days (3% fee)\n` +
      `- Or agree your own off-platform terms — Vano takes 0% when you invoice directly\n` +
      `- We keep matching you with paid briefs after this one\n\n` +
      `If this isn't for you, just ignore this email — we won't follow up.\n\n` +
      `— The Vano team\n` +
      `${siteUrl}\n`;

    const html =
      `<p>Hi ${escapeHtml(greetingName)},</p>` +
      `<p>A client on <a href="${siteUrl}">Vano</a> was looking for a freelancer, and our AI picked you out of the open web. ` +
      `You don't have a Vano profile yet — claim one in under a minute to reply:</p>` +
      `<p><a href="${claimUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#000;color:#fff;text-decoration:none;font-weight:600;">Claim my profile</a></p>` +
      (briefSnippet
        ? `<p style="color:#555"><strong>What they're looking for:</strong><br>"${escapeHtml(briefSnippet)}"</p>`
        : '') +
      `<p><strong>Why freelancers use Vano:</strong></p>` +
      `<ul>` +
      `<li>Get paid safely through <strong>Vano Pay</strong> — clients tap, money lands in your bank in 1–2 days (3% fee)</li>` +
      `<li>Or agree your own off-platform terms — Vano takes 0% when you invoice directly</li>` +
      `<li>We keep matching you with paid briefs after this one</li>` +
      `</ul>` +
      `<p style="color:#888;font-size:12px">If this isn't for you, just ignore this email — we won't follow up.</p>` +
      `<p style="color:#888;font-size:12px">— The Vano team · <a href="${siteUrl}">${siteUrl}</a></p>`;

    if (!resendKey) {
      console.warn('[notify-scouted-freelancer] RESEND_API_KEY not set — skipping send');
      return new Response(JSON.stringify({ skipped: true, reason: 'no_resend_key' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddr,
        to: [scout.contact_email],
        reply_to: replyTo,
        subject,
        text,
        html,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error('[notify-scouted-freelancer] resend error', resp.status, errText.slice(0, 300));
      // Email send failed — roll the status back so a retry can
      // attempt again. Resend transient failures shouldn't burn the
      // outreach chance.
      await supabase
        .from('scouted_freelancers')
        .update({
          status: 'new',
          outreach_channel: null,
          outreach_sent_at: null,
        })
        .eq('id', scout.id);
      return bad(502, 'email_send_failed');
    }

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[notify-scouted-freelancer] unhandled', err);
    return bad(500, 'internal_error');
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
