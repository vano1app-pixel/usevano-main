import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, CalendarCheck, User, MapPin, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
import { useMode, isHelperRoute } from '@/lib/mode';
import { isNativeApp } from '@/lib/platform';

/**
 * App-style bottom tab bar. ONE bar, TWO tab sets (owner call 2026-09-06:
 * one app, mode switch in Account, max 4 tabs):
 *
 *   buyer   Post · Orders · Account
 *   helper  Find · Jobs · Account
 *
 * The set follows the saved mode, but a helper route always shows the helper
 * set (a helper who arrives via a job link shouldn't see buyer tabs). The
 * track and job screens keep their own fixed action bars, so the nav stays
 * off them. Web: phone widths only. Native: always, whatever the width.
 */

interface Tab { to: string; label: string; icon: React.ElementType; match: (p: string) => boolean }

const BUYER_TABS: Tab[] = [
  { to: '/home',     label: 'Post',    icon: Home,          match: (p) => p === '/' || p === '/home' },
  { to: '/bookings', label: 'Orders',  icon: CalendarCheck, match: (p) => p.startsWith('/bookings') },
  { to: '/account',  label: 'Account', icon: User,          match: (p) => p.startsWith('/account') },
];

const HELPER_TABS: Tab[] = [
  { to: '/find',              label: 'Find',    icon: MapPin,    match: (p) => p === '/find' },
  { to: '/student-dashboard', label: 'Jobs',    icon: Briefcase, match: (p) => p.startsWith('/student-dashboard') },
  { to: '/student-account',   label: 'Account', icon: User,      match: (p) => p.startsWith('/student-account') },
];

function showsNav(path: string): boolean {
  return (
    path === '/' ||
    path === '/home' ||
    path.startsWith('/bookings') ||
    path.startsWith('/account') ||
    path === '/find' ||
    path.startsWith('/student-dashboard') ||
    path.startsWith('/student-account')
  );
}

export const BottomNav: React.FC = () => {
  const { pathname } = useLocation();
  const mode = useMode();
  if (!showsNav(pathname)) return null;
  const tabs = mode === 'helper' || isHelperRoute(pathname) ? HELPER_TABS : BUYER_TABS;

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'app-bottom-nav fixed bottom-0 left-0 right-0 z-40 safe-area-bottom border-t border-border/60 bg-cream/90 backdrop-blur-xl backdrop-saturate-[1.2] shadow-[0_-8px_24px_-12px_hsl(var(--shadow-color)/0.18)]',
        !isNativeApp() && 'md:hidden',
      )}
    >
      <ul className="flex items-stretch justify-around px-2">
        {tabs.map(({ to, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                aria-current={active ? 'page' : undefined}
                onClick={() => { haptic(8); if (active) window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="group relative flex min-h-[52px] flex-col items-center gap-1 pt-2.5 pb-1.5 select-none"
              >
                {active && (
                  <motion.span
                    layoutId="bottomnav-indicator"
                    aria-hidden="true"
                    className="absolute top-0 h-[3px] w-8 rounded-full bg-gold"
                    transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                  />
                )}
                <motion.span
                  className="inline-flex"
                  animate={{ scale: active ? 1.1 : 1, y: active ? -1 : 0 }}
                  whileTap={{ scale: 0.85 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                >
                  <Icon
                    className={cn('w-[22px] h-[22px] transition-colors duration-200', active ? 'text-primary' : 'text-muted-foreground')}
                    strokeWidth={active ? 2.4 : 2}
                    aria-hidden="true"
                  />
                </motion.span>
                <span className={cn('text-[11px] font-semibold tracking-tight transition-colors duration-200', active ? 'text-foreground' : 'text-muted-foreground')}>
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
