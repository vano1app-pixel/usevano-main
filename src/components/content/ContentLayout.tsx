import { type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { HouseholdFooter } from "@/components/household/HouseholdFooter";
import logo from "@/assets/logo.png";

/**
 * Shared chrome for the public content pages (blog + glossary). A light,
 * simple header — deliberately not the full booking-app nav, which carries
 * auth state and the quick-book sheet — plus the standard HouseholdFooter.
 */
export const ContentLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen bg-cream text-navy flex flex-col">
      <header className="sticky top-0 z-30 bg-cream/85 backdrop-blur-md border-b border-navy/10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link to="/" aria-label="VANO home" className="inline-flex items-center shrink-0">
            <img src={logo} alt="VANO — same-day home help in Galway" className="h-7 w-auto" />
          </Link>
          <nav aria-label="Content navigation" className="flex items-center gap-5 text-sm font-medium">
            {/* aria-current + weight marks the section you're in. */}
            <NavLink
              to="/blog"
              className={({ isActive }) =>
                isActive
                  ? 'hidden sm:inline text-navy font-semibold'
                  : 'hidden sm:inline text-navy/70 hover:text-navy transition-colors'
              }
            >
              Blog
            </NavLink>
            <NavLink
              to="/glossary"
              className={({ isActive }) =>
                isActive
                  ? 'hidden sm:inline text-navy font-semibold'
                  : 'hidden sm:inline text-navy/70 hover:text-navy transition-colors'
              }
            >
              Glossary
            </NavLink>
            <Link
              to="/join"
              className="inline-flex items-center rounded-full bg-sage px-4 py-2 text-white font-semibold hover:bg-sage-dark transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              Join as helper
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <HouseholdFooter />
    </div>
  );
};
