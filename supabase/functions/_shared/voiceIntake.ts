// Pure helpers for the phone voice agent (voice-agent-tools) — the same
// role _shared/waIntake.ts plays for WhatsApp, kept free of Deno/network
// APIs so vitest can exercise them directly.
//
// The voice agent (ElevenLabs) gathers the job in conversation and calls the
// quote_job / create_booking tools. These helpers turn what the LLM heard —
// a category guess and a rough number of hours — into the EXACT size_label
// the shared server price table prices, so the spoken quote is identical to
// what create-household-payment-checkout will charge. The agent can never
// set a price; it can only read out what quoteDraft returns.

import { computePriceCents, type Category } from './householdPricing.ts';
import { computeVanoFeeCents } from './vanoFees.ts';
import { WA_CATEGORIES, type WaCategory, keywordClassify, needsSize, euro } from './waIntake.ts';

export { euro };

/**
 * Resolve whatever the agent passed as a category into a real catalogue key.
 * Accepts an exact key, otherwise keyword-matches the free text (the job
 * description) — same offline matcher the WhatsApp door falls back to. Always
 * lands on a bookable key (worst case `custom`, the €18/hr catch-all).
 */
export function resolveCategory(categoryOrText: string | null | undefined, fallbackText?: string | null): WaCategory {
  const raw = (categoryOrText ?? '').trim().toLowerCase();
  if ((WA_CATEGORIES as readonly string[]).includes(raw)) return raw as WaCategory;
  const text = [categoryOrText, fallbackText].filter(Boolean).join(' ').trim();
  return text ? keywordClassify(text) : 'custom';
}

/**
 * Turn a spoken hours number into the exact price-table label. Clamps to the
 * priceable 1–8h range. Categories that aren't time-priced (laundry) return
 * '' (no duration needed); dog-walk only has 30-min / 1-hour options.
 */
export function sizeLabelFromHours(category: WaCategory, hours: number | null | undefined): string {
  if (!needsSize(category)) return '';
  if (category === 'dog-walk') {
    // Only two options; anything ≥1h books the hour walk, else the 30-min.
    return hours && hours >= 1 ? '1 hour' : '30 min';
  }
  let h = Math.round(Number(hours));
  if (!Number.isFinite(h) || h < 1) h = category === 'custom' ? 1 : 2; // sensible default
  if (h > 8) h = 8;
  return h === 1 ? '1 hour' : `${h} hours`;
}

export interface VoiceQuote {
  category: WaCategory;
  sizeLabel: string;
  priceCents: number;
  feeCents: number;
  totalCents: number;
  /** A sentence the agent reads out verbatim. */
  spoken: string;
}

/**
 * Quote a resolved job for the voice agent. Returns null when the combination
 * isn't priceable (the agent should re-ask the duration). The spoken line is
 * phrased for the ear, not the eye, and always states pay-after-accept.
 */
export function voiceQuote(category: WaCategory, sizeLabel: string): VoiceQuote | null {
  const priceCents = computePriceCents(category as Category, sizeLabel, '');
  if (!priceCents) return null;
  // DIRECT-PAY: the job price is paid to the helper directly (they keep 100%);
  // the card is charged ONLY the VANO booking fee (15%, min €4) — exactly what
  // checkout charges. totalCents stays price + fee for callers that compare it.
  const feeCents = computeVanoFeeCents(priceCents);
  const totalCents = priceCents + feeCents;
  const spoken =
    `That's ${euro(priceCents)} for the job, paid to your helper directly — they keep all of it. ` +
    `VANO's booking fee is ${euro(feeCents)}, and you only pay that after a verified helper accepts.`;
  return { category, sizeLabel, priceCents, feeCents, totalCents, spoken };
}
