// Who VANO legally IS — the single source of truth for trader identity.
//
// WHY THIS EXISTS (2026-07-30 legal audit): Irish/EU law requires a consumer
// to be able to tell who they are contracting with, before they are bound:
//   • European Communities (Directive 2000/31/EC) Regulations 2003 (SI 68/2003)
//     — the service provider's name, geographic address and contact details
//     must be "easily, directly and permanently accessible";
//   • EU (Consumer Information, Cancellation and Other Rights) Regulations
//     2013 (SI 484/2013) — the same identity information must be given before
//     a distance contract is concluded.
// Until this audit the site said only "VANO is operated from Galway, Ireland",
// which names no trader at all.
//
// HOW IT'S FILLED IN: everything below reads from Vite env vars (same pattern
// as src/lib/contact.ts), so the owner sets them in Vercel and redeploys — no
// code change, no PR, the moment the CRO business-name registration lands.
//
// THE HARD RULE — NEVER SHIP A PLACEHOLDER TO A CUSTOMER:
// a half-filled legal identity is worse than the honest short version, because
// an invented name/address/registration number on a consumer contract is a
// misrepresentation. So every field below is EMPTY until genuinely configured,
// and `hasTraderIdentity` gates the full block. Unconfigured ⇒ the surfaces
// render exactly what they render today ("operated from Galway, Ireland").

const env = (key: string): string =>
  ((import.meta.env[key as keyof ImportMetaEnv] as string | undefined) ?? '').trim();

/** 'sole_trader' until the owner incorporates; 'company' switches the wording
 *  (a registered company must show its company number + registered office). */
export const TRADER_ENTITY_TYPE: 'sole_trader' | 'company' =
  env('VITE_TRADER_ENTITY_TYPE') === 'company' ? 'company' : 'sole_trader';

/** The legal person behind VANO — the individual's full name while trading as
 *  a sole trader, or the registered company name once incorporated. */
export const TRADER_LEGAL_NAME = env('VITE_TRADER_LEGAL_NAME');

/** The trading/business name customers know. Always VANO. */
export const TRADER_BUSINESS_NAME = 'VANO';

/** Geographic address of the trader — required, and it must be a real address
 *  where the trader can be reached (not just "Galway"). */
export const TRADER_ADDRESS = env('VITE_TRADER_ADDRESS');

/** CRO Registered Business Name number (Form RBN1) — an individual trading
 *  under a name that is not their own surname must register it under the
 *  Registration of Business Names Act 1963. */
export const TRADER_RBN_NUMBER = env('VITE_TRADER_RBN_NUMBER');

/** CRO company number — only meaningful once TRADER_ENTITY_TYPE is 'company'. */
export const TRADER_COMPANY_NUMBER = env('VITE_TRADER_COMPANY_NUMBER');

/** Irish VAT number, if/when VAT-registered (below the threshold there is
 *  none — and showing a fake one would be far worse than showing nothing). */
export const TRADER_VAT_NUMBER = env('VITE_TRADER_VAT_NUMBER');

/**
 * True only when the MINIMUM legally-required identity is genuinely on file:
 * a named trader + a geographic address. Registration numbers are additive —
 * they render when present and are simply absent when not, which is honest
 * either way. Every legal surface gates its full identity block on this.
 */
export const hasTraderIdentity = (): boolean =>
  TRADER_LEGAL_NAME.length > 0 && TRADER_ADDRESS.length > 0;

/**
 * One-line trader description for compact surfaces (the footer).
 * Configured  → "VANO is a business name of Jane Doe, Galway, Ireland (RBN 123456)"
 * Unconfigured → "VANO · operated from Galway, Ireland" (today's honest text)
 */
export function traderIdentityLine(): string {
  if (!hasTraderIdentity()) return 'VANO · operated from Galway, Ireland';
  const bits: string[] = [];
  bits.push(
    TRADER_ENTITY_TYPE === 'company'
      ? `${TRADER_BUSINESS_NAME} is a trading name of ${TRADER_LEGAL_NAME}`
      : `${TRADER_BUSINESS_NAME} is a business name of ${TRADER_LEGAL_NAME}`,
  );
  bits.push(TRADER_ADDRESS);
  const regs: string[] = [];
  if (TRADER_ENTITY_TYPE === 'company' && TRADER_COMPANY_NUMBER) regs.push(`Company no. ${TRADER_COMPANY_NUMBER}`);
  if (TRADER_RBN_NUMBER) regs.push(`RBN ${TRADER_RBN_NUMBER}`);
  if (TRADER_VAT_NUMBER) regs.push(`VAT ${TRADER_VAT_NUMBER}`);
  return regs.length ? `${bits.join(', ')} · ${regs.join(' · ')}` : bits.join(', ');
}

/** Structured rows for the Terms "who we are" block. Empty when unconfigured. */
export function traderIdentityRows(): Array<{ label: string; value: string }> {
  if (!hasTraderIdentity()) return [];
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Trading name', value: TRADER_BUSINESS_NAME },
    {
      label: TRADER_ENTITY_TYPE === 'company' ? 'Registered company' : 'Trader',
      value: TRADER_LEGAL_NAME,
    },
    { label: TRADER_ENTITY_TYPE === 'company' ? 'Registered office' : 'Address', value: TRADER_ADDRESS },
  ];
  if (TRADER_ENTITY_TYPE === 'company' && TRADER_COMPANY_NUMBER) {
    rows.push({ label: 'Company number', value: TRADER_COMPANY_NUMBER });
  }
  if (TRADER_RBN_NUMBER) rows.push({ label: 'Business name reg. (CRO)', value: TRADER_RBN_NUMBER });
  if (TRADER_VAT_NUMBER) rows.push({ label: 'VAT number', value: TRADER_VAT_NUMBER });
  return rows;
}

// ── The 14-day right to cancel (distance contracts) ───────────────────────
// SI 484/2013 gives a consumer 14 days to cancel a distance service contract.
// It is LOST only where the service has been FULLY performed inside those 14
// days AND the consumer both (a) expressly requested it start immediately and
// (b) acknowledged they would lose the right once it was complete.
// VANO is same-day help, so almost every booking meets that description —
// which is exactly why the booking sheet must capture (a) + (b) at the point
// of sale, and why checkout stamps the acknowledgement onto the booking as
// evidence (booking_data.immediate_performance_consent).
export const COOLING_OFF_DAYS = 14;

/** The exact sentence shown above the Book button AND stored on the booking —
 *  keep the two identical so what was agreed is what is recorded. */
export const IMMEDIATE_PERFORMANCE_CONSENT_TEXT =
  'By booking you ask VANO to arrange your help straight away, and you accept that once the job is fully done you lose the 14-day cancellation right that normally applies to online bookings. You can still cancel free of charge any time before your helper starts.';
