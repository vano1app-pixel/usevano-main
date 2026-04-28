import { useEffect, useState } from 'react';
import { Target, Loader2, ArrowRight, ShieldCheck } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { cardElevated } from '@/lib/cardStyles';
import { diagnoseAuthFailure } from '@/lib/authDiagnose';

// In-thread card rendered when a sales-milestone system message
// lands in the conversation. Hirer sees the deals + a Pay button
// that fires the existing create-vano-payment-checkout function
// with from_milestone=true; freelancer sees the same deals + an
// "awaiting payout" state. After payment the card stays in chat as
// an audit trail of the milestone.
//
// Looks up the deals listed in metadata.deal_ids on render so we
// always show fresh deal data (not a stale snapshot). The deal_ids
// list captured at trigger-fire time means even if a deal is later
// moved out of closed_won, the card still shows the original three
// that earned the milestone.

type MilestoneMessage = {
  id: string;
  conversation_id: string;
  content: string;
  metadata?: Record<string, unknown> | null;
};

type DealRow = {
  id: string;
  lead_name: string;
  lead_company: string;
  deal_amount_cents: number | null;
};

export function SalesMilestoneCard({
  message,
  conversationId,
  isHirer,
}: {
  message: MilestoneMessage;
  conversationId: string | null;
  isHirer: boolean;
}) {
  const { toast } = useToast();
  const [deals, setDeals] = useState<DealRow[] | null>(null);
  const [paying, setPaying] = useState(false);

  // metadata.deal_ids = uuid[] captured at trigger-fire time.
  // metadata.bonus_cents = integer bonus amount. Both authoritative.
  const dealIds = Array.isArray((message.metadata as { deal_ids?: unknown })?.deal_ids)
    ? ((message.metadata as { deal_ids: string[] }).deal_ids).filter((x) => typeof x === 'string')
    : [];
  const bonusCents = typeof (message.metadata as { bonus_cents?: unknown })?.bonus_cents === 'number'
    ? (message.metadata as { bonus_cents: number }).bonus_cents
    : 0;
  const targetCount = typeof (message.metadata as { target_count?: unknown })?.target_count === 'number'
    ? (message.metadata as { target_count: number }).target_count
    : dealIds.length;

  useEffect(() => {
    if (dealIds.length === 0) { setDeals([]); return; }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('sales_deals' as never)
        .select('id, lead_name, lead_company, deal_amount_cents')
        .in('id', dealIds);
      if (cancelled) return;
      // Preserve the deal_ids order so the card lists them in the
      // sequence the rep closed them, not the order Postgres
      // returned them.
      const map = new Map<string, DealRow>();
      for (const row of (data ?? []) as DealRow[]) map.set(row.id, row);
      setDeals(dealIds.map((id) => map.get(id)).filter(Boolean) as DealRow[]);
    })();
    return () => { cancelled = true; };
  }, [dealIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const bonusEuro = `€${(bonusCents / 100).toFixed(bonusCents % 100 === 0 ? 0 : 2)}`;

  const pay = async () => {
    if (!conversationId || paying) return;
    setPaying(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        toast({
          title: 'Your sign-in expired',
          description: 'Please sign in again to pay the bonus.',
          variant: 'destructive',
        });
        setPaying(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke('create-vano-payment-checkout', {
        body: {
          conversation_id: conversationId,
          // Match the bonus configured on the conversation. Server
          // re-validates against the conversation's
          // sales_target_bonus_cents, so a stale client can't tamper.
          agreed_price_cents: bonusCents,
          amount_cents: bonusCents,
          from_milestone: true,
          description: `Sales milestone — ${targetCount} ${targetCount === 1 ? 'deal' : 'deals'} closed`,
        },
      });
      if (error) throw error;
      const url = (data as { url?: string } | null)?.url;
      if (!url) throw new Error('No checkout URL returned');
      window.location.href = url;
    } catch (err) {
      const ctxErr = (err as { context?: { error?: string } })?.context?.error;
      const message = ctxErr || (err as { message?: string })?.message || '';
      const status = (err as { status?: number; context?: { status?: number } })?.status
        ?? (err as { context?: { status?: number } })?.context?.status;
      const isAuthFailure = status === 401 || status === 403
        || message.toLowerCase().includes('unauthorized');
      const diag = isAuthFailure ? await diagnoseAuthFailure() : null;
      toast({
        title: "Couldn't open the milestone payout",
        description: diag
          ? diag
          : isAuthFailure
            ? 'Your sign-in expired — please sign in again.'
          : message.includes('No milestone is currently due')
            ? 'This milestone has already been paid or retracted. Refresh the chat.'
          : message.includes('not enabled Vano Pay')
            ? 'The freelancer needs to enable Vano Pay first. Ask them to set it up in their profile.'
          : 'Please try again in a moment.',
        variant: 'destructive',
      });
      setPaying(false);
    }
  };

  return (
    <div className="my-1.5">
      <div className={cn(cardElevated, 'overflow-hidden')}>
        <div className="border-b border-primary/15 bg-primary/[0.04] px-4 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            <Target size={11} strokeWidth={2.5} />
            Milestone reached
          </p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-[14px] font-semibold leading-snug text-foreground">
            {message.content.replace(/^🎯\s*/, '')}
          </p>

          {/* Deal list — mono numerics + truncate so a long
               company name doesn't blow out the card width. */}
          <ul className="mt-2.5 space-y-1.5">
            {deals === null ? (
              <li className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                Loading deals…
              </li>
            ) : deals.length === 0 ? (
              <li className="text-[12px] text-muted-foreground">No deal data available.</li>
            ) : (
              deals.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 text-[12.5px]"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                    <span className="truncate text-foreground">
                      <span className="font-medium">{d.lead_name}</span>
                      {d.lead_company && (
                        <span className="text-muted-foreground"> · {d.lead_company}</span>
                      )}
                    </span>
                  </span>
                  {d.deal_amount_cents != null && d.deal_amount_cents > 0 && (
                    <span className="shrink-0 text-muted-foreground">
                      €{(d.deal_amount_cents / 100).toLocaleString('en-IE', {
                        minimumFractionDigits: d.deal_amount_cents % 100 === 0 ? 0 : 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  )}
                </li>
              ))
            )}
          </ul>

          <div
            className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-[13px]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            <span className="font-medium text-muted-foreground">Bonus due</span>
            <span className="text-[16px] font-bold text-foreground">{bonusEuro}</span>
          </div>

          {isHirer ? (
            <button
              type="button"
              onClick={pay}
              disabled={paying || !conversationId}
              className="group mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-[14px] font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.55)] transition-all duration-150 hover:brightness-[1.08] hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.99] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {paying ? (
                <><Loader2 size={15} className="animate-spin" /> Opening Stripe…</>
              ) : (
                <>
                  <ShieldCheck size={14} strokeWidth={2.5} />
                  Review &amp; pay {bonusEuro}
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          ) : (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
              <ShieldCheck size={12} strokeWidth={2.25} className="text-emerald-600 dark:text-emerald-400" />
              <span>Awaiting your client to release {bonusEuro} through Vano Pay.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
