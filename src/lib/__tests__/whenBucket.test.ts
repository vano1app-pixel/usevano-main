import { describe, it, expect } from 'vitest';
import { whenBucketFromText } from '../whenBucket';

describe('whenBucketFromText', () => {
  it('hears now / tonight / today', () => {
    expect(whenBucketFromText('need the kitchen cleaned in Salthill in an hour')).toBe('asap');
    expect(whenBucketFromText('walk the dog tonight')).toBe('tonight');
    expect(whenBucketFromText('mow the lawn this afternoon')).toBe('today');
    expect(whenBucketFromText('help me move asap')).toBe('asap');
  });
  it('hands a dated request to the picker, and stays quiet otherwise', () => {
    expect(whenBucketFromText('clean the house on saturday', 'saturday')).toBe('scheduled');
    expect(whenBucketFromText('clean the house')).toBeNull();
  });
});
