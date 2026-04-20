import { describe, it, expect } from 'vitest';
import {
  HIRE_TIMELINES,
  HIRE_BUDGETS,
  budgetLabel,
  timelineLabel,
  DIRECT_HIRE_EXPIRY_HOURS,
} from '../hireOptions';

// Three call sites (HirePage, QuoteModal, HireNowModal) render these
// chip grids and rely on the id ↔ label mapping being round-trip-safe
// — a freelancer's in-app notification shows "Timeline: 2 weeks", not
// "Timeline: 2_weeks".

describe('HIRE_TIMELINES', () => {
  it('has the four documented timelines in order', () => {
    expect(HIRE_TIMELINES.map((t) => t.id)).toEqual([
      'this_week',
      '2_weeks',
      '1_month',
      'flexible',
    ]);
  });

  it('every timeline has a label + sub', () => {
    for (const t of HIRE_TIMELINES) {
      expect(typeof t.label).toBe('string');
      expect(t.label.length).toBeGreaterThan(0);
      expect(typeof t.sub).toBe('string');
      expect(t.sub.length).toBeGreaterThan(0);
    }
  });
});

describe('HIRE_BUDGETS', () => {
  it('has the five documented budget bands in order', () => {
    expect(HIRE_BUDGETS.map((b) => b.id)).toEqual([
      'under_100',
      '100_250',
      '250_500',
      '500_plus',
      'unsure',
    ]);
  });

  it('every band has a label + sub', () => {
    for (const b of HIRE_BUDGETS) {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.sub.length).toBeGreaterThan(0);
    }
  });

  it('labels contain € symbol for price bands (not the unsure band)', () => {
    // If someone accidentally swaps euros for dollars / pounds, catch it.
    for (const b of HIRE_BUDGETS) {
      if (b.id === 'unsure') continue;
      expect(b.label).toMatch(/€/);
    }
  });
});

describe('budgetLabel', () => {
  it('maps a known id to its label', () => {
    expect(budgetLabel('100_250')).toBe('€100–250');
    expect(budgetLabel('500_plus')).toBe('€500+');
  });

  it('returns null for unknown id', () => {
    expect(budgetLabel('nonsense')).toBeNull();
    expect(budgetLabel(null)).toBeNull();
    expect(budgetLabel(undefined)).toBeNull();
  });
});

describe('timelineLabel', () => {
  it('maps a known id to its label', () => {
    expect(timelineLabel('this_week')).toBe('This week');
    expect(timelineLabel('flexible')).toBe('Flexible');
  });

  it('returns null for unknown id', () => {
    expect(timelineLabel('yesterday')).toBeNull();
    expect(timelineLabel(null)).toBeNull();
    expect(timelineLabel(undefined)).toBeNull();
  });
});

describe('DIRECT_HIRE_EXPIRY_HOURS', () => {
  it('is the 2-hour window the HireNowModal promises', () => {
    // The urgency banner on HireNowModal and the DB-side expiry
    // cron both depend on this being 2. A change that only updates
    // one side would silently mis-lock freelancers.
    expect(DIRECT_HIRE_EXPIRY_HOURS).toBe(2);
  });
});
