import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  BONUS_STATUS_LABELS,
  STAGE_LABELS,
  STAGE_STYLES,
  formatEuro,
  type SalesDealRow,
  type SalesDealStage,
  type SalesDealBonusStatus,
} from '@/lib/salesDeals';
import {
  CheckCircle2,
  X,
  AlertOctagon,
  Loader2,
  Briefcase,
  TrendingUp,
  Banknote,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Business-side view of the sales pipeline — the other half of the
// flow that SalesPipelineBoard already covers for the freelancer.
// Lives inside the conversation thread on Messages.tsx so a business
// chatting with their sales freelancer sees what's been logged for
// them and can confirm / dispute closes right there.
//
// Responsibilities:
//   - Load deals the freelancer logged against this business
//   - For closed_won: Approve (bonus_status → approved) or Waive it
//   - For approved bonuses: show "awaiting payout" until the paid
//     flip happens via a Vano Pay webhook (follow-up)
//   - For active stages: passive view of where the deal sits
//
// RLS on sales_deals lets the business UPDATE any row they're on, so
// the state-change writes below don't need a dedicated RPC — the
// policy matches the mental model ("the business confirms the close").

export interface BusinessDealsPanelProps {
  /** Current viewer — must be the business on the conversation. */
  businessId: string;
  /** The freelancer they're talking with. Only their deals show up. */
  freelancerId: string;
  /** Pretty name for copy ("Ellie's deals"). */
  freelancerName: string;
}

export function BusinessDealsPanel({
  businessId,
  freelancerId,
  freelancerName,
}: BusinessDealsPanelProps) {
  const { toast } = useToast();
  const [deals, setDeals] = useState<SalesDealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from('sales_deals' as never)
      .select('*')
      .eq('freelancer_id' as never, freelancerId as never)
      .eq('business_id' as never, businessId as never)
      .order('updated_at', { ascending: false }) as { data: SalesDealRow[] | null; error: unknown };
    if (error) {
      setLoading(false);
      return;
    }
    setDeals(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, freelancerId]);

  // Realtime subscription so the business sees a new lead the moment
  // the freelancer logs one, and the freelancer sees the confirm-flip
  // immediately on their side too. Scoped to this pair so a busy
  // business working with multiple freelancers doesn't get chatter
  // from unrelated pipelines.
  useEffect(() => {
    const channel = supabase
      .channel(`sales-deals-${businessId}-${freelancerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales_deals',
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, freelancerId]);

  const summary = useMemo(() => {
    const total = deals.length;
    const pendingApproval = deals.filter(
      (d) => d.stage === 'closed_won' && d.bonus_status === 'pending',
    ).length;
    const awaitingPayout = deals
      .filter((d) => d.bonus_status === 'approved')
      .reduce((acc, d) => acc + (d.bonus_amount_cents ?? 0), 0);
    return { total, pendingApproval, awaitingPayout };
  }, [deals]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          Loading pipeline…
        </div>
      </div>
    );
  }

  if (deals.length === 0) {
    // Compact empty state — the full-card version pushed the actual
    // chat below the fold on mobile for every brand-new digital-sales
    // hire. Single-line pill keeps the "this panel exists, it's just
    // empty" signal without stealing real estate.
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <Briefcase size={12} className="shrink-0" />
        <span>
          <span className="font-semibold text-foreground/80">{freelancerName}</span> hasn&apos;t logged any leads yet — they&apos;ll land here when they do.
        </span>
      </div>
    );
  }

  const updateDeal = async (
    dealId: string,
    patch: Partial<Pick<SalesDealRow, 'bonus_status' | 'stage'>>,
    successMsg: string,
  ) => {
    setBusy(dealId);
    const { error } = await supabase
      .from('sales_deals' as never)
      .update(patch as never)
      .eq('id' as never, dealId as never);
    setBusy(null);
    if (error) {
      toast({
        title: "Couldn't update the deal",
        description: 'Try again in a moment.',
        variant: 'destructive',
      });
      return;
    }
    toast({ title: successMsg });
    await load();
  };

  // "Pay bonus" — reuses the existing Vano Pay checkout edge function
  // with the deal id stamped on the payment so the sync trigger on
  // vano_payments can flip bonus_status to 'paid' automatically when
  // the Stripe webhook confirms the transfer. Opens Stripe Checkout
  // in a redirect (same pattern as VanoPayModal).
  const payBonus = async (deal: SalesDealRow) => {
    if (!deal.conversation_id) {
      toast({
        title: "Can't pay this bonus yet",
        description: 'This deal is not linked to a conversation — message the freelancer first, then retry.',
        variant: 'destructive',
      });
      return;
    }
    if (!deal.bonus_amount_cents || deal.bonus_amount_cents < 100) {
      toast({
        title: "Can't pay this bonus yet",
        description: 'The bonus amount is missing or below the €1.00 Vano Pay minimum.',
        variant: 'destructive',
      });
      return;
    }
    setBusy(deal.id);
    try {
      // Guard against a stale JWT — without this, an expired session
      // bubbles up as "[401] Edge Function returned a non-2xx status
      // code" and the user has no idea they just need to sign in again.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        setBusy(null);
        toast({
          title: 'Your sign-in expired',
          description: 'Please sign in again to pay the bonus.',
          variant: 'destructive',
        });
        return;
      }
      const { data, error } = await supabase.functions.invoke('create-vano-payment-checkout', {
        body: {
          conversation_id: deal.conversation_id,
          amount_cents: deal.bonus_amount_cents,
          description: `Bonus: ${deal.lead_name} — ${deal.lead_company}`.slice(0, 200),
          sales_deal_id: deal.id,
        },
      });
      if (error) throw error;
      const url = (data as { url?: string } | null)?.url;
      if (!url) throw new Error('No checkout URL returned');
      window.location.href = url;
    } catch (err) {
      setBusy(null);
      const message = (err as { message?: string; context?: { error?: string } })?.context?.error
        || (err as { message?: string })?.message
        || '';
      const status = (err as { status?: number; context?: { status?: number } })?.status
        ?? (err as { context?: { status?: number } })?.context?.status;
      const isAuthFailure = status === 401 || status === 403
        || message.toLowerCase().includes('unauthorized');
      toast({
        title: "Couldn't start the bonus payout",
        description:
          isAuthFailure
            ? 'Your sign-in expired — please sign in again and try once more.'
          : message.includes('not enabled Vano Pay')
            ? `${freelancerName} hasn't enabled Vano Pay yet — ask them to turn it on in their profile, then retry.`
          : 'Please try again in a moment.',
        variant: 'destructive',
      });
      // No auto sign-out on 401/403 — see HirePage.handleAiFind for
      // why (env-mismatch case that a fresh sign-in can't recover).
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <TrendingUp size={14} strokeWidth={2.25} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{freelancerName}&apos;s deals</p>
            <p className="text-[11px] text-muted-foreground">
              {summary.total} logged · {summary.pendingApproval} awaiting your confirm · {formatEuro(summary.awaitingPayout)} approved
            </p>
          </div>
        </div>
      </div>

      <ul className="divide-y divide-border">
        {deals.map((deal) => {
          const isBusyOnThis = busy === deal.id;
          const stageStyle = STAGE_STYLES[deal.stage];
          const canApprove = deal.stage === 'closed_won' && deal.bonus_status === 'pending';
          return (
            <li key={deal.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <StageChip stage={deal.stage} />
                  <p className="truncate text-sm font-semibold text-foreground">
                    {deal.lead_name}
                  </p>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {deal.lead_company}
                  {deal.deal_amount_cents != null && (
                    <> · <span className="font-medium text-foreground/80">{formatEuro(deal.deal_amount_cents)}</span> deal</>
                  )}
                </p>
                {deal.stage === 'closed_won' && (
                  <p className="mt-1 text-[11px] font-medium">
                    <span className="text-muted-foreground">Bonus: </span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {formatEuro(deal.bonus_amount_cents)}
                    </span>
                    <span className="mx-1.5 text-muted-foreground/40">·</span>
                    <BonusStatusLabel status={deal.bonus_status} />
                  </p>
                )}
              </div>

              {canApprove && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg text-xs"
                    disabled={isBusyOnThis}
                    onClick={() => updateDeal(deal.id, { bonus_status: 'waived' }, 'Bonus waived.')}
                  >
                    <X size={12} className="mr-1" strokeWidth={2.5} />
                    Waive
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-lg text-xs font-semibold"
                    disabled={isBusyOnThis}
                    onClick={() => updateDeal(deal.id, { bonus_status: 'approved' }, 'Bonus approved.')}
                  >
                    {isBusyOnThis ? (
                      <Loader2 size={12} className="mr-1 animate-spin" />
                    ) : (
                      <CheckCircle2 size={12} className="mr-1" strokeWidth={2.5} />
                    )}
                    Confirm close
                  </Button>
                </div>
              )}

              {deal.bonus_status === 'approved' && (
                <div className="shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-lg text-xs font-semibold"
                    disabled={isBusyOnThis}
                    onClick={() => void payBonus(deal)}
                  >
                    {isBusyOnThis ? (
                      <Loader2 size={12} className="mr-1 animate-spin" />
                    ) : (
                      <Banknote size={12} className="mr-1" strokeWidth={2.5} />
                    )}
                    Pay {formatEuro(deal.bonus_amount_cents)} bonus
                  </Button>
                </div>
              )}

              {deal.bonus_status === 'waived' && (
                <div className="shrink-0">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                    <AlertOctagon size={10} strokeWidth={2.75} />
                    Waived
                  </span>
                </div>
              )}

              {deal.bonus_status === 'paid' && (
                <div className="shrink-0">
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 size={10} strokeWidth={2.75} />
                    Paid
                  </span>
                </div>
              )}

              {/* Active-stage rows: no action yet — purely informational
                   so the business can see what's cooking. */}
              {deal.stage !== 'closed_won' && deal.stage !== 'closed_lost' && (
                <div className={cn('shrink-0', stageStyle.chip)} aria-hidden />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StageChip({ stage }: { stage: SalesDealStage }) {
  const style = STAGE_STYLES[stage];
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
      style.chip,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
      {STAGE_LABELS[stage]}
    </span>
  );
}

function BonusStatusLabel({ status }: { status: SalesDealBonusStatus }) {
  const tone =
    status === 'paid' || status === 'approved'
      ? 'text-emerald-700 dark:text-emerald-400'
      : status === 'waived' || status === 'disputed'
      ? 'text-muted-foreground'
      : 'text-amber-700 dark:text-amber-400';
  return <span className={cn('font-semibold', tone)}>{BONUS_STATUS_LABELS[status]}</span>;
}
