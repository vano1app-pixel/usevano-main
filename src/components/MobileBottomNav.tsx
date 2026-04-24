import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Users, MessageCircle, User, LayoutDashboard, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuthContext';
import { cn } from '@/lib/utils';
import { prefetchHandlers } from '@/lib/prefetchRoute';

// Same route-key map as Navbar.tsx — keep in sync. A hover OR touch
// on a tab kicks off the JS chunk for that route so the actual tap
// lands a cached module instead of a network round-trip.
const PATH_TO_PREFETCH_KEY: Record<string, Parameters<typeof prefetchHandlers>[0]> = {
  '/hire': 'hire',
  '/students': 'students',
  '/profile': 'profile',
  '/messages': 'messages',
  '/business-dashboard': 'business-dashboard',
};

export const MobileBottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // Read user + user_type from the shared AuthContext instead of keeping
  // a duplicate subscription + profiles.user_type fetch here. The previous
  // version had its own onAuthStateChange listener, which lagged behind
  // the shared context on fast account switches — the user reported
  // this as "nav tabs glitch between my business and freelancer accounts".
  // Single source of truth means the nav flips atomically with the rest
  // of the app the moment the auth state changes.
  const { user, userType } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  // Pending direct-hire requests for freelancers. Surfaced as a dot on the
  // Profile tab so freelancers don't need to open the app and scroll to
  // /profile → HireRequestsInboxLink to discover an offer is waiting.
  const [pendingHireCount, setPendingHireCount] = useState(0);

  useEffect(() => {
    if (user?.id) {
      loadUnread(user.id);
      loadPendingHires(user.id);
    } else {
      // Sign-out: wipe the badges immediately so a stale count from the
      // previous account doesn't linger on the nav during the brief
      // moment before the next user signs in.
      setUnreadCount(0);
      setPendingHireCount(0);
    }
  }, [user?.id]);

  // Real-time: refresh unread count when messages arrive or are read
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('nav-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        loadUnread(user.id);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => {
        loadUnread(user.id);
      })
      .subscribe();
    // Separate channel for hire_requests so a push notification arriving
    // while the freelancer has the app open also updates the red dot live.
    const hireChannel = supabase
      .channel('nav-pending-hires')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'hire_requests',
        filter: `target_freelancer_id=eq.${user.id}`,
      }, () => {
        loadPendingHires(user.id);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(hireChannel);
    };
  }, [user]);

  const loadUnread = async (userId: string) => {
    try {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .neq('sender_id', userId)
        .eq('read', false);
      setUnreadCount(count || 0);
    } catch {
      // Realtime subscription refreshes on next event — keep last count.
    }
  };

  const loadPendingHires = async (userId: string) => {
    try {
      const { count } = await supabase
        .from('hire_requests' as any)
        .select('id', { count: 'exact', head: true })
        .eq('kind', 'direct')
        .eq('target_freelancer_id', userId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());
      setPendingHireCount(count || 0);
    } catch {
      // Realtime subscription refreshes on next event — keep last count.
    }
  };

  const navItems = useMemo(() => [
    { label: 'Home', icon: Home, href: '/' },
    // "Hire" only for business users or visitors (not students)
    ...(userType !== 'student' ? [{ label: 'Hire', icon: Sparkles, href: '/hire' }] : []),
    { label: 'Talent', icon: Users, href: '/students' },
    { label: 'Messages', icon: MessageCircle, href: '/messages' },
    userType === 'business'
      ? { label: 'Dashboard', icon: LayoutDashboard, href: '/business-dashboard' }
      : { label: 'Profile', icon: User, href: '/profile' },
  ], [userType]);

  const handleNav = (href: string) => {
    const requiresAuth = href === '/messages' || href === '/profile' || href === '/business-dashboard';
    if (requiresAuth && !user) {
      navigate('/auth');
      return;
    }
    // Talent tab: always open hub (strip ?cat=) so signed-in matches signed-out “three boxes” first screen.
    if (href === '/students') {
      navigate({ pathname: '/students', search: '' });
      return;
    }
    navigate(href);
  };

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  const HIDDEN_PATHS = ['/auth', '/choose-account-type', '/complete-profile'];
  if (HIDDEN_PATHS.includes(location.pathname)) return null;

  return (
    <>
      {/* Gradient scrim */}
      <div className="pointer-events-none fixed bottom-[3.25rem] left-0 right-0 z-[1999] h-16 bg-gradient-to-t from-background via-background/60 to-transparent md:hidden" />
      <nav className="fixed bottom-0 left-0 right-0 z-[2000] safe-area-bottom border-t border-border/25 bg-card/75 backdrop-blur-2xl backdrop-saturate-[1.2] md:hidden">
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1.5 pt-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom,0px))]">
        {navItems.map(({ label, icon: Icon, href }) => {
          const active = isActive(href);
          const prefetchKey = PATH_TO_PREFETCH_KEY[href];
          const prefetch = prefetchKey ? prefetchHandlers(prefetchKey) : undefined;
          return (
            <button
              key={href}
              type="button"
              onClick={() => handleNav(href)}
              {...prefetch}
              className="relative flex min-h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-end gap-[3px] px-1 pb-1 pt-0.5 transition-transform duration-100 active:scale-[0.95]"
            >
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200">
                {active && (
                  <span className="absolute inset-0 rounded-xl bg-primary/10 scale-100" />
                )}
                <Icon
                  size={20}
                  strokeWidth={active ? 2.2 : 1.6}
                  className={cn('relative transition-colors duration-200', active ? 'text-primary' : 'text-foreground/45')}
                />
                {href === '/messages' && unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full border-2 border-card bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
                {/* Freelancer-only: pending direct-hire count on the Profile tab.
                    Only shows when the active nav actually includes Profile
                    (businesses get Dashboard instead). */}
                {href === '/profile' && pendingHireCount > 0 && (
                  <span className="absolute -right-1.5 -top-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full border-2 border-card bg-amber-500 px-1 text-[10px] font-bold leading-none text-white">
                    {pendingHireCount > 9 ? '9+' : pendingHireCount}
                  </span>
                )}
              </span>
              <span className={cn(
                'text-[10px] leading-none tracking-wide transition-colors duration-200',
                active ? 'font-semibold text-primary' : 'font-medium text-foreground/40',
              )}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
    </>
  );
};
