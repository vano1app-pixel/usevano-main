import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2, Copy, Share2, X } from 'lucide-react';

import { useToast } from '@/hooks/use-toast';

// Overlay shown right after a freelancer publishes their Quick-start
// listing. Fires confetti, surfaces the shareable profile URL, and
// gives them a copy button so they can paste it into Instagram bio /
// a TikTok pinned comment / wherever. The old flow just redirected
// silently — momentum gets lost at the one moment the user actually
// feels proud. This fixes that.

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

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="relative bg-gradient-to-br from-emerald-500 via-emerald-500 to-emerald-600 px-5 py-5 text-white">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white/90 hover:bg-white/30"
            aria-label="Close"
          >
            <X size={14} />
          </button>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} />
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/90">
              You're live on Vano
            </p>
          </div>
          <h2 className="mt-2 text-2xl font-bold leading-tight sm:text-[26px]">
            Your listing just went public.
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/85">
            Businesses can find, message, and hire you starting right now. Share the link below
            in your Instagram bio or wherever you hang out online to start pulling leads in.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Your public profile
            </p>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
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
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:brightness-110 active:scale-[0.98]"
          >
            <Share2 size={14} strokeWidth={2.5} />
            Share to Instagram / TikTok / anywhere
          </button>
          <button
            type="button"
            onClick={onClose}
            className="block w-full text-center text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Back to my profile
          </button>
        </div>
      </div>
    </div>
  );
}
