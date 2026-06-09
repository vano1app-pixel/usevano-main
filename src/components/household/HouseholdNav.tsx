import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, UserCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { teamWhatsAppHref } from '@/lib/contact';
import { useAuth } from '@/hooks/useAuthContext';
import logo from '@/assets/logo.png';

/* Glass-on-scroll pattern mirrored from Navbar.tsx:
   mobile threshold=4px (instant) so touch users don't see
   a laggy transition; desktop threshold=50px keeps the hero clean. */
export const HouseholdNav: React.FC = () => {
  const { user, authLoading } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  const handleScroll = useCallback(() => {
    const threshold = window.innerWidth < 768 ? 4 : 50;
    setScrolled(window.scrollY > threshold);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const navSurfaceClass = scrolled
    ? 'bg-cream/90 backdrop-blur-2xl backdrop-saturate-[1.2] border-border/50 shadow-tinted-lg'
    : 'bg-cream border-border/30 shadow-none';

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 border-b transition-[background-color,backdrop-filter,box-shadow,border-color] duration-300 ease-out-expo',
        navSurfaceClass,
      )}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between h-[72px] px-5 lg:px-8 xl:px-10">
        <Link to="/home" className="flex items-center">
          <img src={logo} alt="VANO" className="h-8 w-auto" />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Join as a helper */}
          <Link
            to="/join"
            className={cn(
              'flex items-center rounded-full border px-3.5 py-1.5',
              'border-foreground/25 bg-foreground/5',
              'text-sm font-medium text-foreground/80 hover:text-foreground hover:border-foreground/40 hover:bg-foreground/10',
              'transition-colors duration-150 active:scale-[0.97] whitespace-nowrap',
            )}
          >
            Join as a helper
          </Link>

          {/* WhatsApp */}
          <a
            href={`${teamWhatsAppHref}?text=${encodeURIComponent('Hi VANO, I need some help around the house!')}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat on WhatsApp"
            className="hidden sm:flex items-center gap-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors duration-150 active:scale-95"
          >
            <MessageCircle className="w-4 h-4" style={{ color: '#25D366' }} />
            <span>WhatsApp us</span>
          </a>

          {/* Profile / account button */}
          {!authLoading && (
            <Link
              to={user ? '/student-account' : '/auth'}
              aria-label={user ? 'My account' : 'Sign in'}
              className={cn(
                'flex items-center justify-center w-9 h-9 rounded-full',
                'border border-foreground/20 bg-foreground/5',
                'hover:bg-foreground/10 hover:border-foreground/35',
                'transition-[background-color,border-color] duration-150 active:scale-95',
              )}
            >
              {user ? (
                <img src={logo} alt="Account" className="w-5 h-5 object-contain" />
              ) : (
                <UserCircle2 className="w-5 h-5 text-foreground/60" />
              )}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};
