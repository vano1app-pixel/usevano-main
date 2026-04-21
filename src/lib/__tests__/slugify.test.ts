import { describe, it, expect } from 'vitest';
import { nameToSlug } from '../slugify';

// nameToSlug is on the public-profile URL path (/u/:slug) and the
// sharecard download filename. Getting it wrong means broken profile
// share links or 404s — cheap to test, catastrophic to break silently.
describe('nameToSlug', () => {
  it('lowercases and hyphenates a basic name', () => {
    expect(nameToSlug('Jane Doe')).toBe('jane-doe');
  });

  it('strips accents (NFD → ASCII)', () => {
    expect(nameToSlug('Sinéad Ní Fhaoláin')).toBe('sinead-ni-fhaolain');
    expect(nameToSlug('François Dubois')).toBe('francois-dubois');
  });

  it('collapses runs of non-alphanumerics into a single hyphen', () => {
    expect(nameToSlug('Hello   World!!')).toBe('hello-world');
    expect(nameToSlug('a/b/c')).toBe('a-b-c');
  });

  it('trims leading and trailing hyphens', () => {
    expect(nameToSlug('  Jane Doe  ')).toBe('jane-doe');
    expect(nameToSlug('!!!Jane!!!')).toBe('jane');
  });

  it('preserves digits', () => {
    expect(nameToSlug('Studio 54')).toBe('studio-54');
  });

  it('returns empty string for input with no safe characters', () => {
    expect(nameToSlug('!!!')).toBe('');
    expect(nameToSlug('   ')).toBe('');
  });

  it('handles single-character names', () => {
    expect(nameToSlug('a')).toBe('a');
    expect(nameToSlug('!')).toBe('');
  });
});
