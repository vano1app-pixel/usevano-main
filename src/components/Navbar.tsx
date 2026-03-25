import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { Menu, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { AuthSheet } from './AuthSheet';
import { NotificationBell } from './NotificationBell';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import logo from '@/assets/logo.png';

export const Navbar: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const isAdmin = useIsAdmin(user?.id);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
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
    { label: 'Browse Gigs', href: '/jobs', requiresAuth: false },
    { label: 'Post a Gig', href: '/post-job', requiresAuth: true },
    { label: 'Community', href: '/community', requiresAuth: false },
  ];

  const authNavItems = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Messages', href: '/messages' },
    { label: 'Profile', href: '/profile' },
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
  const isLandingPage = location.pathname === '/' || location.pathname === '/landing';

  // Hide navbar on mobile for all pages except landing
  if (isMobile && !isLandingPage) return null;

  return (
    <>
      <nav className="fixed top-2 left-2 right-2 sm:top-4 sm:left-4 sm:right-4 z-[2000] bg-background/60 backdrop-blur-xl border border-border/50 rounded-xl sm:rounded-2xl shadow-lg shadow-black/5">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-8 h-14 sm:h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="VANO" className="h-8 w-8 rounded-lg" />
            <span className="text-2xl font-bold tracking-tight text-primary">VANO</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.href}
                onClick={() => handleNavClick(item.href, item.requiresAuth)}
                className="px-4 py-2 text-sm font-medium text-foreground/70 hover:text-primary transition-colors rounded-lg hover:bg-primary/5"
              >
                {item.label}
              </button>
            ))}
            {user && authNavItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="px-4 py-2 text-sm font-medium text-foreground/70 hover:text-primary transition-colors rounded-lg hover:bg-primary/5"
              >
                {item.label}
              </Link>
            ))}
            {user && isAdmin && (
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
                className="ml-2 px-5 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Sign In
              </button>
            )}
          </div>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-foreground"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden bg-background/60 backdrop-blur-xl border-t border-border/30 pb-3 px-3 max-h-[70vh] overflow-y-auto">
            {navItems.map((item) => (
              <button
                key={item.href}
                onClick={() => { handleNavClick(item.href, item.requiresAuth); setIsMobileMenuOpen(false); }}
                className="block w-full text-left px-3 py-2.5 text-sm font-medium text-foreground/70 hover:text-primary active:bg-primary/5 rounded-lg transition-colors"
              >
                {item.label}
              </button>
            ))}
            {user && authNavItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-4 py-3 text-sm font-medium text-foreground/70 hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
            {user && isAdmin && (
              <Link
                to="/admin"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-4 py-3 text-sm font-medium text-destructive hover:text-destructive/80"
              >
                Admin
              </Link>
            )}
            {user ? (
              <button
                onClick={async () => { await supabase.auth.signOut(); setIsMobileMenuOpen(false); }}
                className="block w-full text-left px-4 py-3 text-sm font-medium text-foreground/70 hover:text-destructive"
              >
                Sign Out
              </button>
            ) : (
              <button
                onClick={() => { setIsAuthOpen(true); setIsMobileMenuOpen(false); }}
                className="block w-full text-left px-4 py-3 text-sm font-medium text-primary"
              >
                Sign In
              </button>
            )}
          </div>
        )}
      </nav>
      <AuthSheet isOpen={isAuthOpen} onClose={() => { setIsAuthOpen(false); setPendingRoute(null); }} />
    </>
  );
};
