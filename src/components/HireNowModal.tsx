import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { isEmailVerified } from '@/lib/authSession';
import {
  HIRE_TIMELINES,
  HIRE_BUDGETS,
  DIRECT_HIRE_EXPIRY_HOURS,
} from '@/lib/hireOptions';
import { cn } from '@/lib/utils';
import { Zap, AlertTriangle, Loader2, Clock, MailWarning, CheckCircle2 } from 'lucide-react';
import { track } from '@/lib/track';

interface HireNowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  freelancerId: string;
  freelancerName: string;
  category?: string | null;
}

/**
 * Instant-hire flow: creates a direct hire_request targeting this freelancer
 * with a 2hr expiry. Freelancer gets notified (in-app + push + email via
 * edge function). If they don't respond in time, the request auto-expires.
 */
export const HireNowModal: React.FC<HireNowModalProps> = ({
  open,
  onOpenChange,
  freelancerId,
  freelancerName,
  category,
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [brief, setBrief] = useState('');
  const [timeline, setTimeline] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  // Synchronous guard against a fast double-click: `setSubmitting(true)` in
  // handleSubmit is asynchronous, so a second click landing before React
  // re-renders could otherwise slip past the `if (!canSubmit) return` check
  // and fire a second `.insert`. A ref flips instantly.
  const submitLockRef = useRef(false);
  // Pre-flight verify state — checked when the modal opens so we can show an
  // inline banner immediately, instead of letting the user fill the whole form
  // and rejecting them on submit.
  const [verifyState, setVerifyState] = useState<'unknown' | 'verified' | 'unverified' | 'anon'>('unknown');
  const [resending, setResending] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.user) {
        setVerifyState('anon');
        setUserEmail(null);
        return;
      }
      setUserEmail(session.user.email ?? null);
      setVerifyState(isEmailVerified(session) ? 'verified' : 'unverified');
    })();
    return () => { cancelled = true; };
  }, [open]);

  const handleResend = async () => {
    if (!userEmail || resending) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: userEmail });
      if (error) throw error;
      toast({
        title: 'Verification email sent',
        description: `Check ${userEmail} — then come back here.`,
      });
    } catch (err) {
      console.error('Resend verify failed', err);
      toast({
        title: 'Could not resend',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setResending(false);
    }
  };

  const canSubmit =
    brief.trim().length >= 5 && !!timeline && !!budget && !submitting && verifyState !== 'unverified';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate(`/auth?intent=hire&freelancer=${freelancerId}`);
        return;
      }
      // Mirror HirePage concierge guard — unverified accounts shouldn't send direct hires.
      if (!isEmailVerified(session)) {
        toast({
          title: 'Verify your email first',
          description: 'Check your inbox to confirm your account, then try again.',
          variant: 'destructive',
        });
        setSubmitting(false);
        submitLockRef.current = false;
        return;
      }

      const expiresAt = new Date(
        Date.now() + DIRECT_HIRE_EXPIRY_HOURS * 60 * 60 * 1000,
      ).toISOString();

      const { data: inserted, error } = await supabase
        .from('hire_requests' as any)
        .insert({
          requester_id: session.user.id,
          description: brief.trim(),
          category: category || null,
          budget_range: budget,
          timeline,
          status: 'pending',
          kind: 'direct',
          target_freelancer_id: freelancerId,
          expires_at: expiresAt,
        } as any)
        .select('id')
        .single();

      if (error || !inserted) {
        console.error('HireNowModal insert error', error);
        toast({
          title: 'Could not send hire request',
          description: 'Please try again or contact us on WhatsApp.',
          variant: 'destructive',
        });
        setSubmitting(false);
        submitLockRef.current = false;
        return;
      }

      // Fire-and-forget: notify the freelancer. Do not block UX on this.
      supabase.functions
        .invoke('notify-direct-hire', {
          body: { hire_request_id: (inserted as any).id },
        })
        .catch((err) => console.warn('notify-direct-hire failed', err));

      track('direct_hire_sent', {
        freelancer_id: freelancerId,
        category: category || null,
        timeline,
        budget,
      });

      toast({
        title: `Hire request sent to ${freelancerName}! ⚡`,
        description: `They have ${DIRECT_HIRE_EXPIRY_HOURS}h to accept. You'll get notified when they respond.`,
      });

      // Brief in-modal success state so the interaction doesn't feel like
      // the app simply ate the click. Modal auto-closes after 1.2s.
      setSuccess(true);
      window.setTimeout(() => {
        onOpenChange(false);
        // Reset for next time
        setBrief('');
        setTimeline(null);
        setBudget(null);
        setSuccess(false);
        submitLockRef.current = false;
      }, 1200);
    } catch (err) {
      console.error('HireNowModal error', err);
      toast({
        title: 'Something went wrong',
        description: 'Please try again.',
        variant: 'destructive',
      });
      submitLockRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap size={18} className="text-amber-500" />
            Hire {freelancerName} now
          </DialogTitle>
          <DialogDescription>
            We'll notify {freelancerName} right away. They have {DIRECT_HIRE_EXPIRY_HOURS} hours
            to accept, or the job moves on.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Pre-flight email-verification banner — surfaced before the user
              fills the form so they don't get rejected at submit time. */}
          {verifyState === 'unverified' && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 flex items-start gap-2">
              <MailWarning size={14} className="text-destructive mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-destructive">Verify your email to send instant hires</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-destructive/80">
                  {userEmail ? <>We sent a link to <span className="font-medium">{userEmail}</span>. </> : null}
                  Confirm it, then come back to send.
                </p>
                {userEmail && (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending}
                    className="mt-1.5 text-[11px] font-semibold text-destructive underline underline-offset-2 hover:no-underline disabled:opacity-50"
                  >
                    {resending ? 'Sending…' : 'Resend verification email'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Urgency banner */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 flex items-start gap-2">
            <Clock size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              This locks {freelancerName} for{' '}
              <strong>{DIRECT_HIRE_EXPIRY_HOURS} hours</strong>. If they don't respond, we'll
              help you find someone else.
            </p>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Describe the job
            </label>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="e.g. I need a 60-second promo video for my restaurant — filming next week, want 2 edits"
              className="mt-1.5 w-full min-h-[110px] resize-none rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
              autoFocus
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Be specific — this is what {freelancerName} sees first.
            </p>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Timeline <span className="text-destructive">*</span>
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {HIRE_TIMELINES.map((t) => {
                const active = timeline === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTimeline(t.id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground hover:border-primary/40',
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Budget <span className="text-destructive">*</span>
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {HIRE_BUDGETS.map((b) => {
                const active = budget === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBudget(b.id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground hover:border-primary/40',
                    )}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            disabled={!canSubmit || success}
            onClick={handleSubmit}
            className={cn(
              'w-full rounded-xl py-3 text-sm font-bold text-white shadow-lg transition-all',
              success
                ? 'bg-gradient-to-r from-emerald-500 to-green-600'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:shadow-xl hover:brightness-110',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg disabled:hover:brightness-100',
              'flex items-center justify-center gap-2',
            )}
          >
            {success ? (
              <>
                <CheckCircle2 size={16} /> Sent!
              </>
            ) : submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Sending…
              </>
            ) : (
              <>
                <Zap size={16} /> Send hire request
              </>
            )}
          </button>

          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            <span>
              Payment is arranged directly with {freelancerName} in Messages after they accept.
              VANO takes no commission.
            </span>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
