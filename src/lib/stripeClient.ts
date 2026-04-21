import { loadStripe, type Stripe } from '@stripe/stripe-js';

// Shared Stripe.js loader for client-side features that need to mount
// Stripe components (Embedded Checkout, Payment Element, etc).
//
// Publishable key is injected at build time via VITE_STRIPE_PUBLISHABLE_KEY.
// Set it in Vercel/your local .env alongside the existing VITE_SUPABASE_*
// pair. Never commit a real key; pk_test_... for dev, pk_live_... for
// prod. The value is public (that's the whole point of "publishable")
// so no secret hygiene required.
//
// loadStripe returns a Promise that resolves to a Stripe instance; we
// memoise it module-level so mounting multiple <EmbeddedCheckoutProvider>
// components in one session doesn't re-fetch Stripe.js.

let cached: Promise<Stripe | null> | null = null;

export function getStripePromise(): Promise<Stripe | null> {
  if (cached) return cached;
  const key = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined)?.trim();
  if (!key) {
    // Return a promise that resolves to null rather than throwing —
    // the caller falls back to the redirect flow when the publishable
    // key isn't set, so missing config degrades gracefully instead of
    // blocking the hire flow in production.
    cached = Promise.resolve(null);
    return cached;
  }
  cached = loadStripe(key);
  return cached;
}

/** Quick synchronous check the caller can use to skip the embedded
 *  path entirely when the publishable key isn't configured. Avoids
 *  an async load just to detect misconfiguration. */
export function hasStripePublishableKey(): boolean {
  const key = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined)?.trim();
  return !!key;
}
