import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  Circle,
  Briefcase,
  Euro,
} from 'lucide-react';
import {
  BONUS_STATUS_LABELS,
  STAGE_LABELS,
  STAGE_ORDER,
  STAGE_STYLES,
  computeBonusCents,
  formatEuro,
  type SalesDealRow,
  type SalesDealStage,
} from '@/lib/salesDeals';
import { cn } from '@/lib/utils';

// Freelancer-side deal pipeline for digital-sales listings. Shown in
// the freelancer's own /profile as a dedicated section; gated by the
// caller to digital-sales freelancers only (no point showing this to
// a videographer).
//
// Responsibilities:
//   - Load the freelancer's sales_deals rows
//   - Let them log a new lead (AddDealDialog)
//   - Move a deal between stages via per-row select
//   - Compute + display the bonus based on the freelancer's saved
//     bonus_rate / bonus_unit (snapshotted onto the row at close)
//   - Show a clean summary: total deals, wins, pending bonus, paid bonus
//
// The business-side approval / payout flow is a follow-up — this
// component just lays the pipeline down so both sides can agree on
// what's in play before Vano Pay starts settling bonuses.

export interface SalesPipelineBoardProps {
  /** Current user id. Must be a digital-sales freelancer; the caller
   *  checks the category so this component doesn't re-validate. */
  userId: string;
  /** Freelancer's saved bonus rate (from student_profiles). Used as
   *  the default rate on new closes until we snapshot it onto the
   *  deal row at close time. */
  defaultBonusRate: number | null;
  defaultBonusUnit: 'percentage' | 'flat' | null;
}

interface BusinessOption {
  userId: string;
  displayName: string;
  conversationId: string;
}

export function SalesPipelineBoard({
  userId,
  defaultBonusRate,
  defaultBonusUnit,
}: SalesPipelineBoardProps) {
  const { toast } = useToast();
  const [deals, setDeals] = useState<SalesDealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);

  // Load the freelancer's own deals. RLS guarantees we only see rows
  // where freelancer_id = auth.uid(), so a simple select covers it.
  const loadDeals = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sales_deals' as never)
      .select('*')
      .eq('freelancer_id' as never, userId as never)
      .order('updated_at', { ascending: false }) as { data: SalesDealRow[] | null; error: unknown };
    setLoading(false);
    if (error) {
      toast({
        title: "Couldn't load your pipeline",
        description: 'Refresh to try again.',
        variant: 'destructive',
      });
      return;
    }
    setDeals(data ?? []);
  };

  useEffect(() => {
    void loadDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Realtime subscription so a business confirming a close on their
  // side flips the freelancer's bonus_status chip without a reload.
  // Filtered to `freelancer_id=eq.userId` so a freelancer working on
  // dozens of pipelines across multiple businesses only gets events
  // from rows they actually own.
  useEffect(() => {
    const channel = supabase
      .channel(`sales-deals-freelancer-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales_deals',
          filter: `freelancer_id=eq.${userId}`,
        },
        () => {
          void loadDeals();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Resolve the set of businesses this freelancer can log deals
  // against — driven off the conversations table so we never end
  // up with a dropdown offering a "business" the freelancer has
  // never actually worked with. Lazy-loaded on first open of the
  // AddDealDialog so the pipeline renders instantly on mount.
  const loadBusinesses = async () => {
    if (businesses.length > 0) return;
    setLoadingBusinesses(true);
    try {
      const { data: convs, error: convErr } = await supabase
        .from('conversations')
        .select('id, participant_1, participant_2')
        .or(`participant_1.eq.${userId},participant_2.eq.${userId}`);
      if (convErr) throw convErr;
      const rows = (convs ?? []) as Array<{
        id: string; participant_1: string; participant_2: string;
      }>;
      const otherIds = Array.from(
        new Set(
          rows.map((r) => (r.participant_1 === userId ? r.participant_2 : r.participant_1)),
        ),
      );
      if (otherIds.length === 0) {
        setBusinesses([]);
        return;
      }
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, user_type')
        .in('user_id', otherIds);
      const businessIds = new Set(
        (profs ?? [])
          .filter((p) => p.user_type === 'business')
          .map((p) => p.user_id),
      );
      const nameByUser: Record<string, string> = {};
      (profs ?? []).forEach((p) => {
        nameByUser[p.user_id] = p.display_name || 'Business';
      });
      // One row per distinct business, keyed on the most-recent
      // conversation id so the deal can open back to it later.
      const seen = new Set<string>();
      const opts: BusinessOption[] = [];
      for (const r of rows) {
        const other = r.participant_1 === userId ? r.participant_2 : r.participant_1;
        if (!businessIds.has(other)) continue;
        if (seen.has(other)) continue;
        seen.add(other);
        opts.push({
          userId: other,
          displayName: nameByUser[other] ?? 'Business',
          conversationId: r.id,
        });
      }
      setBusinesses(opts);
    } catch {
      toast({
        title: "Couldn't load your businesses",
        description: 'Try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setLoadingBusinesses(false);
    }
  };

  const summary = useMemo(() => {
    const total = deals.length;
    const won = deals.filter((d) => d.stage === 'closed_won').length;
    const pendingBonus = deals
      .filter((d) => d.stage === 'closed_won' && d.bonus_status !== 'paid' && d.bonus_status !== 'waived')
      .reduce((acc, d) => acc + (d.bonus_amount_cents ?? 0), 0);
    const paidBonus = deals
      .filter((d) => d.bonus_status === 'paid')
      .reduce((acc, d) => acc + (d.bonus_amount_cents ?? 0), 0);
    return { total, won, pendingBonus, paidBonus };
  }, [deals]);

  const groupedByStage = useMemo(() => {
    const map = new Map<SalesDealStage, SalesDealRow[]>();
    for (const stage of STAGE_ORDER) map.set(stage, []);
    for (const d of deals) {
      map.get(d.stage)?.push(d);
    }
    return map;
  }, [deals]);

  const handleStageChange = async (deal: SalesDealRow, newStage: SalesDealStage) => {
    if (newStage === deal.stage) return;

    // When closing a deal, snapshot the freelancer's current bonus
    // rate onto the row so a later profile change can't alter
    // booked commissions. Percentage deals without a deal_amount
    // are allowed to close — bonus_amount_cents stays null until
    // the freelancer (or business) fills the amount in.
    const patch: Partial<SalesDealRow> = { stage: newStage };
    if (newStage === 'closed_won') {
      patch.bonus_rate = defaultBonusRate ?? deal.bonus_rate ?? null;
      patch.bonus_unit = defaultBonusUnit ?? deal.bonus_unit ?? null;
      patch.bonus_amount_cents = computeBonusCents({
        rate: patch.bonus_rate,
        unit: patch.bonus_unit,
        dealAmountCents: deal.deal_amount_cents,
      });
    }
    if (newStage === 'closed_lost') {
      // Closing lost wipes any bonus calc — nothing to pay out.
      patch.bonus_amount_cents = null;
      patch.bonus_status = 'waived';
    }

    const { error } = await supabase
      .from('sales_deals' as never)
      .update(patch as never)
      .eq('id' as never, deal.id as never);
    if (error) {
      toast({
        title: "Couldn't update the deal",
        description: 'Try again in a moment.',
        variant: 'destructive',
      });
      return;
    }
    await loadDeals();
  };

  const handleAmountChange = async (deal: SalesDealRow, euros: string) => {
    const trimmed = euros.trim();
    const cents = trimmed === ''
      ? null
      : (() => {
          const n = parseFloat(trimmed.replace(',', '.'));
          return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
        })();
    // When a won deal gets an amount filled in, recompute the bonus
    // using the rate snapshot already on the row (if any) or the
    // freelancer's current default.
    const patch: Partial<SalesDealRow> = { deal_amount_cents: cents };
    if (deal.stage === 'closed_won') {
      const rate = deal.bonus_rate ?? defaultBonusRate ?? null;
      const unit = deal.bonus_unit ?? defaultBonusUnit ?? null;
      patch.bonus_rate = rate;
      patch.bonus_unit = unit;
      patch.bonus_amount_cents = computeBonusCents({
        rate, unit, dealAmountCents: cents,
      });
    }
    const { error } = await supabase
      .from('sales_deals' as never)
      .update(patch as never)
      .eq('id' as never, deal.id as never);
    if (error) {
      toast({
        title: "Couldn't update the amount",
        description: 'Try again in a moment.',
        variant: 'destructive',
      });
      return;
    }
    await loadDeals();
  };

  const handleDelete = async (deal: SalesDealRow) => {
    if (!window.confirm(`Delete lead "${deal.lead_name} — ${deal.lead_company}"? This can't be undone.`)) {
      return;
    }
    const { error } = await supabase
      .from('sales_deals' as never)
      .delete()
      .eq('id' as never, deal.id as never);
    if (error) {
      toast({
        title: "Couldn't delete",
        description: 'Closed deals can\'t be removed — mark them waived instead.',
        variant: 'destructive',
      });
      return;
    }
    await loadDeals();
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      {/* ── Header + summary ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <TrendingUp size={16} strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Sales pipeline</h2>
              <p className="text-[12px] text-muted-foreground">
                Log leads, move them through stages, and keep your bonus math honest.
              </p>
            </div>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-9 shrink-0 rounded-xl"
          onClick={() => {
            void loadBusinesses();
            setAddOpen(true);
          }}
        >
          <Plus size={14} className="mr-1" strokeWidth={2.5} />
          Log a lead
        </Button>
      </div>

      {/* Summary chips */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryChip label="Total deals" value={String(summary.total)} />
        <SummaryChip label="Closed — won" value={String(summary.won)} />
        <SummaryChip label="Bonus pending" value={formatEuro(summary.pendingBonus)} tone="amber" />
        <SummaryChip label="Bonus paid" value={formatEuro(summary.paidBonus)} tone="emerald" />
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div className="mt-6 flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 size={18} className="mr-2 animate-spin" />
          <span className="text-sm">Loading your pipeline…</span>
        </div>
      ) : deals.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <Briefcase size={24} className="mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm font-semibold text-foreground">No leads logged yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Log your first lead — name, company, and a deal size if you've got one. You can move it through the stages as it progresses.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-4 h-9 rounded-xl"
            onClick={() => {
              void loadBusinesses();
              setAddOpen(true);
            }}
          >
            <Plus size={14} className="mr-1" strokeWidth={2.5} />
            Log your first lead
          </Button>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {STAGE_ORDER.map((stage) => {
            const rows = groupedByStage.get(stage) ?? [];
            if (rows.length === 0) return null;
            const styles = STAGE_STYLES[stage];
            return (
              <div key={stage}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', styles.dot)} />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {STAGE_LABELS[stage]}
                  </p>
                  <span className="text-[11px] text-muted-foreground/70">· {rows.length}</span>
                </div>
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {rows.map((deal) => (
                    <DealRow
                      key={deal.id}
                      deal={deal}
                      onStageChange={(s) => void handleStageChange(deal, s)}
                      onAmountChange={(v) => void handleAmountChange(deal, v)}
                      onDelete={() => void handleDelete(deal)}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <AddDealDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        freelancerId={userId}
        businesses={businesses}
        loadingBusinesses={loadingBusinesses}
        onCreated={() => {
          setAddOpen(false);
          void loadDeals();
        }}
      />
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'amber' | 'emerald';
}) {
  const toneClass =
    tone === 'emerald' ? 'text-emerald-700 dark:text-emerald-400'
    : tone === 'amber' ? 'text-amber-700 dark:text-amber-400'
    : 'text-foreground';
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-0.5 text-sm font-bold tabular-nums', toneClass)}>{value}</p>
    </div>
  );
}

function DealRow({
  deal,
  onStageChange,
  onAmountChange,
  onDelete,
}: {
  deal: SalesDealRow;
  onStageChange: (s: SalesDealStage) => void;
  onAmountChange: (v: string) => void;
  onDelete: () => void;
}) {
  const [amountDraft, setAmountDraft] = useState(
    deal.deal_amount_cents != null ? String(deal.deal_amount_cents / 100) : '',
  );
  useEffect(() => {
    setAmountDraft(deal.deal_amount_cents != null ? String(deal.deal_amount_cents / 100) : '');
  }, [deal.deal_amount_cents]);

  const closable = deal.stage !== 'closed_won' && deal.stage !== 'closed_lost';
  const bonus = deal.stage === 'closed_won'
    ? (deal.bonus_amount_cents ?? computeBonusCents({
        rate: deal.bonus_rate,
        unit: deal.bonus_unit,
        dealAmountCents: deal.deal_amount_cents,
      }))
    : null;

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {deal.lead_name}
        </p>
        <p className="truncate text-xs text-muted-foreground">{deal.lead_company}</p>
      </div>

      <div className="flex flex-1 items-center gap-2">
        <div className="relative flex-1">
          <Euro size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            className="h-9 pl-7 text-sm tabular-nums"
            inputMode="decimal"
            placeholder="Deal size"
            value={amountDraft}
            onChange={(e) => setAmountDraft(e.target.value)}
            onBlur={() => {
              const normalised = amountDraft.trim();
              const currentCents = deal.deal_amount_cents;
              const nextCents = normalised === ''
                ? null
                : (() => {
                    const n = parseFloat(normalised.replace(',', '.'));
                    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
                  })();
              if (nextCents !== currentCents) onAmountChange(normalised);
            }}
          />
        </div>
        <Select value={deal.stage} onValueChange={(v) => onStageChange(v as SalesDealStage)}>
          <SelectTrigger className="h-9 w-[11rem] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAGE_ORDER.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {STAGE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 sm:justify-end sm:min-w-[11rem]">
        {deal.stage === 'closed_won' ? (
          <div className="flex flex-col text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Bonus
            </p>
            <p className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {bonus != null ? formatEuro(bonus) : '€—'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {BONUS_STATUS_LABELS[deal.bonus_status]}
            </p>
          </div>
        ) : deal.stage === 'closed_lost' ? (
          <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Circle size={10} className="fill-rose-400/30 text-rose-400" />
            Closed lost
          </div>
        ) : closable ? (
          <button
            type="button"
            onClick={onDelete}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-rose-500/40 hover:bg-rose-500/5 hover:text-rose-500"
            title="Delete this lead"
            aria-label="Delete this lead"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>
    </li>
  );
}

function AddDealDialog({
  open,
  onOpenChange,
  freelancerId,
  businesses,
  loadingBusinesses,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  freelancerId: string;
  businesses: BusinessOption[];
  loadingBusinesses: boolean;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [leadName, setLeadName] = useState('');
  const [leadCompany, setLeadCompany] = useState('');
  const [dealEuros, setDealEuros] = useState('');
  const [businessId, setBusinessId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setLeadName('');
      setLeadCompany('');
      setDealEuros('');
      setBusinessId('');
      setNotes('');
      setSubmitting(false);
    }
  }, [open]);

  const canSubmit =
    leadName.trim().length > 0 &&
    leadCompany.trim().length > 0 &&
    businessId.length > 0 &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const business = businesses.find((b) => b.userId === businessId);
    const cents = (() => {
      const t = dealEuros.trim();
      if (!t) return null;
      const n = parseFloat(t.replace(',', '.'));
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
    })();
    const { error } = await supabase
      .from('sales_deals' as never)
      .insert({
        freelancer_id: freelancerId,
        business_id: businessId,
        conversation_id: business?.conversationId ?? null,
        lead_name: leadName.trim(),
        lead_company: leadCompany.trim(),
        deal_amount_cents: cents,
        notes: notes.trim() || null,
      } as never);
    setSubmitting(false);
    if (error) {
      toast({
        title: "Couldn't log that lead",
        description: 'Refresh and try again in a moment.',
        variant: 'destructive',
      });
      return;
    }
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a new lead</DialogTitle>
          <DialogDescription>
            Logs as <span className="font-medium text-foreground">Sourced</span>. Move it through stages as the deal progresses.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="deal-lead-name">Lead name</Label>
            <Input
              id="deal-lead-name"
              className="mt-1.5 h-10"
              placeholder="e.g. Niamh Byrne"
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              maxLength={140}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="deal-lead-company">Company</Label>
            <Input
              id="deal-lead-company"
              className="mt-1.5 h-10"
              placeholder="e.g. Acme Ltd"
              value={leadCompany}
              onChange={(e) => setLeadCompany(e.target.value)}
              maxLength={140}
            />
          </div>
          <div>
            <Label>Working for</Label>
            {loadingBusinesses && businesses.length === 0 ? (
              <div className="mt-1.5 flex h-10 items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                Loading your businesses…
              </div>
            ) : businesses.length === 0 ? (
              <p className="mt-1.5 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                No businesses found yet — message a client through a Vano conversation first, then come back here to log leads you're sourcing for them.
              </p>
            ) : (
              <Select value={businessId} onValueChange={setBusinessId}>
                <SelectTrigger className="mt-1.5 h-10">
                  <SelectValue placeholder="Pick the business" />
                </SelectTrigger>
                <SelectContent>
                  {businesses.map((b) => (
                    <SelectItem key={b.userId} value={b.userId}>
                      {b.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label htmlFor="deal-amount">
              Deal size (€) <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="deal-amount"
              className="mt-1.5 h-10"
              inputMode="decimal"
              placeholder="e.g. 2000"
              value={dealEuros}
              onChange={(e) => setDealEuros(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="deal-notes">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="deal-notes"
              className="mt-1.5 min-h-[60px] text-sm"
              placeholder="Context for you — how you found them, next step, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 flex-1 rounded-xl"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-10 flex-1 rounded-xl font-semibold"
            onClick={() => void submit()}
            disabled={!canSubmit}
          >
            {submitting ? (
              <><Loader2 size={14} className="mr-2 animate-spin" />Logging…</>
            ) : (
              <><CheckCircle2 size={14} className="mr-1.5" strokeWidth={2.5} />Log lead</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
