import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount every rendered component between tests so we don't leak
// DOM state + effect timers across test boundaries.
afterEach(() => {
  cleanup();
});

// Mock matchMedia — happy-dom doesn't implement it and several of our
// components (Landing, ErrorBoundary, ParticleBackground) read
// prefers-reduced-motion on mount. Default to "not matches" so the
// non-reduced-motion path renders in tests.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// IntersectionObserver stub — used by some UI primitives; happy-dom
// doesn't ship one. Always-visible default keeps lazy-rendered content
// mounted so tests can assert against it.
if (typeof window !== 'undefined' && !window.IntersectionObserver) {
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = '';
    thresholds: ReadonlyArray<number> = [];
  }
  (window as unknown as { IntersectionObserver: typeof MockIntersectionObserver }).IntersectionObserver = MockIntersectionObserver;
}
