import { describe, it, expect } from 'vitest';
import { getHouseholdPriceCents } from '../householdPricing';
// The voice agent's intake helpers are pure TS (no Deno APIs), so we import
// the REAL server modules and check that a spoken quote resolves to the exact
// same price create-household-payment-checkout would charge. The agent can
// never set a price — this proves the tool it calls can't drift from checkout.
import {
  resolveCategory,
  sizeLabelFromHours,
  voiceQuote,
} from '../../../supabase/functions/_shared/voiceIntake';
import { SERVICE_FEE_PCT } from '../../../supabase/functions/_shared/householdPricing';

describe('voice category resolution', () => {
  it('accepts an exact catalogue key', () => {
    expect(resolveCategory('cleaning')).toBe('cleaning');
    expect(resolveCategory('dog-walk')).toBe('dog-walk');
  });

  it('keyword-matches free speech the LLM passed through', () => {
    expect(resolveCategory('the grass needs mowing')).toBe('garden');
    expect(resolveCategory('help lifting a wardrobe')).toBe('moving');
    expect(resolveCategory('maths grinds')).toBe('tutoring');
  });

  it('falls back to custom for anything unmatched', () => {
    expect(resolveCategory('', 'hang some pictures on the wall')).toBe('custom');
    expect(resolveCategory('random nonsense zzz')).toBe('custom');
  });
});

describe('spoken hours → exact price-table label', () => {
  it('maps whole hours to the labels the price table prices', () => {
    expect(sizeLabelFromHours('cleaning', 2)).toBe('2 hours');
    expect(sizeLabelFromHours('cleaning', 1)).toBe('1 hour');
    expect(sizeLabelFromHours('garden', 8)).toBe('8 hours');
  });

  it('clamps out-of-range hours into the priceable window', () => {
    expect(sizeLabelFromHours('cleaning', 99)).toBe('8 hours');
    expect(sizeLabelFromHours('cleaning', 0)).toBe('2 hours');   // default
    expect(sizeLabelFromHours('custom', null)).toBe('1 hour');   // custom default
  });

  it('handles the non-hourly categories', () => {
    expect(sizeLabelFromHours('shopping', 3)).toBe('');          // flat laundry
    expect(sizeLabelFromHours('dog-walk', 2)).toBe('1 hour');
    expect(sizeLabelFromHours('dog-walk', 0)).toBe('30 min');
  });
});

describe('voiceQuote = the exact charge, never invented', () => {
  it('prices a resolved job identically to the frontend canonical table', () => {
    for (const [cat, hours] of [['cleaning', 2], ['garden', 3], ['moving', 4], ['tutoring', 1]] as const) {
      const size = sizeLabelFromHours(cat, hours);
      const q = voiceQuote(cat, size)!;
      expect(q.priceCents, `${cat} ${hours}h`).toBe(getHouseholdPriceCents(cat, size));
      expect(q.feeCents).toBe(Math.round(q.priceCents * SERVICE_FEE_PCT));
      expect(q.totalCents).toBe(q.priceCents + q.feeCents);
    }
  });

  it('speaks the price with the pay-after-accept promise', () => {
    const q = voiceQuote('cleaning', '2 hours')!;
    expect(q.spoken).toContain('€36');
    expect(q.spoken).toContain('€2.70');
    expect(q.spoken).toContain('€38.70');
    expect(q.spoken.toLowerCase()).toContain('after a verified helper accepts');
  });

  it('returns null for an unpriceable combination (agent re-asks)', () => {
    expect(voiceQuote('cleaning', 'gibberish')).toBeNull();
  });

  it('an end-to-end resolve→size→quote is always priceable for real requests', () => {
    for (const speech of ['clean my house', 'mow the lawn', 'move a couch', 'walk the dog', 'do my laundry']) {
      const cat = resolveCategory(speech);
      const size = sizeLabelFromHours(cat, 2);
      expect(voiceQuote(cat, size), speech).not.toBeNull();
    }
  });
});
