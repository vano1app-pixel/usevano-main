import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { AuthSheet } from './AuthSheet';
import { NotificationBell } from './NotificationBell';
import { isAdminOwnerEmail } from '@/lib/adminOwner';
import { cn } from '@/lib/utils';
import logo from '@/assets/logo.png';
import { APP_VERSION_LABEL } from '@/lib/appVersion';
import { NewFeatureBadge } from '@/components/NewFeatureBadge';

export const Navbar: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [userType, setUserType] = useState<string | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const showAdminLink = isAdminOwnerEmail(user?.email);
  const [scrolled, setScrolled] = useState(false);

  /* ── Glass effect on scroll ── */
  const handleScroll = useCallback(() => {
    setScrolled(window.scrollY > 50);
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
      fetchUserType(session?.user?.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      fetchUserType(session?.user?.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user && pendingRoute) {
      navigate(pendingRoute);
      setPendingRoute(null);
      setIsAuthOpen(false);
    }
  }, [user, pendingRoute, navigate]);

  const navItems = [
    { label: 'Home', href: '/', requiresAuth: false, isNew: false },
    // "Hire" only for business users or visitors (not students)
    ...(userType !== 'student' ? [{ label: 'Hire', href: '/hire', requiresAuth: false, isNew: true }] : []),
    { label: 'Talent Board', href: '/students', requiresAuth: false, isNew: true },
  ];

  const authNavItems = [
    { label: 'Messages', href: '/messages' },
    userType === 'business'
      ? { label: 'Dashboard', href: '/business-dashboard' }
      : { label: 'Profile', href: '/profile' },
  ];

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
            {navItems.map((item) => (
              <button
                key={item.href}
                onClick={() => handleNavClick(item.href, item.requiresAuth)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-xl transition-all duration-150",
                  isActiveRoute(item.href)
                    ? "text-primary bg-primary/10 font-semibold"
                    : "text-foreground/65 hover:text-foreground hover:bg-foreground/[0.04]"
                )}
              >
                {item.label}
                {item.isNew ? <NewFeatureBadge /> : null}
              </button>
            ))}
            <div className="w-px h-5 bg-border/60 mx-1.5" />

            {user && authNavItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "px-3.5 py-2 text-[13px] font-medium rounded-xl transition-all duration-150",
                  isActiveRoute(item.href)
                    ? "text-primary bg-primary/10 font-semibold"
                    : "text-foreground/65 hover:text-foreground hover:bg-foreground/[0.04]"
                )}
              >
                {item.label}
              </Link>
            ))}
            {user && showAdminLink && (
              <Link
                to="/admin"
                className="px-3.5 py-2 text-[13px] font-medium text-destructive/80 hover:text-destructive transition-colors duration-150 rounded-xl hover:bg-destructive/5"
              >
                Admin
              </Link>
            )}
            {user && <NotificationBell />}
            {user ? (
              <button
                onClick={async () => { await supabase.auth.signOut(); }}
                className="ml-1 px-3.5 py-2 text-[13px] font-medium text-foreground/50 hover:text-destructive transition-colors duration-150 rounded-xl"
              >
                Sign out
              </button>
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
