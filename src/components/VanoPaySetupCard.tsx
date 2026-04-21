import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, Banknote, ExternalLink, AlertCircle, Circle } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { StatusChip } from '@/components/ui/StatusChip';
import { cn } from '@/lib/utils';
import { cardBase } from '@/lib/cardStyles';

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
  // When status resolves to 'pending', we fetch the actual list of
  // Stripe requirements (currently_due + past_due) so the freelancer
  // sees exactly what's missing — "Link a bank account", "Add your
  // PPS number" — instead of a vague "Stripe needs a bit more
  // information." Null until we've made the call; empty array means
  // "we checked and Stripe told us nothing specific is blocking".
  const [requirements, setRequirements] = useState<Array<{ key: string; label: string }> | null>(null);

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

  // When we land on the pending state, ask Stripe what specifically is
  // blocking so we can render a concrete checklist instead of a vague
  // "Stripe needs a bit more information." The edge function is a thin
  // wrapper around /v1/accounts/{id} that maps Stripe's requirement
  // keys to human sentences. Silent-failure on network error — the
  // pending state still works, just without the itemised list.
  useEffect(() => {
    if (status !== 'pending') {
      setRequirements(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.functions.invoke(
        'get-vano-pay-requirements',
        { body: {} },
      );
      if (cancelled) return;
      if (error) { setRequirements([]); return; }
      const payload = data as { requirements?: Array<{ key: string; label: string }> } | null;
      setRequirements(payload?.requirements ?? []);
    })();
    return () => { cancelled = true; };
  }, [status, returned]);

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
    <div className={cn(cardBase, 'overflow-hidden')}>
      <div className="border-b border-border/50 px-5 py-3">
        <div className="flex items-center gap-2">
          <Banknote size={15} className="text-primary" />
          <p className="text-sm font-semibold text-foreground">Vano Pay — Receive payments</p>
          {status === 'enabled' ? (
            <StatusChip tone="success" size="sm" icon={CheckCircle2} className="ml-auto">Active</StatusChip>
          ) : status === 'pending' ? (
            <StatusChip tone="warning" size="sm" className="ml-auto">Pending</StatusChip>
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
              Clients can pay you safely through Vano Pay. Funds are held on Vano until the client releases them (or auto-release after 14 days) — then they land in your bank in 1–2 days. Vano takes 3%.
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
              Stripe needs a bit more information before you can start receiving payments.
              {requirements && requirements.length > 0
                ? ' Here’s what’s still outstanding:'
                : ' Pick up where you left off — takes a minute.'}
            </p>
            {/* Concrete checklist of outstanding requirements (currently_due
                 + past_due) so the freelancer knows whether this is a
                 30-second missing-field or a real ID upload before they
                 tap. Loading skeleton shown while we're waiting on the
                 Stripe read; null list means we have nothing specific to
                 show, so we fall back to the generic line above. */}
            {requirements === null ? (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3.5 py-2.5 text-[12px] text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                Checking what Stripe still needs…
              </div>
            ) : requirements.length > 0 ? (
              <ul className="space-y-1.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.04] px-3.5 py-3">
                {requirements.map((r) => (
                  <li key={r.key} className="flex items-start gap-2 text-[12.5px] leading-snug text-foreground">
                    <Circle size={9} strokeWidth={3} className="mt-1 shrink-0 text-amber-600" />
                    <span>{r.label}</span>
                  </li>
                ))}
              </ul>
            ) : null}
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
              Let clients pay you safely through Vano Pay. Funds are held on Vano until the client releases them on delivery (or auto-release after 14 days) — then they land in your bank in 1–2 days. Vano takes 3%, no monthly charge. Powered by Stripe.
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
