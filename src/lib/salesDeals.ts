// Shared helpers for the digital-sales deal pipeline. Lives in lib so
// the freelancer-side list, the add-deal modal, and any future
// business-side approval surface all share one place for stage
// colours, formatters, and the bonus-computation rule.

export type SalesDealStage =
  | 'sourced'
  | 'qualified'
  | 'meeting'
  | 'proposal'
  | 'closed_won'
  | 'closed_lost';

export type SalesDealBonusStatus =
  | 'pending'
  | 'approved'
  | 'paid'
  | 'waived'
  | 'disputed';

export interface SalesDealRow {
  id: string;
  freelancer_id: string;
  business_id: string;
  conversation_id: string | null;
  lead_name: string;
  lead_company: string;
  notes: string | null;
  deal_amount_cents: number | null;
  stage: SalesDealStage;
  bonus_rate: number | null;
  bonus_unit: 'percentage' | 'flat' | null;
  bonus_amount_cents: number | null;
  bonus_status: SalesDealBonusStatus;
  bonus_payment_id: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const STAGE_ORDER: readonly SalesDealStage[] = [
  'sourced',
  'qualified',
  'meeting',
  'proposal',
  'closed_won',
  'closed_lost',
] as const;

export const STAGE_LABELS: Record<SalesDealStage, string> = {
  sourced: 'Sourced',
  qualified: 'Qualified',
  meeting: 'Meeting',
  proposal: 'Proposal',
  closed_won: 'Closed — won',
  closed_lost: 'Closed — lost',
};

/** Tailwind classes for the stage chip + subtle accent colour.
 *  Kept as string pairs (not JSX) so the same palette can be used
 *  in both the chip row and the rail column if we ever go kanban. */
export const STAGE_STYLES: Record<SalesDealStage, { chip: string; dot: string }> = {
  sourced:     { chip: 'bg-muted text-muted-foreground border-border',                              dot: 'bg-muted-foreground/50' },
  qualified:   { chip: 'bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-300',            dot: 'bg-sky-500' },
  meeting:     { chip: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/25 dark:text-indigo-300',dot: 'bg-indigo-500' },
  proposal:    { chip: 'bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300',    dot: 'bg-amber-500' },
  closed_won:  { chip: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300', dot: 'bg-emerald-500' },
  closed_lost: { chip: 'bg-rose-500/10 text-rose-700 border-rose-500/25 dark:text-rose-300',        dot: 'bg-rose-400' },
};

export const BONUS_STATUS_LABELS: Record<SalesDealBonusStatus, string> = {
  pending:   'Awaiting business',
  approved:  'Approved — awaiting payout',
  paid:      'Paid',
  waived:    'Waived',
  disputed:  'Disputed',
};

/** Euro formatter for cents — the whole app deals in integer cents
 *  to dodge floating-point pain, so we centralise the convert-and-
 *  format step here. Returns "€—" for null so the UI has a safe
 *  placeholder it can render without a conditional. */
export function formatEuro(cents: number | null | undefined): string {
  if (cents == null) return '€—';
  const euros = cents / 100;
  // Show decimals only when they're non-zero — €1,200 reads cleaner
  // than €1,200.00 on a dense pipeline row.
  return euros % 1 === 0
    ? `€${euros.toLocaleString('en-IE', { maximumFractionDigits: 0 })}`
    : `€${euros.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Computes the bonus for a deal given the freelancer's rate +
 *  unit and the deal amount. Returns null when we can't compute
 *  (e.g. percentage but no deal amount yet) so the caller can
 *  render "—" instead of a misleading €0.
 *
 *  Matches the DB CHECK — bonus_amount_cents >= 0 — by flooring to
 *  zero if a weird input sneaks through. */
export function computeBonusCents(params: {
  rate: number | null | undefined;
  unit: 'percentage' | 'flat' | null | undefined;
  dealAmountCents: number | null | undefined;
}): number | null {
  const { rate, unit, dealAmountCents } = params;
  if (rate == null || !unit) return null;
  if (unit === 'percentage') {
    if (dealAmountCents == null) return null;
    const raw = Math.round((dealAmountCents * rate) / 100);
    return Math.max(0, raw);
  }
  // Flat — rate is already in euros per close, convert to cents.
  return Math.max(0, Math.round(rate * 100));
}
