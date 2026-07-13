import { describe, it, expect } from 'vitest';
import { getHouseholdPriceCents } from '../householdPricing';
// The server price table + WhatsApp intake helpers are deliberately pure
// TypeScript (no Deno APIs), so these tests import the REAL server modules —
// a live cross-check on top of the hardcoded contract in
// householdPayMath.test.ts. If checkout's price table and the frontend ever
// drift, this fails on the actual code, not a mirror of it.
import {
  computePriceCents,
  SERVICE_FEE_PCT,
  type Category,
} from '../../../supabase/functions/_shared/householdPricing';
import {
  WA_CATEGORIES,
  keywordClassify,
  needsSize,
  parseDurationReply,
  isYes,
  isNo,
  isAsapWhen,
  euro,
  quoteDraft,
} from '../../../supabase/functions/_shared/waIntake';

const HOUR_LABELS = ['1 hour', '2 hours', '3 hours', '4 hours', '5 hours', '6 hours', '7 hours', '8 hours'];

describe('server price table (shared module) matches the frontend canonical table', () => {
  it('prices every quick-book hourly combination identically', () => {
    for (const slug of ['cleaning', 'garden', 'moving', 'tutoring', 'custom'] as Category[]) {
      for (const size of HOUR_LABELS) {
        expect(computePriceCents(slug, size, ''), `${slug} / ${size}`)
          .toBe(getHouseholdPriceCents(slug, size));
      }
    }
  });

  it('prices the flat and short-visit combinations identically', () => {
    expect(computePriceCents('shopping', '', '')).toBe(getHouseholdPriceCents('shopping', ''));
    expect(computePriceCents('dog-walk', '30 min', '')).toBe(getHouseholdPriceCents('dog-walk', '30 min'));
    expect(computePriceCents('dog-walk', '1 hour', '')).toBe(getHouseholdPriceCents('dog-walk', '1 hour'));
    expect(computePriceCents('moving', '4+ hours', '')).toBe(getHouseholdPriceCents('moving', '4+ hours'));
    expect(computePriceCents('custom', '30 min', '')).toBe(getHouseholdPriceCents('custom', '30 min'));
    expect(computePriceCents('custom', '45 min', '')).toBe(getHouseholdPriceCents('custom', '45 min'));
  });
});

describe('WhatsApp quote = price + the same 7.5% service fee checkout charges', () => {
  it('quotes 2h cleaning as €36 + €2.70 = €38.70', () => {
    const q = quoteDraft('cleaning', '2 hours')!;
    expect(q.priceCents).toBe(3600);
    expect(q.feeCents).toBe(Math.round(3600 * SERVICE_FEE_PCT));
    expect(q.totalCents).toBe(3870);
    expect(q.line).toBe('€36 + €2.70 service fee = €38.70');
  });

  it('quotes flat laundry with no size answer', () => {
    expect(needsSize('shopping')).toBe(false);
    const q = quoteDraft('shopping', '')!;
    expect(q.priceCents).toBe(1500);
  });

  it('returns null for an unpriceable duration (caller re-asks)', () => {
    expect(quoteDraft('cleaning', 'not a duration')).toBeNull();
    expect(quoteDraft('dog-walk', '3 hours')).toBeNull();
  });
});

describe('offline keyword matcher (the Gemini fail-soft net)', () => {
  it('maps common Galway phrasings to the right category', () => {
    expect(keywordClassify('can someone clean my apartment')).toBe('cleaning');
    expect(keywordClassify('need the grass mowed this weekend')).toBe('garden');
    expect(keywordClassify('help moving a couch upstairs')).toBe('moving');
    expect(keywordClassify('leaving cert maths grinds for my son')).toBe('tutoring');
    expect(keywordClassify('anyone free to walk my dog at 5')).toBe('dog-walk');
    expect(keywordClassify('laundry collected and ironed please')).toBe('shopping');
  });

  it('falls back to custom (the €18/hr catch-all) for anything else', () => {
    expect(keywordClassify('assemble an ikea desk')).toBe('custom');
    expect(WA_CATEGORIES).toContain(keywordClassify('literally anything'));
  });
});

describe('duration reply parsing', () => {
  it('parses digits, words and unit variants into exact price-table labels', () => {
    expect(parseDurationReply('2', 'cleaning')).toBe('2 hours');
    expect(parseDurationReply('2 hours', 'cleaning')).toBe('2 hours');
    expect(parseDurationReply('two hrs', 'cleaning')).toBe('2 hours');
    expect(parseDurationReply('1', 'garden')).toBe('1 hour');
    expect(parseDurationReply('an hour', 'garden')).toBe('1 hour');
    expect(parseDurationReply('8 hours', 'moving')).toBe('8 hours');
  });

  it('supports the short custom visits and rejects out-of-range answers', () => {
    expect(parseDurationReply('30 min', 'custom')).toBe('30 min');
    expect(parseDurationReply('half an hour', 'custom')).toBe('30 min');
    expect(parseDurationReply('45 min', 'custom')).toBe('45 min');
    expect(parseDurationReply('30 min', 'cleaning')).toBeNull(); // short visits are custom-only
    expect(parseDurationReply('9 hours', 'cleaning')).toBeNull();
    expect(parseDurationReply('dunno', 'cleaning')).toBeNull();
  });

  it('parses the two dog-walk options', () => {
    expect(parseDurationReply('30 min', 'dog-walk')).toBe('30 min');
    expect(parseDurationReply('half hour is fine', 'dog-walk')).toBe('30 min');
    expect(parseDurationReply('1 hour', 'dog-walk')).toBe('1 hour');
    expect(parseDurationReply('the hour one', 'dog-walk')).toBe('1 hour');
  });

  it('every parsed label is actually priceable', () => {
    for (const cat of ['cleaning', 'garden', 'moving', 'tutoring', 'custom'] as const) {
      for (const reply of ['1', '3 hours', 'four hours']) {
        const label = parseDurationReply(reply, cat)!;
        expect(quoteDraft(cat, label), `${cat} / ${reply} → ${label}`).not.toBeNull();
      }
    }
  });
});

describe('confirmation + timing parsing', () => {
  it('recognises casual Irish yes/no', () => {
    for (const yes of ['yes', 'YES', 'yeah', 'grand', 'ok', 'sounds good', 'book it', 'go ahead']) {
      expect(isYes(yes), yes).toBe(true);
      expect(isNo(yes), yes).toBe(false);
    }
    for (const no of ['no', 'nah', 'not now', 'leave it']) {
      expect(isNo(no), no).toBe(true);
      expect(isYes(no), no).toBe(false);
    }
    expect(isYes('maybe')).toBe(false);
    expect(isNo('maybe')).toBe(false);
  });

  it('treats now-ish timing as ASAP and keeps stated preferences', () => {
    expect(isAsapWhen(null)).toBe(true);
    expect(isAsapWhen('now')).toBe(true);
    expect(isAsapWhen('ASAP')).toBe(true);
    expect(isAsapWhen('tomorrow morning')).toBe(false);
    expect(isAsapWhen('Saturday at 2')).toBe(false);
  });

  it('formats euros the way the messages read', () => {
    expect(euro(3600)).toBe('€36');
    expect(euro(270)).toBe('€2.70');
    expect(euro(1935)).toBe('€19.35');
  });
});
