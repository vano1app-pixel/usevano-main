// Pure helpers for the WhatsApp door (whatsapp-inbound): the offline intent
// matcher, the reply parsers and the quote formatter. Everything here is
// deliberately free of Deno/network APIs so vitest can import it directly —
// src/lib/__tests__/homeMemoryWhatsapp.test.ts exercises these parsers, and
// the Gemini classifier in whatsapp-inbound fails soft onto keywordClassify
// exactly like parse-custom-job fails onto the CustomJobBuilder's matcher.

import { computePriceCents, SERVICE_FEE_PCT, type Category } from './householdPricing.ts';

/**
 * The categories bookable over WhatsApp — the quick-book sheet's set. `custom`
 * is the catch-all: any request that doesn't match still books at €18/hr with
 * the customer's own words as the note, exactly like "name any job" on the web.
 */
export const WA_CATEGORIES = ['cleaning', 'garden', 'moving', 'tutoring', 'dog-walk', 'shopping', 'custom'] as const;
export type WaCategory = typeof WA_CATEGORIES[number];

/** Catalogue the AI classifier is grounded on (key: what it covers). */
export const WA_CATALOGUE: Record<WaCategory, string> = {
  cleaning: 'Home cleaning (rooms, kitchen, bathroom, windows, deep clean)',
  garden:   'Garden help (lawn mowing, weeding, hedges, leaves, tidy-up)',
  moving:   'Moving & lifting help (boxes, furniture, van loading, tip run)',
  tutoring: 'Tutoring / grinds (school or college subjects)',
  'dog-walk': 'Dog walking',
  shopping: 'Laundry — collected, washed, returned folded',
  custom:   'Anything else around the home (flatpack, errands, odd jobs)',
};

/** Offline fallback matcher — order matters (most specific first). */
export function keywordClassify(text: string): WaCategory {
  const t = text.toLowerCase();
  if (/\b(tutor|grind|maths|math|physics|chemistry|french|irish|leaving cert|junior cert|exam|study)\b/.test(t)) return 'tutoring';
  if (/\b(dog|puppy|pup)\b/.test(t) && /\b(walk|walking|walked|stroll)\b/.test(t)) return 'dog-walk';
  if (/\b(laundry|ironing|iron|wash(ing)? (and|&) fold|clothes wash)\b/.test(t)) return 'shopping';
  if (/\b(garden|lawn|grass|mow|hedge|hedges|weed|weeds|weeding|leaves|power ?wash)\b/.test(t)) return 'garden';
  if (/\b(mov(e|ing)|lift(ing)?|couch|sofa|wardrobe|boxes|van|tip run|dump run|furniture (up|down)stairs)\b/.test(t)) return 'moving';
  if (/\b(clean|cleaning|hoover|vacuum|scrub|tidy|deep clean|spotless)\b/.test(t)) return 'cleaning';
  return 'custom';
}

/** Whether the category needs a duration answer before it can be priced. */
export function needsSize(category: WaCategory): boolean {
  return category !== 'shopping'; // laundry is the one flat-priced WA category
}

const HOUR_WORDS: Record<string, number> = {
  one: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
};

/**
 * Parse a duration reply ("2", "2 hours", "two hrs", "30 min") into the exact
 * size_label the price table prices. Short 30/45-min visits only exist for
 * `custom` (mirroring the web's short-visit floor); null = didn't understand.
 */
export function parseDurationReply(text: string, category: WaCategory): string | null {
  const t = text.trim().toLowerCase();
  if (category === 'dog-walk') {
    if (/\b(30|thirty|half)\b/.test(t)) return '30 min';
    if (/\b(1|one|an|60|hour)\b/.test(t)) return '1 hour';
    return null;
  }
  if (category === 'custom') {
    if (/\b(30|thirty)\s*min/.test(t) || /\bhalf (an )?hour\b/.test(t)) return '30 min';
    if (/\b(45|forty[- ]?five)\s*min/.test(t)) return '45 min';
  }
  let n: number | null = null;
  const digits = t.match(/\b(\d+)\s*(?:h|hr|hrs|hour|hours)?\b/);
  if (digits) n = Number(digits[1]);
  if (n === null) {
    const word = t.match(/\b(one|an|two|three|four|five|six|seven|eight)\b/);
    if (word) n = HOUR_WORDS[word[1]];
  }
  if (n === null || !Number.isInteger(n) || n < 1 || n > 8) return null;
  return n === 1 ? '1 hour' : `${n} hours`;
}

export function isYes(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[!.]+$/, '');
  return /^(y|yes|yeah|yep|ya|yup|sure|ok|okay|k|grand|sound|perfect|deal|confirm|book( it)?|go( ahead)?|do it|sounds good|👍|✅)$/.test(t)
    || /^(yes|yeah|ok|okay|grand)\b/.test(t);
}

export function isNo(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[!.]+$/, '');
  return /^(n|no|nope|nah|not now|cancel|stop|leave it|forget it|don'?t)$/.test(t) || /^(no|nah)\b/.test(t);
}

/** "Now"-ish timing (ASAP dispatch) vs a stated preference we pass through. */
export function isAsapWhen(text: string | null | undefined): boolean {
  if (!text) return true;
  return /^(now|asap|as soon as possible|today|any ?time|whenever|flexible)$/i.test(text.trim());
}

/** €-format: whole euros without decimals, otherwise 2 decimals. */
export function euro(cents: number): string {
  return cents % 100 === 0 ? `€${cents / 100}` : `€${(cents / 100).toFixed(2)}`;
}

export interface WaQuote {
  priceCents: number;
  feeCents: number;
  totalCents: number;
  line: string;
}

/**
 * Quote a WhatsApp draft with the SAME numbers checkout charges: the shared
 * price table + the 7.5% service fee. Returns null when the combination isn't
 * priceable (the caller should re-ask the duration). Any referral
 * discount is applied by checkout at booking time and can only make the real
 * charge LOWER than this quote — never higher.
 */
export function quoteDraft(category: WaCategory, sizeLabel: string): WaQuote | null {
  const priceCents = computePriceCents(category as Category, sizeLabel, '');
  if (!priceCents) return null;
  const feeCents = Math.round(priceCents * SERVICE_FEE_PCT);
  const totalCents = priceCents + feeCents;
  return {
    priceCents,
    feeCents,
    totalCents,
    line: `${euro(priceCents)} + ${euro(feeCents)} service fee = ${euro(totalCents)}`,
  };
}
