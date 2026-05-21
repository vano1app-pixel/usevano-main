import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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

        <div className="flex items-center gap-2">
          {/* WhatsApp quick-contact — green #25D366 is the official brand color */}
          <a
            href="https://wa.me/REPLACENUMBER?text=Hi%20VANO%2C%20I%20need%20some%20help%20around%20the%20house!"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat on WhatsApp"
            className="flex items-center justify-center w-9 h-9 rounded-full transition-transform duration-150 hover:scale-105 active:scale-95"
          >
            <MessageCircle className="w-5 h-5" style={{ color: '#25D366' }} />
          </a>
          <Button
            asChild
            size="sm"
            className="rounded-full px-4 font-medium"
          >
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </div>
    </header>
  );
};
