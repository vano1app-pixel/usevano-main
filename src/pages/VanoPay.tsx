import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Banknote,
  ShieldCheck,
  Lock,
  RotateCcw,
  ArrowRight,
  MessageCircle,
  Sparkles,
  Wallet,
  Loader2,
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cardBase, cardElevated } from '@/lib/cardStyles';
import { cn } from '@/lib/utils';
import { useVanoPayConfig } from '@/lib/vanoPayConfig';
import { BusinessSpendPanel } from '@/components/BusinessSpendPanel';
import { FreelancerEarningsPanel } from '@/components/FreelancerEarningsPanel';
import { VanoPaySetupCard } from '@/components/VanoPaySetupCard';
import { VANO_PAY_VISIBLE } from '@/lib/featureFlags';

// The /vano-pay nav destination — a wallet-style dashboard that adapts
// to the viewer's user_type:
//
//   • Hirer (business):    Shows "Send a payment" guidance, the
//     BusinessSpendPanel of recent escrow activity, and the
//     "how it works" explainer.
//
//   • Freelancer (student): Shows VanoPaySetupCard (Stripe Connect
//     onboarding state), the FreelancerEarningsPanel of recent
//     receipts, and a tailored explainer.
//
// Vano Match is the discovery layer; Vano Pay is the transaction
// layer that comes AFTER. They sit side by side without competing —
// the hirer view links back into /messages where actual payments live,
// and freelancers manage their payout setup from here without having
// to dig through Profile.
//
// All payment ACTIONS (Pay, Release, Refund, Flag) still live inside
// the /messages thread where the conversation is — this page is a
// summary + entry point, not a parallel checkout surface.

export default function VanoPay() {
  const { user, userType } = useAuth();
  const navigate = useNavigate();
  const { hirerFeeBps, freelancerFeeBps, totalFeeBpsOfAgreed } = useVanoPayConfig();

  const formatPercent = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
  const hirerFeeLabel = formatPercent(hirerFeeBps);
  const freelancerFeeLabel = formatPercent(freelancerFeeBps);
  const totalFeeLabel = formatPercent(totalFeeBpsOfAgreed);

  // Freelancer-side: pull the Stripe Connect status so we can decide
  // whether to lead with the setup card or skip to the earnings.
  // Mirrors the same query VanoPaySetupCard does on its own — small
  // duplication keeps the layout decision local to this page.
  const [studentReady, setStudentReady] = useState<null | boolean>(null);
  const [studentHasAccount, setStudentHasAccount] = useState<null | boolean>(null);
  useEffect(() => {
    if (!user || userType !== 'student') return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('student_profiles')
        .select('stripe_account_id, stripe_payouts_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setStudentHasAccount(!!data?.stripe_account_id);
      setStudentReady(!!data?.stripe_payouts_enabled);
    })();
    return () => { cancelled = true; };
  }, [user, userType]);

  // Bottom-of-page CTA for the hirer view. Drops them into Messages
  // where the actual Vano Pay action lives. Kept as a real Link rather
  // than a button so middle-click / right-click work as expected.
  const sendCta = useMemo(() => (
    <Link
      to="/messages"
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.5)] transition-all duration-150 hover:-translate-y-[1px] hover:brightness-[1.05] active:translate-y-0 active:scale-[0.99]"
    >
      <MessageCircle size={15} />
      Pay a freelancer in Messages
      <ArrowRight size={15} />
    </Link>
  ), []);

  // Feature flag bail-out — if the page is reachable but the flag is
  // off (e.g. someone hit /vano-pay directly from history) we render
  // a friendly placeholder instead of a half-functional surface. The
  // nav item itself is gated separately so this is a defence-in-depth
  // measure, not the primary gate.
  if (!VANO_PAY_VISIBLE) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <div className={cn(cardBase, 'p-8 text-center')}>
          <Banknote size={28} className="mx-auto text-muted-foreground" />
          <h1 className="mt-3 text-xl font-semibold tracking-tight">Vano Pay is coming soon</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We&apos;re finishing the rollout. Check back shortly — or pay your freelancer directly for now.
          </p>
          <Link to="/messages" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            Open Messages <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-14">
      {/* Hero — short, factual, two-line. The numbers (4% / 4% / 8%
          total) come from the live config so a server-side fee tweak
          never desyncs the headline. */}
      <header className="mb-8 sm:mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Vano Pay
        </p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-foreground sm:text-[34px]">
          {userType === 'student'
            ? 'Get paid safely. Money lands in your bank in 1–2 days.'
            : "Pay freelancers safely. Held by Vano until the work's done."}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          Escrow-style payments inside your conversation. The client pays the agreed price plus a {hirerFeeLabel} Vano fee on top; the freelancer has {freelancerFeeLabel} deducted on payout. Both sides protected, both sides pay {hirerFeeLabel} — total to Vano is {totalFeeLabel} of the agreed price.
        </p>
      </header>

      {/* ── HIRER (business) VIEW ───────────────────────────────────── */}
      {userType === 'business' && (
        <div className="space-y-6">
          {/* Quick-start strip — three steps in card form so the page
              works even for hirers with zero payment history. The CTA
              jumps to Messages where the actual payment lives. */}
          <section className={cn(cardElevated, 'overflow-hidden')}>
            <div className="border-b border-border/50 px-5 py-3 sm:px-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                How to pay through Vano
              </p>
            </div>
            <ol className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
              {[
                { n: 1, icon: MessageCircle, title: 'Agree a price in chat', body: 'Negotiate the rate with your freelancer in Messages — that\'s the figure you type into Pay.' },
                { n: 2, icon: ShieldCheck, title: 'Pay through Vano', body: `Tap "Pay via Vano" in the thread. You're charged the agreed price plus ${hirerFeeLabel}. Money sits in escrow.` },
                { n: 3, icon: Wallet, title: 'Release on delivery', body: 'When the work\'s done, tap Release. Vano sends the freelancer their share within 1–2 banking days.' },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <li key={s.n} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/12 text-[12px] font-bold text-primary">
                        {s.n}
                      </span>
                      <Icon size={14} className="text-primary" strokeWidth={2.25} />
                      <p className="text-[13px] font-semibold text-foreground">{s.title}</p>
                    </div>
                    <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                      {s.body}
                    </p>
                  </li>
                );
              })}
            </ol>
            <div className="border-t border-border/50 bg-muted/20 px-5 py-3 sm:px-6">
              {sendCta}
            </div>
          </section>

          {/* Recent activity — reuses the Spend panel that already
              renders on the Business Dashboard. Same data, larger
              context. Realtime-subscribed inside the panel. */}
          <section>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Your Vano Pay activity
            </h2>
            {user && <BusinessSpendPanel userId={user.id} />}
          </section>

          {/* Three-promise trust footer — matches the strip in the
              VanoPayModal, repeated here for the dashboard context so
              the protection story isn't only visible at checkout. */}
          <FeeFooter
            hirerFeeLabel={hirerFeeLabel}
            freelancerFeeLabel={freelancerFeeLabel}
            totalFeeLabel={totalFeeLabel}
          />
        </div>
      )}

      {/* ── FREELANCER (student) VIEW ──────────────────────────────── */}
      {userType === 'student' && user && (
        <div className="space-y-6">
          {/* Lead with the setup card if they haven't onboarded yet —
              there's no point showing a zero-receipts panel above the
              CTA that fixes it. Once enabled, the card is still useful
              as a "manage payouts" entry, just rendered below. */}
          {studentReady === null ? (
            <div className={cn(cardBase, 'flex items-center gap-2 p-5 text-sm text-muted-foreground')}>
              <Loader2 size={14} className="animate-spin" />
              Loading your Vano Pay status…
            </div>
          ) : studentHasAccount && studentReady ? (
            <>
              {/* Earnings panel first when active — the receipts are
                  the headline they'll want to see on visit. The setup
                  card sits below as the "manage payouts" entry. */}
              <section>
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Your Vano Pay earnings
                </h2>
                <FreelancerEarningsPanel userId={user.id} />
              </section>
              <section>
                <VanoPaySetupCard userId={user.id} />
              </section>
            </>
          ) : (
            <>
              <section>
                <VanoPaySetupCard userId={user.id} />
              </section>
              {/* Show the (likely empty) earnings panel below even
                  pre-onboarding so a freelancer who's mid-setup can
                  see the surface they're unlocking. The empty state
                  on the panel handles the no-receipts case. */}
              <section>
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Earnings preview
                </h2>
                <FreelancerEarningsPanel userId={user.id} />
              </section>
            </>
          )}

          {/* Tip strip — reminds freelancers that the action lives in
              the chat, so they don't expect to "request payment" from
              this page. Vano Pay is hirer-initiated by design (only
              the paying side can release escrow). */}
          <div className={cn(cardBase, 'flex items-start gap-3 p-4 sm:p-5')}>
            <Sparkles size={16} strokeWidth={2.25} className="mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground">
                Clients pay you from the chat
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                Vano Pay is hirer-initiated — once you&apos;ve agreed a price in Messages, the client taps &ldquo;Pay via Vano&rdquo; in the thread. You&apos;ll see the held payment land here automatically.
              </p>
              <Link
                to="/messages"
                className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
              >
                Open Messages <ArrowRight size={12} />
              </Link>
            </div>
          </div>

          <FeeFooter
            hirerFeeLabel={hirerFeeLabel}
            freelancerFeeLabel={freelancerFeeLabel}
            totalFeeLabel={totalFeeLabel}
          />
        </div>
      )}

      {/* ── UNKNOWN USER TYPE FALLBACK ──────────────────────────────
          A logged-in user with neither business nor student type
          (mid-onboarding edge case) sees a generic explainer that
          nudges them to finish account setup. RequireVerifiedSession
          guards the route so we never hit this branch unauth. */}
      {user && userType !== 'business' && userType !== 'student' && (
        <div className={cn(cardBase, 'p-6 text-center')}>
          <p className="text-sm text-foreground">
            Finish setting up your account to use Vano Pay.
          </p>
          <button
            type="button"
            onClick={() => navigate('/choose-account-type')}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition hover:brightness-110"
          >
            Choose account type <ArrowRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// Three-row trust strip + fee disclosure shared by both viewer types.
// Pulled out so the wording lives in one place — if we tweak it, both
// hirer and freelancer surfaces stay in sync.
function FeeFooter({
  hirerFeeLabel,
  freelancerFeeLabel,
  totalFeeLabel,
}: {
  hirerFeeLabel: string;
  freelancerFeeLabel: string;
  totalFeeLabel: string;
}) {
  return (
    <section className={cn(cardBase, 'overflow-hidden')}>
      <div className="border-b border-border/50 px-5 py-3 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          How escrow + the fee work
        </p>
      </div>
      <ul className="space-y-2.5 p-5 sm:p-6">
        <li className="flex items-start gap-2.5 text-[13px] leading-relaxed">
          <Lock size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            <span className="font-semibold text-foreground">Held by Vano, not sent yet.</span>{' '}
            <span className="text-muted-foreground">The client&apos;s card is charged at checkout but the money sits with Vano until released.</span>
          </span>
        </li>
        <li className="flex items-start gap-2.5 text-[13px] leading-relaxed">
          <ShieldCheck size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            <span className="font-semibold text-foreground">Released when the work is done.</span>{' '}
            <span className="text-muted-foreground">The hirer taps Release inside the thread. If they ghost, Vano auto-releases after 14 days so the freelancer isn&apos;t stuck.</span>
          </span>
        </li>
        <li className="flex items-start gap-2.5 text-[13px] leading-relaxed">
          <RotateCcw size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            <span className="font-semibold text-foreground">Something off? Flag it.</span>{' '}
            <span className="text-muted-foreground">The hirer can flag a problem during the hold window — full refund issued and a Vano admin reviews if there&apos;s a dispute.</span>
          </span>
        </li>
      </ul>
      <div className="border-t border-border/50 bg-muted/20 px-5 py-3.5 sm:px-6">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">The fee, plainly:</span>{' '}
          The client pays {hirerFeeLabel} on top of the agreed price; the freelancer has {freelancerFeeLabel} deducted on release. Vano keeps {totalFeeLabel} of the agreed price total — split evenly so neither side carries the full cost. No monthly charges, no per-transaction extras.
        </p>
      </div>
    </section>
  );
}
