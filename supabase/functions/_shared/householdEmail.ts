// Shared branded template + send helper for VANO household emails.
//
// Every customer-facing lifecycle email (accepted/pay, on-way, progress,
// reminders, no-helpers, cancelled, completed, rating) renders through
// renderHouseholdEmail() so the brand, spacing, footer and preheader are
// defined ONCE. The render path is pure (no Deno APIs) so it can also be
// executed in Node to generate previews.
//
// Layout notes (email-client realities, not style preferences):
// - A centered role="presentation" table, max-width 480 — divs with
//   margin:auto are ignored by Outlook's Word engine.
// - The CTA is a table-cell button (padding on the <td>, not the <a>) so it
//   stays a button in Outlook; border-radius degrades gracefully.
// - Hidden preheader div feeds the inbox preview line.
// - color-scheme meta keeps dark-mode clients from inverting the header.

export const LOGO_URL =
  'https://puomfwjtpvqedwxjxogh.supabase.co/storage/v1/object/public/email-assets/logo.png';

export const BRAND = {
  sage: '#4a7c59',
  sageDark: '#3d6749',
  slate: '#374151',
  ink: '#111827',
  body: '#374151',
  muted: '#4b5563',
  faint: '#6b7280', // footer text — keeps ≥4.5:1 on white
  cardBg: '#f6f8f6',
  cardBorder: '#d5e2d8',
  pageBg: '#f4f5f4',
  whatsapp: '#25d366',
} as const;

/** User-provided strings (names, notes, addresses) must pass through this
 *  before touching email HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** One label map for every email — no more raw slugs in subjects. */
export const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Laundry', 'grocery-shopping': 'Grocery shopping',
  'dog-walk': 'Dog walk', 'dog-walking': 'Dog walking',
  garden: 'Garden help', 'lawn-mowing': 'Lawn mowing',
  moving: 'Moving help', 'moving-help': 'Moving help',
  cleaning: 'Cleaning', 'outdoor-cleaning': 'Outdoor cleaning',
  tutoring: 'Tutoring', 'tutoring-grinds': 'Tutoring & grinds',
  'post-office': 'Post office run', 'pharmacy-run': 'Pharmacy run',
  'furniture-assembly': 'Furniture assembly', 'tech-help': 'Tech help',
  'wait-delivery': 'Wait for delivery', 'midnight-lift': 'Midnight Lift',
  handyman: 'Handyman', plumbing: 'Plumbing help',
  custom: 'Home help', other: 'General help',
};

export function categoryLabel(category: string | null | undefined): string {
  return CATEGORY_LABELS[String(category ?? '')] ?? 'booking';
}

/** Quick-book leaves customer_name as 'Guest' — never greet with that. */
export function greetName(rawName: string | null | undefined): string {
  const name = String(rawName ?? '').trim();
  return name && name !== 'Guest' ? name : 'there';
}

export interface EmailCta {
  label: string;
  url: string;
  /** 'primary' = filled sage, 'quiet' = outlined grey, 'whatsapp' = filled green */
  variant?: 'primary' | 'quiet' | 'whatsapp';
}

/** Table-cell button that survives Outlook. Safe to embed inside bodyHtml. */
export function emailButton(cta: EmailCta): string {
  const v = cta.variant ?? 'primary';
  const bg = v === 'whatsapp' ? BRAND.whatsapp : v === 'quiet' ? '#f3f4f6' : BRAND.sage;
  const fg = v === 'quiet' ? BRAND.slate : '#ffffff';
  const border = v === 'quiet' ? `border:1px solid #e5e7eb;` : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0;"><tr>
    <td style="background:${bg};${border}border-radius:100px;mso-padding-alt:13px 28px;">
      <a href="${cta.url}" style="display:inline-block;padding:13px 28px;color:${fg};font-size:14px;font-weight:700;text-decoration:none;border-radius:100px;">${cta.label}</a>
    </td></tr></table>`;
}

/** Light inner card for grouped content (helper card, pay box, code box). */
export function emailBox(innerHtml: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.cardBg};border:1px solid ${BRAND.cardBorder};border-radius:14px;margin:0 0 20px;"><tr><td style="padding:18px 20px;">${innerHtml}</td></tr></table>`;
}

export interface HouseholdEmailOpts {
  /** Inbox preview line — the hook, not "Hi there,". Plain text. */
  preheader: string;
  /** Small uppercase line above the heading, e.g. "Helper confirmed". */
  eyebrow?: string;
  /** Big white headline in the brand header. Pre-escape user content. */
  heading: string;
  /** Main content — paragraphs, emailBox()es, emailButton()s. */
  bodyHtml: string;
  /** Rendered as buttons after bodyHtml, first one primary by default. */
  ctas?: EmailCta[];
  /** Muted line under the buttons, e.g. "Ref: AB12CD34 · You haven't paid anything yet." */
  footerNote?: string;
  /** 'sage' (default) for good news, 'slate' for cancellations/bad news. */
  tone?: 'sage' | 'slate';
}

export function renderHouseholdEmail(o: HouseholdEmailOpts): string {
  const headerBg = o.tone === 'slate' ? BRAND.slate : BRAND.sage;
  const ctas = (o.ctas ?? []).map((cta, i) => {
    const withVariant = { variant: (i === 0 ? 'primary' : 'quiet') as EmailCta['variant'], ...cta };
    return `<tr><td style="padding-top:${i === 0 ? 4 : 10}px;">${emailButton(withVariant)}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(o.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.pageBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(o.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.pageBg};">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:${headerBg};padding:28px 32px 22px;">
          <img src="${LOGO_URL}" alt="VANO" width="36" height="36" style="border-radius:9px;display:block;margin:0 0 14px;" />
          ${o.eyebrow ? `<p style="margin:0 0 4px;color:rgba(255,255,255,0.72);font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;">${o.eyebrow}</p>` : ''}
          <p style="margin:0;color:#ffffff;font-size:22px;line-height:1.3;font-weight:700;">${o.heading}</p>
        </td></tr>
        <tr><td style="padding:26px 32px 28px;">
          ${o.bodyHtml}
          ${ctas ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 0;">${ctas}</table>` : ''}
          ${o.footerNote ? `<p style="margin:20px 0 0;color:${BRAND.faint};font-size:12px;line-height:1.6;">${o.footerNote}</p>` : ''}
        </td></tr>
        <tr><td style="padding:16px 32px 20px;border-top:1px solid #f0f1f0;">
          <p style="margin:0;color:${BRAND.faint};font-size:12px;line-height:1.6;">
            VANO · Same-day home help in Galway<br>
            Questions? <a href="https://wa.me/353899817111" style="color:${BRAND.sage};font-weight:600;text-decoration:none;">WhatsApp us</a> — we reply in minutes.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Standard paragraph, so body copy stays consistent across functions. */
export function emailP(html: string, opts?: { muted?: boolean; last?: boolean }): string {
  return `<p style="margin:0 0 ${opts?.last ? 20 : 14}px;color:${opts?.muted ? BRAND.muted : BRAND.body};font-size:15px;line-height:1.6;">${html}</p>`;
}

// ── Send via Resend ─────────────────────────────────────────────────────────
// Deno-only (reads env). The default from-address is the verified brand
// domain — the old per-function fallback was Resend's sandbox address, which
// bounces for unverified recipients the moment RESEND_FROM is unset.

// deno-lint-ignore no-explicit-any
declare const Deno: any;

export interface SendEmailOpts {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export async function sendHouseholdEmail(opts: SendEmailOpts): Promise<boolean> {
  const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
  if (!resendKey) return false;
  const from = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <noreply@vanojobs.com>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    if (!res.ok) console.warn('[householdEmail] Resend error', res.status, (await res.text()).slice(0, 300));
    return res.ok;
  } catch (e) {
    console.warn('[householdEmail] Resend exception', e);
    return false;
  }
}
