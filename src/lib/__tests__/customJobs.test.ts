import { describe, it, expect } from 'vitest';
import { matchCustomJob, customJobByKey, CUSTOM_JOBS, POPULAR_CUSTOM_JOBS } from '../customJobs';
import { getHouseholdPriceCents } from '../householdPricing';

// The recogniser is the zero-cost "AI brain" behind the custom section. These
// tests are the contract that it actually understands the everyday jobs people
// type — painting, moving, cleaning and the long tail — and degrades to the
// "Something else" fallback for anything off the catalogue.

describe('custom job recogniser — clear phrasings map to the right job', () => {
  const exact: Array<[string, string]> = [
    ['paint my spare bedroom', 'painting'],
    ['the living room needs painting', 'painting'],
    ['build my ikea wardrobe', 'assembly'],
    ['flat pack a chest of drawers', 'assembly'],
    ['flat-pack assembly of a desk', 'assembly'],
    ['hang a mirror and some shelves', 'mounting'],
    ['dripping leaky tap in the kitchen', 'plumbing'],
    ['deep clean before guests arrive', 'deepclean'],
    ['end of tenancy clean for my deposit', 'tenancy'],
    ['degrease the oven and hob', 'oven'],
    ['mow the lawn', 'mowing'],
    ['cut the grass out the back', 'mowing'],
    ['trim the hedges', 'hedge'],
    ['power wash the driveway', 'powerwash'],
    ['clear the gutters', 'gutters'],
    ['help load a van on saturday', 'vanhelp'],
    ['take a load of rubbish to the dump', 'tiprun'],
    ['mount my television', 'tvmount'],
    ['fix the broadband router', 'wifi'],
    ['walk my dog', 'dog'],
    ['feed the cat while away', 'petsit'],
    ['collect a prescription from the pharmacy', 'postrun'],
    ['wait in for a delivery', 'waitin'],
    ['a lift to the airport', 'lift'],
  ];
  for (const [phrase, key] of exact) {
    it(`"${phrase}" → ${key}`, () => {
      expect(matchCustomJob(phrase)?.key).toBe(key);
    });
  }
});

describe('custom job recogniser — ambiguous wording lands in the right group', () => {
  const byGroup: Array<[string, string]> = [
    ['moving house this weekend', 'Moving & lifting'],
    ['help me shift a heavy sofa', 'Moving & lifting'],
    ['general tidy and hoover round', 'Cleaning'],
    ['set up smart bulbs and a doorbell', 'Tech & home'],
    ['paint and decorate the hallway', 'Home & repairs'],
  ];
  for (const [phrase, group] of byGroup) {
    it(`"${phrase}" → ${group}`, () => {
      expect(matchCustomJob(phrase)?.group).toBe(group);
    });
  }
});

describe('custom job recogniser — off-catalogue requests fall back to "Something else"', () => {
  for (const phrase of ['do my tax return', 'teach me the guitar', 'babysit the twins', 'asdfgh']) {
    it(`"${phrase}" is unrecognised`, () => {
      expect(matchCustomJob(phrase)).toBeNull();
    });
  }
});

describe('custom job catalogue integrity', () => {
  it('every job prices at the €18/hr time-based rate for its typical duration', () => {
    for (const job of CUSTOM_JOBS) {
      expect(getHouseholdPriceCents('custom', `${job.typicalHours} hours`)).toBe(1800 * job.typicalHours);
    }
  });

  it('keys are unique and the "other" fallback always resolves', () => {
    const keys = CUSTOM_JOBS.map((j) => j.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(customJobByKey('not-a-real-key').key).toBe('other');
    expect(customJobByKey(null).key).toBe('other');
  });

  it('every market comparison rate is strictly above VANO €18/hr, so the saving is real', () => {
    for (const job of CUSTOM_JOBS) {
      expect(job.marketHourlyCents).toBeGreaterThan(1800);
    }
  });

  it('popular jobs are a non-empty subset of the catalogue', () => {
    expect(POPULAR_CUSTOM_JOBS.length).toBeGreaterThanOrEqual(4);
    for (const j of POPULAR_CUSTOM_JOBS) expect(CUSTOM_JOBS).toContain(j);
  });
});
