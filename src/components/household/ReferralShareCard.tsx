import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { loadBookingMemory } from '@/lib/bookingMemory';

interface ReferralInfo {
  code:           string;
  link:           string;
  credit_cents:   number;
  friends_joined: number;
}

const SHARE_TEXT = (link: string) =>
  `I use VANO for help around the house — cleaning, garden, shopping runs, all booked in a minute. This link gives you €5 off your first booking: ${link}`;

/**
 * Give €5, get €5. Renders only for people who have booked on this device
 * (we need their phone, kept in booking memory, to mint their code) — for
 * everyone else it's invisible, so it can sit on any page.
 *
 * `heading` lets the host page speak to the moment (e.g. "Loved Aoife's
 * work?" right after a five-star rating) without forking the card.
 */
export const ReferralShareCard: React.FC<{ className?: string; heading?: string; phone?: string | null }> = ({ className, heading, phone: phoneProp }) => {
  const [info,   setInfo]   = useState<ReferralInfo | null>(null);
  const [copied, setCopied] = useState(false);

  // A host page (e.g. Account) can pass its LIVE phone so the card re-fetches
  // when the user edits or clears their saved details — the old []-dep effect
  // snapshotted the phone once at mount, so after "Clear saved details" the
  // card kept showing the cleared number's code + "€5 ready" until a reload.
  // When no prop is given, fall back to booking memory at mount (standalone use).
  const phone = phoneProp !== undefined ? phoneProp : loadBookingMemory()?.phone ?? null;

  useEffect(() => {
    if (!phone) { setInfo(null); return; }
    let cancelled = false;
    supabase.functions
      .invoke<ReferralInfo>('get-referral-code', { body: { phone } })
      .then(({ data, error }) => {
        if (cancelled || error || !data?.code) return;
        setInfo(data);
      })
      .catch(() => { /* silent — the card simply doesn't render */ });
    return () => { cancelled = true; };
  }, [phone]);

  if (!phone || !info) return null;

  const creditEuros = Math.floor(info.credit_cents / 100);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(info!.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — the visible link can be selected */ }
  }

  function share() {
    const text = SHARE_TEXT(info!.link);
    if (navigator.share) {
      navigator.share({ title: 'VANO — €5 off your first booking', text, url: info!.link })
        .catch(() => { /* user cancelled */ });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-32px' }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-2xl border border-sage/30 bg-sage/6 p-5 ${className ?? ''}`}
    >
      <div className="flex items-start gap-3.5 mb-4">
        <span className="text-2xl leading-none flex-shrink-0" aria-hidden="true">🎁</span>
        <div>
          <p className="text-sm font-bold text-foreground">{heading ?? 'Give €5, get €5'}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Your friend gets €5 off their first booking — you get €5 off your next one,
            applied automatically.
          </p>
        </div>
      </div>

      {creditEuros > 0 && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-sage-dark bg-sage/10 border border-sage/25 rounded-xl px-3 py-2 mb-3">
          <Check className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.5} />
          You have €{creditEuros} ready — it comes off your next booking
        </p>
      )}

      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 rounded-xl bg-white border border-border px-3 py-2.5 text-xs font-mono text-foreground/80 truncate select-all">
          {info.link.replace(/^https?:\/\//, '')}
        </span>
        <button
          type="button"
          onClick={copyLink}
          className="w-10 h-10 rounded-xl border border-border bg-white flex items-center justify-center hover:bg-secondary/60 active:scale-95 transition-[background-color,transform] duration-150 flex-shrink-0"
          aria-label="Copy referral link"
        >
          {copied ? <Check className="w-4 h-4 text-sage" strokeWidth={2.5} /> : <Copy className="w-4 h-4 text-foreground/60" />}
        </button>
        <button
          type="button"
          onClick={share}
          className="h-10 px-4 rounded-xl bg-sage text-white text-sm font-semibold flex items-center gap-2 hover:opacity-90 active:scale-95 transition-[opacity,transform] duration-150 flex-shrink-0"
        >
          <MessageCircle className="w-4 h-4" />
          Share
        </button>
      </div>

      {info.friends_joined > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2.5 text-center">
          {info.friends_joined} friend{info.friends_joined === 1 ? '' : 's'} joined through your link so far
        </p>
      )}
    </motion.div>
  );
};
