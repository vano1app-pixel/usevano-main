import { useEffect, useState } from 'react';
import { X, Loader2, Target, ArrowRight } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Modal for setting (or adjusting) the target-based commission rule
// on a digital-sales conversation. Two fields:
//
//   • Deals per cycle — how many closed_won deals before a bonus is
//     paid. Default 3. 1 = the per-deal model (one payout per
//     closed deal). The CHECK constraint on the DB caps at 50 to
//     stop typos like "300 deals = €5,000" from making the panel
//     useless for years.
//
//   • Bonus per cycle — what the rep gets paid each time the count
//     hits the target. Stored as cents on the conversation; the
//     create-vano-payment-checkout function validates the modal's
//     submitted amount matches the configured bonus exactly so a
//     stale client can't tamper with the figure.
//
// Both fields are written straight to the conversations row. Either
// participant can set/adjust the target — the conversations RLS
// policy "Participants can update conversations" already allows it.
// On save, sales_target_set_at is stamped so we have an audit
// breadcrumb without doing an event-sourcing detour.
//
// The trigger that drops the milestone card on closed_won deals
// reads these columns directly, so flipping them on instantly
// changes which deals "count" toward the next milestone.

export function SetTargetModal({
  open,
  onClose,
  conversationId,
  initialCount,
  initialBonusCents,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  initialCount: number | null;
  initialBonusCents: number | null;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  // String form so the inputs can be fully cleared while typing —
  // keeping these as numbers would replace empty strings with 0 and
  // make the placeholder vanish.
  const [count, setCount] = useState('');
  const [bonus, setBonus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCount(initialCount != null ? String(initialCount) : '3');
    setBonus(initialBonusCents != null ? (initialBonusCents / 100).toString() : '');
    setSubmitting(false);
  }, [open, initialCount, initialBonusCents]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const countNumber = Number.parseInt(count, 10);
  const bonusNumber = Number.parseFloat(bonus);
  const bonusCents = Number.isFinite(bonusNumber) && bonusNumber > 0
    ? Math.round(bonusNumber * 100)
    : 0;
  const validCount = Number.isFinite(countNumber) && countNumber >= 1 && countNumber <= 50;
  const validBonus = bonusCents >= 100; // €1.00 minimum mirrors Vano Pay's MIN_AMOUNT_CENTS
  const canSubmit = validCount && validBonus && !submitting;

  const perDealAvg = validCount && validBonus
    ? `~€${(bonusCents / countNumber / 100).toFixed(bonusCents % (countNumber * 100) === 0 ? 0 : 2)} per deal`
    : '';

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('conversations')
        // Cast through unknown — the regenerated DB types don't yet
        // know about the sales_target_* columns added in migration
        // 20260428130000. RLS gates the write to participants only.
        .update({
          sales_target_count: countNumber,
          sales_target_bonus_cents: bonusCents,
          sales_target_set_at: new Date().toISOString(),
        } as unknown as Record<string, unknown>)
        .eq('id', conversationId);
      if (error) throw error;
      toast({
        title: 'Commission target saved',
        description: `${countNumber} ${countNumber === 1 ? 'deal' : 'deals'} = €${(bonusCents / 100).toFixed(bonusCents % 100 === 0 ? 0 : 2)}`,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('[set-target] save failed', err);
      toast({
        title: "Couldn't save the target",
        description: 'Please try again in a moment.',
        variant: 'destructive',
      });
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="px-6 pb-6 pt-7">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Target size={11} strokeWidth={2.5} />
            Commission target
          </p>
          <h2 className="mt-1 text-[20px] font-semibold leading-tight tracking-tight text-foreground">
            Agree how the bonus is paid
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            Set how many closed deals add up to one bonus payout. <span className="font-medium text-foreground">Use 1</span> to pay per deal; <span className="font-medium text-foreground">3</span> for "every three deals" batches; up to 50.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="set-target-count"
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              >
                Deals per bonus
              </label>
              <input
                id="set-target-count"
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                step={1}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="3"
                className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-[18px] font-semibold tracking-tight text-foreground transition-colors focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </div>
            <div>
              <label
                htmlFor="set-target-bonus"
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              >
                Bonus
              </label>
              <div className="flex items-baseline rounded-xl border border-input bg-background px-3.5 py-3 transition-colors focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10">
                <span className="mr-1 text-[16px] font-semibold text-muted-foreground">€</span>
                <input
                  id="set-target-bonus"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="0.01"
                  value={bonus}
                  onChange={(e) => setBonus(e.target.value)}
                  placeholder="1500"
                  className="w-full bg-transparent text-[18px] font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />
              </div>
            </div>
          </div>

          {perDealAvg && (
            <p className="mt-2 text-[11px] text-muted-foreground/85">
              {perDealAvg} on average — paid in one transfer when the rep hits the target.
            </p>
          )}

          {/* Note on fees + escrow — stays terse. The full mechanics
               (held by Vano, 14-day auto-release, dispute path) are
               re-explained in VanoPayModal at decision time, so we
               don't need to re-teach them here. */}
          <p className="mt-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Each milestone is paid through Vano Pay — held in escrow, released by you (or auto-released after 14 days). Vano takes 3% of the bonus.
          </p>

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="group mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-[14px] font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.55)] transition-all duration-150 hover:brightness-[1.08] hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.99] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {submitting ? (
              <><Loader2 size={15} className="animate-spin" /> Saving…</>
            ) : initialCount != null ? (
              <>Update target <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" /></>
            ) : (
              <>Save commission target <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
