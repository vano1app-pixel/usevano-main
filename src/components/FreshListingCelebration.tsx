import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2, Copy, Share2, X, Banknote, ExternalLink, Loader2 } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Overlay shown right after a freelancer publishes their Quick-start
// listing. Fires confetti, surfaces the shareable profile URL, and
// gives them a copy button so they can paste it into Instagram bio /
// a TikTok pinned comment / wherever. The old flow just redirected
// silently — momentum gets lost at the one moment the user actually
// feels proud. This fixes that.
//
// This modal is also the one high-attention moment where we can get
// freelancers onto Vano Pay. Before, the payouts CTA was a passive
// blurb; now it's a direct button that kicks off Stripe Connect
// onboarding in the same window. Every freelancer who lands here has
// just had "I'm live" registered emotionally — the best conditions
// for completing the payout setup.

export function FreshListingCelebration({
  open,
  shareUrl,
  onClose,
}: {
  open: boolean;
  shareUrl: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [vanoPayLoading, setVanoPayLoading] = useState(false);

  // Confetti on mount. Two bursts from opposite sides — more celebratory
  // than a single straight-up volley and respects motion-safe check.
  useEffect(() => {
    if (!open) return;
    if (typeof window === 'undefined') return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    const duration = 600;
    const end = Date.now() + duration;
    const interval = window.setInterval(() => {
      confetti({
        particleCount: 22,
        spread: 60,
        angle: 60,
        origin: { x: 0, y: 0.6 },
      });
      confetti({
        particleCount: 22,
        spread: 60,
        angle: 120,
        origin: { x: 1, y: 0.6 },
      });
      if (Date.now() > end) window.clearInterval(interval);
    }, 180);
    return () => window.clearInterval(interval);
  }, [open]);

  // Lock background scroll while overlay is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      toast({
        title: "Couldn't copy",
        description: 'Long-press the link to copy it manually.',
        variant: 'destructive',
      });
    }
  };

  const shareNative = async () => {
    // navigator.share is mobile-first; falls back to copy if unsupported.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as unknown as { share: (data: ShareData) => Promise<void> }).share({
          title: 'My Vano listing',
          text: "I'm on Vano — drop me a message for work:",
          url: shareUrl,
        });
        return;
      } catch {
        /* user cancelled or share failed, fall through */
      }
    }
    void copyLink();
  };

  // Kicks off Stripe Connect Express onboarding in the current window.
  // Same edge function + same return URL as the VanoPaySetupCard on
  // /profile — on return they land back on /profile with
  // ?vano_pay_done=1 and the green "Active" state. Failure toasts and
  // leaves the modal open so the user can retry or dismiss.
  const startVanoPay = async () => {
    if (vanoPayLoading) return;
    setVanoPayLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-connect-link', {
        body: {},
      });
      if (error) throw error;
      const url = (data as { url?: string } | null)?.url;
      if (!url) throw new Error('No onboarding URL returned');
      window.location.href = url;
    } catch (err) {
      if (import.meta.env.DEV) console.error('[celebration] vano pay onboarding failed', err);
      const message = (err as { message?: string })?.message || '';
      toast({
        title: "Couldn't open Vano Pay setup",
        description: message.includes('Connect is not enabled')
          ? 'Platform owner: enable Stripe Connect in Stripe Dashboard → Connect.'
          : 'You can try again from your profile in a moment.',
        variant: 'destructive',
      });
      setVanoPayLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="relative w-full max-w-md overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]">
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-emerald-500 to-emerald-600 px-6 py-6 text-white">
          <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-white/15 blur-3xl" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white/90 transition hover:bg-white/25"
            aria-label="Close"
          >
            <X size={15} />
          </button>
          <div className="relative flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85">
            <CheckCircle2 size={13} />
            You're live on Vano
          </div>
          <h2 className="relative mt-3 text-[22px] font-semibold leading-[1.15] tracking-tight sm:text-[26px]">
            Your listing just went public.
          </h2>
          <p className="relative mt-2 max-w-[34ch] text-[13px] leading-relaxed text-white/85">
            Businesses can find, message, and hire you starting right now. Share the link below or wait for your first match to land.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Your public profile
            </p>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {shareUrl}
              </p>
              <button
                type="button"
                onClick={copyLink}
                className={[
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition',
                  copied
                    ? 'bg-emerald-500 text-white'
                    : 'bg-primary text-primary-foreground hover:brightness-110',
                ].join(' ')}
              >
                {copied ? (
                  <><CheckCircle2 size={11} strokeWidth={3} /> Copied</>
                ) : (
                  <><Copy size={11} strokeWidth={2.5} /> Copy</>
                )}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={shareNative}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-[13px] font-semibold text-foreground transition-all duration-150 hover:bg-muted active:scale-[0.99]"
          >
            <Share2 size={13} strokeWidth={2.5} />
            Share to Instagram / TikTok / anywhere
          </button>

          {/* ── Vano Pay activation — the real money moment ──
               Promoted from a passive blurb to the primary CTA. A
               freelancer who completes payouts here starts earning
               through the platform; one who doesn't leaves money on
               the table. Same edge function the profile card calls,
               same Stripe-hosted flow, same return URL — just moved
               five clicks closer to the publish-celebration high. */}
          <div className="overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card">
            <div className="space-y-3 p-4">
              <div className="flex items-start gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Banknote size={16} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold leading-tight text-foreground">
                    Get paid through Vano
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                    3-min Stripe setup. Clients get a Pay button in chat · funds land in your bank 1–2 days after release. 3% fee, no monthly charge.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={startVanoPay}
                disabled={vanoPayLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-[13.5px] font-bold text-primary-foreground shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.5)] transition-all duration-150 hover:-translate-y-[1px] hover:brightness-[1.05] active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {vanoPayLoading ? (
                  <><Loader2 size={14} className="animate-spin" /> Opening Stripe…</>
                ) : (
                  <>Turn on Vano Pay <ExternalLink size={13} strokeWidth={2.5} /></>
                )}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="block w-full text-center text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            I'll set up payments later
          </button>
        </div>
      </div>
    </div>
  );
}
