import React from 'react';
import { Link } from 'react-router-dom';
import logo from '@/assets/logo.png';

const NAV_LINKS = [
  { label: 'Join as helper', href: '/join',                                                                                        external: false },
  { label: 'Instagram',      href: 'https://instagram.com/vanojobs',                                                              external: true  },
  { label: 'WhatsApp',       href: 'https://wa.me/353899817111',                                                                  external: true  },
  { label: 'Terms',          href: '/terms',                                                                                      external: false },
  { label: 'Privacy',        href: '/privacy',                                                                                    external: false },
];

export const HouseholdFooter: React.FC = () => {
  return (
    <footer className="bg-navy text-white px-4 py-12">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 mb-10">
          {/* Logo with CSS invert so it reads white on dark bg */}
          <Link to="/home" className="inline-block">
            <img
              src={logo}
              alt="VANO"
              className="h-7 w-auto"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
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
                      className="text-white/60 hover:text-white text-sm transition-colors duration-150"
                    >
                      {label}
                    </a>
                  ) : (
                    <Link
                      to={href}
                      className="text-white/60 hover:text-white text-sm transition-colors duration-150"
                    >
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-white/40 text-xs">
            hello@vanojobs.com
          </p>
          <p className="text-white/40 text-xs">
            © 2026 VANO · Galway, Ireland
          </p>
        </div>
      </div>
    </footer>
  );
};
