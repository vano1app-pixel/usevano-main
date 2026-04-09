import React, { useState, useEffect } from 'react';
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
    { label: 'Hire', href: '/hire', requiresAuth: false, isNew: true },
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
    location.pathname === '/students' ||
    location.pathname.startsWith('/students/');

  if (isMobile && !showNavbarOnMobile) return null;

  const talentRouteMobile =
    isMobile &&
    (location.pathname === '/students' || location.pathname.startsWith('/students/'));
  /** Opaque bar on Talent so dark page bg doesn’t read as an empty “black box” through glass blur. */
  const navSurfaceClass = talentRouteMobile
    ? 'bg-background border-border/60 shadow-md'
    : 'bg-background/60 backdrop-blur-xl border-border/50 shadow-lg shadow-black/5';

  return (
    <>
      <nav
        className={`fixed top-2 left-2 right-2 sm:top-4 sm:left-4 sm:right-4 lg:top-5 lg:left-6 lg:right-6 z-[2000] rounded-xl sm:rounded-2xl ${navSurfaceClass}`}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-8 lg:px-10 h-14 sm:h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="VANO" className="h-8 w-8 rounded-lg" />
            <span className="text-2xl font-bold tracking-tight text-primary">VANO</span>
          </Link>

          <div className="hidden md:flex items-center gap-1 lg:gap-2">
            {navItems.map((item) => (
              <button
                key={item.href}
                onClick={() => handleNavClick(item.href, item.requiresAuth)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-150",
                  isActiveRoute(item.href)
                    ? "text-primary bg-primary/10 font-semibold"
                    : "text-foreground/70 hover:text-primary hover:bg-primary/5"
                )}
              >
                {item.label}
                {item.isNew ? <NewFeatureBadge /> : null}
              </button>
            ))}
            <Link
              to="/whats-new"
              className="px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/80"
            >
              What&apos;s new
            </Link>
            {user && authNavItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  isActiveRoute(item.href)
                    ? "text-primary bg-primary/10 font-semibold"
                    : "text-foreground/70 hover:text-primary hover:bg-primary/5"
                )}
              >
                {item.label}
              </Link>
            ))}
            {user && showAdminLink && (
              <Link
                to="/admin"
                className="px-4 py-2 text-sm font-medium text-destructive hover:text-destructive/80 transition-colors rounded-lg hover:bg-destructive/5"
              >
                Admin
              </Link>
            )}
            {user && <NotificationBell />}
            {user ? (
              <button
                onClick={async () => { await supabase.auth.signOut(); }}
                className="ml-2 px-4 py-2 text-sm font-medium text-foreground/70 hover:text-destructive transition-colors rounded-lg"
              >
                Sign Out
              </button>
            ) : (
              <button
                onClick={() => navigate('/auth')}
                className="ml-2 px-5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 transition-all duration-200"
              >
                Sign In
              </button>
            )}
          </div>

          {/* Mobile right side — no hamburger, just action */}
          <div className="md:hidden flex items-center gap-2">
            {user && showAdminLink && (
              <Link
                to="/admin"
                className="px-3 py-1.5 text-xs font-semibold text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/5 transition-colors"
              >
                Admin
              </Link>
            )}
            {user ? (
              <NotificationBell />
            ) : (
              <button
                onClick={() => setIsAuthOpen(true)}
                className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 transition-all duration-200"
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
