import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowDownLeft,
  Banknote,
  Clock,
  Loader2,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Business-side spend panel — mirror of FreelancerEarningsPanel but
// viewed from the paying side. Shows where Vano Pay money has gone
// over the last 10 payments, grouped by status so a business can
// see at a glance:
//   - What's in escrow (paid, awaiting release)
//   - What's already released to freelancers (transferred)
//   - What's been refunded back to them
//
// Bonus-originated rows get the same TrendingUp "Bonus" badge the
// freelancer side shows, so sales-pipeline payouts are distinguishable
// from ordinary hourly/project payments at a glance.

interface SpendRow {
  id: string;
  amount_cents: number;
  fee_cents: number;
  description: string | null;
  freelancer_id: string;
  conversation_id: string | null;
  status: 'awaiting_payment' | 'paid' | 'transferred' | 'refunded';
  sales_deal_id: string | null;
  completed_at: string | null;
  released_at: string | null;
  refunded_at: string | null;
  created_at: string;
}

interface BusinessSpendPanelProps {
  userId: string;
}

export function BusinessSpendPanel({ userId }: BusinessSpendPanelProps) {
  const [rows, setRows] = useState<SpendRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  const load = async () => {
    const { data, error } = await supabase
      .from('vano_payments')
      .select('id, amount_cents, fee_cents, description, freelancer_id, conversation_id, status, sales_deal_id, completed_at, released_at, refunded_at, created_at')
      .eq('business_id', userId)
      .in('status', ['paid', 'transferred', 'refunded'])
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) {
      setRows([]);
      return;
    }
    // sales_deal_id was added by a later migration; cast via unknown.
    const typed = (data ?? []) as unknown as SpendRow[];
    setRows(typed);

    // Resolve freelancer names in one round-trip so rows can say
    // "to Ellie" instead of "to a freelancer".
    const ids = Array.from(new Set(typed.map((r) => r.freelancer_id)));
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p) => {
        map[p.user_id] = p.display_name || 'A freelancer';
      });
      setNames(map);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Realtime — pulls in new entries when a Checkout completes or a
  // release fires, so the dashboard stays in sync with conversations.
  useEffect(() => {
    const channel = supabase
      .channel(`spend-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vano_payments',
          filter: `business_id=eq.${userId}`,
        },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const summary = useMemo(() => {
    if (!rows) return { paidOut: 0, inEscrow: 0, refunded: 0, count: 0 };
    let paidOut = 0;
    let inEscrow = 0;
    let refunded = 0;
    for (const r of rows) {
      if (r.status === 'transferred') paidOut += r.amount_cents;
      else if (r.status === 'paid') inEscrow += r.amount_cents;
      else if (r.status === 'refunded') refunded += r.amount_cents;
    }
    return { paidOut, inEscrow, refunded, count: rows.length };
  }, [rows]);

  if (!rows) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          Loading your Vano Pay spend…
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Banknote size={18} strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Vano Pay spend
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              No payments yet. Once you pay a freelancer through Vano Pay, your receipts will show up here.
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
            Vano Pay spend
          </p>
          <h2 className="mt-0.5 text-lg font-bold text-foreground">
            €{(summary.paidOut / 100).toLocaleString('en-IE', {
              minimumFractionDigits: summary.paidOut % 100 === 0 ? 0 : 2,
              maximumFractionDigits: 2,
            })}
            <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
              spent through Vano Pay
            </span>
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {summary.count} payment{summary.count === 1 ? '' : 's'} total
            {summary.inEscrow > 0 && (
              <> · €{(summary.inEscrow / 100).toFixed(summary.inEscrow % 100 === 0 ? 0 : 2)} in escrow</>
            )}
            {summary.refunded > 0 && (
              <> · €{(summary.refunded / 100).toFixed(summary.refunded % 100 === 0 ? 0 : 2)} refunded</>
            )}
          </p>
        </div>
      </div>

      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const recipient = names[r.freelancer_id] ?? 'A freelancer';
          const when = r.released_at || r.refunded_at || r.completed_at || r.created_at;
          const niceDate = new Date(when).toLocaleDateString('en-IE', {
            day: 'numeric',
            month: 'short',
          });
          // Rows link back to the conversation where the payment
          // lives. Escrow actions (release, dispute, refund) live
          // in the thread UI — keeping the entry point one tap
          // away saves a "now where was that conversation again?"
          // hunt. Falls back to a non-clickable li when
          // conversation_id is missing (legacy rows) rather than
          // routing to a broken link.
          const inner = (
            <div className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  r.status === 'transferred' && 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
                  r.status === 'paid' && 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
                  r.status === 'refunded' && 'bg-muted text-muted-foreground',
                )}
              >
                {r.status === 'transferred' ? (
                  <ArrowDownLeft size={14} strokeWidth={2.5} />
                ) : r.status === 'paid' ? (
                  <ShieldCheck size={14} strokeWidth={2.25} />
                ) : (
                  <Clock size={14} strokeWidth={2.25} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <span className="tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    €{(r.amount_cents / 100).toFixed(r.amount_cents % 100 === 0 ? 0 : 2)}
                  </span>
                  {r.sales_deal_id && (
                    <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-primary">
                      <TrendingUp size={8} strokeWidth={2.75} />
                      Bonus
                    </span>
                  )}
                  <span className="text-xs font-normal text-muted-foreground">
                    to {recipient}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {r.status === 'transferred'
                    ? `Released ${niceDate}`
                    : r.status === 'paid'
                    ? `In escrow since ${niceDate}`
                    : `Refunded ${niceDate}`}
                  {r.description && (
                    <> · <span className="text-foreground/70">{r.description}</span></>
                  )}
                </p>
              </div>
            </div>
          );
          return (
            <li key={r.id}>
              {r.conversation_id ? (
                <Link to={`/messages?open=${r.conversation_id}`} className="block">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
