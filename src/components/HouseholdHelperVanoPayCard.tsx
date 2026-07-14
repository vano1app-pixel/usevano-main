import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Banknote, ExternalLink, AlertCircle, Clock } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { extractFnError } from '@/lib/fnError';

// LEGACY-ONLY since the direct-pay pivot (July 2026): new bookings are paid
// by the customer to the helper directly (they keep 100% — the Revolut tag
// in the profile sheet is the only "setup"), so this Stripe Connect card
// only matters for money earned under the OLD escrow model. It renders
// NOTHING unless the helper has legacy traces (any household_payouts rows,
// or an existing stripe_account_id) — brand-new helpers never see it.
//
// For legacy helpers, three states driven by household_helpers.
// {stripe_account_id, stripe_payouts_enabled} + the payout rows:
//
//   1. not_set_up  → "release your held earnings" (only shown when there
//      IS held money — otherwise the card hides).
//   2. pending     → account created but Stripe wants more / isn't
//      payout-ready yet → "Finish payout setup".
//   3. enabled     → payouts active, with pending + paid totals.
//
// Legacy earnings are NEVER lost by skipping setup: payouts pile up as
// 'pending' and the release-household-payouts cron transfers them the
// moment onboarding completes.

type PayStatus = 'loading' | 'hidden' | 'not_set_up' | 'pending' | 'enabled' | 'error';

interface Props {
  // The helper's auth user id (= household_helpers.user_id). When
  // omitted the card resolves it from the current session.
  userId?: string;
  className?: string;
}

export function HouseholdHelperVanoPayCard({ userId: userIdProp, className }: Props) {
  const { toast } = useToast();

  const [status, setStatus] = useState<PayStatus>('loading');
  const [redirecting, setRedirecting] = useState(false);
  const [pendingCents, setPendingCents] = useState(0);
  const [paidCents, setPaidCents] = useState(0);

  // Surface the post-onboarding return toast (Stripe redirects back to
  // /student-dashboard?payout=done|refresh) and strip the param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payout = params.get('payout');
    if (payout === 'done') {
      toast({ title: 'Payout setup received', description: "We're verifying with Stripe — held earnings release automatically once you're approved." });
    } else if (payout === 'refresh') {
      toast({ title: 'Setup interrupted', description: 'You can pick up payout setup again from this card.' });
    }
    if (payout) {
      const url = new URL(window.location.href);
      url.searchParams.delete('payout');
      window.history.replaceState({}, '', url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let uid = userIdProp ?? null;
      if (!uid) {
        const { data: { session } } = await supabase.auth.getSession();
        uid = session?.user?.id ?? null;
      }
      if (cancelled) return;
      if (!uid) { setStatus('error'); return; }

      // household tables aren't in the generated types yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hdb = supabase as any;

      const [helperRes, payoutRes] = await Promise.all([
        hdb.from('household_helpers')
          .select('stripe_account_id, stripe_payouts_enabled')
          .eq('user_id', uid)
          .maybeSingle(),
        hdb.from('household_payouts')
          .select('amount_cents, status')
          .eq('student_id', uid),
      ]);

      if (cancelled) return;
      if (helperRes.error) { setStatus('error'); return; }

      const payouts = (payoutRes.data as Array<{ amount_cents: number; status: string }> | null) ?? [];
      setPendingCents(payouts.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount_cents, 0));
      setPaidCents(payouts.filter((p) => p.status === 'transferred').reduce((s, p) => s + p.amount_cents, 0));

      const row = helperRes.data as { stripe_account_id?: string | null; stripe_payouts_enabled?: boolean | null } | null;
      // Direct-pay: no legacy traces → nothing to manage here, hide entirely.
      // (New helpers are paid directly by the customer; their get-paid setup
      // is the Revolut tag in the profile, not Stripe onboarding.)
      if (payouts.length === 0 && !row?.stripe_account_id) {
        setStatus('hidden');
        return;
      }
      if (!row || !row.stripe_account_id) {
        setStatus('not_set_up');
      } else if (row.stripe_payouts_enabled) {
        setStatus('enabled');
      } else {
        // Account exists but the readiness flag isn't set yet (e.g. the
        // account.updated webhook isn't wired). Confirm directly with Stripe
        // so a helper who's finished onboarding sees "Active" immediately.
        setStatus('pending');
        try {
          const { data: sync } = await supabase.functions.invoke('household-helper-connect-link', { body: { check_only: true } });
          if (!cancelled && (sync as { stripe_payouts_enabled?: boolean } | null)?.stripe_payouts_enabled) {
            setStatus('enabled');
          }
        } catch { /* keep pending — they can finish setup from the card */ }
      }
    })();
    return () => { cancelled = true; };
  }, [userIdProp]);

  const openOnboarding = async () => {
    if (redirecting) return;
    setRedirecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('household-helper-connect-link', { body: {} });
      if (error) throw error;
      const url = (data as { url?: string } | null)?.url;
      if (!url) throw new Error('No onboarding URL returned');
      window.location.href = url;
    } catch (err) {
      // The real server reason hides in err.context on non-2xx — err.message
      // is just "Edge Function returned a non-2xx status code", which made
      // the Connect-not-enabled owner hint below unreachable.
      const message = await extractFnError(null, err, (err as { message?: string })?.message || '');
      toast({
        title: "Couldn't open payout setup",
        description: message.includes('Connect is not enabled')
          ? 'Platform owner: enable Stripe Connect in Stripe Dashboard → Connect.'
          : 'Please try again in a moment.',
        variant: 'destructive',
      });
      setRedirecting(false);
    }
  };

  const euros = (cents: number) => `€${(cents / 100).toFixed(0)}`;

  if (status === 'hidden') return null;

  return (
    <div className={cn('rounded-2xl border border-border/60 bg-background overflow-hidden', className)}>
      <div className="border-b border-border/50 px-4 py-3 flex items-center gap-2">
        <Banknote size={15} className="text-sage" />
        <p className="text-sm font-semibold text-foreground">Earnings from older bookings</p>
        {status === 'enabled' ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sage/10 text-sage border border-sage/20">
            <CheckCircle2 size={11} /> Active
          </span>
        ) : status === 'pending' ? (
          <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
            Pending
          </span>
        ) : null}
      </div>

      <div className="space-y-3.5 p-4">
        {status === 'loading' ? (
          <div className="flex items-center justify-center py-3 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : status === 'error' ? (
          <div className="flex items-start gap-2 text-xs text-destructive">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <p>Couldn't load your payout status. Refresh the page, or make sure you're logged in.</p>
          </div>
        ) : status === 'enabled' ? (
          <>
            <p className="text-sm text-foreground leading-relaxed">
              Payouts active — earnings from your older (pre-direct-pay) bookings land in your bank account or Revolut within 1–2 days. New jobs are paid to you directly by the customer. Powered by Stripe.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-sage-light border border-sage/20 p-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Paid out</p>
                <p className="text-xl font-bold text-foreground tabular-nums">{euros(paidCents)}</p>
              </div>
              <div className="rounded-xl bg-secondary border border-border/40 p-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Pending</p>
                <p className="text-xl font-bold text-foreground tabular-nums">{euros(pendingCents)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void openOnboarding()}
              disabled={redirecting}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold text-foreground transition hover:bg-secondary/60 disabled:opacity-60"
            >
              {redirecting ? <><Loader2 size={13} className="animate-spin" /> Opening Stripe…</> : <>Manage payout details <ExternalLink size={12} /></>}
            </button>
          </>
        ) : status === 'pending' ? (
          <>
            {pendingCents > 0 && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                <Clock size={14} className="text-amber-600 flex-shrink-0" />
                <p className="text-xs text-amber-800 leading-snug">
                  You've earned <span className="font-bold">{euros(pendingCents)}</span> — finish setup to release it.
                </p>
              </div>
            )}
            <p className="text-sm text-foreground leading-relaxed">
              Stripe needs a little more to finish setting up your payouts. Pick up where you left off — add your bank account or Revolut (any IBAN works). Takes a minute.
            </p>
            <button
              type="button"
              onClick={() => void openOnboarding()}
              disabled={redirecting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sage px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-sage-dark disabled:opacity-60"
            >
              {redirecting ? <><Loader2 size={14} className="animate-spin" /> Opening Stripe…</> : <>Finish payout setup <ExternalLink size={13} /></>}
            </button>
          </>
        ) : (
          <>
            {pendingCents > 0 ? (
              <p className="text-sm text-foreground leading-relaxed">
                You've earned <span className="font-bold">{euros(pendingCents)}</span> from older bookings — add your bank account or Revolut (any IBAN works) to release it. It's held safely until you do. New jobs are paid to you directly by the customer.
              </p>
            ) : (
              <p className="text-sm text-foreground leading-relaxed">
                Finish Stripe setup to release any earnings from older bookings. New jobs don't need this — customers pay you directly and you keep 100%.
              </p>
            )}
            <button
              type="button"
              onClick={() => void openOnboarding()}
              disabled={redirecting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sage px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-sage-dark disabled:opacity-60"
            >
              {redirecting ? <><Loader2 size={14} className="animate-spin" /> Opening Stripe…</> : <>Release my held earnings <ExternalLink size={13} /></>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default HouseholdHelperVanoPayCard;
