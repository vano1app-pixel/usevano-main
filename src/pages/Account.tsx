import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Phone, MapPin, CalendarCheck, MessageCircle, FileText, Shield, UserPlus, ChevronRight,
} from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { ReferralShareCard } from '@/components/household/ReferralShareCard';
import { loadBookingMemory, clearBookingMemory } from '@/lib/bookingMemory';
import { teamWhatsAppHref } from '@/lib/contact';

const Account: React.FC = () => {
  const [mem, setMem] = useState(() => loadBookingMemory());

  function forget() {
    clearBookingMemory();
    setMem(null);
  }

  const links: { label: string; to?: string; href?: string; icon: React.ElementType }[] = [
    { label: 'Your bookings', to: '/bookings', icon: CalendarCheck },
    { label: 'Become a helper', to: '/join', icon: UserPlus },
    { label: 'Chat to us on WhatsApp', href: `${teamWhatsAppHref}?text=${encodeURIComponent('Hi VANO! ')}`, icon: MessageCircle },
    { label: 'Terms', to: '/terms', icon: FileText },
    { label: 'Privacy', to: '/privacy', icon: Shield },
  ];

  return (
    <div className="min-h-[100dvh] bg-cream">
      <SEOHead title="Account" description="Your VANO details, bookings and referral credit." url="https://vanojobs.com/account" />
      <HouseholdNav />

      <main className="mx-auto w-full max-w-lg px-4 pt-24 pb-28">
        <header className="mb-6">
          <p className="eyebrow mb-3">Account</p>
          <h1 className="display-lg text-foreground">Your details</h1>
        </header>

        {/* Saved details — device-local, with a clear affordance */}
        {mem ? (
          <div className="surface-float rounded-2xl border border-black/5 bg-white p-5 mb-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-foreground/60">
                  <Phone className="w-4 h-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Phone</p>
                  <p className="text-sm font-semibold text-foreground truncate">{mem.phone}</p>
                </div>
              </div>
              {mem.address && (
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-foreground/60">
                    <MapPin className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Address</p>
                    <p className="text-sm font-semibold text-foreground truncate">{mem.address}</p>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={forget}
              className="mt-4 text-xs font-semibold text-foreground/45 hover:text-foreground/70 underline underline-offset-2"
            >
              Clear saved details
            </button>
          </div>
        ) : (
          <div className="surface-float rounded-2xl border border-black/5 bg-white p-5 mb-4 text-center">
            <p className="text-sm text-muted-foreground">
              No saved details yet. <Link to="/home" className="font-semibold text-sage-dark underline underline-offset-2">Book your first job</Link> and we'll remember them here.
            </p>
          </div>
        )}

        {/* Referral credit — only renders for people who've booked */}
        <div className="mb-4">
          <ReferralShareCard />
        </div>

        {/* Links */}
        <div className="surface-float overflow-hidden rounded-2xl border border-black/5 bg-white divide-y divide-border/60">
          {links.map(({ label, to, href, icon: Icon }) => {
            const inner = (
              <>
                <span className="flex items-center gap-3">
                  <Icon className="w-[18px] h-[18px] text-foreground/55 transition-colors group-hover/row:text-foreground/80" aria-hidden="true" />
                  <span className="text-sm font-semibold text-foreground">{label}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 transition-transform duration-200 group-hover/row:translate-x-0.5 group-hover/row:text-muted-foreground/70" aria-hidden="true" />
              </>
            );
            const cls = 'group/row flex items-center justify-between px-5 py-3.5 hover:bg-secondary/50 transition-colors active:bg-secondary/70';
            return href ? (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
            ) : (
              <Link key={label} to={to!} className={cls}>{inner}</Link>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/70">VANO · Ireland</p>
      </main>
    </div>
  );
};

export default Account;
