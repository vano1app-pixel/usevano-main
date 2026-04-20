import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, Banknote, ExternalLink, AlertCircle } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Freelancer-facing card for enabling Vano Pay. Shown on the Profile
// page for student-type users. Handles three states based on
// student_profiles.{stripe_account_id, stripe_payouts_enabled}:
//
//   1. Nothing set up → "Enable Vano Pay" CTA (creates Connect Express
//      account and redirects to Stripe-hosted onboarding).
//   2. Account created but not ready → "Finish setup" CTA (stripe
//      wants more info; fresh onboarding link minted on click).
//   3. Fully enabled → green "Vano Pay is on" state with a "Manage
//      payouts" link that also returns an onboarding URL (Stripe's
//      same flow doubles as an account-update page).

type VanoPayStatus = 'loading' | 'not_set_up' | 'pending' | 'enabled' | 'error';

export function VanoPaySetupCard({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [status, setStatus] = useState<VanoPayStatus>('loading');
  const [redirecting, setRedirecting] = useState(false);

  // Handle post-return from Stripe's hosted onboarding. Stripe appends
  // a completion query param as configured in create-stripe-connect-link.
  // We surface a toast and strip the param so back/forward doesn't
  // retrigger it.
  const returned = useMemo(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('vano_pay_done') === '1') return 'done' as const;
    if (params.get('vano_pay_refresh') === '1') return 'refresh' as const;
    return null;
  }, [location.search]);

  useEffect(() => {
    if (!returned) return;
    if (returned === 'done') {
      toast({ title: 'Vano Pay setup received', description: "We're verifying with Stripe — may take a minute to show as active." });
    } else {
      toast({ title: 'Setup interrupted', description: 'You can resume anytime from this card.' });
    }
    // Strip the param cleanly without a full navigation.
    const url = new URL(window.location.href);
    url.searchParams.delete('vano_pay_done');
    url.searchParams.delete('vano_pay_refresh');
    window.history.replaceState({}, '', url.toString());
  }, [returned, toast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('student_profiles')
        .select('stripe_account_id, stripe_payouts_enabled')
        .eq('user_id', userId)
        .maybeSingle();

      if (cancelled) return;
      if (error) { setStatus('error'); return; }

      const row = data;
      if (!row || !row.stripe_account_id) {
        setStatus('not_set_up');
      } else if (row.stripe_payouts_enabled) {
        setStatus('enabled');
      } else {
        setStatus('pending');
      }
    })();
    return () => { cancelled = true; };
  }, [userId, returned]);

  const openOnboarding = async () => {
    if (redirecting) return;
    setRedirecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-connect-link', {
        body: {},
      });
      if (error) throw error;
      const url = (data as { url?: string } | null)?.url;
      if (!url) throw new Error('No onboarding URL returned');
      window.location.href = url;
    } catch (err) {
      if (import.meta.env.DEV) console.error('[vano-pay] onboarding link failed', err);
      const message = (err as { message?: string })?.message || '';
      toast({
        title: "Couldn't open Vano Pay setup",
        description: message.includes('Connect is not enabled')
          ? 'Platform owner: enable Stripe Connect in Stripe Dashboard → Connect.'
          : 'Please try again in a moment.',
        variant: 'destructive',
      });
      setRedirecting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border/50 px-5 py-3">
        <div className="flex items-center gap-2">
          <Banknote size={15} className="text-primary" />
          <p className="text-sm font-semibold text-foreground">Vano Pay — Receive payments</p>
          {status === 'enabled' ? (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              <CheckCircle2 size={10} /> Active
            </span>
          ) : status === 'pending' ? (
            <span className="ml-auto rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
              Pending
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-5">
        {status === 'loading' ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : status === 'error' ? (
          <div className="flex items-start gap-2 text-xs text-destructive">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <p>Couldn't load Vano Pay status. Refresh the page.</p>
          </div>
        ) : status === 'enabled' ? (
          <>
            <p className="text-sm text-foreground leading-relaxed">
              Clients can pay you safely through Vano. Funds are held on Vano until the client releases them (or auto-release after 14 days) — then they land in your bank in 1–2 days. Vano takes 3%.
            </p>
            <button
              type="button"
              onClick={openOnboarding}
              disabled={redirecting}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold text-foreground transition hover:bg-muted disabled:opacity-60"
            >
              {redirecting ? (
                <><Loader2 size={13} className="animate-spin" /> Opening Stripe…</>
              ) : (
                <>Manage payout details <ExternalLink size={12} /></>
              )}
            </button>
          </>
        ) : status === 'pending' ? (
          <>
            <p className="text-sm text-foreground leading-relaxed">
              Stripe needs a bit more information before you can start receiving payments. Pick up where you left off — takes a minute.
            </p>
            <button
              type="button"
              onClick={openOnboarding}
              disabled={redirecting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60"
            >
              {redirecting ? (
                <><Loader2 size={13} className="animate-spin" /> Opening Stripe…</>
              ) : (
                <>Finish Vano Pay setup <ExternalLink size={13} /></>
              )}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-foreground leading-relaxed">
              Let clients pay you safely through Vano. Funds are held on Vano until the client releases them on delivery (or auto-release after 14 days) — then they land in your bank in 1–2 days. Vano takes 3%, no monthly charge. Powered by Stripe.
            </p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>• One-time 3-minute setup with Stripe (bank + ID)</li>
              <li>• Protected work = more clients willing to pay through Vano</li>
              <li>• Clients see a "Pay via Vano" button in their chat with you</li>
            </ul>
            <button
              type="button"
              onClick={openOnboarding}
              disabled={redirecting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60"
            >
              {redirecting ? (
                <><Loader2 size={13} className="animate-spin" /> Opening Stripe…</>
              ) : (
                <>Enable Vano Pay <ExternalLink size={13} /></>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
