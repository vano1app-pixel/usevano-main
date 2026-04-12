import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuthContext';
import { Zap, ArrowRight } from 'lucide-react';

/**
 * Small card shown on the freelancer Profile page that surfaces pending
 * direct hire requests and links to the full /hire-requests inbox.
 *
 * We want this visible even at zero pending so freelancers learn the flow exists,
 * but the visual weight scales with urgency.
 */
export const HireRequestsInboxLink: React.FC = () => {
  const navigate = useNavigate();
  // User id comes from the shared auth cache — no more redundant getSession() here.
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setPendingCount(null);
      return;
    }
    const uid = user.id;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const load = async () => {
      const { count } = await supabase
        .from('hire_requests' as any)
        .select('id', { count: 'exact', head: true })
        .eq('kind', 'direct')
        .eq('target_freelancer_id', uid)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());
      if (!cancelled) setPendingCount(count ?? 0);
    };

    void load();
    channel = supabase
      .channel(`hire-inbox-link-${uid}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hire_requests',
          filter: `target_freelancer_id=eq.${uid}`,
        },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const hasPending = (pendingCount ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={() => navigate('/hire-requests')}
      className={
        'group w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ' +
        (hasPending
          ? 'border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-orange-500/10 shadow-md hover:shadow-lg hover:-translate-y-[1px]'
          : 'border-border bg-card hover:border-primary/20 hover:bg-primary/5')
      }
    >
      <div
        className={
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' +
          (hasPending ? 'bg-amber-500 text-white' : 'bg-primary/10 text-primary')
        }
      >
        <Zap size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">
          {hasPending ? `${pendingCount} hire request${pendingCount === 1 ? '' : 's'} waiting` : 'Hire requests'}
        </p>
        <p className="text-xs text-muted-foreground">
          {hasPending ? 'Respond before they expire.' : 'Direct hire requests from businesses show up here.'}
        </p>
      </div>
      <ArrowRight size={16} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
};
