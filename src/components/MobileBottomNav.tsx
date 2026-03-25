import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Briefcase, Users, MessageCircle, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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
    <nav className="fixed bottom-0 left-0 right-0 z-[2000] md:hidden bg-background/80 backdrop-blur-xl border-t border-border/50 safe-area-bottom">
      <div className="flex items-center justify-around h-14 px-2">
        {NAV_ITEMS.map(({ label, icon: Icon, href }) => {
          const active = isActive(href);
          return (
            <button
              key={href}
              onClick={() => handleNav(href)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <div className="relative">
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                {href === '/messages' && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 bg-primary text-primary-foreground text-[8px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
