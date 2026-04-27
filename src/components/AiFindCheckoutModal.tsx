import { useEffect, useMemo } from 'react';
import { X, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';
import { getStripePromise } from '@/lib/stripeClient';

// Inline Stripe Embedded Checkout for the €1 Vano Match purchase.
// Replaces the "redirect to Stripe, wait, redirect back" round-trip
// with an in-page modal so the hirer never leaves /hire.
//
// Behaviour:
//   1. Parent (HirePage) calls create-ai-find-checkout with
//      ui_mode='embedded' and gets back a client_secret.
//   2. Parent mounts this modal with that client_secret + a
//      fallback `url` (for the edge case where Stripe refuses to
//      render the iframe for some reason — we show a "Open in
//      new tab" link).
//   3. Stripe renders the checkout UI inside
//      <EmbeddedCheckoutProvider>. When the user pays, Stripe
//      automatically redirects the browser to the `return_url`
//      set by the edge function (`/ai-find/:id?session_id=...`).
//      The webhook flips ai_find_requests.status → 'paid' and
//      triggers ai-find-freelancer, same as the hosted flow.
//
// No new webhook logic; no new success/cancel routing; the
// existing polling screen on /ai-find/:id handles everything the
// moment Stripe redirects.

interface Props {
  open: boolean;
  onClose: () => void;
  /** Stripe Checkout Session client_secret from the edge function. */
  clientSecret: string | null;
  /** Fallback hosted-checkout URL in case the user wants to open
   *  Stripe in a new tab (accessibility, iframe blockers, etc). */
  fallbackUrl?: string | null;
}

export function AiFindCheckoutModal({ open, onClose, clientSecret, fallbackUrl }: Props) {
  const stripePromise = useMemo(() => getStripePromise(), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="relative flex h-[92dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[20px] border border-border bg-card shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] sm:h-auto sm:max-h-[92dvh] sm:rounded-[20px]">
        {/* Close lives in-corner without a heavy header border so
             Stripe's own branded header reads as the focal point. */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-card/90 text-muted-foreground shadow-sm backdrop-blur-sm transition hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* Brand header — tiny so Stripe's checkout owns the frame.
             States exactly what €1 buys + the refund promise so the
             user can decide without scrolling inside the iframe.
             Aligned with the AI-vs-human positioning on /hire. */}
        <div className="border-b border-border/60 bg-gradient-to-br from-primary/6 via-card to-card px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Sparkles size={13} strokeWidth={2.5} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                AI Match · €1
              </p>
              <p className="text-[11px] leading-tight text-muted-foreground">
                Our AI picks your freelancer in 20 seconds. Refunded if we can&apos;t find one.
              </p>
            </div>
            <div className="hidden shrink-0 items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/8 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 sm:inline-flex">
              <ShieldCheck size={10} strokeWidth={2.5} />
              Secure
            </div>
          </div>
          {/* What the €1 actually buys — small breakdown so the user
               doesn't perceive a hidden second charge. The €1 is the
               only platform fee for the match itself; the hire amount
               (handled separately via Vano Pay) has its own fee
               disclosed in that modal (4% from each side). */}
          <ul className="mt-2.5 ml-9 space-y-0.5 text-[10.5px] leading-snug text-muted-foreground/90">
            <li>· €1 covers the AI match + a verified contact</li>
            <li>· Agree a rate directly — pay outside Vano or use Vano Pay (4% each side, held in escrow)</li>
            <li>· Auto-refund if we don&apos;t find a fit</li>
          </ul>
        </div>

        {/* Stripe mount point. The iframe Stripe injects has a min
             height we can't easily control from out here, so we give
             it a flex-1 container and let it fill. On very short
             viewports Stripe handles its own internal scroll. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
          {clientSecret ? (
            <EmbeddedCheckoutProvider
              stripe={stripePromise}
              options={{ clientSecret }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 size={18} className="animate-spin" />
              <p className="text-sm">Starting secure checkout…</p>
              {fallbackUrl && (
                <a
                  href={fallbackUrl}
                  className="mt-3 text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  Or open in a new tab →
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
