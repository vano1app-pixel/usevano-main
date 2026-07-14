import { describe, it, expect } from 'vitest';
import {
  VALID_CATEGORIES,
  computePriceCents,
  CATEGORY_LABELS,
  type Category,
} from '../../../supabase/functions/_shared/householdPricing';
import { screenRequestText } from '../../../supabase/functions/_shared/safetyScreen';

// July 2026 liability triage: two categories were RETIRED because the risk
// class doesn't belong on students —
//   'midnight-lift' → carrying passengers for reward needs an SPSV licence +
//                     hire-and-reward motor insurance (a personal policy is
//                     void for it);
//   'plumbing'      → trade work; the refusal copy promises customers our
//                     helpers are "not qualified tradespeople".
// These tests pin the retirement so a well-meaning re-add fails loudly, and
// pin the free-text safety screen that now catches the same requests when
// they arrive through the "Something else" box (web, WhatsApp and voice all
// funnel through the same checkout screen).

describe('retired categories stay retired', () => {
  it.each(['midnight-lift', 'plumbing'])('%s is not bookable', (slug) => {
    expect(VALID_CATEGORIES).not.toContain(slug);
    // Even if a stale client posts the old slug + size label, no price exists.
    expect(computePriceCents(slug as Category, '1 hour', '')).toBeNull();
    expect(computePriceCents(slug as Category, 'Nearby (under 3 km)', '')).toBeNull();
  });

  it.each(['midnight-lift', 'plumbing'])('%s keeps a display label for historical bookings', (slug) => {
    expect(CATEGORY_LABELS[slug]).toBeTruthy();
  });

  it('handyman survived the triage (kept, pending a Pro-insurance gate)', () => {
    expect(VALID_CATEGORIES).toContain('handyman');
  });
});

describe('free-text safety screen catches the retired risk classes', () => {
  it('blocks plumbing-style requests as trade work', () => {
    expect(screenRequestText('fix my leaking sink')).toBe('plumbing work');
    expect(screenRequestText('can you replace the tap in the bathroom')).toBe('plumbing work');
    expect(screenRequestText('blocked drain outside the house')).toBe('plumbing work');
    expect(screenRequestText('need a plumber for an hour')).toBe('plumbing work');
    expect(screenRequestText('burst pipe under the stairs')).toBe('plumbing work');
  });

  it('blocks lift/driving requests, including the old midnight-lift shape', () => {
    expect(screenRequestText('a lift home from town at 1am')).toBe('driving passengers');
    expect(screenRequestText('drive me home after the gig')).toBe('driving passengers');
    expect(screenRequestText('can you drive me to Salthill')).toBe('driving passengers');
    expect(screenRequestText('airport run on Friday')).toBe('driving passengers');
  });

  it('still passes legitimate neighbouring jobs (conservative by design)', () => {
    expect(screenRequestText("clean the kids' bedroom")).toBeNull();
    expect(screenRequestText('clean the sink and the bathroom')).toBeNull();
    expect(screenRequestText('scrub the shower screen and tiles')).toBeNull();
    expect(screenRequestText('help me lift a sofa upstairs')).toBeNull();
    expect(screenRequestText('run to the pharmacy for me')).toBeNull();
    expect(screenRequestText('deep clean the drains smell in the kitchen… actually just mop the floors')).toBeNull();
  });

  it('keeps blocking the original vetting/trade/height lines', () => {
    expect(screenRequestText('babysit on Saturday evening')).toBe('minding children');
    expect(screenRequestText('look after my elderly mother')).toBe('caring for a vulnerable person');
    expect(screenRequestText('rewire the socket in the kitchen')).toBe('qualified trade work');
    expect(screenRequestText('clear out the gutters')).toBe('working at height');
  });
});
