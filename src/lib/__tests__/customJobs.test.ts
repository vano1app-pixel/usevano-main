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
    ['cut the grass this saturday', 'mowing'],
    ['trim the hedges', 'hedge'],
    ['power wash the driveway', 'powerwash'],
    ['clear the gutters', 'gutters'],
    ['help load a van on saturday', 'vanhelp'],
    ['take a load of rubbish to the dump', 'tiprun'],
    ['mount my television', 'tvmount'],
    ['set up my tv', 'tvmount'],
    ['fix the broadband router', 'wifi'],
    ['walk my dog', 'dog'],
    ['feed the cat while away', 'petsit'],
    ['collect a prescription from the pharmacy', 'postrun'],
    ['wait in for a delivery', 'waitin'],
    ['a lift to the airport', 'lift'],
    // The big expansion — the long tail now has real homes, not "Something else"
    ['tile the kitchen splashback', 'tiling'],
    ['lay laminate flooring in the hall', 'flooring'],
    ['fit a new cat flap', 'catflap'],
    ['bleed the radiators', 'radiator'],
    ['replace a broken fence panel', 'fencing'],
    ['shampoo the living room carpet', 'carpetclean'],
    ['clean up after the builders', 'afterbuild'],
    ['turn around my airbnb between guests', 'airbnb'],
    ['cut back some overhanging branches', 'treework'],
    ['rake up the autumn leaves', 'leafclear'],
    ['lay new turf in the back garden', 'turfing'],
    ['water my plants while away', 'watering'],
    ['move a washing machine', 'whitegoods'],
    ['help move an upright piano', 'piano'],
    ['a full house clearance', 'houseclearance'],
    ['set up a security camera', 'cctv'],
    ['no signal on the tv aerial', 'tvaerial'],
    ['do my weekly grocery shop', 'groceries'],
    ['wash and valet the car', 'carwash'],
    ['drop bags to the charity shop', 'charityshop'],
    ['batch cook meals for the week', 'mealprep'],
    // Online tutoring (adults) — what survived the Garda-vetting cull
    ['online tutoring to upskill', 'tutoring'],
    ['online french conversation practice', 'languages'],
    ['online guitar lessons for a beginner', 'music'],
    ['learn python coding online', 'coding'],
    ['set up a market stall for the day', 'markethelp'],
    ['tidy and tend a family grave', 'gravetend'],
    ['take the dog to the vet', 'pettransport'],
    ['muck out and feed the horses', 'horses'],
    ['feed the hens and clean the coop', 'chickens'],
    ['deliver flyers around the estate', 'flyering'],
    ['serving staff for a function', 'eventstaff'],
  ];
  for (const [phrase, key] of exact) {
    it(`"${phrase}" → ${key}`, () => {
      expect(matchCustomJob(phrase)?.key).toBe(key);
    });
  }
});

describe('custom job recogniser — a single typo still finds the job', () => {
  // The whole point of the fuzzy pass: one fat-finger slip must not drop the
  // customer back to the generic "Something else".
  const typos: Array<[string, string]> = [
    ['need a tutuor online', 'tutoring'],
    ['painnt the spare room', 'painting'],
    ['cleen the whole house', 'clean'],
    ['gardenin out the back', 'weeding'],
  ];
  for (const [phrase, key] of typos) {
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
    ['do some gardening', 'Garden & outdoor'],
    ['french conversation practice', 'Online tutoring'],
    ['feed the cat and the fish', 'Pets'],
    ['hand out samples at an event', 'Business & events'],
  ];
  for (const [phrase, group] of byGroup) {
    it(`"${phrase}" → ${group}`, () => {
      expect(matchCustomJob(phrase)?.group).toBe(group);
    });
  }
});

describe('custom job recogniser — only true gibberish falls back to "Something else"', () => {
  // The catalogue is broad enough now that real-world phrasings should always
  // find a home; only meaningless input is expected to return null.
  for (const phrase of ['asdfghjkl', 'qwertyuiop', 'zzzz zzzz', 'xkcd qpwo']) {
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
