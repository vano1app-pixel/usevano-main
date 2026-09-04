import { describe, it, expect } from 'vitest';
import { peekJobRequest } from '../parseJobRequest';
import { searchCustomJobs } from '../customJobs';

// The live peek is pure + synchronous — it never calls the network. These lock
// the "ask only what's missing" behaviour and the keyword-trap fix.

describe('peekJobRequest — rooms ask, they never lock a job', () => {
  it('"help in the kitchen" → Kitchen room, asks how long + tools, stays General help', () => {
    const p = peekJobRequest('I want help in the kitchen');
    expect(p.tags).toContain('Kitchen');
    expect(p.jobKey).toBe('other');          // a bare room is not a job lock
    expect(p.multiSignal).toBe(false);
    expect(p.needsDuration).toBe(true);      // no hours said
    expect(p.needsTools).toBe(true);         // kitchen is kit-relevant
  });

  it('collapses both questions once a duration and the tools are heard', () => {
    const p = peekJobRequest('clean the kitchen for two hours, I have the products');
    expect(p.hours).toBe(2);
    expect(p.needsDuration).toBe(false);
    expect(p.needsTools).toBe(false);
  });
});

describe('peekJobRequest — multi-signal keeps General help', () => {
  it('"clean the kitchen and walk the dog" carries both, books General help', () => {
    const p = peekJobRequest('clean the kitchen and walk the dog');
    expect(p.tags).toEqual(expect.arrayContaining(['Kitchen', 'Dog']));
    expect(p.multiSignal).toBe(true);
    expect(p.jobKey).toBe('other');          // never drop one for the other
  });
});

describe('peekJobRequest — strong verbs lock one job', () => {
  it('"mow the lawn" → lawn mowing (one signal, Lawn is not double-counted)', () => {
    const p = peekJobRequest('mow the lawn');
    expect(p.jobKey).toBe('mowing');
    expect(p.multiSignal).toBe(false);
    expect(p.tags).not.toContain('Lawn');    // deduped under Lawn mowing
    expect(p.needsTools).toBe(true);
  });

  it('"shift a wardrobe upstairs" → furniture (upstairs is a qualifier, not a 2nd job)', () => {
    const p = peekJobRequest('help me shift a wardrobe upstairs');
    expect(p.jobKey).toBe('furniture');
    expect(p.multiSignal).toBe(false);
  });

  it('"walk the dog" → dog, no tools question', () => {
    const p = peekJobRequest('walk the dog');
    expect(p.jobKey).toBe('dog');
    expect(p.needsTools).toBe(false);
  });

  it('a wardrobe with no move verb does NOT lock furniture', () => {
    const p = peekJobRequest('paint the wardrobe');
    expect(p.jobKey).not.toBe('furniture');
  });
});

describe('keyword trap — a bare room noun no longer locks a specific clean/garden', () => {
  it('"the kitchen" does not match Oven & kitchen clean', () => {
    const top = searchCustomJobs('the kitchen', 5).filter((j) => j.key !== 'other');
    expect(top.some((j) => j.key === 'oven')).toBe(false);
  });

  it('"the garden" does not match Weeding & garden tidy', () => {
    const top = searchCustomJobs('the garden', 5).filter((j) => j.key !== 'other');
    expect(top.some((j) => j.key === 'weeding')).toBe(false);
  });

  it('but a real verb still lands the specific job', () => {
    expect(searchCustomJobs('degrease the oven', 3)[0].key).toBe('oven');
    expect(searchCustomJobs('do some gardening', 3)[0].key).toBe('weeding');
  });
});
