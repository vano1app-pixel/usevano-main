import { useEffect, useState } from 'react';
import { X, Loader2, Sparkles } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useVanoPayConfig } from '@/lib/vanoPayConfig';

// Business-side modal for initiating a Vano Pay payment inside a
// conversation. Collects amount (€) + optional description, shows a
// preview of "you pay / freelancer receives / Vano keeps" splits,
// and hands off to Stripe Checkout.
//
// The edge function does all the validation (freelancer must have
// Vano Pay enabled, amount bounds, etc.) — we surface its errors
// via toast so the modal stays dumb. Fee / bounds are fetched from
// get-vano-pay-config so a server-side fee change needs no frontend
// redeploy.

export function VanoPayModal({
  open,
  onClose,
  conversationId,
  freelancerName,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  freelancerName: string;
}) {
  const { toast } = useToast();
  const { feeBps, minCents } = useVanoPayConfig();
  const feePercentLabel = `${(feeBps / 100).toFixed(feeBps % 100 === 0 ? 0 : 1)}%`;
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset fields when the modal opens so a previous aborted payment
  // doesn't ghost the next one.
  useEffect(() => {
    if (open) {
      setAmount('');
      setDescription('');
      setSubmitting(false);
    }
  }, [open]);

  // Lock background scroll while modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const amountNumber = Number.parseFloat(amount);
  const amountCents = Number.isFinite(amountNumber) && amountNumber > 0 ? Math.round(amountNumber * 100) : 0;
  const feeCents = amountCents > 0 ? Math.max(1, Math.round((amountCents * feeBps) / 10000)) : 0;
  const freelancerCents = amountCents - feeCents;
  const canSubmit = amountCents >= minCents && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-vano-payment-checkout', {
        body: {
          conversation_id: conversationId,
          amount_cents: amountCents,
          description: description.trim() || undefined,
        },
      });
      if (error) throw error;
      const url = (data as { url?: string } | null)?.url;
      if (!url) throw new Error('No checkout URL returned');
      window.location.href = url;
    } catch (err) {
      console.error('[vano-pay-modal] checkout failed', err);
      const message = (err as { message?: string; context?: { error?: string } })?.context?.error
        || (err as { message?: string })?.message
        || '';
      toast({
        title: "Couldn't start Vano Pay",
        description:
          message.includes('not enabled Vano Pay')
            ? `${freelancerName} hasn't enabled Vano Pay yet. Ask them to turn it on in their profile.`
          : message.includes('at least €1')
            ? 'Amount must be at least €1.00.'
          : 'Please try again in a moment.',
        variant: 'destructive',
      });
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-primary" />
            <p className="text-sm font-semibold text-foreground">Pay {freelancerName} via Vano</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Short trust blurb — reminds hirers why they're paying the
              fee: the platform handles card handling, receipts, refund
              escalation, and keeps a record both sides can reference. */}
          <div className="rounded-xl border border-primary/20 bg-primary/[0.05] px-3.5 py-2.5 text-[12px] leading-relaxed text-foreground">
            <p className="font-semibold">Pay safely through Vano</p>
            <p className="mt-0.5 text-muted-foreground">
              Card handled by Stripe. Receipt kept in the thread. If anything goes wrong, we've got the payment record to help sort it.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">Amount (€)</label>
            <input
              type="number"
              inputMode="decimal"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">What's this for? (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Wedding video deposit, logo design, etc."
              maxLength={200}
              className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {amountCents >= minCents ? (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">You pay</span>
                <span className="font-semibold text-foreground">€{(amountCents / 100).toFixed(2)}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-muted-foreground">{freelancerName} receives</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  €{(freelancerCents / 100).toFixed(2)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between border-t border-border pt-1.5">
                <span className="text-muted-foreground">Vano fee ({feePercentLabel})</span>
                <span className="font-medium text-muted-foreground">€{(feeCents / 100).toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Minimum €{(minCents / 100).toFixed(2)} — Vano takes {feePercentLabel}, freelancer gets the rest.
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <><Loader2 size={14} className="animate-spin" /> Opening Stripe…</>
            ) : (
              amountCents >= minCents
                ? <>Pay €{(amountCents / 100).toFixed(2)} now</>
                : 'Enter an amount'
            )}
          </button>

          <p className="text-center text-[10px] text-muted-foreground">
            You'll be redirected to Stripe's secure checkout to enter your card details.
          </p>
        </div>
      </div>
    </div>
  );
}
