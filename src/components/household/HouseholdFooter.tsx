import React from 'react';
import { Link } from 'react-router-dom';
import logo from '@/assets/logo.png';

// Service landing pages — internal links so crawlers (and people) can reach
// /cleaning-galway etc. from every page. Keep in step with
// src/content/serviceSlugs.ts.
const SERVICE_LINKS = [
  { label: 'Cleaning Galway',   href: '/cleaning-galway' },
  { label: 'Dog walking',       href: '/dog-walking-galway' },
  { label: 'Garden help',       href: '/garden-help-galway' },
  { label: 'Laundry',           href: '/laundry-service-galway' },
  { label: 'Moving help',       href: '/moving-help-galway' },
];

const NAV_LINKS = [
  { label: 'Join as helper', href: '/join',                                          external: false },
  { label: 'Blog',           href: '/blog',                                          external: false },
  { label: 'Glossary',       href: '/glossary',                                      external: false },
  { label: 'Instagram',      href: 'https://instagram.com/vano.app',                 external: true  },
  { label: 'TikTok',         href: 'https://www.tiktok.com/@gottalovevano',          external: true  },
  { label: 'LinkedIn',       href: 'https://www.linkedin.com/in/ayush-puri-4b88b8357', external: true },
  { label: 'WhatsApp',       href: 'https://wa.me/353899817111',                     external: true  },
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

export const HouseholdFooter: React.FC = () => {
  return (
    <footer className="relative bg-navy text-white px-4 pt-12 pb-28 md:pb-12">
      {/* Soft seam — the cream content above melts down into the navy footer
          instead of a hard colour cut, matching the PopularCategories band. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-cream to-transparent" aria-hidden="true" />
      <div className="relative max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 mb-10">
          <Link to="/home" className="inline-block">
            <img src={logo} alt="VANO" className="h-7 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
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
          <a
            href="mailto:hello@vanojobs.com"
            className="inline-block text-xs text-white/60 hover:text-white bg-[linear-gradient(currentColor,currentColor)] bg-no-repeat bg-left-bottom bg-[length:0%_1px] hover:bg-[length:100%_1px] transition-[background-size,color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          >
            hello@vanojobs.com
          </a>
          <p className="text-white/55 text-xs">© 2026 VANO · Ireland</p>
        </div>
      </div>
    </footer>
  );
};
