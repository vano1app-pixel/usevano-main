import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, UserCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { teamWhatsAppHref } from '@/lib/contact';
import { useAuth } from '@/hooks/useAuthContext';
import logo from '@/assets/logo.png';

interface HouseholdNavProps {
  darkHero?: boolean;
}

export const HouseholdNav: React.FC<HouseholdNavProps> = ({ darkHero = false }) => {
  const { user, authLoading } = useAuth();
  const [scrolled,  setScrolled]  = useState(false);
  const [hidden,    setHidden]    = useState(false);
  const lastY = useRef(0);

  const handleScroll = useCallback(() => {
    const y = window.scrollY;
    const threshold = window.innerWidth < 768 ? 4 : 60;
    setScrolled(y > threshold);

    // Hide when scrolling down past 120px, reveal on scroll up
    if (y > lastY.current + 8 && y > 120) {
      setHidden(true);
    } else if (y < lastY.current - 4) {
      setHidden(false);
    }
    lastY.current = y;
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const dark = darkHero && !scrolled; // on the hero, before first scroll

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 border-b',
        'transition-[background-color,backdrop-filter,box-shadow,border-color,transform] duration-300 ease-out-expo',
        hidden ? '-translate-y-full' : 'translate-y-0',
        scrolled
          ? 'bg-cream/90 backdrop-blur-2xl backdrop-saturate-[1.2] border-border/50 shadow-tinted-lg'
          : 'bg-transparent border-transparent',
      )}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between h-[72px] px-5 lg:px-8 xl:px-10">
        {/* Logo — white filter on dark hero, normal on scroll */}
        <Link to="/home" className="flex items-center">
          <img
            src={logo}
            alt="VANO"
            className={cn('h-8 w-auto transition-[filter] duration-300', dark && 'brightness-0 invert')}
          />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Join as a helper */}
          <Link
            to="/join"
            className={cn(
              'flex items-center rounded-full border px-3.5 py-1.5',
              'text-sm font-medium transition-colors duration-150 active:scale-[0.97] whitespace-nowrap',
              dark
                ? 'border-white/30 bg-white/10 text-white hover:bg-white/20 hover:border-white/50'
                : 'border-foreground/25 bg-foreground/5 text-foreground/80 hover:text-foreground hover:border-foreground/40 hover:bg-foreground/10',
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
            className={cn(
              'hidden sm:flex items-center gap-2 text-sm font-medium transition-colors duration-150 active:scale-95',
              dark ? 'text-white/80 hover:text-white' : 'text-foreground/80 hover:text-foreground',
            )}
          >
            <MessageCircle className="w-4 h-4" style={{ color: '#25D366' }} />
            <span>WhatsApp us</span>
          </a>

          {/* Profile / account */}
          {!authLoading && (
            <Link
              to={user ? '/student-account' : '/auth'}
              aria-label={user ? 'My account' : 'Sign in'}
              className={cn(
                'flex items-center justify-center w-9 h-9 rounded-full',
                'transition-[background-color,border-color] duration-150 active:scale-95',
                dark
                  ? 'border border-white/25 bg-white/10 hover:bg-white/20 hover:border-white/40'
                  : 'border border-foreground/20 bg-foreground/5 hover:bg-foreground/10 hover:border-foreground/35',
              )}
            >
              {user ? (
                <img
                  src={logo}
                  alt="Account"
                  className={cn('w-5 h-5 object-contain transition-[filter] duration-300', dark && 'brightness-0 invert')}
                />
              ) : (
                <UserCircle2 className={cn('w-5 h-5', dark ? 'text-white/70' : 'text-foreground/60')} />
              )}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};
