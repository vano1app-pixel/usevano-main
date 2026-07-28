import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, MessageCircle, Phone, ShieldAlert, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentPosition } from '@/lib/native/geolocation';
import { useToast } from '@/hooks/use-toast';

// ── Helper SOS — the panic button on the job screen ─────────────────────────
// A helper alone in a stranger's home must always have two moves within one
// tap: 999, and a silent "VANO, come get me" that pages the owner with their
// live location + the job details (functions/household-arrival `sos` action →
// notify-admin-whatsapp: WhatsApp + SMS + email).
//
// Rules this component lives by (same overlay law as the rest of the app):
// - 999 is ALWAYS first and always visible — VANO is not an emergency service.
// - Nothing here can dead-end: GPS is fail-soft (the alert goes out without a
//   fix), a failed/unconfirmed page falls back to direct WhatsApp + 999, and
//   close/Escape stay live in every state.
// - The customer never sees any of it: no booking writes, no job updates —
//   the SOS ledger is service-role only.
// - An active SOS survives a reload via localStorage (per booking); the red
//   banner keeps it one tap away until "I'm safe now".

const SOS_STORAGE_PREFIX = 'vano-sos-active-';
// Same number as the "Report a problem" line — the owner's WhatsApp.
const OWNER_WHATSAPP = '353899817111';

type Phase = 'idle' | 'sending' | 'sent' | 'error';

interface HelperSOSProps {
  bookingId: string;
  customerAddress: string;
  /** Fresh-at-send accessor for the last streamed GPS fix (may be null). */
  getLastPos: () => { lat: number; lng: number } | null;
  /** Called after a successful alert — the page restarts live GPS streaming. */
  onSosSent?: () => void;
}

export function HelperSOS({ bookingId, customerAddress, getLastPos, onSosSent }: HelperSOSProps) {
  const { toast } = useToast();
  const storageKey = `${SOS_STORAGE_PREFIX}${bookingId}`;
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [activeSince, setActiveSince] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // Restore an in-flight SOS after a reload/crash — the banner must come back.
  useEffect(() => {
    try {
      const stamp = localStorage.getItem(storageKey);
      if (stamp) { setActiveSince(stamp); setPhase('sent'); }
    } catch { /* private mode — state just lives for this visit */ }
  }, [storageKey]);

  // Escape always closes (the sheet hides; an in-flight alert keeps going).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const sendAlert = useCallback(async () => {
    setPhase('sending');
    // Best-effort fresh fix; fall back to the last streamed position; NEVER
    // block the alert on GPS — the job address rides along server-side.
    let coords: { lat: number; lng: number; accuracy?: number } | null = null;
    try {
      const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 });
      coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? undefined };
    } catch {
      coords = getLastPos();
    }
    try {
      const invoke = supabase.functions.invoke('household-arrival', {
        body: { booking_id: bookingId, action: 'sos', ...(coords ?? {}) },
      });
      // A hanging request must not strand the sheet in "sending" — after 12s
      // treat it as unconfirmed and show the direct WhatsApp/999 fallback.
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('sos-timeout')), 12000));
      const { data, error } = await Promise.race([invoke, timeout]);
      if (error || (data as { alerted?: boolean } | null)?.alerted === false) {
        setPhase('error');
        return;
      }
      const now = new Date().toISOString();
      try { localStorage.setItem(storageKey, now); } catch { /* best effort */ }
      setActiveSince(now);
      setPhase('sent');
      onSosSent?.();
    } catch {
      setPhase('error');
    }
  }, [bookingId, getLastPos, onSosSent, storageKey]);

  const markSafe = useCallback(async () => {
    if (resolving) return;
    setResolving(true);
    const { error } = await supabase.functions.invoke('household-arrival', {
      body: { booking_id: bookingId, action: 'sos_safe' },
    });
    setResolving(false);
    if (error) {
      toast({ title: "Couldn't update just now", description: 'No harm — the team has your alert and will still check on you.', variant: 'destructive' });
      return;
    }
    try { localStorage.removeItem(storageKey); } catch { /* best effort */ }
    setActiveSince(null);
    setPhase('idle');
    setOpen(false);
    toast({ title: "Glad you're safe ✓", description: 'The team has been told all is well.' });
  }, [bookingId, resolving, storageKey, toast]);

  const sosActive = !!activeSince;
  const alertedAt = activeSince
    ? new Date(activeSince).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })
    : null;
  const waHref = `https://wa.me/${OWNER_WHATSAPP}?text=${encodeURIComponent(
    `🆘 SOS — I need help on a VANO job (ref ${bookingId.slice(-8).toUpperCase()}) at ${customerAddress}. Please call me now.`,
  )}`;

  const call999 = (
    <div>
      <a
        href="tel:999"
        className="w-full h-14 rounded-full bg-destructive text-destructive-foreground font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        <Phone size={18} /> Call 999 now
      </a>
      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
        Garda &amp; ambulance — in real danger this always comes first.
      </p>
    </div>
  );

  return (
    <>
      {/* Header trigger — always within reach while the job is live */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Emergency SOS"
        className="h-9 px-3 rounded-full border-2 border-destructive/50 bg-destructive/5 text-destructive text-xs font-extrabold tracking-widest flex items-center gap-1.5 active:scale-95 transition-transform"
      >
        <ShieldAlert size={14} strokeWidth={2.5} /> SOS
      </button>

      {typeof document !== 'undefined' && createPortal(
        <>
          {/* Active-SOS banner — pinned under the header until "I'm safe now" */}
          <AnimatePresence>
            {sosActive && !open && (
              <motion.button
                key="sos-banner"
                type="button"
                onClick={() => setOpen(true)}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="fixed top-14 inset-x-0 z-[60] bg-destructive text-destructive-foreground text-xs font-semibold py-2.5 px-4 flex items-center justify-center gap-2"
              >
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/70" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </span>
                SOS active — the team has been alerted · Tap for options
              </motion.button>
            )}
          </AnimatePresence>

          {/* The emergency sheet */}
          <AnimatePresence>
            {open && (
              <>
                <motion.div
                  key="sos-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setOpen(false)}
                  className="fixed inset-0 z-[120] bg-primary/60 backdrop-blur-sm"
                />
                <motion.div
                  key="sos-sheet"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Emergency SOS"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'tween', duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="fixed inset-x-0 bottom-0 z-[121] rounded-t-3xl bg-background safe-area-bottom"
                >
                  <div className="max-w-sm mx-auto px-5 pt-3 pb-6">
                    <div className="w-9 h-1 rounded-full bg-border mx-auto mb-4" aria-hidden="true" />
                    <div className="flex items-center gap-2.5 mb-1">
                      <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                        <ShieldAlert size={18} className="text-destructive" />
                      </div>
                      <p className="text-lg font-bold text-foreground flex-1">Emergency</p>
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        aria-label="Close"
                        className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center active:scale-95 transition-transform"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {(phase === 'idle' || phase === 'sending') && (
                      <>
                        <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                          If you feel unsafe or something's wrong, act now — you'll never be in trouble for raising it.
                        </p>
                        {call999}
                        <div className="flex items-center gap-3 my-4" aria-hidden="true">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">or</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                        <button
                          type="button"
                          onClick={() => void sendAlert()}
                          disabled={phase === 'sending'}
                          className="w-full h-14 rounded-full bg-primary text-primary-foreground font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-70 active:scale-[0.98] transition-transform"
                        >
                          {phase === 'sending'
                            ? <><Loader2 size={18} className="animate-spin" /> Sending your location…</>
                            : <><ShieldAlert size={18} /> Alert the VANO team</>}
                        </button>
                        <p className="mt-1.5 text-center text-[11px] text-muted-foreground leading-relaxed">
                          Silently sends your live location and this job's details to a real person — expect a call within minutes. The customer is not told.
                        </p>
                      </>
                    )}

                    {phase === 'sent' && (
                      <>
                        <div className="rounded-2xl border border-sage/30 bg-sage-light p-4 mb-4">
                          <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                            <CheckCircle2 size={16} className="text-sage flex-shrink-0" />
                            The VANO team has been alerted{alertedAt ? ` · ${alertedAt}` : ''}
                          </p>
                          <p className="text-xs text-foreground/75 leading-relaxed mt-1">
                            Your location and this job's details are with a real person — keep your phone close, you'll get a call. If anything gets worse, call 999.
                          </p>
                        </div>
                        {call999}
                        <button
                          type="button"
                          onClick={() => void markSafe()}
                          disabled={resolving}
                          className="mt-4 w-full h-12 rounded-full bg-sage text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-transform"
                        >
                          {resolving ? <Loader2 size={16} className="animate-spin" /> : <><CheckCircle2 size={16} /> I'm safe now — all clear</>}
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpen(false)}
                          className="mt-2 w-full text-center text-xs text-muted-foreground underline underline-offset-2 py-1.5"
                        >
                          Close — keep SOS active
                        </button>
                      </>
                    )}

                    {phase === 'error' && (
                      <>
                        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/50 p-4 mb-4">
                          <p className="text-sm font-bold text-foreground">Couldn't confirm the team was reached</p>
                          <p className="text-xs text-foreground/75 leading-relaxed mt-1">
                            Your alert may still have been logged — but don't wait. Go direct:
                          </p>
                        </div>
                        {call999}
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-4 w-full h-12 rounded-full bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                        >
                          <MessageCircle size={16} /> WhatsApp the owner now
                        </a>
                        <button
                          type="button"
                          onClick={() => void sendAlert()}
                          className="mt-2 w-full text-center text-xs text-muted-foreground underline underline-offset-2 py-1.5"
                        >
                          Try the alert again
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>,
        document.body,
      )}
    </>
  );
}
