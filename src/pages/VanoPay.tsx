import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banknote, ArrowRight, MessageCircle, Loader2 } from 'lucide-react';

import { useAuth } from '@/hooks/useAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cardBase } from '@/lib/cardStyles';
import { cn } from '@/lib/utils';
import { useVanoPayConfig } from '@/lib/vanoPayConfig';
import { BusinessSpendPanel } from '@/components/BusinessSpendPanel';
import { FreelancerEarningsPanel } from '@/components/FreelancerEarningsPanel';
import { VanoPaySetupCard } from '@/components/VanoPaySetupCard';
import { VANO_PAY_VISIBLE } from '@/lib/featureFlags';

// /vano-pay — the nav destination. A deliberately simple wallet view:
// one title, one panel of activity, one action. No re-teaching: the
// trust copy + fee breakdown lives in the VanoPayModal at the moment
// the hirer actually pays, and in the in-thread receipt card after.
//
// Layout (max three sections, both user types):
//   1. Header — userType-tailored title + one-line fee disclosure
//   2. Activity panel (earnings or spend) — or the setup card for
//      freelancers who haven't onboarded yet
//   3. Single primary action — "Pay a freelancer in Messages" for
//      hirers; nothing for freelancers (payments are hirer-initiated)
//
// All payment ACTIONS (Pay, Release, Refund, Flag) still live inside
// the /messages thread where the conversation is.

export default function VanoPay() {
  const { user, userType } = useAuth();
  const navigate = useNavigate();
  const { hirerFeeBps } = useVanoPayConfig();
  const feeLabel = `${(hirerFeeBps / 100).toFixed(hirerFeeBps % 100 === 0 ? 0 : 1)}%`;

  // Freelancer-side: pull Stripe Connect status so we can decide
  // whether to lead with the setup card or skip to earnings.
  const [studentReady, setStudentReady] = useState<null | boolean>(null);
  useEffect(() => {
    if (!user || userType !== 'student') return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('student_profiles')
        .select('stripe_payouts_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setStudentReady(!!data?.stripe_payouts_enabled);
    })();
    return () => { cancelled = true; };
  }, [user, userType]);

  // Feature-flag bail-out for direct URL hits when the flag is off.
  // The nav item itself is gated separately so this is just a safety
  // net.
  if (!VANO_PAY_VISIBLE) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <div className={cn(cardBase, 'p-8 text-center')}>
          <Banknote size={28} className="mx-auto text-muted-foreground" />
          <h1 className="mt-3 text-xl font-semibold tracking-tight">Vano Pay is coming soon</h1>
          <Link to="/messages" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            Open Messages <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  const isHirer = userType === 'business';
  const isFreelancer = userType === 'student';

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10 lg:py-14">
      {/* Header — small label, one-line title, one-line fee note.
          Tailored copy by userType so each side sees what's relevant
          to them. No paragraph-length intro; the modal does the
          teaching at decision time. */}
      <header className="mb-6 sm:mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Vano Pay
        </p>
        <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-tight text-foreground sm:text-[30px]">
          {isFreelancer
            ? 'Get paid safely.'
            : 'Pay freelancers, held until you release.'}
        </h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {isFreelancer
            ? `Money in your bank in 1–2 days. ${feeLabel} fee on your side.`
            : `Released in 1–2 days. ${feeLabel} fee on each side.`}
        </p>
      </header>

      {/* ── HIRER VIEW ─────────────────────────────────────────────── */}
      {isHirer && user && (
        <div className="space-y-5">
          <BusinessSpendPanel userId={user.id} />
          <Link
            to="/messages"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-[14px] font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.5)] transition-all duration-150 hover:-translate-y-[1px] hover:brightness-[1.05] active:translate-y-0 active:scale-[0.99]"
          >
            <MessageCircle size={15} />
            Pay a freelancer in Messages
            <ArrowRight size={15} />
          </Link>
        </div>
      )}

      {/* ── FREELANCER VIEW ────────────────────────────────────────── */}
      {isFreelancer && user && (
        <div className="space-y-5">
          {studentReady === null ? (
            <div className={cn(cardBase, 'flex items-center gap-2 p-5 text-sm text-muted-foreground')}>
              <Loader2 size={14} className="animate-spin" />
              Loading…
            </div>
          ) : studentReady ? (
            // Active freelancer — earnings panel is the headline,
            // setup card collapses to a "manage payouts" entry below.
            <>
              <FreelancerEarningsPanel userId={user.id} />
              <VanoPaySetupCard userId={user.id} />
            </>
          ) : (
            // Not yet onboarded — setup card is the whole page until
            // they finish. The earnings panel would be empty + noisy.
            <VanoPaySetupCard userId={user.id} />
          )}
        </div>
      )}

      {/* ── UNKNOWN USER TYPE FALLBACK ──────────────────────────────
          Mid-onboarding edge case — RequireVerifiedSession guards the
          route so we never hit this branch unauthed. */}
      {user && !isHirer && !isFreelancer && (
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
