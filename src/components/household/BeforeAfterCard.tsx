import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Share2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { loadBookingMemory } from '@/lib/bookingMemory';

// The before/after reveal on the customer's tracking page — the shareable
// payoff of the helper's job photos. Sharing attaches the customer's €5
// referral link (same get-referral-code plumbing as ReferralShareCard), so
// the proudest moment of the booking is also the growth loop. Renders
// nothing until at least one photo exists.

interface Props {
  arrivalUrl: string | null;
  finishUrl: string | null;
  helperName?: string | null;
  completed?: boolean;
  className?: string;
}

export const BeforeAfterCard: React.FC<Props> = ({ arrivalUrl, finishUrl, helperName, completed, className }) => {
  const [referralLink, setReferralLink] = useState<string | null>(null);

  // Best-effort referral link for the share text — the card works without it.
  useEffect(() => {
    const phone = loadBookingMemory()?.phone ?? null;
    if (!phone) return;
    let cancelled = false;
    supabase.functions
      .invoke<{ code?: string; link?: string }>('get-referral-code', { body: { phone } })
      .then(({ data, error }) => {
        if (!cancelled && !error && data?.link) setReferralLink(data.link);
      })
      .catch(() => { /* silent — share falls back to the plain site link */ });
    return () => { cancelled = true; };
  }, []);

  if (!arrivalUrl && !finishUrl) return null;
  const both = !!(arrivalUrl && finishUrl);

  function share() {
    const link = referralLink ?? 'https://vanojobs.com';
    const text = referralLink
      ? `Look at the state of my place before vs after VANO ✨ ${helperName ? `${helperName} sorted it` : 'Booked in a minute'} — this link gets you €5 off your first booking: ${link}`
      : `Look at the state of my place before vs after VANO ✨ ${helperName ? `${helperName} sorted it.` : 'Booked in a minute.'} ${link}`;
    if (navigator.share) {
      navigator.share({ title: 'Before vs after — VANO', text, url: link }).catch(() => { /* user cancelled */ });
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
      className={`rounded-2xl border border-border/60 bg-white p-4 ${className ?? ''}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Camera size={15} className="text-sage flex-shrink-0" aria-hidden="true" />
        <p className="text-sm font-bold text-foreground">
          {both ? 'Before & after' : finishUrl ? 'The finished job' : 'Before the job'}
        </p>
      </div>
      <div className={both ? 'grid grid-cols-2 gap-2.5' : ''}>
        {arrivalUrl && (
          <figure className="relative m-0">
            <img src={arrivalUrl} alt="Before the job" loading="lazy" className="w-full aspect-[4/3] object-cover rounded-xl border border-border/50" />
            <figcaption className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-semibold">Before</figcaption>
          </figure>
        )}
        {finishUrl && (
          <figure className="relative m-0">
            <img src={finishUrl} alt="After the job" loading="lazy" className="w-full aspect-[4/3] object-cover rounded-xl border border-border/50" />
            <figcaption className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-semibold">After</figcaption>
          </figure>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2.5 leading-relaxed">
        Taken by {helperName || 'your helper'} — kept with your booking, and your proof of how things were left if you ever need it.
      </p>
      {completed && both && (
        <button
          type="button"
          onClick={share}
          className="mt-3 w-full h-10 rounded-full bg-navy text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] duration-150"
        >
          <Share2 size={14} />
          Share the reveal{referralLink ? ' — your friend gets €5 off' : ''}
        </button>
      )}
    </motion.div>
  );
};
