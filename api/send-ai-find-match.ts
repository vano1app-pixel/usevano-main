// Vercel serverless function — emails the hirer their AI Find match
// (freelancer profile + phone + Vano message link) so they always
// have the details on file even if they close the tab. Resend handles
// delivery. Bypasses Supabase edge functions entirely (those have
// been intermittently 401-ing the gateway), keeping the receipt path
// reliable while the platform's other notifications are in flux.
//
// Auth model: the caller passes their Supabase user JWT in the
// Authorization header. We verify the JWT with Supabase, then use
// it to read the ai_find_requests row — RLS guarantees the row
// belongs to that user, so there's no way to email someone else's
// match. No service-role key required.
//
// Idempotency: the client-side caller stamps a sessionStorage flag
// (`vano_ai_find_emailed_<id>`) before invoking, so a refresh on the
// results page won't double-send within the same browser session.
// We don't gate this server-side because (a) Resend won't reject a
// duplicate, (b) hirers occasionally lose the first email and want
// it re-sent — letting the client decide is fine.

type VercelReq = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
};

type VercelRes = {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  '';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || 'VANO <onboarding@resend.dev>';
const SITE_URL = (process.env.SITE_URL || 'https://vanojobs.com').replace(/\/+$/, '');

function readHeader(headers: VercelReq['headers'], name: string): string | null {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === 'string' ? v : null;
}

async function supabaseRest<T = unknown>(
  path: string,
  jwt: string,
): Promise<T | null> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/json',
    },
  });
  if (!resp.ok) {
    console.error(`[ai-find-email] supabase ${path} failed`, resp.status);
    return null;
  }
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
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

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Supabase env not configured' });
  }
  if (!RESEND_API_KEY) {
    // Don't fail the request — log and return a soft success so the
    // UI doesn't surface a scary error for what is purely a backup
    // delivery channel. The user already saw the match on screen.
    console.warn('[ai-find-email] RESEND_API_KEY missing — skipping email');
    return res.status(200).json({ ok: true, skipped: 'no_resend_key' });
  }

  const auth = readHeader(req.headers, 'authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  const jwt = auth.slice('Bearer '.length).trim();
  if (!jwt) return res.status(401).json({ error: 'Empty bearer token' });

  const body = (req.body ?? {}) as { request_id?: string };
  const requestId = body.request_id;
  if (!requestId || typeof requestId !== 'string') {
    return res.status(400).json({ error: 'Missing request_id' });
  }

  // 1. Verify the JWT and pull the user's email by hitting Supabase
  //    /auth/v1/user with their token. Same call the SDK makes under
  //    the hood — the response body is { id, email, ... } on success.
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!userResp.ok) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }
  const userData = (await userResp.json()) as { id?: string; email?: string };
  if (!userData?.id || !userData.email) {
    return res.status(401).json({ error: 'Auth token missing identity' });
  }

  // 2. Read the AI Find row through the user's JWT. RLS gates this
  //    to rows the user owns, so a stolen request_id from another
  //    user can't extract that match.
  const rows = await supabaseRest<Array<{
    id: string;
    requester_id: string;
    brief: string | null;
    category: string | null;
    vano_match_user_id: string | null;
    vano_match_reason: string | null;
    status: string;
  }>>(
    `ai_find_requests?id=eq.${encodeURIComponent(requestId)}&select=id,requester_id,brief,category,vano_match_user_id,vano_match_reason,status`,
    jwt,
  );
  const row = rows?.[0];
  if (!row) return res.status(404).json({ error: 'Request not found' });
  if (row.requester_id !== userData.id) {
    return res.status(403).json({ error: 'Not your request' });
  }
  if (!row.vano_match_user_id) {
    return res.status(409).json({ error: 'Match not ready yet' });
  }

  // 3. Pull the matched freelancer's profile + phone. Both publicly
  //    readable for approved profiles, no service role needed. We
  //    accept partial data (e.g. missing avatar) gracefully.
  const [profiles, students] = await Promise.all([
    supabaseRest<Array<{ user_id: string; display_name: string | null; avatar_url: string | null }>>(
      `profiles?user_id=eq.${encodeURIComponent(row.vano_match_user_id)}&select=user_id,display_name,avatar_url`,
      jwt,
    ),
    supabaseRest<Array<{ user_id: string; bio: string | null; skills: string[] | null; hourly_rate: number | null; phone: string | null }>>(
      `student_profiles?user_id=eq.${encodeURIComponent(row.vano_match_user_id)}&select=user_id,bio,skills,hourly_rate,phone`,
      jwt,
    ),
  ]);
  const profile = profiles?.[0];
  const sp = students?.[0];
  const name = profile?.display_name?.trim() || 'Your VANO match';
  const phone = sp?.phone?.trim() || null;
  const phoneDigits = phone ? phone.replace(/[^+\d]/g, '') : null;
  const skills = (sp?.skills ?? []).slice(0, 6);
  const bio = (sp?.bio ?? '').slice(0, 400);
  const hourly = sp?.hourly_rate;
  const reason = row.vano_match_reason ?? null;

  const matchUrl = `${SITE_URL}/ai-find/${row.id}`;
  const messageUrl = `${SITE_URL}/messages?with=${row.vano_match_user_id}`;
  const hireAgainUrl = `${SITE_URL}/hire`;

  // 4. Compose + send the email. Plain-text fallback for clients that
  //    hate HTML; the HTML version is the one most people see.
  const subjectName = name === 'Your VANO match' ? 'your match' : name;
  const subject = `Your VANO match: ${subjectName}`;

  const textParts = [
    `Here's your hand-picked freelancer for the brief you submitted:`,
    ``,
    name,
    hourly ? `From €${hourly}/hr` : null,
    reason ? `\nWhy we picked them: "${reason}"` : null,
    bio ? `\nAbout: ${bio}` : null,
    skills.length ? `\nSkills: ${skills.join(', ')}` : null,
    phone ? `\n📞 Call or text: ${phone}` : null,
    `\nMessage them on VANO: ${messageUrl}`,
    `Open their match page: ${matchUrl}`,
    ``,
    `Need a different freelancer? Run another AI Find for €1: ${hireAgainUrl}`,
    ``,
    `— VANO`,
  ].filter(Boolean) as string[];
  const text = textParts.join('\n');

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px;">
    <p style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#10b981;margin:0 0 8px;">VANO · AI Find · €1</p>
    <h1 style="font-size:22px;line-height:1.25;margin:0 0 16px;">Your perfect freelancer</h1>
    <p style="font-size:14px;line-height:1.55;color:#475569;margin:0 0 24px;">Here's your hand-picked match — keep this email for the contact details.</p>

    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:20px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        ${profile?.avatar_url ? `<img src="${escapeHtml(profile.avatar_url)}" alt="" width="56" height="56" style="border-radius:9999px;object-fit:cover;display:block;" />` : `<div style="width:56px;height:56px;border-radius:9999px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-weight:700;color:#475569;">${escapeHtml(name.charAt(0).toUpperCase())}</div>`}
        <div>
          <p style="margin:0;font-size:16px;font-weight:600;">${escapeHtml(name)}</p>
          ${hourly ? `<p style="margin:2px 0 0;font-size:12px;color:#64748b;">From €${escapeHtml(String(hourly))}/hr</p>` : ''}
        </div>
      </div>

      ${reason ? `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:10px 12px;margin-bottom:14px;"><p style="margin:0;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#b45309;">Why we picked them</p><p style="margin:4px 0 0;font-size:13px;font-style:italic;line-height:1.5;">"${escapeHtml(reason)}"</p></div>` : ''}

      ${bio ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#1e293b;">${escapeHtml(bio)}</p>` : ''}

      ${skills.length ? `<p style="margin:0 0 16px;font-size:12px;color:#475569;"><strong style="color:#0f172a;">Skills:</strong> ${escapeHtml(skills.join(', '))}</p>` : ''}

      ${phoneDigits ? `<a href="tel:${escapeHtml(phoneDigits)}" style="display:block;text-align:center;background:#10b981;color:#ffffff;font-weight:700;font-size:15px;padding:13px 16px;border-radius:12px;text-decoration:none;margin-bottom:8px;">📞 Call ${escapeHtml(phone || '')}</a>` : ''}
      ${phoneDigits ? `<a href="sms:${escapeHtml(phoneDigits)}" style="display:block;text-align:center;background:#ecfdf5;color:#047857;font-weight:600;font-size:14px;padding:11px 16px;border-radius:12px;text-decoration:none;border:1px solid #a7f3d0;margin-bottom:8px;">💬 Text ${escapeHtml(phone || '')}</a>` : ''}
      <a href="${escapeHtml(messageUrl)}" style="display:block;text-align:center;background:#f1f5f9;color:#0f172a;font-weight:600;font-size:14px;padding:11px 16px;border-radius:12px;text-decoration:none;">Message them on VANO</a>
    </div>

    <p style="font-size:12px;color:#64748b;line-height:1.6;margin:20px 0 8px;text-align:center;">Once you agree the work and rate, pay safely on VANO.</p>
    <p style="font-size:12px;color:#64748b;line-height:1.6;margin:0 0 24px;text-align:center;">Need a different freelancer? <a href="${escapeHtml(hireAgainUrl)}" style="color:#10b981;font-weight:600;text-decoration:none;">Run another AI Find for €1 →</a></p>

    <p style="font-size:11px;color:#94a3b8;text-align:center;margin:32px 0 0;">VANO · vanojobs.com</p>
  </div>
</body>
</html>`;

  const sendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [userData.email],
      subject,
      text,
      html,
    }),
  });

  if (!sendResp.ok) {
    const errText = await sendResp.text();
    console.error('[ai-find-email] Resend rejected', sendResp.status, errText);
    return res.status(502).json({ error: 'Email send failed' });
  }

  return res.status(200).json({ ok: true });
}
