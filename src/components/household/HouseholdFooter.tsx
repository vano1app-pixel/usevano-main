import React from 'react';
import { Link } from 'react-router-dom';
import logo from '@/assets/logo.png';
import {
  TEAM_INSTAGRAM_URL,
  TEAM_FACEBOOK_URL,
  TEAM_TIKTOK_URL,
  TEAM_CONTACT_EMAIL,
  teamMailtoHref,
} from '@/lib/contact';
import { traderIdentityLine } from '@/lib/legalEntity';
import { isNativeApp } from '@/lib/platform';

// Service landing pages — internal links so crawlers (and people) can reach
// /cleaning-galway etc. from every page. Keep in step with
// src/content/serviceSlugs.ts.
const SERVICE_LINKS = [
  { label: 'Cleaning Galway',   href: '/cleaning-galway' },
  { label: 'Dog walking',       href: '/dog-walking-galway' },
  { label: 'Garden help',       href: '/garden-help-galway' },
  { label: 'Laundry',           href: '/laundry-service-galway' },
  // Moving help was PARKED 2026-07-24 (its landing redirects home) — the slug
  // stays in serviceSlugs.ts so old inbound links keep redirecting, but the
  // footer must not advertise a service that can't be booked.
];

const NAV_LINKS = [
  { label: 'Join as helper', href: '/join',                                          external: false },
  { label: 'Partners',       href: '/partners',                                      external: false },
  { label: 'Blog',           href: '/blog',                                          external: false },
  { label: 'Glossary',       href: '/glossary',                                      external: false },
  { label: 'Instagram',      href: TEAM_INSTAGRAM_URL,                               external: true  },
  { label: 'Facebook',       href: TEAM_FACEBOOK_URL,                                external: true  },
  { label: 'TikTok',         href: TEAM_TIKTOK_URL,                                  external: true  },
  { label: 'LinkedIn',       href: 'https://www.linkedin.com/in/ayush-puri-4b88b8357', external: true },
  { label: 'WhatsApp',       href: 'https://wa.me/353899817111',                     external: true  },
  { label: 'Support',        href: '/support',                                       external: false },
  { label: 'Safety',         href: '/safety',                                        external: false },
  { label: 'Terms',          href: '/terms',                                         external: false },
  { label: 'Vano Cover',     href: '/cover',                                         external: false },
  { label: 'Helper terms',   href: '/helper-terms',                                  external: false },
  { label: 'Privacy',        href: '/privacy',                                       external: false },
];

// Underline that grows in from the left on hover (animated via background-size,
// so there's no layout shift). Shared by every footer link.
const FOOTER_LINK =
  'inline-block py-1 text-sm text-white/60 hover:text-white ' +
  'bg-[linear-gradient(currentColor,currentColor)] bg-no-repeat bg-left-bottom bg-[length:0%_1px] hover:bg-[length:100%_1px] ' +
  'transition-[background-size,color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]';

// Inside the store app: legal links only. Blog, glossary, SEO landings and
// social links are the website's business; in the binary they are exactly
// the "website in a box" surfaces Apple rejects under 4.2.
const APP_LINKS = [
  { label: 'Support', href: '/support' },
  { label: 'Safety',  href: '/safety' },
  { label: 'Terms',   href: '/terms' },
  { label: 'Privacy', href: '/privacy' },
];

export const HouseholdFooter: React.FC = () => {
  if (isNativeApp()) {
    return (
      <footer className="px-6 pt-8 pb-28 text-center">
        <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {APP_LINKS.map(({ label, href }) => (
            <li key={href}><Link to={href} className="text-sm font-medium text-foreground/60">{label}</Link></li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-foreground/45">© 2026 {traderIdentityLine()}</p>
      </footer>
    );
  }
  return (
    <footer className="relative bg-navy text-white rounded-t-[2rem] sm:rounded-t-[3rem] px-4 pt-14 pb-28 md:pb-12">
      {/* Rounded-slab seam on top only (the bottom meets the screen edge) —
          curved into the cream, no gradients (they smeared on real phones). */}
      <div className="relative max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 mb-10">
          <Link to="/home" className="inline-block">
            {/* No white-out filter: brightness(0) invert(1) turned the whole
                mark into a blank white square. The real logo reads fine on
                navy — it's the same asset the dark hero nav uses. */}
            <img src={logo} alt="VANO" className="h-7 w-auto" />
          </Link>

          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap gap-x-6 gap-y-3">
              {NAV_LINKS.map(({ label, href, external }) => (
                <li key={label}>
                  {external ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={FOOTER_LINK}
                    >
                      {label}
                    </a>
                  ) : (
                    <Link
                      to={href}
                      className={FOOTER_LINK}
                    >
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <nav aria-label="Services" className="mb-8">
          <ul className="flex flex-wrap gap-x-6 gap-y-3">
            {SERVICE_LINKS.map(({ label, href }) => (
              <li key={href}>
                <Link to={href} className={FOOTER_LINK}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          {/* The contact address comes from src/lib/contact.ts, the same
              source /support, /privacy and /terms read, so there is ONE
              inbox on the site. This was hardcoded to hello@vanojobs.com
              until 2026-08-28 — vanojobs.com has no MX records, so that
              address could not receive mail and every footer enquiry
              bounced. Don't hardcode an address here again; if the branded
              inbox is ever set up, point VITE_TEAM_CONTACT_EMAIL at it. */}
          <a
            href={teamMailtoHref}
            className="inline-block text-xs text-white/60 hover:text-white bg-[linear-gradient(currentColor,currentColor)] bg-no-repeat bg-left-bottom bg-[length:0%_1px] hover:bg-[length:100%_1px] transition-[background-size,color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          >
            {TEAM_CONTACT_EMAIL}
          </a>
          {/* Trader identity (SI 68/2003: name + geographic address must be
              permanently accessible). traderIdentityLine falls back to the
              honest short form until the details are configured — see
              src/lib/legalEntity.ts. */}
          <p className="text-white/55 text-xs">© 2026 {traderIdentityLine()}</p>
        </div>
      </div>
    </footer>
  );
};
