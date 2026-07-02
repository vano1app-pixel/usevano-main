import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, Share2, Users, Coins, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface PartnerInfo {
  code:           string;
  link:           string;
  commission_pct: number;
  signups:        number;
  jobs:           number;
  pending_cents:  number;
  paid_cents:     number;
  total_cents:    number;
}

const EMAIL_KEY = 'vano_partner_email';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function euros(cents: number): string {
  const v = cents / 100;
  return Number.isInteger(v) ? `€${v}` : `€${v.toFixed(2)}`;
}

// Written to be pasted straight into an Instagram story / WhatsApp group /
// TikTok bio — leads with what the FRIEND gets, so it actually converts.
const shareText = (link: string) =>
  `I earn money on VANO doing flexible student jobs around Galway — cleaning, dog walks, tutoring, moving. ` +
  `You pick your own hours and get paid straight to your bank. Join with my link 👇\n${link}`;

/**
 * "Invite friends & earn 5%" — the friend-referral card for helpers. Share
 * your link; when a friend joins and earns on VANO, you get 5% of everything
 * they earn for their first year — paid from VANO's cut, on top of (never out
 * of) the friend's full pay. Email keys the code; no login needed.
 */
export const PartnerProgramCard: React.FC<{ className?: string; prefillEmail?: string | null }> = ({ className, prefillEmail }) => {
  const [email,   setEmail]   = useState('');
  const [info,    setInfo]    = useState<PartnerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [copied,  setCopied]  = useState(false);

  async function load(addr: string) {
    setLoading(true); setError(null);
    const { data, error: err } = await supabase.functions
      .invoke<PartnerInfo>('partner-program', { body: { email: addr } });
    setLoading(false);
    if (err || !data?.code) { setError("Couldn't load your code — try again."); return; }
    setInfo(data);
    try { localStorage.setItem(EMAIL_KEY, addr); } catch { /* storage may be off */ }
  }

  // Auto-load from the signed-in helper's email, falling back to the email
  // this device used before.
  useEffect(() => {
    let saved = '';
    try { saved = localStorage.getItem(EMAIL_KEY) ?? ''; } catch { /* ignore */ }
    const candidate = (prefillEmail ?? '').trim().toLowerCase() || saved;
    if (candidate && EMAIL_RE.test(candidate)) { setEmail(candidate); void load(candidate); }
  }, [prefillEmail]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!EMAIL_RE.test(addr)) { setError('Enter a valid email.'); return; }
    void load(addr);
  }

  async function copyLink() {
    if (!info) return;
    try { await navigator.clipboard.writeText(info.link); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* clipboard blocked — link is selectable */ }
  }

  function share() {
    if (!info) return;
    const text = shareText(info.link);
    if (navigator.share) navigator.share({ title: 'Join me on VANO', text, url: info.link }).catch(() => {});
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-32px' }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-2xl border border-gold/30 bg-gold/[0.06] p-5 ${className ?? ''}`}
    >
      <div className="flex items-start gap-3.5 mb-4">
        <span className="text-2xl leading-none flex-shrink-0" aria-hidden="true">💸</span>
        <div>
          <p className="text-sm font-bold text-foreground">Invite friends, earn {info ? `${info.commission_pct}%` : '5%'} of what they earn</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Share your link on your story or group chat. When a friend joins and starts earning on VANO,
            you get {info ? `${info.commission_pct}%` : '5%'} of everything they earn for their <strong>first year</strong> —
            on top of their full pay, not out of it.
          </p>
        </div>
      </div>

      {!info ? (
        <form onSubmit={submit} className="flex gap-2">
          <input
            type="email" inputMode="email" autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
            placeholder="your@email.ie"
            className="flex-1 min-w-0 rounded-xl border border-border bg-white px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
          />
          <button
            type="submit" disabled={loading}
            className="btn-gold flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-navy disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Get my link'}
          </button>
        </form>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-xl bg-white border border-border px-3 py-2.5 text-center">
              <p className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70"><Users className="w-3 h-3" />Friends</p>
              <p className="text-lg font-extrabold text-foreground tabular-nums leading-tight mt-0.5">{info.signups}</p>
            </div>
            <div className="rounded-xl bg-white border border-border px-3 py-2.5 text-center">
              <p className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70"><Coins className="w-3 h-3" />Pending</p>
              <p className="text-lg font-extrabold text-foreground tabular-nums leading-tight mt-0.5">{euros(info.pending_cents)}</p>
            </div>
            <div className="rounded-xl bg-white border border-border px-3 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Paid</p>
              <p className="text-lg font-extrabold text-foreground tabular-nums leading-tight mt-0.5">{euros(info.paid_cents)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex-1 min-w-0 rounded-xl bg-white border border-border px-3 py-2.5 text-sm font-mono font-bold tracking-widest text-foreground text-center select-all">
              {info.code}
            </span>
            <button
              type="button" onClick={copyLink} aria-label="Copy referral link"
              className="w-10 h-10 rounded-xl border border-border bg-white flex items-center justify-center hover:bg-secondary/60 active:scale-95 transition-[background-color,transform] duration-150 flex-shrink-0"
            >
              {copied ? <Check className="w-4 h-4 text-sage" strokeWidth={2.5} /> : <Copy className="w-4 h-4 text-foreground/60" />}
            </button>
            <button
              type="button" onClick={share}
              className="h-10 px-4 rounded-xl btn-gold text-navy text-sm font-semibold flex items-center gap-2 active:scale-95 transition-transform duration-150 flex-shrink-0"
            >
              <Share2 className="w-4 h-4" />Share
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2.5 text-center break-all">
            {info.link.replace(/^https?:\/\//, '')}
          </p>
        </>
      )}

      {error && <p className="mt-2.5 text-xs text-destructive text-center">{error}</p>}
    </motion.div>
  );
};
