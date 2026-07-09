import React, { useState } from 'react';
import { Loader2, Mail, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { extractFnError } from '@/lib/fnError';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Quick-book collects only a phone number, so most bookings have no email —
 * which means no confirmation, no pay-link email, no receipt. This card lets
 * the customer opt in after booking, with zero friction added to the booking
 * itself. Hidden once the booking already has an email.
 */
export const BookingEmailCapture: React.FC<{
  bookingId: string;
  /** Email already on the booking — when set (and we didn't just save it), the card hides. */
  currentEmail: string | null;
  onSaved: (email: string) => void;
}> = ({ bookingId, currentEmail, onSaved }) => {
  const [email,   setEmail]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Booking already has an email (and not via this card) → nothing to ask.
  // Stays mounted after our own save so the confirmation is visible.
  if (currentEmail && !saved) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) { setError('Please enter a valid email.'); return; }
    setSaving(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        'set-booking-email',
        { body: { booking_id: bookingId, email: clean } },
      );
      if (fnErr || (data as { error?: string } | null)?.error) {
        // On non-2xx the real server message hides in fnErr.context, not
        // fnErr.message ("Edge Function returned a non-2xx status code").
        throw new Error(await extractFnError(data, fnErr, 'Could not save. Please try again.'));
      }
      setSaved(true);
      onSaved(clean);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="mt-4 rounded-2xl border border-border/60 bg-secondary/30 px-4 py-3 flex items-center gap-2.5">
        <Check className="w-4 h-4 text-sage flex-shrink-0" strokeWidth={2.5} />
        <p className="text-xs text-foreground/70">
          You're on the list — we'll email you every update for this booking.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-border/60 bg-secondary/30 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <p className="text-xs font-semibold text-foreground">Want updates by email too?</p>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Confirmation, pay link and receipt straight to your inbox. Optional.
      </p>
      <form onSubmit={save} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setError(null); }}
          placeholder="you@example.com"
          autoComplete="email"
          className="flex-1 min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={saving || !email.trim()}
          className="px-4 py-2 rounded-xl bg-foreground text-background text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 flex-shrink-0 transition-opacity"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
        </button>
      </form>
      {error && <p className="text-[11px] text-destructive mt-1.5">{error}</p>}
    </div>
  );
};
