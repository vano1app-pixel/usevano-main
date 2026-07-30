import { describe, expect, it } from 'vitest';
import { BLOG_POSTS } from '../../content/blog';
import { GLOSSARY_TERMS } from '../../content/glossary';
import { SERVICE_LANDINGS } from '../../content/services';
import {
  HOURLY_RATE_CENTS,
  LAUNDRY_BAG_CENTS,
  VANO_COVER_CENTS,
  VANO_FEE_BPS,
  VANO_FEE_MIN_CENTS,
  computeVanoFeeCents,
  getHouseholdPriceCents,
} from '../householdPricing';

// ── Why this file exists ─────────────────────────────────────────────────
// On 2026-07-30 the labour rate went €18 → €22/hr and the fee floor €4 → €5.
// Every headline in the content was updated… and every worked example under
// it was left doing the OLD arithmetic. The blog said "€22 an hour" and then
// "a typical 2-hour clean is €36" — which is 2 × €18. Four live posts quoted
// prices roughly 20% under what checkout actually charges, so a customer who
// read the price guide and then booked was quoted MORE at the till than the
// article promised. That is the worst direction for this error to run.
//
// Prose can't be fully parsed, but the shapes that carry money can be. These
// tests scrape the rendered content for the patterns that state a price and
// check each one against the REAL price table.

const LIVE_TEXT = [
  ...BLOG_POSTS.map((p) => `${p.title}\n${p.description}\n${p.summary}\n${p.bodyHtml}\n` +
    p.faqs.map((f) => `${f.q} ${f.a}`).join('\n')),
  ...GLOSSARY_TERMS.map((t) => `${t.term}\n${t.short}\n${t.bodyHtml}`),
  ...SERVICE_LANDINGS.map((s) => `${s.title}\n${s.description}\n${JSON.stringify(s)}`),
].join('\n\n');

/** Strip tags so "<strong>2 hours (€44)</strong>" reads as prose. */
const PLAIN = LIVE_TEXT.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const euros = (cents: number) => cents / 100;

describe('content prices — the blog can never quote a price we do not charge', () => {
  // The check that would have caught the original bug in one line: every
  // euro figure printed in a price guide must be one we can DERIVE from the
  // live tables — or a named competitor anchor. When the rate moved €18 → €22,
  // €36 / €54 / €72 / €90 / €108 all stopped being derivable and would have
  // failed here immediately, listed by name.
  it('every euro figure in a price guide is one the real tables can produce', () => {
    const rate = HOURLY_RATE_CENTS.cleaning;
    const derived = new Set<number>();
    const add = (c: number) => { derived.add(euros(c)); derived.add(euros(c + computeVanoFeeCents(c))); };
    for (let h = 1; h <= 8; h++) add(rate * h);                    // hourly totals + all-ins
    for (const s of Object.keys(LAUNDRY_BAG_CENTS)) add(getHouseholdPriceCents('shopping', s) as number);
    for (const s of ['30 min', '1 hour']) add(getHouseholdPriceCents('dog-walk', s) as number);
    derived.add(euros(VANO_FEE_MIN_CENTS));                        // the fee floor
    derived.add(euros(VANO_COVER_CENTS));                          // Vano Cover
    for (let h = 1; h <= 8; h++) derived.add(euros(computeVanoFeeCents(rate * h)));  // the fee itself

    // Figures that are deliberately NOT ours: what other people charge, the
    // legal wage floor, and the Cover payout ceiling. Each needs a reason.
    const ANCHORS = new Map<number, string>([
      [12, 'launderette service wash, low end'],
      [20, 'launderette service wash, high end / agency hourly, low end'],
      [25, 'professional dog walker, high end / agency hourly'],
      [30, 'agency cleaning hourly, high end'],
      [15, 'professional dog walker, low end'],
      [35, 'agency cleaning quote'],
      [150, 'dedicated end-of-tenancy firm, low end'],
      [300, 'dedicated end-of-tenancy firm, high end'],
      [250, 'Vano Cover payout ceiling'],
      [14.15, 'Ireland minimum wage 2026'],
      [50, 'agency call-out anchor'],
    ]);

    const GUIDES = ['cleaner-cost-galway', 'end-of-tenancy-cleaning-galway',
      'dog-walker-galway-cost', 'laundry-service-galway-cost', 'deep-clean-vs-standard-clean'];
    let seen = 0;
    for (const slug of GUIDES) {
      const post = BLOG_POSTS.find((p) => p.slug === slug);
      expect(post, `${slug} is a live price guide`).toBeDefined();
      const text = `${post!.title} ${post!.description} ${post!.summary} ${post!.bodyHtml} ` +
        post!.faqs.map((f) => `${f.q} ${f.a}`).join(' ');
      for (const m of text.replace(/<[^>]+>/g, ' ').matchAll(/€(\d+(?:\.\d+)?)/g)) {
        const v = Number(m[1]);
        seen++;
        expect(derived.has(v) || ANCHORS.has(v),
          `${slug}: €${v} is neither derivable from the price tables nor a named competitor anchor`)
          .toBe(true);
      }
    }
    expect(seen, 'the price guides still quote prices').toBeGreaterThan(20);
  });

  it('states the booking fee floor as the number we actually charge', () => {
    const floor = euros(VANO_FEE_MIN_CENTS);
    // Any "minimum €N" / "min €N" next to the fee must be the real floor.
    const claims = [...PLAIN.matchAll(/\bmin(?:imum)?\s*€(\d+)(?!\d)/g)].map((m) => Number(m[1]));
    expect(claims.length, 'the fee floor is quoted somewhere in the content').toBeGreaterThan(3);
    for (const c of claims) expect(c, `content says min €${c}, the fee floor is €${floor}`).toBe(floor);
    // And the fee's own sentences, built from the constants rather than
    // pattern-matched — "100% of the job price" (the helper's share) also
    // matches a naive percentage regex, which is how this test first
    // reported a phantom failure.
    const pct = VANO_FEE_BPS / 100;
    expect(PLAIN).toContain(`${pct}% of the job price, minimum €${floor}`);
    expect(PLAIN).toContain(`(${pct}%, min €${floor})`);
  });

  it('quotes the real dog-walk and laundry prices, which are not hourly', () => {
    const walk30 = getHouseholdPriceCents('dog-walk', '30 min') as number;
    const walk60 = getHouseholdPriceCents('dog-walk', '1 hour') as number;
    // The two figures always appear as a pair in the walking guide.
    const pairs = [...PLAIN.matchAll(/€(\d+) for (?:a )?30[- ]minutes?[^€]{0,30}€(\d+) for/g)];
    expect(pairs.length, 'the dog-walk price pair is stated').toBeGreaterThan(0);
    for (const m of pairs) {
      expect(Number(m[1])).toBe(euros(walk30));
      expect(Number(m[2]), 'the one-hour walk rose to €24 with the €22/hr labour rate').toBe(euros(walk60));
    }
    // Laundry is per bag, and the all-in figure must include the real fee.
    const bag = LAUNDRY_BAG_CENTS['1 bag'];
    expect(PLAIN, 'the flat one-bag price').toContain(`€${euros(bag)}`);
    const allIn = euros(bag + computeVanoFeeCents(bag));
    expect(PLAIN, `one bag all-in should read €${allIn}`).toContain(`€${allIn} all-in`);
  });

  it('never advertises a parked category as bookable', () => {
    // Moving, Business and Tutoring are parked (CLAUDE.md) — their machinery
    // survives for old links, but live content must not sell them. The parked
    // moving post and landing are excluded from these arrays already; this is
    // the tripwire for a stray mention creeping back into a LIVE page.
    const slugs = [...BLOG_POSTS.map((p) => p.slug), ...SERVICE_LANDINGS.map((s) => s.slug)];
    expect(slugs).not.toContain('moving-help-galway');
    for (const post of BLOG_POSTS) {
      expect(post.title.toLowerCase(), `${post.slug} title`).not.toMatch(/moving help|tutoring/);
    }
  });

  // The service landings emit an Offer with `fromPriceEuro` as its price —
  // that number is what Google prints in the rich result. It sat at €18 for a
  // week after the rate moved to €22, so search advertised a price the site
  // didn't sell, on the pages built to win exactly those searches.
  it('every service landing\'s schema price is the real from-price', () => {
    const expected: Record<string, number> = {
      cleaning:    euros(HOURLY_RATE_CENTS.cleaning),
      garden:      euros(HOURLY_RATE_CENTS.garden),
      'dog-walk':  euros(getHouseholdPriceCents('dog-walk', '30 min') as number),
      shopping:    euros(LAUNDRY_BAG_CENTS['1 bag']),
      moving:      euros(HOURLY_RATE_CENTS.moving),
    };
    for (const s of SERVICE_LANDINGS) {
      const want = expected[s.category];
      expect(want, `${s.slug}: no expected from-price for category "${s.category}"`).toBeDefined();
      expect(s.fromPriceEuro, `${s.slug} advertises €${s.fromPriceEuro} in its Offer schema`).toBe(want);
      // …and the human-readable label has to agree with the schema.
      expect(s.priceLabel, `${s.slug} priceLabel "${s.priceLabel}"`).toContain(`€${want}`);
    }
  });
});
