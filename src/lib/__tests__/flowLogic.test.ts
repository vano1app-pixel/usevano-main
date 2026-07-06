import { describe, it, expect } from 'vitest';
import { helperPresenceTier, REASSURING_MIN } from '@/lib/helperPresence';
import { pendingWaitTier } from '@/lib/householdJob';
import { isValidPhone, normalizePhoneE164 } from '@/lib/validation';

// These three drive customer-facing copy that used to be inline ternaries with
// no coverage: the "helpers online" pill, the "finding your helper" wait state,
// and the booking-sheet phone tick. Lock the boundaries so a refactor can't
// quietly flip "Same-day help in Galway" back to a scary "2 helpers online".

describe('helperPresenceTier', () => {
  it('shows a skeleton until the count request settles, regardless of count', () => {
    expect(helperPresenceTier(0, false)).toBe('loading');
    expect(helperPresenceTier(99, false)).toBe('loading');
  });

  it('only quotes a real number once supply is genuinely reassuring', () => {
    expect(helperPresenceTier(REASSURING_MIN, true)).toBe('count');     // boundary: exactly 5
    expect(helperPresenceTier(REASSURING_MIN + 1, true)).toBe('count');
    expect(helperPresenceTier(12, true)).toBe('count');
  });

  it('uses an honest "available" signal for a thin-but-nonzero supply (1–4)', () => {
    expect(helperPresenceTier(1, true)).toBe('available');
    expect(helperPresenceTier(REASSURING_MIN - 1, true)).toBe('available'); // boundary: 4
  });

  it('falls back to the service signal at zero / unknown supply', () => {
    expect(helperPresenceTier(0, true)).toBe('service');
  });

  it('keeps REASSURING_MIN above the "feels thin" range', () => {
    expect(REASSURING_MIN).toBeGreaterThanOrEqual(5);
  });
});

describe('pendingWaitTier', () => {
  it('is "fresh" right after placing', () => {
    expect(pendingWaitTier(0)).toBe('fresh');
    expect(pendingWaitTier(2)).toBe('fresh');
  });

  it('escalates to "searching" between 3 and 10 minutes', () => {
    expect(pendingWaitTier(3)).toBe('searching');  // boundary: exactly 3
    expect(pendingWaitTier(9)).toBe('searching');
  });

  it('escalates to "team" at and past 10 minutes', () => {
    expect(pendingWaitTier(10)).toBe('team');       // boundary: exactly 10
    expect(pendingWaitTier(45)).toBe('team');
  });

  it('never under-reports for odd inputs (negative clamps to fresh)', () => {
    expect(pendingWaitTier(-5)).toBe('fresh');
  });
});

describe('isValidPhone', () => {
  it('accepts real Irish-style numbers, with or without spaces / +', () => {
    expect(isValidPhone('083 123 4567')).toBe(true);
    expect(isValidPhone('0831234567')).toBe(true);
    expect(isValidPhone('+353 89 981 7111')).toBe(true);
  });

  it('rejects empty, too-short, and non-numeric input', () => {
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone('   ')).toBe(false);
    expect(isValidPhone('12345')).toBe(false);   // 5 digits, under the 7 floor
    expect(isValidPhone('not a phone')).toBe(false);
  });

  it('rejects absurdly long input', () => {
    expect(isValidPhone('1'.repeat(20))).toBe(false);
  });

  it('tolerates a nullish value without throwing', () => {
    expect(isValidPhone(undefined as unknown as string)).toBe(false);
  });
});

// Must mirror the edge functions' normalizeIrishPhone exactly — every SMS /
// WhatsApp send (pay link, on-my-way, arrival) is keyed on this rule, so a
// number the sheet accepts but this rejects is a customer we can never text.
describe('normalizePhoneE164', () => {
  it('normalizes bare Irish mobiles to +353', () => {
    expect(normalizePhoneE164('083 123 4567')).toBe('+353831234567');
    expect(normalizePhoneE164('0891234567')).toBe('+353891234567');
    expect(normalizePhoneE164('89 123 4567')).toBe('+353891234567'); // dropped leading 0
  });

  it('passes through international E.164 with + or 00', () => {
    expect(normalizePhoneE164('+44 7911 123456')).toBe('+447911123456');
    expect(normalizePhoneE164('0044 7911 123456')).toBe('+447911123456');
    expect(normalizePhoneE164('+353 89 981 7111')).toBe('+353899817111');
  });

  it('strips separator punctuation the same way the server does', () => {
    expect(normalizePhoneE164('(083) 123-4567')).toBe('+353831234567');
  });

  it('rejects numbers we could never text', () => {
    expect(normalizePhoneE164('07911 123456')).toBe(null);  // UK mobile w/o country code
    expect(normalizePhoneE164('091 123456')).toBe(null);    // Galway landline
    expect(normalizePhoneE164('12345')).toBe(null);
    expect(normalizePhoneE164('')).toBe(null);
    expect(normalizePhoneE164('+1')).toBe(null);             // too short after +
  });
});
