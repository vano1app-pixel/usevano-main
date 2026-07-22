import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Gift, ChevronRight } from 'lucide-react';

/**
 * A tappable entry into the referral hub — the "refer & earn" equivalent of the
 * "Helper account" row: one tap opens /refer, where the code sits up top and
 * the live stats sit under it. Kept as a compact banner (not the full
 * always-open dashboard) so the pages it lives on stay clean and the referral
 * hub is a deliberate destination.
 *
 * `prefillEmail` lets a page that already knows who the user is (a
 * phone-verified helper) hand their email through so the hub loads their code
 * and earnings instantly — no email box to fill.
 */
export const ReferralEntryCard: React.FC<{ prefillEmail?: string; className?: string }> = ({ prefillEmail, className }) => {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate('/refer', prefillEmail ? { state: { email: prefillEmail } } : undefined)}
      className={`group w-full text-left rounded-2xl border border-gold/30 bg-gold/[0.07] p-4 flex items-center gap-3.5 transition-[transform,box-shadow] duration-200 active:scale-[0.99] hover:shadow-tinted ${className ?? ''}`}
    >
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gold/20 text-navy" aria-hidden="true">
        <Gift className="w-5 h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-foreground">Refer &amp; earn 3%</span>
        <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">
          Your invite link, live earnings &amp; who's joined — tap to open.
        </span>
      </span>
      <ChevronRight className="w-5 h-5 text-muted-foreground/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted-foreground/70 flex-shrink-0" aria-hidden="true" />
    </button>
  );
};
