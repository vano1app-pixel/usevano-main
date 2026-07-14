import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowRequest } from "../_shared/rateLimit.ts";

// Called by HouseholdAdmin right after approving a helper, and by the server
// signup/backstop paths. Previously approval was a silent DB flip — the helper
// was never told they got in, so approved helpers didn't know to go available.
//
// It only ever messages the helper's OWN email/phone, but under free-to-join
// every helper is 'approved' (so the status guard is vacuous) and helper_id is
// public (it's in every /helpers/:id URL) — so it's rate-limited per helper_id
// to at most one send per 6h, bounding any spam-a-helper attempt regardless of
// which caller (server service-role or the admin browser session) invokes it.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeIrishPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-().]/g, '').trim();
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
  if (cleaned.startsWith('00')) {
    const c = '+' + cleaned.slice(2);
    return /^\+\d{8,15}$/.test(c) ? c : null;
  }
  if (/^08[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned.slice(1);
  if (/^8[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned;
  return null;
}

async function sendWhatsApp(to: string | null, body: string): Promise<boolean> {
  const sid   = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  const waFrom = Deno.env.get('TWILIO_WHATSAPP_FROM')?.trim();
  if (!sid || !token || !waFrom) return false;
  const e164 = normalizeIrishPhone(to);
  if (!e164) return false;
  const from = waFrom.startsWith('whatsapp:') ? waFrom : `whatsapp:${waFrom}`;
  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: `whatsapp:${e164}`, From: from, Body: body }).toString(),
    });
    return resp.ok;
  } catch { return false; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  try {
    const { helper_id } = await req.json().catch(() => ({})) as { helper_id?: string };
    if (!helper_id) {
      return new Response(JSON.stringify({ error: 'helper_id required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Bound spam: at most one "you're approved" per helper per 6h, whoever calls.
    if (!await allowRequest(supabase, 'notify-helper-approved', helper_id, 1, 6 * 60 * 60)) {
      return new Response(JSON.stringify({ skipped: 'rate_limited' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { data: helper } = await supabase
      .from('household_helpers')
      .select('id, name, email, phone, city, status, id_verified')
      .eq('id', helper_id)
      .maybeSingle() as { data: { name: string; email: string | null; phone: string | null; city: string; status: string; id_verified: boolean | null } | null };

    if (!helper) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });
    // Only notify when genuinely approved — prevents using this as a spam vector
    if (helper.status !== 'approved') {
      return new Response(JSON.stringify({ skipped: 'not approved' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://vanojobs.com').replace(/\/$/, '');
    const firstName = helper.name.split(' ')[0];
    const dashUrl = `${siteUrl}/student-dashboard`;
    const verifyUrl = `${siteUrl}/verify-helper?id=${helper_id}&name=${encodeURIComponent(firstName)}`;

    // Approved ≠ receiving jobs: since the first-job ID gate, offers only go
    // to id_verified helpers — so the FIRST ask is the free ID check, not
    // "set yourself Available". Already-verified helpers (admin re-approval)
    // get the original go-live message.
    const idVerified = !!helper.id_verified;
    const waText = idVerified
      ? `🎉 ${firstName}, you're approved on VANO! You can now pick up jobs in ${helper.city}. Open your dashboard, turn on job alerts and set yourself Available — jobs are first come, first served: ${dashUrl}\n\n💶 One important step: add your payout details in the Earnings tab so we can pay you — without it your earnings are held: ${dashUrl}?tab=earnings`
      : `🎉 ${firstName}, you're approved on VANO! One free step before your first job: verify your ID — it takes about 2 minutes, and customers are told every VANO helper is ID-verified, so jobs only go to verified helpers: ${verifyUrl}\n\nThen open your dashboard, turn on job alerts and set yourself Available — jobs are first come, first served: ${dashUrl}`;
    const waOk = await sendWhatsApp(helper.phone, waText);

    let emailOk = false;
    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
    const resendFrom = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    if (resendKey && helper.email) {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: resendFrom,
          to: [helper.email],
          subject: `🎉 You're approved — start earning on VANO`,
          html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">You're in, ${firstName} 🎉</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      Your VANO helper application is <strong>approved</strong>. You can now pick up paid jobs in ${helper.city}.
    </p>
    <p style="margin:0 0 6px;color:#111827;font-size:14px;font-weight:700;">Get your first job:</p>
    <ol style="margin:0 0 18px;padding-left:20px;color:#374151;font-size:14px;line-height:1.9;">
      ${idVerified ? '' : `<li><strong>Verify your ID</strong> (free, ~2 minutes) — jobs only go to ID-verified helpers</li>`}
      <li>Open your dashboard and set yourself <strong>Available</strong></li>
      <li>Turn on <strong>job alerts</strong> — jobs are first come, first served</li>
      <li>Add your <strong>payout details</strong> in the Earnings tab so you get paid</li>
      <li>When an offer lands, tap <strong>Accept</strong> fast 💨</li>
    </ol>
    ${idVerified ? '' : `<div style="background:#eef4ef;border:1px solid #cfe0d3;border-radius:12px;padding:12px 16px;margin:0 0 14px;">
      <p style="margin:0;color:#2f4f3a;font-size:13px;line-height:1.5;">🪪 <strong>The ID check comes first:</strong> customers are told every VANO helper is ID-verified before their first job, so offers only go out to verified helpers. It's free and takes about 2 minutes.</p>
    </div>`}
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:12px 16px;margin:0 0 20px;">
      <p style="margin:0;color:#9a3412;font-size:13px;line-height:1.5;">💶 <strong>Don't skip payouts:</strong> until you add your bank details in the Earnings tab, anything you earn is held and can't be paid out.</p>
    </div>
    <a href="${idVerified ? dashUrl : verifyUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;">${idVerified ? 'Open my dashboard →' : 'Verify my ID (free) →'}</a>
    <p style="margin:22px 0 0;color:#9ca3af;font-size:12px;">Questions? WhatsApp us any time: +353 89 981 7111</p>
  </div>
</div>
</body></html>`,
          text: idVerified
            ? `You're approved on VANO, ${firstName}! Pick up paid jobs in ${helper.city}. 1) Open your dashboard and set yourself Available 2) Turn on job alerts 3) Accept fast — first come, first served. ${dashUrl} — Questions? WhatsApp +353 89 981 7111`
            : `You're approved on VANO, ${firstName}! One free step before your first job: verify your ID (~2 minutes) — jobs only go to ID-verified helpers: ${verifyUrl} Then set yourself Available and turn on job alerts: ${dashUrl} — Questions? WhatsApp +353 89 981 7111`,
        }),
      });
      emailOk = resp.ok;
    }

    return new Response(JSON.stringify({ sent: true, whatsapp: waOk, email: emailOk }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[notify-helper-approved] unhandled', err);
    return new Response(JSON.stringify({ error: 'Unexpected error' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
