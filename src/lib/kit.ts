// Frontend mirror of supabase/functions/_shared/kit.ts — "we'll bring the
// mower" (2026-07-30). Read the server module for the reasoning; the short
// version is that the helper-side kit question and the customer-side
// equipment question had never been wired to each other, so a household with
// no mower simply could not buy mowing.
//
// The SERVER prices the kit and dispatch does the matching. Every number here
// is display-only, and src/lib/__tests__/kit.test.ts fails if the two modules
// ever disagree.

/** The one list a helper ticks — join form, post-verify boost screen and the
 *  account editor all render THIS, never a local copy. Slugs are stored in
 *  household_helpers.own_kit and matched by dispatch, so they are a data
 *  contract: rename one and every existing helper silently stops matching. */
export const HELPER_KIT_OPTIONS: Array<{ slug: string; emoji: string; label: string; hint?: string }> = [
  { slug: 'lawn-mower',        emoji: '🚜', label: 'Lawn mower',        hint: 'Mowing jobs pay extra' },
  { slug: 'power-washer',      emoji: '💦', label: 'Power washer',      hint: 'Power-washing jobs pay extra' },
  { slug: 'garden-tools',      emoji: '🧤', label: 'Garden tools',      hint: 'Shears, rake, gloves' },
  { slug: 'hoover',            emoji: '🧹', label: 'Hoover',            hint: 'Handy when a place has none' },
  { slug: 'cleaning-products', emoji: '🧴', label: 'Cleaning products', hint: 'Sprays, cloths' },
];

export const KIT_SLUGS = HELPER_KIT_OPTIONS.map((k) => k.slug);

/**
 * The CHARGEABLE subset: gear big enough that hauling it is real work, and
 * expensive enough that a household is genuinely better off not owning it.
 *
 * Deliberately short. Hand tools, a hoover and cleaning sprays are NOT here —
 * garden tools ride along free, and "no cleaning products" is already served
 * by the €8 supplies add-on. Adding a fee for something a student can carry in
 * a backpack would be charging for nothing.
 */
export const KIT_HIRE_CENTS: Record<string, number> = {
  'lawn-mower':   1000,
  'power-washer': 1200,
};

/** Only these can ever be sold as "we'll bring it". */
export const HIREABLE_KIT = Object.keys(KIT_HIRE_CENTS);

/**
 * Validate a client-supplied kit list: known hireable slugs only, deduped,
 * order-stable, capped. Anything unrecognised is DROPPED rather than
 * rejected — a stale client or the WhatsApp door must never 400 a booking
 * over gear, it just books without it (fail-soft, like everything here).
 */
export function normalizeKit(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const out: string[] = [];
  for (const item of list) {
    const slug = String(item ?? '').trim();
    if (HIREABLE_KIT.includes(slug) && !out.includes(slug)) out.push(slug);
    if (out.length >= HIREABLE_KIT.length) break;
  }
  return out;
}

/** What the household pays for the helper to bring the gear, in cents. */
export function kitHireCents(slugs: string[] | null | undefined): number {
  return (slugs ?? []).reduce((sum, s) => sum + (KIT_HIRE_CENTS[s] ?? 0), 0);
}

/** "Lawn mower" / "Lawn mower + power washer" — for notes and offers. */
export function kitLabel(slugs: string[] | null | undefined): string {
  const labels = (slugs ?? [])
    .map((s) => HELPER_KIT_OPTIONS.find((k) => k.slug === s)?.label)
    .filter(Boolean) as string[];
  if (!labels.length) return '';
  return labels.map((l, i) => (i === 0 ? l : l.toLowerCase())).join(' + ');
}

/**
 * Does this helper's own_kit cover everything the booking needs?
 *
 * Used by dispatch as a HARD filter: promising a mower and sending someone
 * without one is worse than never offering it. A helper with a null/absent
 * own_kit simply doesn't match a kit job — they still get every other job,
 * and the gap nudge invites them to tick the box.
 */
export function helperHasKit(ownKit: string[] | null | undefined, required: string[] | null | undefined): boolean {
  if (!required?.length) return true;
  const owned = ownKit ?? [];
  return required.every((r) => owned.includes(r));
}
