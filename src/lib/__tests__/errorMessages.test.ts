import { describe, it, expect } from 'vitest';
import { getUserFriendlyError } from '../errorMessages';

// getUserFriendlyError is the one safety net between Supabase / Stripe /
// Postgres raw errors and what a user actually sees in a toast. Regressions
// here leak implementation details (schema names, JWT fragments) or
// contradict user expectations. The codes + message matches are stable
// public contracts for Supabase Auth / PostgREST, so this test suite is
// worth anchoring.
describe('getUserFriendlyError', () => {
  it('maps postgres unique-violation code 23505 to the dedupe message', () => {
    expect(getUserFriendlyError({ code: '23505' })).toBe('This action has already been completed.');
  });

  it('maps the check-constraint code 23514', () => {
    expect(getUserFriendlyError({ code: '23514' })).toBe('Input does not meet the required constraints.');
  });

  it('maps RLS denial (42501) to a permission message', () => {
    expect(getUserFriendlyError({ code: '42501' })).toBe('You do not have permission to perform this action.');
  });

  it('rewrites Supabase "invalid login credentials"', () => {
    expect(getUserFriendlyError({ message: 'Invalid login credentials' })).toBe('Invalid email or password.');
  });

  it('rewrites "email not confirmed" to the verification nudge', () => {
    const out = getUserFriendlyError({ message: 'Email not confirmed' });
    expect(out).toMatch(/verify your email/i);
  });

  it('rewrites "user already registered" to a sign-in nudge', () => {
    expect(getUserFriendlyError({ message: 'User already registered' })).toMatch(/already exists/i);
  });

  it('catches rate-limit messages in multiple phrasings', () => {
    const phrasings = [
      'rate limit exceeded',
      'too many requests',
      'over_email_send_rate_limit',
      'email rate limit reached',
    ];
    for (const message of phrasings) {
      expect(getUserFriendlyError({ message })).toMatch(/Too many emails or attempts/);
    }
  });

  it('rewrites JWT / session errors to a re-sign-in prompt', () => {
    expect(getUserFriendlyError({ message: 'JWT expired' })).toBe('Your session expired. Please sign in again.');
  });

  it('handles a network error', () => {
    expect(getUserFriendlyError({ message: 'Failed to fetch' })).toBe('Connection problem. Check your internet and try again.');
  });

  it('falls back to a generic string on unknown shapes', () => {
    const out = getUserFriendlyError({});
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('is defensive against non-object inputs', () => {
    expect(typeof getUserFriendlyError(null)).toBe('string');
    expect(typeof getUserFriendlyError(undefined)).toBe('string');
    expect(typeof getUserFriendlyError('raw string')).toBe('string');
  });
});
