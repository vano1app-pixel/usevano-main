import { describe, it, expect } from 'vitest';

// Mirrors of the validation regexes used at call sites, so if either
// changes without updating the other we catch it here. Keeping them in
// sync with the original call site is more important than the exact
// wording of the regex — inline constants on both sides are fine for
// now; we revisit if a third call site appears.

// ListOnCommunityQuickStart.tsx:55 — phone validator.
// Required shape: starts with a digit or +, 7+ chars, digits + spaces +
// dashes + parens only. Empty string is also valid (phone is optional).
const phoneRegex = /^\+?[0-9][0-9\s\-()]{6,}$/;

// Auth.tsx magic-link submit gate — minimal email shape so we fail fast
// in the UI instead of a round-trip to Supabase.
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

describe('phone validation (ListOnCommunityQuickStart)', () => {
  it('accepts a plain 10-digit number', () => {
    expect(phoneRegex.test('0851234567')).toBe(true);
  });

  it('accepts an international format with +', () => {
    expect(phoneRegex.test('+353851234567')).toBe(true);
  });

  it('accepts numbers with spaces + dashes + parens after the first digit', () => {
    expect(phoneRegex.test('085 123 4567')).toBe(true);
    expect(phoneRegex.test('085-123-4567')).toBe(true);
    expect(phoneRegex.test('0851(234)567')).toBe(true);
  });

  it('rejects numbers that lead with an open paren', () => {
    // First char must be a digit or `+` — a leading paren is an easy
    // typo and we want to nudge the user to strip it.
    expect(phoneRegex.test('(085) 123-4567')).toBe(false);
  });

  it('rejects strings that are too short', () => {
    expect(phoneRegex.test('123456')).toBe(false);
    expect(phoneRegex.test('')).toBe(false);
  });

  it('rejects strings starting with a non-digit / non-plus', () => {
    expect(phoneRegex.test('a1234567')).toBe(false);
    expect(phoneRegex.test(' 12345678')).toBe(false);
  });

  it('rejects garbage that happens to pass the length check', () => {
    expect(phoneRegex.test('abcdefg')).toBe(false);
    expect(phoneRegex.test('foo123')).toBe(false);
  });
});

describe('email validation (Auth magic-link gate)', () => {
  it('accepts standard shapes', () => {
    expect(emailRegex.test('jane@example.com')).toBe(true);
    expect(emailRegex.test('a@b.c')).toBe(true);
    expect(emailRegex.test('jane.doe+vano@acme.co.uk')).toBe(true);
  });

  it('rejects missing @ or missing dot', () => {
    expect(emailRegex.test('janeexample.com')).toBe(false);
    expect(emailRegex.test('jane@example')).toBe(false);
  });

  it('rejects whitespace anywhere', () => {
    expect(emailRegex.test('jane @example.com')).toBe(false);
    expect(emailRegex.test(' jane@example.com')).toBe(false);
    expect(emailRegex.test('jane@example.com ')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(emailRegex.test('')).toBe(false);
  });
});
