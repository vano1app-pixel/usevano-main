import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, UserCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { teamWhatsAppHref } from '@/lib/contact';
import logo from '@/assets/logo.png';

interface HouseholdNavProps {
  darkHero?: boolean;
}

export const HouseholdNav: React.FC<HouseholdNavProps> = ({ darkHero = false }) => {
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
        scrolled || !darkHero
          ? 'bg-cream/90 backdrop-blur-2xl backdrop-saturate-[1.2] border-border/50 shadow-tinted-lg'
          : 'bg-transparent border-transparent',
      )}
    >
      <div
        className={cn(
          'max-w-6xl mx-auto flex items-center justify-between px-5 lg:px-8 xl:px-10',
          'transition-[height] duration-300 ease-out-expo',
          // Condense once you've scrolled — the bar tucks in tighter, a small
          // cue that you've left the hero and the nav is now "in service".
          scrolled ? 'h-[60px]' : 'h-[72px]',
        )}
      >
        <Link to="/home" className="flex items-center group">
          <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
            <img src={logo} alt="VANO" className="w-full h-full object-cover" />
          </div>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Bookings — desktop only (mobile has the bottom tab bar). Gives
              desktop customers a first-class way to reach their bookings. */}
          <Link
            to="/bookings"
            className={cn(
              'hidden md:inline-flex items-center px-2 py-2 text-sm font-medium transition-colors duration-150 whitespace-nowrap',
              dark ? 'text-white/70 hover:text-white' : 'text-foreground/60 hover:text-foreground',
            )}
          >
            Bookings
          </Link>

          {/* Join as a helper — a quiet text link, not a button: on a customer
              homepage the booking action (the hero card) should own attention,
              not helper recruitment. */}
          <Link
            to="/join"
            className={cn(
              'inline-flex items-center px-2 py-2 text-sm font-medium transition-colors duration-150 whitespace-nowrap',
              dark ? 'text-white/70 hover:text-white' : 'text-foreground/60 hover:text-foreground',
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
              'group hidden sm:flex items-center gap-2 text-sm font-medium transition-colors duration-150 active:scale-95',
              dark ? 'text-white/80 hover:text-white' : 'text-foreground/80 hover:text-foreground',
            )}
          >
            <MessageCircle className="w-4 h-4" style={{ color: '#25D366' }} />
            <span className="bg-[linear-gradient(currentColor,currentColor)] bg-no-repeat bg-left-bottom bg-[length:0%_1px] group-hover:bg-[length:100%_1px] transition-[background-size] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">WhatsApp us</span>
          </a>

          {/* Profile / account */}
          <Link
            to="/account"
            aria-label="My account"
            className={cn(
              'flex items-center justify-center w-9 h-9 rounded-full',
              'transition-[background-color,border-color] duration-150 active:scale-95',
              dark
                ? 'border border-white/25 bg-white/10 hover:bg-white/20 hover:border-white/40'
                : 'border border-foreground/20 bg-foreground/5 hover:bg-foreground/10 hover:border-foreground/35',
            )}
          >
            <UserCircle2 className={cn('w-5 h-5', dark ? 'text-white/70' : 'text-foreground/60')} />
          </Link>
        </div>
      </div>
    </header>
  );
};
