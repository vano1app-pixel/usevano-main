import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // We only know the user-scoped channel name AND filter after reading
    // the session, so the subscription is set up inside an async block.
    // The `active` flag guards against a sign-out-then-sign-back-in race
    // where the effect cleanup runs while the setup is still in-flight.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active || !session) return;
      loadNotifications();

      // Previous version listened to `event: 'INSERT'` on the whole table
      // with no filter, which (a) fired loadNotifications for every user's
      // inserts site-wide — wasteful — and (b) missed UPDATE events, so a
      // "mark as read" from another tab left this badge stale. Scope to
      // this user's rows + listen to all event types to keep cross-tab
      // counts in sync.
      channel = supabase
        .channel(`notifications:${session.user.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${session.user.id}`,
        }, () => {
          loadNotifications();
        })
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const loadNotifications = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    setNotifications(data || []);
    setUnreadCount(data?.filter((n) => !n.read).length || 0);
  };

  const markAllRead = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    // Optimistically clear the badge + each row's unread highlight so the
    // user sees an immediate response when they open the bell — the
    // subsequent loadNotifications() refetch used to race this update and
    // caused a brief flicker of the old "3" badge before it disappeared.
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));
    await supabase.from('notifications').update({ read: true }).eq('user_id', session.user.id).eq('read', false);
    loadNotifications();
  };

  const handleClick = (notification: any) => {
    const title = notification.title || '';
    if (notification.job_id) {
      navigate(`/jobs/${notification.job_id}`);
    } else if (/hire|hired|accepted|declined/i.test(title)) {
      // Direct-hire flow notifications — route the freelancer to their inbox,
      // or the business to messages when the freelancer accepted.
      if (/accepted/i.test(title)) {
        navigate('/messages');
      } else {
        navigate('/hire-requests');
      }
    } else if (title.includes('v1.0') || title.includes('v1.5')) {
      navigate('/blog/vano-v1');
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open) markAllRead(); }}
        className="relative p-2 text-foreground/70 hover:text-primary transition-colors rounded-lg"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[1998]" onClick={() => setOpen(false)} />
          {/* Anchor to the right of the bell on all breakpoints. On mobile we
              cap width at "viewport minus 2rem" so the dropdown never pokes
              past the left edge; the previous -translate-x-1/4 hack shoved it
              off-screen on narrow phones. */}
          <div className="absolute right-0 top-full mt-2 w-[min(calc(100vw-2rem),20rem)] max-w-sm bg-card border border-border rounded-xl shadow-lg z-[1999] overflow-hidden">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-primary hover:underline">Mark all read</button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No notifications</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-secondary/50 transition-colors ${!n.read ? 'bg-primary/5' : ''}`}
                  >
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
