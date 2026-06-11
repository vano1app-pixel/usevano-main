import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QUICK_BOOK_CATEGORIES,
  QUICK_BOOK_DEFAULT_SIZE,
  quickBookPriceCents,
  serviceFeeCents,
  totalWithFeeCents,
  fmtEuro,
} from '../householdPricing';

// The quick-book sheet shows a price, then create-household-payment-checkout
// recomputes it server-side for Stripe. If the two tables drift, customers
// either get charged a different amount than the sheet promised, or the
// booking is rejected outright ("No price available") after they've filled
// in the whole form. This suite pins every offered option to a price on
// BOTH sides by parsing the edge function source.

const here = dirname(fileURLToPath(import.meta.url));
const edgeFnSrc = readFileSync(
  resolve(here, '../../../supabase/functions/create-household-payment-checkout/index.ts'),
  'utf8',
);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The body of the `if (category === '<slug>' …)` branch in the edge function. */
function serverBranch(slug: string): string {
  const segments = edgeFnSrc.split('if (category ===');
  const seg = segments.find((s) => s.trimStart().startsWith(`'${slug}'`));
  if (!seg) throw new Error(`No pricing branch for '${slug}' in create-household-payment-checkout`);
  // Tutoring's branch also contains an hours-multiplier map ('1 hour': 1);
  // the plain hour labels the quick-book sheet sends are priced in hourMap.
  if (slug === 'tutoring') return seg.slice(seg.indexOf('hourMap'));
  return seg;
}

function serverPriceCents(slug: string, sizeLabel: string): number | null {
  // Shopping is priced in the `flat` table before the per-category branches.
  const haystack = slug === 'shopping' ? edgeFnSrc : serverBranch(slug);
  const m = haystack.match(new RegExp(`'${escapeRegex(sizeLabel || slug)}':\\s*(\\d+)`));
  return m ? Number(m[1]) : null;
}

describe('quick-book pricing client/server agreement', () => {
  for (const cat of QUICK_BOOK_CATEGORIES) {
    const sizes = cat.sizes ?? [QUICK_BOOK_DEFAULT_SIZE[cat.slug] ?? ''];
    for (const size of sizes) {
      it(`${cat.slug} · "${size || 'flat'}" has the same price in the sheet and at Stripe`, () => {
        const client = quickBookPriceCents(cat.slug, size);
        expect(client, 'sheet must show a price for every offered option').not.toBeNull();
        const server = serverPriceCents(cat.slug, size);
        expect(server, 'server must price every option the sheet offers').not.toBeNull();
        expect(client).toBe(server);
      });
    }
  }

  it('prices every smart-default size (what the card shows before tapping)', () => {
    for (const cat of QUICK_BOOK_CATEGORIES) {
      expect(
        quickBookPriceCents(cat.slug, QUICK_BOOK_DEFAULT_SIZE[cat.slug]),
        `default size for ${cat.slug}`,
      ).not.toBeNull();
    }
  });
});

describe('service fee display math', () => {
  it('matches the server formula: fee = round(base × 7.5%), total = base + fee', () => {
    expect(serviceFeeCents(3200)).toBe(240);
    expect(totalWithFeeCents(3200)).toBe(3440);
    expect(serviceFeeCents(1500)).toBe(113); // 112.5 rounds up
    expect(totalWithFeeCents(1500)).toBe(1613);
  });

  it('the 7.5% rate in the edge function matches SERVICE_FEE_PCT here', () => {
    expect(edgeFnSrc).toMatch(/SERVICE_FEE_PCT\s*=\s*0\.075/);
  });

  it('formats whole euros without decimals and cents with two', () => {
    expect(fmtEuro(3200)).toBe('€32');
    expect(fmtEuro(3440)).toBe('€34.40');
    expect(fmtEuro(1613)).toBe('€16.13');
  });
});
