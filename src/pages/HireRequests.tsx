import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { budgetLabel, timelineLabel, DIRECT_HIRE_EXPIRY_HOURS } from '@/lib/hireOptions';
import { Zap, Clock, Check, X, Loader2, Inbox, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusChip, type StatusTone } from '@/components/ui/StatusChip';
import { EmptyState } from '@/components/ui/EmptyState';

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

/** Countdown renderer — ticks every second so the "X minutes left" badge
 * decrements smoothly instead of jumping in 15-second steps near expiry. */
const CountdownBadge: React.FC<{ expiresAt: string }> = ({ expiresAt }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1_000);
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
  const tone: StatusTone = expired ? 'neutral' : urgent ? 'danger' : 'warning';
  return (
    <StatusChip tone={tone} icon={Clock}>
      {label}
    </StatusChip>
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
  const [loadError, setLoadError] = useState(false);

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
      // Show an inline error + retry rather than a destructive toast — the
      // toast flashed every time the user landed on the page during a
      // transient network blip, even though the inbox is often simply empty.
      setLoadError(true);
      setLoading(false);
      return;
    }
    setLoadError(false);

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
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="text-sm font-semibold">Couldn&apos;t load your hire requests</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => { setLoadError(false); setLoading(true); load(); }}
              className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
            >
              Retry
            </button>
          </div>
        ) : pending.length === 0 && past.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No hire requests yet"
            description="When a business taps Hire now on your profile, the request lands here. We'll text you too, so you can accept within the 2-hour window."
          />
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
                              loading="lazy"
                              decoding="async"
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                              {name[0].toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="flex-1 min-w-0 truncate text-sm font-semibold" title={name}>{name} wants to hire you</p>
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
                        className="rounded-2xl border border-foreground/6 bg-muted/30 p-3 flex items-center gap-3"
                      >
                        {p?.avatar_url ? (
                          <img
                            src={p.avatar_url}
                            alt={name}
                            loading="lazy"
                            decoding="async"
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {name[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium" title={name}>{name}</p>
                          <p className="truncate text-xs text-muted-foreground" title={req.description || undefined}>{req.description}</p>
                        </div>
                        <StatusChip
                          size="sm"
                          tone={(() => {
                            if (isExpired) return 'danger';
                            if (req.status === 'accepted') return 'success';
                            if (req.status === 'declined') return 'neutral';
                            return 'neutral';
                          })() as StatusTone}
                        >
                          {statusLabel}
                        </StatusChip>
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
