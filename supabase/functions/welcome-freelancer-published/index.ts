import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Welcome email fired once a freelancer publishes their Vano listing.
// The celebration modal is great for the in-app moment, but nothing
// existed to (a) legitimize the publish over email, (b) give the
// freelancer a shareable link in their inbox, or (c) open an email
// channel for future product updates. This closes that gap.
//
// Called from the client after a successful publish (Quick Start or
// full Wizard). verify_jwt=true — the caller's session provides
// identity. Client-side sessionStorage is used as the light
// idempotency guard so a user who re-publishes in the same tab
// doesn't trigger a duplicate; the function itself is fire-and-
// forget and tolerates the rare dup that might arrive from a
// separate tab.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string): Response => new Response(
    JSON.stringify({ error }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
    const fromAddr = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    const replyTo = Deno.env.get('LISTING_NOTIFY_EMAIL')?.trim() || 'vano1app@gmail.com';
    const rawSite = Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com';
    const siteUrl = rawSite
      .replace(/^https?:\/\/www\.vanojobs\.com/i, 'https://vanojobs.com')
      .replace(/\/+$/, '');

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return bad(401, 'Unauthorized');
    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string | undefined;

    if (!userEmail) {
      // No email on the JWT — probably a phone-auth user. Nothing we
      // can do via Resend, so exit cleanly.
      return new Response(JSON.stringify({ skipped: true, reason: 'no_email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Pull the display name + a URL-friendly slug for their public
    // profile. Fall back to the email local-part if the profile row
    // doesn't have a display_name yet.
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, user_type')
      .eq('user_id', userId)
      .maybeSingle();

    if (profile?.user_type && profile.user_type !== 'student') {
      // A business account shouldn't be triggering this endpoint.
      // Skip cleanly rather than 403 — prevents support tickets on a
      // spurious failure.
      return new Response(JSON.stringify({ skipped: true, reason: 'not_student' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const displayName = profile?.display_name?.trim()
      || userEmail.split('@')[0]
      || 'there';
    const firstName = displayName.split(/\s+/)[0] || displayName;

    // Public-profile link — same shape as the celebration-modal copy
    // button uses. nameToSlug is a trivial lowercase + kebab; we
    // inline the equivalent here to keep the function self-contained.
    const slug = displayName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      || 'profile';
    const profileUrl = `${siteUrl}/u/${slug}`;
    const profileManageUrl = `${siteUrl}/profile`;

    const subject = "You're live on Vano — here's your profile link";

    const text =
      `Hi ${firstName},\n\n` +
      `Your Vano listing is live. Businesses can find and message you starting right now.\n\n` +
      `Your public profile:\n${profileUrl}\n\n` +
      `What's next:\n` +
      `- Share your link on Instagram, LinkedIn or WhatsApp to get in front of clients faster.\n` +
      `- Turn on Vano Pay from your profile — clients tap a button, money lands in your bank in 1–2 days. 3% fee, no monthly charge.\n` +
      `- Add a cover photo, skills and sample work to make your listing pop (3× more messages, based on our data).\n\n` +
      `Manage everything from ${profileManageUrl}\n\n` +
      `— The Vano team\n` +
      `${siteUrl}\n`;

    const html =
      `<p>Hi ${escapeHtml(firstName)},</p>` +
      `<p>Your Vano listing is <strong>live</strong>. Businesses can find and message you starting right now.</p>` +
      `<p><strong>Your public profile:</strong><br>` +
      `<a href="${profileUrl}" style="color:#2563eb;font-weight:600;">${escapeHtml(profileUrl)}</a></p>` +
      `<p style="margin-top:20px;"><a href="${profileManageUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#000;color:#fff;text-decoration:none;font-weight:600;">Manage my profile</a></p>` +
      `<p style="margin-top:24px;"><strong>What's next</strong></p>` +
      `<ul>` +
      `<li><strong>Share your link</strong> on Instagram, LinkedIn or WhatsApp so clients find you faster.</li>` +
      `<li><strong>Turn on Vano Pay</strong> — clients tap a button, money lands in your bank in 1–2 days (3% fee, no monthly charge).</li>` +
      `<li><strong>Add a cover photo, skills, sample work</strong> — listings with those get roughly 3× more messages.</li>` +
      `</ul>` +
      `<p style="color:#888;font-size:12px;margin-top:28px;">— The Vano team · <a href="${siteUrl}">${siteUrl}</a></p>`;

    if (!resendKey) {
      console.warn('[welcome-freelancer-published] RESEND_API_KEY not set — skipping send');
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
        to: [userEmail],
        reply_to: replyTo,
        subject,
        text,
        html,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error('[welcome-freelancer-published] resend error', resp.status, errText.slice(0, 300));
      return bad(502, 'email_send_failed');
    }

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[welcome-freelancer-published] unhandled', err);
    return bad(500, 'internal_error');
  }
});
