import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowUpRight,
  Banknote,
  Clock,
  Loader2,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Freelancer-side receipts panel. Lives on /profile inside the
// "extras" column for any freelancer with stripe_payouts_enabled.
// Shows the money they've actually earned through Vano Pay so
// "Vano Pay works" stops being an abstract claim and becomes a
// concrete running tally. Realtime-subscribed so a new transfer
// lands on the panel (and via toast) without a refresh.

interface EarningsRow {
  id: string;
  amount_cents: number;
  fee_cents: number;
  description: string | null;
  business_id: string;
  status: 'paid' | 'transferred' | 'refunded';
  sales_deal_id: string | null;
  completed_at: string | null;
  released_at: string | null;
  created_at: string;
}

interface EarningsPanelProps {
  userId: string;
}

export function FreelancerEarningsPanel({ userId }: EarningsPanelProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<EarningsRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  // Initial load + refresh helper. Pulls the most recent 10 rows
  // in a non-transient state — awaiting_payment rows aren't
  // receipts yet, so we skip them.
  const load = async () => {
    const { data, error } = await supabase
      .from('vano_payments')
      .select('id, amount_cents, fee_cents, description, business_id, status, sales_deal_id, completed_at, released_at, created_at')
      .eq('freelancer_id', userId)
      .in('status', ['paid', 'transferred', 'refunded'])
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) {
      setRows([]);
      return;
    }
    // sales_deal_id was added by a later migration; the generated
    // DB types may not include it yet, so cast through unknown.
    const typed = (data ?? []) as unknown as EarningsRow[];
    setRows(typed);

    // Resolve business display names in one round-trip so each row
    // can render "from X" without a fan-out.
    const ids = Array.from(new Set(typed.map((r) => r.business_id)));
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p) => {
        map[p.user_id] = p.display_name || 'A business';
      });
      setNames(map);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Realtime — fires the "+ €X just landed" toast the moment a
  // payment actually lands in the freelancer's Connect account
  // (status=transferred). Also catches the initial payment
  // (awaiting → paid) and dispute/refund flips so the panel stays
  // in sync with what the business is seeing on their side.
  useEffect(() => {
    const channel = supabase
      .channel(`earnings-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vano_payments',
          filter: `freelancer_id=eq.${userId}`,
        },
        (payload) => {
          const newRow = payload.new as Partial<EarningsRow> | null;
          const oldRow = payload.old as Partial<EarningsRow> | null;
          void load();
          // Only celebrate the actual money-hits-your-bank moment
          // (status transitioning into `transferred`), not every
          // intermediate write.
          if (
            newRow?.status === 'transferred' &&
            oldRow?.status !== 'transferred' &&
            typeof newRow.amount_cents === 'number' &&
            typeof newRow.fee_cents === 'number'
          ) {
            const net = newRow.amount_cents - newRow.fee_cents;
            toast({
              title: `€${(net / 100).toFixed(2)} just landed`,
              description: newRow.sales_deal_id
                ? 'Sales bonus — paid straight to your bank via Vano Pay.'
                : 'Vano Pay released to your bank — 1–2 business days to arrive.',
            });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const summary = useMemo(() => {
    if (!rows) return { lifetimeNetCents: 0, monthNetCents: 0, transferredCount: 0, pendingCents: 0 };
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startMs = startOfMonth.getTime();
    let lifetime = 0;
    let month = 0;
    let transferredCount = 0;
    let pending = 0;
    for (const r of rows) {
      const net = r.amount_cents - r.fee_cents;
      if (r.status === 'transferred') {
        lifetime += net;
        transferredCount += 1;
        const when = r.released_at || r.completed_at || r.created_at;
        if (when && new Date(when).getTime() >= startMs) {
          month += net;
        }
      } else if (r.status === 'paid') {
        // Money is in Vano's escrow, not yet released to the
        // freelancer — surfaced as "in escrow" so they know
        // what's coming.
        pending += net;
      }
    }
    return {
      lifetimeNetCents: lifetime,
      monthNetCents: month,
      transferredCount,
      pendingCents: pending,
    };
  }, [rows]);

  if (!rows) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          Loading your earnings…
        </div>
      </div>
    );
  }

  // Brand-new Vano Pay freelancer with no receipts yet. Friendly
  // empty state rather than a hollow card so a first-time visit
  // feels intentional.
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Banknote size={18} strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Your Vano Pay earnings
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              No payments yet. Once a client pays you through Vano Pay, receipts land here automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start gap-3 border-b border-border/60 bg-gradient-to-br from-primary/5 via-card to-card px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Banknote size={18} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Vano Pay earnings
          </p>
          <h2 className="mt-0.5 text-lg font-bold text-foreground">
            €{(summary.lifetimeNetCents / 100).toLocaleString('en-IE', {
              minimumFractionDigits: summary.lifetimeNetCents % 100 === 0 ? 0 : 2,
              maximumFractionDigits: 2,
            })}
            <span className="ml-1.5 text-xs font-semibold text-muted-foreground">lifetime</span>
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {summary.transferredCount} payment{summary.transferredCount === 1 ? '' : 's'} released
            {summary.monthNetCents > 0 && (
              <> · €{(summary.monthNetCents / 100).toFixed(summary.monthNetCents % 100 === 0 ? 0 : 2)} this month</>
            )}
            {summary.pendingCents > 0 && (
              <> · €{(summary.pendingCents / 100).toFixed(summary.pendingCents % 100 === 0 ? 0 : 2)} in escrow</>
            )}
          </p>
        </div>
      </div>

      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const net = r.amount_cents - r.fee_cents;
          const payer = names[r.business_id] ?? 'A business';
          const when = r.released_at || r.completed_at || r.created_at;
          const niceDate = new Date(when).toLocaleDateString('en-IE', {
            day: 'numeric',
            month: 'short',
          });
          return (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  r.status === 'transferred' && 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
                  r.status === 'paid' && 'bg-primary/10 text-primary',
                  r.status === 'refunded' && 'bg-muted text-muted-foreground',
                )}
              >
                {r.status === 'transferred' ? (
                  <ArrowUpRight size={14} strokeWidth={2.5} />
                ) : r.status === 'paid' ? (
                  <ShieldCheck size={14} strokeWidth={2.25} />
                ) : (
                  <Clock size={14} strokeWidth={2.25} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <span className="tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    €{(net / 100).toFixed(net % 100 === 0 ? 0 : 2)}
                  </span>
                  {r.sales_deal_id && (
                    <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-primary">
                      <TrendingUp size={8} strokeWidth={2.75} />
                      Bonus
                    </span>
                  )}
                  <span className="text-xs font-normal text-muted-foreground">
                    from {payer}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {r.status === 'transferred'
                    ? `Released ${niceDate}`
                    : r.status === 'paid'
                    ? `Paid into escrow ${niceDate} — awaiting release`
                    : `Refunded ${niceDate}`}
                  {r.description && (
                    <> · <span className="text-foreground/70">{r.description}</span></>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
