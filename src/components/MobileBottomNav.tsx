import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Users,
  MessageCircle,
  User as UserIcon,
  LayoutDashboard,
  Sparkles,
  Banknote,
  LogOut,
  Shield,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuthContext';
import { signOutCleanly } from '@/lib/signOut';
import { isAdminOwnerEmail } from '@/lib/adminOwner';
import { cn } from '@/lib/utils';
import { prefetchHandlers } from '@/lib/prefetchRoute';
import { VANO_PAY_VISIBLE } from '@/lib/featureFlags';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

// Same route-key map as Navbar.tsx — keep in sync. A hover OR touch
// on a tab kicks off the JS chunk for that route so the actual tap
// lands a cached module instead of a network round-trip.
const PATH_TO_PREFETCH_KEY: Record<string, Parameters<typeof prefetchHandlers>[0]> = {
  '/hire': 'hire',
  '/students': 'students',
  '/profile': 'profile',
  '/messages': 'messages',
  '/business-dashboard': 'business-dashboard',
  '/vano-pay': 'vano-pay',
};

export const MobileBottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Read user + user_type from the shared AuthContext instead of keeping
  // a duplicate subscription + profiles.user_type fetch here. The previous
  // version had its own onAuthStateChange listener, which lagged behind
  // the shared context on fast account switches — the user reported
  // this as "nav tabs glitch between my business and freelancer accounts".
  // Single source of truth means the nav flips atomically with the rest
  // of the app the moment the auth state changes.
  const { user, userType } = useAuth();
  const showAdminLink = isAdminOwnerEmail(user?.email);
  const [unreadCount, setUnreadCount] = useState(0);
  // Pending direct-hire requests for freelancers. The dot now sits on
  // the Account avatar (since Profile lives inside the avatar sheet),
  // not on a top-level Profile tab.
  const [pendingHireCount, setPendingHireCount] = useState(0);
  // Bottom-sheet "Account" menu — collapses Profile/Dashboard, Vano Pay,
  // Admin (if applicable) and Sign out into a single tab so the visible
  // bottom nav matches the cleaned-up desktop avatar dropdown. Sheet
  // pattern (slides up from bottom) gives big finger-friendly rows
  // instead of a desktop-style dropdown that would feel cramped on a
  // phone.
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);

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
        .from('hire_requests' as never)
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

  // Visible bottom-nav tabs. Mirrors the desktop refactor: Home dropped
  // (the VANO logo on top-bar pages already navigates home, and
  // logged-in users rarely need to revisit the marketing landing). The
  // tabs are now a tight set of high-frequency surfaces; everything
  // user-scoped (Profile/Dashboard, Vano Pay, Admin, Sign out) lives
  // behind the Account avatar tab on the right.
  const navItems = useMemo(() => [
    // "Hire" only for business users or visitors (not students).
    ...(userType !== 'student' ? [{ label: 'Hire', icon: Sparkles, href: '/hire' }] : []),
    { label: 'Talent', icon: Users, href: '/students' },
    { label: 'Messages', icon: MessageCircle, href: '/messages' },
  ], [userType]);

  // Account sheet contents — order matches desktop: Vano Pay first
  // (the new product surface), then Profile/Dashboard, Admin (when
  // applicable, tinted destructive so it's flagged), then Sign out
  // separated by a small visual gap.
  type AccountItem = {
    label: string;
    href?: string;
    icon: LucideIcon;
    onSelect?: () => void;
    tone?: 'default' | 'destructive' | 'muted';
    badge?: number | null;
  };
  const accountItems: AccountItem[] = useMemo(() => {
    if (!user) return [];
    const items: AccountItem[] = [];
    if (VANO_PAY_VISIBLE) {
      items.push({ label: 'Vano Pay', href: '/vano-pay', icon: Banknote });
    }
    if (userType === 'business') {
      items.push({ label: 'Dashboard', href: '/business-dashboard', icon: LayoutDashboard });
    } else {
      // Freelancers: Profile carries the pending-hire badge. The dot
      // also surfaces on the Account avatar tab itself so the user sees
      // "something needs attention" before opening the sheet.
      items.push({
        label: 'Profile',
        href: '/profile',
        icon: UserIcon,
        badge: pendingHireCount > 0 ? pendingHireCount : null,
      });
    }
    if (showAdminLink) {
      items.push({ label: 'Admin', href: '/admin', icon: Shield, tone: 'destructive' });
    }
    return items;
  }, [user, userType, showAdminLink, pendingHireCount]);

  const handleNav = (href: string) => {
    const requiresAuth = href === '/messages' || href === '/profile' || href === '/business-dashboard' || href === '/vano-pay';
    if (requiresAuth && !user) {
      navigate('/auth');
      return;
    }
    // Talent tab: always open hub (strip ?cat=) so signed-in matches
    // signed-out "three boxes" first screen.
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

  // Highlight the Account tab when the user is on any of its sheet
  // destinations — same "you are here" cue the desktop avatar gets.
  const accountActive = accountItems.some((item) => item.href && isActive(item.href));

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

          {/* Account tab — opens the bottom sheet for logged-in users
              or routes to /auth when nobody's signed in. The avatar
              circle gives this tab a different visual rhythm to the
              icon tabs so it reads as "you" rather than "another
              section". The amber dot mirrors the freelancer-only
              pending-hire badge that used to live on the Profile tab. */}
          <button
            type="button"
            onClick={() => {
              if (!user) {
                navigate('/auth');
                return;
              }
              setAccountSheetOpen(true);
            }}
            className="relative flex min-h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-end gap-[3px] px-1 pb-1 pt-0.5 transition-transform duration-100 active:scale-[0.95]"
            aria-label={user ? 'Account menu' : 'Sign in'}
          >
            <span
              className={cn(
                'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200',
                accountActive
                  ? 'bg-primary/15 text-primary'
                  : 'bg-foreground/[0.06] text-foreground/55',
              )}
            >
              <UserIcon size={16} strokeWidth={accountActive ? 2.4 : 1.85} />
              {pendingHireCount > 0 && userType === 'student' && (
                <span className="absolute -right-1.5 -top-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full border-2 border-card bg-amber-500 px-1 text-[10px] font-bold leading-none text-white">
                  {pendingHireCount > 9 ? '9+' : pendingHireCount}
                </span>
              )}
            </span>
            <span className={cn(
              'text-[10px] leading-none tracking-wide transition-colors duration-200',
              accountActive ? 'font-semibold text-primary' : 'font-medium text-foreground/40',
            )}>
              {user ? 'Account' : 'Sign in'}
            </span>
          </button>
        </div>
      </nav>

      {/* Account sheet — slides up from the bottom. Big finger-friendly
           rows match the iOS / Android share-sheet pattern users already
           know; we don't want a tiny desktop-style dropdown on touch
           screens. Each row uses the same icon set as the desktop
           avatar dropdown so the two surfaces feel unified. */}
      <Sheet open={accountSheetOpen} onOpenChange={setAccountSheetOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl border-t border-border/60 px-0 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-2 md:hidden"
        >
          <SheetHeader className="px-5 py-2 text-left">
            <SheetTitle className="text-[15px] font-semibold tracking-tight">Account</SheetTitle>
          </SheetHeader>
          <div className="mt-1 flex flex-col">
            {accountItems.map((item) => {
              const Icon = item.icon;
              const active = item.href ? isActive(item.href) : false;
              const prefetchKey = item.href ? PATH_TO_PREFETCH_KEY[item.href] : undefined;
              const prefetch = prefetchKey ? prefetchHandlers(prefetchKey) : undefined;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    if (item.href) {
                      handleNav(item.href);
                    } else if (item.onSelect) {
                      item.onSelect();
                    }
                    setAccountSheetOpen(false);
                  }}
                  {...prefetch}
                  className={cn(
                    'flex w-full items-center gap-3 px-5 py-3.5 text-left text-[14.5px] font-medium transition-colors',
                    active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-foreground/[0.04]',
                    item.tone === 'destructive' && !active && 'text-destructive',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                      active
                        ? 'bg-primary/15 text-primary'
                        : item.tone === 'destructive'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-foreground/[0.05] text-foreground/70',
                    )}
                  >
                    <Icon size={17} strokeWidth={2} />
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10.5px] font-bold leading-none text-white">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                  <ChevronRight size={16} className="shrink-0 text-foreground/30" />
                </button>
              );
            })}

            <div className="mx-5 my-2 h-px bg-border/60" />

            <button
              type="button"
              onClick={async () => {
                setAccountSheetOpen(false);
                await signOutCleanly(queryClient);
              }}
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[14.5px] font-medium text-foreground/75 transition-colors hover:bg-destructive/[0.06] hover:text-destructive"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05] text-foreground/65">
                <LogOut size={17} strokeWidth={2} />
              </span>
              <span className="flex-1">Sign out</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
