import { useEffect, useState } from 'react';
import { X, Loader2, ShieldCheck, ArrowRight } from 'lucide-react';

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
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]">
        {/* Close sits in-corner without a heavy header border so the
            modal reads as a focused checkout, not a form. */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="px-6 pb-6 pt-7">
          {/* Header — no border, generous leading, tighter tracking so
              the freelancer's name is the anchor. */}
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Vano Pay
          </p>
          <h2 className="mt-1 text-[22px] font-semibold leading-tight tracking-tight text-foreground">
            Pay <span className="text-primary">{freelancerName}</span>
          </h2>

          {/* Amount input is the hero. Big tabular-nums digits, prefixed
              €, minimal chrome. Feels like a POS screen, not a form. */}
          <div className="mt-6">
            <label htmlFor="vano-pay-amount" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Amount
            </label>
            <div className="group relative flex items-baseline rounded-2xl border border-input bg-background px-4 py-4 transition-colors focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10">
              <span className="mr-1.5 text-[28px] font-semibold text-muted-foreground">€</span>
              <input
                id="vano-pay-amount"
                type="number"
                inputMode="decimal"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="w-full bg-transparent text-[32px] font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </div>
          </div>

          {/* Optional note — visually quieter so it reads as optional. */}
          <div className="mt-3">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this for? (optional)"
              maxLength={200}
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10"
            />
          </div>

          {/* Breakdown — stripped of the bordered-box look. Rows with a
              hairline divider above the fee line so the eye lands on
              "freelancer receives" first. Tabular-nums keeps euros
              aligned. */}
          {amountCents >= minCents ? (
            <dl className="mt-5 space-y-2 text-[13px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">You pay</dt>
                <dd className="font-medium text-foreground">€{(amountCents / 100).toFixed(2)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{freelancerName} receives</dt>
                <dd className="font-semibold text-emerald-700 dark:text-emerald-300">
                  €{(freelancerCents / 100).toFixed(2)}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-border/70 pt-2 text-[12px]">
                <dt className="text-muted-foreground">Vano fee · {feePercentLabel}</dt>
                <dd className="text-muted-foreground">€{(feeCents / 100).toFixed(2)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-[12px] text-muted-foreground">
              Minimum €{(minCents / 100).toFixed(2)}. Vano takes {feePercentLabel}; the rest goes straight to {freelancerName}.
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 text-[15px] font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.55)] transition-all duration-150 hover:brightness-[1.08] hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.99] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {submitting ? (
              <><Loader2 size={16} className="animate-spin" /> Opening Stripe…</>
            ) : amountCents >= minCents ? (
              <>
                Pay €{(amountCents / 100).toFixed(2)}
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </>
            ) : (
              'Enter an amount'
            )}
          </button>

          {/* Footer trust — explains the escrow promise in the moment
               of payment: money is HELD on Vano, hirer releases on
               delivery, 14-day auto-release if nothing happens. This
               is the bit that justifies the 3% fee on its own merits. */}
          <div className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck size={13} className="mt-[2px] shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p>
              We hold your payment until you release it. 14-day auto-release if you don't act. Full refund on dispute.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
