import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, Share2, Users, Coins, Eye, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface CommissionEvent {
  amount_cents: number;
  status:       string;
  created_at:   string;
  helper_name:  string | null;
  category:     string | null;
}

interface PartnerInfo {
  code:              string;
  link:              string;
  commission_pct:    number;
  signups:           number;
  jobs:              number;
  pending_cents:     number;
  paid_cents:        number;
  total_cents:       number;
  // Tracker extras — optional so an older cached function response can never
  // crash the card.
  link_opens?:       number;
  this_month_cents?: number;
  active_helpers?:   number;
  recent?:           CommissionEvent[];
}

const EMAIL_KEY = 'vano_partner_email';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same category → emoji/label language as the live-activity ticker.
const CAT_EMOJI: Record<string, string> = {
  business: '💼', cleaning: '🧹', shopping: '🧺', 'dog-walk': '🐾', garden: '🌿',
  moving: '📦', tutoring: '📚', custom: '✨',
};
const CAT_LABEL: Record<string, string> = {
  business: 'Business temp staff', cleaning: 'Cleaning', shopping: 'Laundry', 'dog-walk': 'Pet care',
  garden: 'Garden', moving: 'Moving', tutoring: 'Tutoring', custom: 'Custom job',
};

function euros(cents: number): string {
  const v = cents / 100;
  return Number.isInteger(v) ? `€${v}` : `€${v.toFixed(2)}`;
}

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

const shareText = (link: string) =>
  `Earn money with VANO — sign up to do flexible student jobs (cleaning, dog walks, tutoring & more) in minutes. Use my link: ${link}`;

/**
 * "Refer students & earn" — the self-serve partner dashboard for anyone
 * recruiting helpers (a union, a society, or a helper bringing friends in).
 * Enter an email once, get a shareable code; when a student signs up with it
 * and completes paid jobs, you earn a commission (default 3% of the job, out of
 * VANO's cut — the student's pay is untouched) for the student's FIRST YEAR
 * (12 months from signup — enforced by the accrual triggers). No login: codes
 * aren't secrets, and the email just keys your earnings.
 *
 * Layout when loaded: the CODE + share sits at the very top (it's the thing to
 * grab), then the money earned, then a funnel of stats (opens → joined → jobs)
 * and the live earnings feed. `initialEmail` lets a known user (e.g. a
 * phone-verified helper) skip the email box entirely.
 */
export const PartnerProgramCard: React.FC<{ className?: string; initialEmail?: string }> = ({ className, initialEmail }) => {
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

  // Auto-load if we already know the partner's email — a saved one on this
  // device, else an `initialEmail` handed in (a phone-verified helper).
  useEffect(() => {
    let saved = '';
    try { saved = localStorage.getItem(EMAIL_KEY) ?? ''; } catch { /* ignore */ }
    const addr = (saved && EMAIL_RE.test(saved)) ? saved
      : (initialEmail && EMAIL_RE.test(initialEmail)) ? initialEmail.trim().toLowerCase()
      : '';
    if (addr) { setEmail(addr); void load(addr); }
  }, [initialEmail]);

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
    if (navigator.share) navigator.share({ title: 'Refer students to VANO', text, url: info.link }).catch(() => {});
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
        <span className="text-2xl leading-none flex-shrink-0" aria-hidden="true">🎓</span>
        <div>
          <p className="text-sm font-bold text-foreground">Refer students &amp; earn</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Anyone can do this — share your link once, and every time a student you brought in
            completes a job in their first year you automatically earn {info ? `${info.commission_pct}%` : '3%'} of it. We email you each time money lands.
          </p>
        </div>
      </div>

      {!info ? (
        <>
          <form onSubmit={submit} className="flex gap-2">
            <input
              type="email" inputMode="email" autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
              placeholder="you@email.com"
              className="flex-1 min-w-0 rounded-xl border border-border bg-white px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
            />
            <button
              type="submit" disabled={loading}
              className="btn-gold flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-navy disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Get my code'}
            </button>
          </form>
          <p className="text-[11px] text-muted-foreground/80 mt-2 leading-snug">
            Any email works — you don't need to be a student union. Friends, family, classmates, anyone.
          </p>
        </>
      ) : (
        <>
          {/* CODE + share — top of the card: the thing to grab and send. */}
          <div className="rounded-2xl bg-white border border-border p-3.5 mb-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 mb-1.5">Your invite code</p>
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 rounded-xl bg-secondary/50 border border-border px-3 py-2.5 text-lg font-mono font-bold tracking-[0.2em] text-foreground text-center select-all">
                {info.code}
              </span>
              <button
                type="button" onClick={copyLink} aria-label="Copy referral link"
                className="w-11 h-11 rounded-xl border border-border bg-white flex items-center justify-center hover:bg-secondary/60 active:scale-95 transition-[background-color,transform] duration-150 flex-shrink-0"
              >
                {copied ? <Check className="w-4 h-4 text-sage" strokeWidth={2.5} /> : <Copy className="w-4 h-4 text-foreground/60" />}
              </button>
              <button
                type="button" onClick={share}
                className="h-11 px-4 rounded-xl btn-gold text-navy text-sm font-semibold flex items-center gap-2 active:scale-95 transition-transform duration-150 flex-shrink-0"
              >
                <Share2 className="w-4 h-4" />Share
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 text-center break-all">
              {info.link.replace(/^https?:\/\//, '')}
            </p>
          </div>

          {/* The headline number — money earned so far. */}
          <div className="rounded-2xl bg-navy px-4 py-4 mb-2.5 text-center relative overflow-hidden">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">Earned so far</p>
            <p className="text-3xl font-extrabold text-white tabular-nums leading-tight mt-0.5">{euros(info.total_cents)}</p>
            {(info.this_month_cents ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 mt-1.5 rounded-full bg-sage/25 px-2.5 py-0.5 text-[11px] font-semibold text-sage-light">
                +{euros(info.this_month_cents ?? 0)} this month
              </span>
            )}
          </div>

          {/* The funnel — opens → joined → jobs — so a share feels like progress
              even before the first euro lands. */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="rounded-xl bg-white border border-border px-2 py-2 text-center">
              <p className="flex items-center justify-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70"><Eye className="w-3 h-3" />Link opens</p>
              <p className="text-base font-extrabold text-foreground tabular-nums leading-tight mt-0.5">{info.link_opens ?? 0}</p>
            </div>
            <div className="rounded-xl bg-white border border-border px-2 py-2 text-center">
              <p className="flex items-center justify-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70"><Users className="w-3 h-3" />Joined</p>
              <p className="text-base font-extrabold text-foreground tabular-nums leading-tight mt-0.5">{info.signups}</p>
            </div>
            <div className="rounded-xl bg-white border border-border px-2 py-2 text-center">
              <p className="flex items-center justify-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70"><Coins className="w-3 h-3" />Jobs</p>
              <p className="text-base font-extrabold text-foreground tabular-nums leading-tight mt-0.5">{info.jobs}</p>
            </div>
          </div>

          {/* Money split. */}
          <div className="grid grid-cols-2 gap-2 mb-2.5">
            <div className="rounded-xl bg-white border border-border px-3 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Pending</p>
              <p className="text-base font-extrabold text-foreground tabular-nums leading-tight mt-0.5">{euros(info.pending_cents)}</p>
            </div>
            <div className="rounded-xl bg-white border border-border px-3 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Paid out</p>
              <p className="text-base font-extrabold text-foreground tabular-nums leading-tight mt-0.5">{euros(info.paid_cents)}</p>
            </div>
          </div>

          {/* Recent earnings feed — money landing while you did nothing. */}
          <div className="rounded-xl bg-white border border-border px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-1.5">Recent earnings</p>
            {(info.recent?.length ?? 0) > 0 ? (
              <ul className="divide-y divide-border/60">
                {(info.recent ?? []).map((ev, i) => (
                  <li key={i} className="flex items-center gap-2 py-1.5">
                    <span className="text-base leading-none flex-shrink-0" aria-hidden="true">{CAT_EMOJI[ev.category ?? ''] ?? '✨'}</span>
                    <span className="flex-1 min-w-0 text-[13px] text-foreground truncate">
                      {CAT_LABEL[ev.category ?? ''] ?? 'Job'}{ev.helper_name ? ` · ${ev.helper_name}` : ''}
                    </span>
                    <span className="text-[13px] font-bold text-sage-dark tabular-nums flex-shrink-0">+{euros(ev.amount_cents)}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0 w-12 text-right">{shortDate(ev.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Nothing yet — the moment a student you invited finishes a job, your cut
                lands here <span className="font-semibold text-foreground">automatically</span> and we email you.
              </p>
            )}
          </div>
        </>
      )}

      {error && <p className="mt-2.5 text-xs text-destructive text-center">{error}</p>}
    </motion.div>
  );
};
