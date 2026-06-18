import { describe, it, expect } from 'vitest';
import { parseWhenText } from '../whenParse';

// Anchored to Monday 15 June 2026 so weekday maths is deterministic.
const MON = new Date(2026, 5, 15, 10, 0, 0);

describe('parseWhenText — days', () => {
  it('"today" / "now" / "asap" → today', () => {
    expect(parseWhenText('can you come today', MON)?.day).toBe('today');
    expect(parseWhenText('need someone right now', MON)?.day).toBe('today');
    expect(parseWhenText('asap please', MON)?.day).toBe('today');
  });

  it('"tomorrow" → tomorrow', () => {
    expect(parseWhenText('tomorrow if possible', MON)?.day).toBe('tomorrow');
  });

  it('a named weekday → pick, with the right future date', () => {
    const r = parseWhenText('cut the grass this saturday', MON);
    expect(r?.day).toBe('pick');
    expect(r?.date).toBe('2026-06-20'); // Mon 15th + 5 = Sat 20th
    expect(new Date(`${r?.date}T12:00:00`).getDay()).toBe(6);
  });

  it('"this weekend" → the coming Saturday', () => {
    expect(parseWhenText('sometime this weekend', MON)?.date).toBe('2026-06-20');
  });

  it('naming today’s own weekday resolves to today, not next week', () => {
    expect(parseWhenText('on monday', MON)?.day).toBe('today');
  });
});

describe('parseWhenText — dayparts', () => {
  it('reads morning / afternoon / evening', () => {
    expect(parseWhenText('tomorrow morning', MON)).toMatchObject({ day: 'tomorrow', daypart: 'Morning' });
    expect(parseWhenText('saturday afternoon', MON)).toMatchObject({ day: 'pick', daypart: 'Afternoon' });
    expect(parseWhenText('tomorrow evening', MON)).toMatchObject({ day: 'tomorrow', daypart: 'Evening' });
  });

  it('"tonight" → today evening', () => {
    expect(parseWhenText('tonight', MON)).toMatchObject({ day: 'today', daypart: 'Evening' });
  });

  it('a bare daypart implies today', () => {
    expect(parseWhenText('sometime in the afternoon', MON)).toMatchObject({ day: 'today', daypart: 'Afternoon' });
  });

  it('defaults to Afternoon when a day is named without a time', () => {
    expect(parseWhenText('this saturday', MON)?.daypart).toBe('Afternoon');
  });
});

describe('parseWhenText — no timing', () => {
  it('returns null when nothing time-like is present', () => {
    expect(parseWhenText('paint my spare bedroom', MON)).toBeNull();
    expect(parseWhenText('help me move a sofa', MON)).toBeNull();
  });

  it('does not false-match day names inside other words', () => {
    expect(parseWhenText('sort out my money and satisfy the landlord', MON)).toBeNull();
  });
});
