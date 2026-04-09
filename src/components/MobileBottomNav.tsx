import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Users, MessageCircle, User, LayoutDashboard, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

export const MobileBottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [userType, setUserType] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchUserType = async (userId: string | undefined) => {
      if (!userId) { setUserType(null); return; }
      const { data } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('user_id', userId)
        .maybeSingle();
      setUserType(data?.user_type ?? null);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUnread(session.user.id);
        fetchUserType(session.user.id);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUnread(session.user.id);
        fetchUserType(session.user.id);
      } else {
        setUnreadCount(0);
        setUserType(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

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
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const loadUnread = async (userId: string) => {
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .neq('sender_id', userId)
      .eq('read', false);
    setUnreadCount(count || 0);
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
          return (
            <button
              key={href}
              type="button"
              onClick={() => handleNav(href)}
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
