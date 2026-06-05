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
    <footer className="bg-white border-t border-border/50 px-4 py-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 mb-10">
          <Link to="/home" className="inline-block">
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
                      className="text-foreground/50 hover:text-foreground text-sm transition-colors duration-150"
                    >
                      {label}
                    </a>
                  ) : (
                    <Link
                      to={href}
                      className="text-foreground/50 hover:text-foreground text-sm transition-colors duration-150"
                    >
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="border-t border-border/50 pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <a href="mailto:hello@vanojobs.com" className="text-foreground/40 hover:text-foreground text-xs transition-colors duration-150">
            hello@vanojobs.com
          </a>
          <p className="text-foreground/40 text-xs">© 2026 VANO · Ireland</p>
        </div>
      </div>
    </footer>
  );
};
