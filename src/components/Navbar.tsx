import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, User as UserIcon, LayoutDashboard, Banknote, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { signOutCleanly } from '@/lib/signOut';
import { AuthSheet } from './AuthSheet';
import { NotificationBell } from './NotificationBell';
import { isAdminOwnerEmail } from '@/lib/adminOwner';
import { cn } from '@/lib/utils';
import logo from '@/assets/logo.png';
import { APP_VERSION_LABEL } from '@/lib/appVersion';
import { prefetchHandlers } from '@/lib/prefetchRoute';
import { VANO_PAY_VISIBLE } from '@/lib/featureFlags';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Maps a route pathname to the prefetch key so hover on a nav item
// kicks off the JS chunk download before the actual click. Keep the
// keys in lockstep with src/lib/prefetchRoute.ts#routeImports.
const PATH_TO_PREFETCH_KEY: Record<string, Parameters<typeof prefetchHandlers>[0]> = {
  '/hire': 'hire',
  '/students': 'students',
  '/profile': 'profile',
  '/messages': 'messages',
  '/business-dashboard': 'business-dashboard',
  '/auth': 'auth',
  '/vano-pay': 'vano-pay',
};

export const Navbar: React.FC = () => {
  // Shared auth context: single subscription + single profile fetch shared
  // across Navbar, WhatsApp button, MascotGuide, etc. Replaces the old
  // Navbar-local onAuthStateChange + SELECT user_type round-trip.
  const { user, userType } = useAuth();
  const queryClient = useQueryClient();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const showAdminLink = isAdminOwnerEmail(user?.email);
  const [scrolled, setScrolled] = useState(false);
  // Unread message count surfaced as a red pill next to "Messages" so
  // hirers don't miss freelancer replies (and vice versa). Mirrors the
  // existing MobileBottomNav pattern — same query, separate channel
  // name so both nav surfaces can mount without stepping on each other.
  const [unreadCount, setUnreadCount] = useState(0);

  /* ── Glass effect on scroll ──
     Mobile flips opaque the instant the user scrolls at all so the
     transparent-to-blurred transition doesn't feel laggy on touch
     devices (where small scroll deltas at thumb speed made the 50px
     threshold feel late). Desktop keeps the old 50px hold so the
     hero area stays clean when the page first loads. */
  const handleScroll = useCallback(() => {
    const threshold = window.innerWidth < 768 ? 4 : 50;
    setScrolled(window.scrollY > threshold);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial state
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const isActiveRoute = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  useEffect(() => {
    if (user && pendingRoute) {
      navigate(pendingRoute);
      setPendingRoute(null);
      setIsAuthOpen(false);
    }
  }, [user, pendingRoute, navigate]);

  // Unread messages: count + realtime refresh. Skips when logged out.
  useEffect(() => {
    if (!user) { setUnreadCount(0); return; }

    const load = async () => {
      try {
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .neq('sender_id', user.id)
          .eq('read', false);
        setUnreadCount(count || 0);
      } catch {
        // Realtime channel will refresh on the next message event — degrade
        // to the last known count rather than throwing into React.
      }
    };

    void load();

    const channel = supabase
      .channel('navbar-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const navItems = [
    // "Hire" only for business users or visitors (not students). The
    // logo doubles as a Home link (industry-standard) so we don't
    // ship an explicit Home item — it would be redundant chrome.
    ...(userType !== 'student' ? [{ label: 'Hire', href: '/hire', requiresAuth: false }] : []),
    { label: 'Talent', href: '/students', requiresAuth: false },
  ];

  // Avatar-dropdown destinations (low-frequency "your account" surfaces
  // that don't earn a top-level slot). Order is fixed: Vano Pay first
  // because that's the new product surface we want users to discover;
  // Dashboard/Profile second; Admin only for staff; Sign out last,
  // separated by a divider so it doesn't get tapped by accident.
  //
  // Messages stays in the visible nav (high-frequency surface with
  // unread badges that need to be seen at a glance). Hire / Talent
  // also stay visible — those are the discovery surfaces we want
  // logged-out visitors to see immediately.
  type AvatarItem = {
    label: string;
    href: string;
    icon: LucideIcon;
    tone?: 'default' | 'destructive';
  };
  const avatarItems: AvatarItem[] = [
    ...(VANO_PAY_VISIBLE
      ? [{ label: 'Vano Pay', href: '/vano-pay', icon: Banknote }] satisfies AvatarItem[]
      : []),
    userType === 'business'
      ? { label: 'Dashboard', href: '/business-dashboard', icon: LayoutDashboard }
      : { label: 'Profile', href: '/profile', icon: UserIcon },
    ...(showAdminLink
      ? [{ label: 'Admin', href: '/admin', icon: Shield, tone: 'destructive' as const }]
      : []),
  ];

  // Highlight the avatar trigger with the same primary tint as a top-
  // level nav item when the user is on any of its dropdown
  // destinations. Without this cue the user has no "you are here"
  // signal when on /vano-pay, /profile, /business-dashboard or /admin.
  const avatarRouteActive = avatarItems.some((item) => isActiveRoute(item.href));

  const handleNavClick = (href: string, requiresAuth: boolean) => {
    if (requiresAuth && !user) {
      // On desktop, navigate to auth page; on mobile, open sheet
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        setPendingRoute(href);
        setIsAuthOpen(true);
      } else {
        navigate('/auth');
      }
    } else {
      navigate(href);
    }
  };
  /** Mobile: show top bar on home and talent routes so /students isn’t an empty padded strip. */
  const showNavbarOnMobile =
    location.pathname === '/' ||
    location.pathname === '/landing' ||
    location.pathname === '/hire' ||
    location.pathname === '/students' ||
    location.pathname.startsWith('/students/');

  if (isMobile && !showNavbarOnMobile) return null;

  const talentRouteMobile =
    isMobile &&
    (location.pathname === "/students" || location.pathname.startsWith("/students/"));
  const navSurfaceClass = talentRouteMobile
    ? "bg-background/95 border-border/50 shadow-tinted"
    : scrolled
      ? isMobile
        ? "bg-background/80 backdrop-blur-lg border-border/50 shadow-tinted"
        : "bg-background/70 backdrop-blur-2xl backdrop-saturate-[1.2] border-border/50 shadow-tinted-lg"
      : "bg-transparent border-transparent shadow-none backdrop-blur-none";

  return (
    <>
      <nav
        className={`fixed top-2.5 left-3 right-3 sm:top-4 sm:left-5 sm:right-5 lg:top-5 lg:left-8 lg:right-8 z-[2000] rounded-2xl border transition-all duration-300 ${navSurfaceClass}`}
      >
        <div className="max-w-7xl mx-auto px-3.5 sm:px-5 md:px-8 lg:px-10 h-14 sm:h-[3.75rem] flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <img src={logo} alt="VANO" className="h-8 w-8 rounded-[10px] shadow-sm transition-transform duration-200 group-hover:scale-105" />
            <span className="text-[22px] font-bold tracking-tight text-primary">VANO</span>
          </Link>

          <div className="hidden md:flex items-center gap-0.5 lg:gap-1">
            {navItems.map((item) => {
              const prefetchKey = PATH_TO_PREFETCH_KEY[item.href];
              const prefetch = prefetchKey ? prefetchHandlers(prefetchKey) : undefined;
              return (
                <button
                  key={item.href}
                  onClick={() => handleNavClick(item.href, item.requiresAuth)}
                  {...prefetch}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-xl transition-all duration-150",
                    isActiveRoute(item.href)
                      ? "text-primary bg-primary/10 font-semibold"
                      : "text-foreground/65 hover:text-foreground hover:bg-foreground/[0.04]"
                  )}
                >
                  {item.label}
                </button>
              );
            })}
            {user && (
              <Link
                to="/messages"
                {...prefetchHandlers('messages')}
                className={cn(
                  "relative px-3.5 py-2 text-[13px] font-medium rounded-xl transition-all duration-150",
                  isActiveRoute('/messages')
                    ? "text-primary bg-primary/10 font-semibold"
                    : "text-foreground/65 hover:text-foreground hover:bg-foreground/[0.04]"
                )}
              >
                Messages
                {unreadCount > 0 ? (
                  <span
                    className="absolute -top-0.5 -right-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold leading-none text-destructive-foreground shadow-sm"
                    aria-label={`${unreadCount} unread messages`}
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : null}
              </Link>
            )}
            {user && <NotificationBell />}
            {user ? (
              // Avatar dropdown — collapses Vano Pay + Dashboard/Profile
              // + Admin (if applicable) + Sign out into one trigger so
              // the visible nav stays calm. Active-route highlight on
              // the trigger so the user has a "you're here" cue when
              // on any of the dropdown destinations.
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Account menu"
                    className={cn(
                      "ml-1 flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                      avatarRouteActive
                        ? "bg-primary/15 text-primary"
                        : "bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/[0.1] hover:text-foreground",
                    )}
                  >
                    <UserIcon size={15} strokeWidth={2.25} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="min-w-[200px] rounded-xl"
                >
                  {avatarItems.map((item) => {
                    const Icon = item.icon;
                    const prefetchKey = PATH_TO_PREFETCH_KEY[item.href];
                    const prefetch = prefetchKey ? prefetchHandlers(prefetchKey) : undefined;
                    const active = isActiveRoute(item.href);
                    return (
                      <DropdownMenuItem
                        key={item.href}
                        asChild
                        // Tone destructive items in red so /admin is
                        // visually flagged from the Sign out divider
                        // group below; no behavioural change.
                        className={cn(
                          'gap-2.5 rounded-lg text-[13px] font-medium focus:bg-foreground/[0.05]',
                          active && 'bg-primary/10 text-primary',
                          item.tone === 'destructive' && !active && 'text-destructive/85 focus:text-destructive focus:bg-destructive/[0.06]',
                        )}
                      >
                        <Link to={item.href} {...prefetch}>
                          <Icon size={14} strokeWidth={2.25} />
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={async () => { await signOutCleanly(queryClient); }}
                    className="gap-2.5 rounded-lg text-[13px] font-medium text-foreground/70 focus:bg-destructive/[0.06] focus:text-destructive"
                  >
                    <LogOut size={14} strokeWidth={2.25} />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button
                onClick={() => navigate('/auth')}
                className="ml-1.5 px-5 py-2 text-[13px] font-semibold bg-primary text-primary-foreground rounded-xl shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 transition-all duration-200 hover:-translate-y-[0.5px] active:scale-[0.97]"
              >
                Sign in
              </button>
            )}
          </div>

          {/* Mobile right */}
          <div className="md:hidden flex items-center gap-2">
            {user && showAdminLink && (
              <Link
                to="/admin"
                className="px-2.5 py-1.5 text-[11px] font-semibold text-destructive/80 border border-destructive/25 rounded-lg hover:bg-destructive/5 transition-colors"
              >
                Admin
              </Link>
            )}
            {user ? (
              <NotificationBell />
            ) : (
              <button
                onClick={() => setIsAuthOpen(true)}
                className="px-4.5 py-2 text-[13px] font-semibold bg-primary text-primary-foreground rounded-xl shadow-md shadow-primary/20 hover:shadow-lg transition-all duration-200 active:scale-[0.97]"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </nav>
      <AuthSheet isOpen={isAuthOpen} onClose={() => { setIsAuthOpen(false); setPendingRoute(null); }} />
    </>
  );
};
