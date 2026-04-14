import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { budgetLabel, timelineLabel, DIRECT_HIRE_EXPIRY_HOURS } from '@/lib/hireOptions';
import { Zap, Clock, Check, X, Loader2, Inbox, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HireRequest {
  id: string;
  requester_id: string;
  description: string;
  category: string | null;
  budget_range: string | null;
  timeline: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  created_at: string;
  expires_at: string;
  responded_at: string | null;
}

interface RequesterProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

/** Countdown renderer — updates every 15s for the pending list. */
const CountdownBadge: React.FC<{ expiresAt: string }> = ({ expiresAt }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  const ms = new Date(expiresAt).getTime() - now;
  const mins = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  const urgent = ms < 30 * 60 * 1000; // <30 min
  const expired = ms <= 0;
  const label = expired
    ? 'Expired'
    : hours > 0
      ? `${hours}h ${rem}m left`
      : `${rem}m left`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1',
        expired && 'bg-muted text-muted-foreground ring-border',
        !expired && urgent && 'bg-destructive/10 text-destructive ring-destructive/30',
        !expired && !urgent && 'bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/30',
      )}
    >
      <Clock size={11} /> {label}
    </span>
  );
};

const HireRequestsPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<HireRequest[]>([]);
  const [requesters, setRequesters] = useState<Record<string, RequesterProfile>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      navigate('/auth');
      return;
    }
    setUserId(session.user.id);

    const { data, error } = await supabase
      .from('hire_requests' as any)
      .select('*')
      .eq('kind', 'direct')
      .eq('target_freelancer_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load hire requests', error);
      toast({ title: 'Could not load requests', variant: 'destructive' });
      setLoading(false);
      return;
    }

    const reqs = (data || []) as unknown as HireRequest[];
    setRequests(reqs);

    const requesterIds = Array.from(new Set(reqs.map((r) => r.requester_id)));
    if (requesterIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', requesterIds);
      const map: Record<string, RequesterProfile> = {};
      (profs || []).forEach((p: any) => { map[p.user_id] = p; });
      setRequesters(map);
    }

    setLoading(false);
  }, [navigate, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: refresh on INSERT/UPDATE to our hire_requests
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`hire-requests-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hire_requests',
          filter: `target_freelancer_id=eq.${userId}`,
        },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, load]);

  const respond = async (req: HireRequest, action: 'accepted' | 'declined') => {
    setPendingAction(req.id);
    const { error } = await supabase
      .from('hire_requests' as any)
      .update({ status: action, responded_at: new Date().toISOString() } as any)
      .eq('id', req.id)
      .eq('status', 'pending'); // guard against race with expiry

    if (error) {
      console.error('Respond to hire request failed', error);
      toast({ title: 'Could not update', description: 'Request may have already expired.', variant: 'destructive' });
      setPendingAction(null);
      load();
      return;
    }

    if (action === 'accepted') {
      // Open / create a conversation with the requester so work can continue there.
      const requesterId = req.requester_id;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: existing } = await supabase
          .from('conversations')
          .select('id')
          .or(
            `and(participant_1.eq.${session.user.id},participant_2.eq.${requesterId}),and(participant_1.eq.${requesterId},participant_2.eq.${session.user.id})`,
          )
          .maybeSingle();
        if (!existing) {
          await supabase
            .from('conversations')
            .insert({ participant_1: session.user.id, participant_2: requesterId });
        }
      }
      toast({
        title: 'Accepted! 🎉',
        description: 'We opened a conversation — say hi and lock in the details.',
      });
      navigate(`/messages?with=${requesterId}`);
    } else {
      toast({ title: 'Declined', description: "We'll let them know." });
    }
    setPendingAction(null);
    load();
  };

  const pending = requests.filter((r) => {
    if (r.status !== 'pending') return false;
    return new Date(r.expires_at).getTime() > Date.now();
  });
  const past = requests.filter((r) => !pending.includes(r));

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <SEOHead
        title="Hire Requests — VANO"
        description="Respond to direct hire requests from businesses."
        noindex
      />
      <Navbar />

      <div className="mx-auto max-w-3xl px-4 pt-20 sm:pt-24">
        <header className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Zap size={22} className="text-amber-500" /> Hire requests
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Businesses who want to hire you directly. You have{' '}
            <strong>{DIRECT_HIRE_EXPIRY_HOURS} hours</strong> to respond.
          </p>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : pending.length === 0 && past.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <Inbox size={28} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-semibold">No hire requests yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              When a business clicks "Hire now" on your profile, it'll show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {pending.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  Pending ({pending.length})
                </h2>
                <div className="space-y-3">
                  {pending.map((req) => {
                    const p = requesters[req.requester_id];
                    const name = p?.display_name || 'A business';
                    const isActing = pendingAction === req.id;
                    return (
                      <article
                        key={req.id}
                        className="rounded-2xl border border-foreground/8 bg-card p-4 sm:p-5 shadow-tinted"
                      >
                        <div className="flex items-start gap-3">
                          {p?.avatar_url ? (
                            <img
                              src={p.avatar_url}
                              alt={name}
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                              {name[0].toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold truncate">{name} wants to hire you</p>
                              <CountdownBadge expiresAt={req.expires_at} />
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                              {req.category && (
                                <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
                                  {req.category}
                                </span>
                              )}
                              {req.timeline && (
                                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 font-medium text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/20">
                                  {timelineLabel(req.timeline)}
                                </span>
                              )}
                              {req.budget_range && (
                                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20">
                                  {budgetLabel(req.budget_range)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
                          {req.description}
                        </p>
                        <div className="mt-4 flex gap-2">
                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() => respond(req, 'accepted')}
                            className={cn(
                              'flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 py-2.5 text-sm font-bold text-white shadow-md transition-all',
                              'hover:shadow-lg hover:brightness-110 disabled:opacity-50',
                            )}
                          >
                            {isActing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            Accept
                          </button>
                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() => respond(req, 'declined')}
                            className={cn(
                              'flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2.5 text-sm font-semibold text-foreground/70 transition-all',
                              'hover:bg-destructive/5 hover:border-destructive/30 hover:text-destructive disabled:opacity-50',
                            )}
                          >
                            <X size={14} /> Decline
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
                  Past requests
                </h2>
                <div className="space-y-2">
                  {past.map((req) => {
                    const p = requesters[req.requester_id];
                    const name = p?.display_name || 'A business';
                    const isExpired =
                      req.status === 'expired' ||
                      (req.status === 'pending' && new Date(req.expires_at).getTime() <= Date.now());
                    const statusLabel = isExpired
                      ? 'Expired'
                      : req.status.charAt(0).toUpperCase() + req.status.slice(1);
                    return (
                      <article
                        key={req.id}
                        className="rounded-xl border border-foreground/6 bg-muted/30 p-3 flex items-center gap-3"
                      >
                        {p?.avatar_url ? (
                          <img
                            src={p.avatar_url}
                            alt={name}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {name[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <p className="text-xs text-muted-foreground truncate">{req.description}</p>
                        </div>
                        <span
                          className={cn(
                            'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                            req.status === 'accepted' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                            req.status === 'declined' && 'bg-muted text-muted-foreground',
                            isExpired && 'bg-destructive/10 text-destructive',
                          )}
                        >
                          {statusLabel}
                        </span>
                      </article>
                    );
                  })}
                </div>
                {past.some((r) => r.status === 'expired' || (r.status === 'pending' && new Date(r.expires_at).getTime() <= Date.now())) && (
                  <p className="mt-2 flex items-start gap-1 text-[11px] text-muted-foreground">
                    <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                    <span>Expired requests auto-cleared — the business was notified.</span>
                  </p>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default HireRequestsPage;
