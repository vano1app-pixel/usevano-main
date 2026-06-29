import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, CalendarCheck, User } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * App-style bottom tab bar (mobile only). The single biggest "feels like an
 * app" upgrade: a persistent Home · Bookings · Account nav so customers can
 * jump between booking, tracking and their details without scrolling a long
 * page. Replaces the old sticky "Book now" bar — the Home tab IS where you
 * book. Helper/admin and content routes don't show it (it's a customer chrome).
 */

const TABS = [
  { to: '/home',     label: 'Home',     icon: Home,          match: (p: string) => p === '/' || p === '/home' },
  { to: '/bookings', label: 'Bookings', icon: CalendarCheck, match: (p: string) => p.startsWith('/bookings') || p.startsWith('/track') },
  { to: '/account',  label: 'Account',  icon: User,          match: (p: string) => p.startsWith('/account') },
];

// Only customer-facing screens get the tab bar.
function showsNav(path: string): boolean {
  return (
    path === '/' ||
    path === '/home' ||
    path.startsWith('/bookings') ||
    path.startsWith('/account') ||
    path.startsWith('/track')
  );
}

export const BottomNav: React.FC = () => {
  const { pathname } = useLocation();
  if (!showsNav(pathname)) return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden safe-area-bottom border-t border-border/60 bg-background/90 backdrop-blur-xl backdrop-saturate-[1.2] shadow-[0_-8px_24px_-12px_hsl(var(--shadow-color)/0.18)]"
    >
      <ul className="flex items-stretch justify-around px-2">
        {TABS.map(({ to, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                aria-current={active ? 'page' : undefined}
                onClick={() => { if (active) window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="group relative flex flex-col items-center gap-1 pt-2.5 pb-1.5 select-none"
              >
                {/* Active indicator — a short gold bar that glides between tabs */}
                {active && (
                  <motion.span
                    layoutId="bottomnav-indicator"
                    aria-hidden="true"
                    className="absolute top-0 h-[3px] w-8 rounded-full bg-gold"
                    transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                  />
                )}
                <Icon
                  className={cn(
                    'w-[22px] h-[22px] transition-[color,transform] duration-200 group-active:scale-90',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                  strokeWidth={active ? 2.4 : 2}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    'text-[11px] font-semibold tracking-tight transition-colors duration-200',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
