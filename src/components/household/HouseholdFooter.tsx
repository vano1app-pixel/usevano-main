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

// Underline grows from the left on hover (animated background-size) — quietly
// makes the static footer feel responsive without adding any layout.
const linkCls =
  'inline-block py-1 text-sm text-white/60 hover:text-white bg-gradient-to-r from-white/70 to-white/70 bg-no-repeat bg-left-bottom bg-[length:0%_1px] hover:bg-[length:100%_1px] transition-[color,background-size] duration-300';

export const HouseholdFooter: React.FC = () => {
  return (
    <footer className="bg-navy text-white px-4 py-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 mb-10">
          <Link to="/home" className="inline-block transition-transform duration-200 hover:scale-[1.03]">
            <img src={logo} alt="VANO" className="h-7 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
          </Link>

          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap gap-x-6 gap-y-3">
              {NAV_LINKS.map(({ label, href, external }) => (
                <li key={label}>
                  {external ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className={linkCls}>
                      {label}
                    </a>
                  ) : (
                    <Link to={href} className={linkCls}>
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <a
            href="mailto:hello@vanojobs.com"
            className="inline-block text-xs text-white/40 hover:text-white bg-gradient-to-r from-white/50 to-white/50 bg-no-repeat bg-left-bottom bg-[length:0%_1px] hover:bg-[length:100%_1px] transition-[color,background-size] duration-300"
          >
            hello@vanojobs.com
          </a>
          <p className="text-white/40 text-xs">© 2026 VANO · Ireland</p>
        </div>
      </div>
    </footer>
  );
};
