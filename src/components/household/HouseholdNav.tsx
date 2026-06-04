import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { teamWhatsAppHref } from '@/lib/contact';
import logo from '@/assets/logo.png';

/* Glass-on-scroll pattern mirrored from Navbar.tsx:
   mobile threshold=4px (instant) so touch users don't see
   a laggy transition; desktop threshold=50px keeps the hero clean. */
export const HouseholdNav: React.FC = () => {
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
    ? 'bg-background/80 backdrop-blur-2xl backdrop-saturate-[1.2] border-border/50 shadow-tinted-lg'
    : 'bg-transparent border-transparent shadow-none backdrop-blur-none';

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 border-b transition-[background-color,backdrop-filter,box-shadow,border-color] duration-300 ease-out-expo',
        navSurfaceClass,
      )}
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between h-14 px-4 lg:px-6">
        <Link to="/home" className="flex items-center">
          <img src={logo} alt="VANO" className="h-7 w-auto" />
        </Link>

        <div className="flex items-center gap-3">
          {/* Become a helper — shown unless already on /join */}
          <Link
            to="/join"
            className={cn(
              'hidden sm:flex items-center rounded-full border border-border/60 px-3.5 py-1.5',
              'text-sm font-medium text-foreground/75 hover:text-foreground hover:border-border',
              'transition-[color,border-color] duration-150 active:scale-[0.97]',
            )}
          >
            Become a helper
          </Link>

          {/* Helper profile — circular VANO logo */}
          <Link
            to="/helper/profile"
            aria-label="Helper profile"
            className="flex items-center active:scale-95 transition-transform duration-150"
          >
            <img src={logo} alt="VANO" className="w-8 h-8 rounded-full object-cover border border-border/40" />
          </Link>

          {/* WhatsApp quick-contact — green #25D366 is the official brand color */}
          <a
            href={`${teamWhatsAppHref}?text=${encodeURIComponent('Hi VANO, I need some help around the house!')}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat on WhatsApp"
            className="flex items-center gap-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors duration-150 active:scale-95"
          >
            <MessageCircle className="w-4 h-4" style={{ color: '#25D366' }} />
            <span className="hidden sm:inline">WhatsApp us</span>
          </a>
        </div>
      </div>
    </header>
  );
};
