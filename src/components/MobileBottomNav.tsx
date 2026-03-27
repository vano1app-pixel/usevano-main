import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Briefcase, Users, MessageCircle, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { NewFeatureBadge } from '@/components/NewFeatureBadge';

const NAV_ITEMS = [
  { label: 'Home', icon: Home, href: '/' },
  { label: 'Gigs', icon: Briefcase, href: '/jobs' },
  { label: 'Community', icon: Users, href: '/community' },
  { label: 'Messages', icon: MessageCircle, href: '/messages' },
  { label: 'Profile', icon: User, href: '/profile' },
];

export const MobileBottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadUnread(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadUnread(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadUnread = async (userId: string) => {
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .neq('sender_id', userId)
      .eq('read', false);
    setUnreadCount(count || 0);
  };

  const handleNav = (href: string) => {
    const requiresAuth = href === '/messages' || href === '/profile';
    if (requiresAuth && !user) {
      navigate('/auth');
    } else {
      navigate(href);
    }
  };

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  // Hide on auth page
  if (location.pathname === '/auth') return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[2000] md:hidden safe-area-bottom border-t border-border/40 bg-card/96 backdrop-blur-xl">
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom,0px))]">
        {NAV_ITEMS.map(({ label, icon: Icon, href }) => {
          const active = isActive(href);
          return (
            <button
              key={href}
              type="button"
              onClick={() => handleNav(href)}
              className="flex min-h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-end gap-[3px] px-1 pb-1 pt-0.5 transition-transform active:scale-[0.94]"
            >
              <span
                className={cn(
                  'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-150',
                  active ? 'bg-foreground' : 'bg-transparent',
                )}
              >
                <Icon
                  size={18}
                  strokeWidth={active ? 2.4 : 2}
                  className={active ? 'text-background' : 'text-foreground/70'}
                />
                {href === '/messages' && unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full border-2 border-card bg-foreground px-0.5 text-[9px] font-bold leading-none text-background">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'text-[10px] leading-none tracking-tight',
                  active ? 'font-semibold text-foreground' : 'font-medium text-foreground/55',
                )}
              >
                <span className="inline-flex items-center gap-0.5">
                  {label}
                  {href === '/community' ? (
                    <NewFeatureBadge className="scale-90" />
                  ) : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
