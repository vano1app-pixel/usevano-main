import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SITE_ORIGIN_DEFAULT, getSiteOrigin, getAuthRedirectUrl, getCanonicalUrl } from '../siteUrl';

// siteUrl powers canonical tags, OG URLs, password-reset redirects, and
// the `redirectTo` on every Supabase auth flow. Supabase's allow-list
// is strict — if this drifts, sign-in and email-link return trips
// silently break. High-leverage, easy to test in isolation.

const ORIGINAL_ENV = { ...import.meta.env };
const ORIGINAL_LOCATION = window.location;

// Helper to swap window.location for a test — happy-dom lets us replace
// the getter directly. Restored in afterEach.
function setLocation(hostname: string, pathname = '/', search = '') {
  const origin = `https://${hostname}`;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { hostname, pathname, search, origin, href: `${origin}${pathname}${search}` },
  });
}

afterEach(() => {
  // Reset env overrides between tests. Assigning undefined here
  // stringifies to "undefined" under Vite's env handling, so we
  // restore with the original string or empty, never with a JS
  // undefined.
  (import.meta.env as Record<string, string | undefined>).VITE_SITE_URL =
    ORIGINAL_ENV.VITE_SITE_URL ?? '';
  (import.meta.env as Record<string, string | undefined>).VITE_AUTH_EMAIL_REDIRECT_URL =
    ORIGINAL_ENV.VITE_AUTH_EMAIL_REDIRECT_URL ?? '';
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: ORIGINAL_LOCATION,
  });
});

describe('SITE_ORIGIN_DEFAULT', () => {
  it('is the canonical apex', () => {
    expect(SITE_ORIGIN_DEFAULT).toBe('https://vanojobs.com');
  });
});

describe('getSiteOrigin', () => {
  beforeEach(() => {
    (import.meta.env as Record<string, string | undefined>).VITE_SITE_URL = '';
    (import.meta.env as Record<string, string | undefined>).VITE_AUTH_EMAIL_REDIRECT_URL = '';
  });

  it('returns env VITE_SITE_URL when set, stripping trailing slashes', () => {
    (import.meta.env as Record<string, string | undefined>).VITE_SITE_URL = 'https://vanojobs.com/';
    expect(getSiteOrigin()).toBe('https://vanojobs.com');
  });

  it('falls back to VITE_AUTH_EMAIL_REDIRECT_URL when VITE_SITE_URL is empty', () => {
    (import.meta.env as Record<string, string | undefined>).VITE_SITE_URL = '';
    (import.meta.env as Record<string, string | undefined>).VITE_AUTH_EMAIL_REDIRECT_URL = 'https://vanojobs.com';
    expect(getSiteOrigin()).toBe('https://vanojobs.com');
  });

  it('normalises www → apex (env)', () => {
    (import.meta.env as Record<string, string | undefined>).VITE_SITE_URL = 'https://www.vanojobs.com';
    expect(getSiteOrigin()).toBe('https://vanojobs.com');
  });

  it('upgrades http → https for the apex', () => {
    (import.meta.env as Record<string, string | undefined>).VITE_SITE_URL = 'http://vanojobs.com';
    expect(getSiteOrigin()).toBe('https://vanojobs.com');
  });

  it('uses localhost window.origin when running on localhost and no env is set', () => {
    setLocation('localhost', '/hire');
    expect(getSiteOrigin()).toBe('https://localhost');
  });

  it('uses canonical apex when running on vanojobs.com (ignores www)', () => {
    setLocation('www.vanojobs.com', '/hire');
    expect(getSiteOrigin()).toBe('https://vanojobs.com');
  });

  it('falls back to the canonical default when on an unknown host', () => {
    setLocation('preview-abc.vercel.app', '/');
    expect(getSiteOrigin()).toBe('https://vanojobs.com');
  });
});

describe('getAuthRedirectUrl', () => {
  beforeEach(() => {
    (import.meta.env as Record<string, string | undefined>).VITE_SITE_URL = '';
    (import.meta.env as Record<string, string | undefined>).VITE_AUTH_EMAIL_REDIRECT_URL = '';
  });

  it('mirrors getSiteOrigin', () => {
    (import.meta.env as Record<string, string | undefined>).VITE_SITE_URL = 'https://vanojobs.com';
    expect(getAuthRedirectUrl()).toBe(getSiteOrigin());
  });
});

describe('getCanonicalUrl', () => {
  beforeEach(() => {
    (import.meta.env as Record<string, string | undefined>).VITE_SITE_URL = '';
    (import.meta.env as Record<string, string | undefined>).VITE_AUTH_EMAIL_REDIRECT_URL = '';
  });

  it('combines the canonical origin with the current path + query', () => {
    setLocation('vanojobs.com', '/students/abc', '?ref=home');
    expect(getCanonicalUrl()).toBe('https://vanojobs.com/students/abc?ref=home');
  });

  it('normalises www.vanojobs.com to the apex', () => {
    setLocation('www.vanojobs.com', '/u/jane-doe');
    expect(getCanonicalUrl()).toBe('https://vanojobs.com/u/jane-doe');
  });

  it('preserves the path with an empty query string', () => {
    setLocation('vanojobs.com', '/hire');
    expect(getCanonicalUrl()).toBe('https://vanojobs.com/hire');
  });
});
