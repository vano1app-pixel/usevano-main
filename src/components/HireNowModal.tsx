import React, { useState } from 'react';
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
import { Zap, AlertTriangle, Loader2, Clock } from 'lucide-react';

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

  const canSubmit =
    brief.trim().length >= 5 && !!timeline && !!budget && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
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
        return;
      }

      // Fire-and-forget: notify the freelancer. Do not block UX on this.
      supabase.functions
        .invoke('notify-direct-hire', {
          body: { hire_request_id: (inserted as any).id },
        })
        .catch((err) => console.warn('notify-direct-hire failed', err));

      toast({
        title: `Hire request sent to ${freelancerName}! ⚡`,
        description: `They have ${DIRECT_HIRE_EXPIRY_HOURS}h to accept. You'll get notified when they respond.`,
      });

      onOpenChange(false);
      // Reset for next time
      setBrief('');
      setTimeline(null);
      setBudget(null);
    } catch (err) {
      console.error('HireNowModal error', err);
      toast({
        title: 'Something went wrong',
        description: 'Please try again.',
        variant: 'destructive',
      });
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
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={cn(
              'w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-sm font-bold text-white shadow-lg transition-all',
              'hover:shadow-xl hover:brightness-110',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg disabled:hover:brightness-100',
              'flex items-center justify-center gap-2',
            )}
          >
            {submitting ? (
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
