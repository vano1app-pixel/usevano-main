import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Phone, MapPin, CalendarCheck, MessageCircle, FileText, Shield, UserPlus, UserCog, ChevronRight, Pencil,
} from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { PartnerProgramCard } from '@/components/household/PartnerProgramCard';
import { loadBookingMemory, saveBookingMemory, clearBookingMemory } from '@/lib/bookingMemory';
import { teamWhatsAppHref } from '@/lib/contact';

const Account: React.FC = () => {
  const [mem, setMem] = useState(() => loadBookingMemory());

  // Inline edit — lets you fix a wrong number, add a missing address, or set
  // your details up front before your first booking.
  const [editing, setEditing] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [addressDraft, setAddressDraft] = useState('');

  function startEditing() {
    setPhoneDraft(mem?.phone ?? '');
    setAddressDraft(mem?.address ?? '');
    setEditing(true);
  }

  function saveEdits() {
    const phone = phoneDraft.trim();
    if (!phone) return;
    const address = addressDraft.trim();
    // Rewrite the whole record (clear first) so an emptied address actually
    // clears — saveBookingMemory keeps previous fields it isn't given.
    // Coordinates/city belong to the old address, so only carry them over
    // when the address text didn't change.
    const addressUnchanged = address === (mem?.address ?? '').trim() && !!address;
    const prev = mem;
    clearBookingMemory();
    saveBookingMemory({
      phone,
      address: address || undefined,
      lat: addressUnchanged ? prev?.lat : undefined,
      lng: addressUnchanged ? prev?.lng : undefined,
      city: addressUnchanged ? prev?.city : undefined,
      lastCategory: prev?.lastCategory,
      lastSize: prev?.lastSize,
    });
    setMem(loadBookingMemory());
    setEditing(false);
  }

  function forget() {
    clearBookingMemory();
    setMem(null);
    setEditing(false);
  }

  const links: { label: string; to?: string; href?: string; icon: React.ElementType }[] = [
    { label: 'Your bookings', to: '/bookings', icon: CalendarCheck },
    { label: 'Become a helper', to: '/join', icon: UserPlus },
    { label: 'Helper account — photo, payouts & profile', to: '/student-account', icon: UserCog },
    { label: 'Chat to us on WhatsApp', href: `${teamWhatsAppHref}?text=${encodeURIComponent('Hi VANO! ')}`, icon: MessageCircle },
    { label: 'Terms', to: '/terms', icon: FileText },
    { label: 'Privacy', to: '/privacy', icon: Shield },
  ];

  return (
    <div className="min-h-[100dvh] bg-cream">
      <SEOHead title="Account" description="Your VANO details, bookings and referral credit." url="https://vanojobs.com/account" />
      <HouseholdNav />

      {/* Mobile: top-aligned under the nav. Desktop: centre the column in the
          viewport so the details + links sit balanced in the middle rather than
          clinging to the top over empty cream. Grows past the viewport (and
          top-aligns) if the content is ever taller than the screen. */}
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col px-4 pt-24 pb-28 md:justify-center md:pb-32">
        <header className="mb-6">
          <p className="eyebrow mb-3">Account</p>
          <h1 className="display-lg text-foreground">Your details</h1>
        </header>

        {/* Saved details — device-local, editable */}
        {editing ? (
          <div className="surface-float rounded-2xl border border-black/5 bg-white p-5 mb-4">
            <p className="text-sm font-semibold text-foreground mb-4">Edit your details</p>
            <div className="space-y-3">
              <div>
                <label htmlFor="account-phone" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-1.5">Phone</label>
                <input
                  id="account-phone"
                  type="tel"
                  value={phoneDraft}
                  onChange={e => setPhoneDraft(e.target.value)}
                  placeholder="+353 87 123 4567"
                  autoFocus
                  className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label htmlFor="account-address" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-1.5">Address</label>
                <input
                  id="account-address"
                  type="text"
                  value={addressDraft}
                  onChange={e => setAddressDraft(e.target.value)}
                  placeholder="e.g. 12 Shop Street, Galway"
                  className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={saveEdits}
                disabled={!phoneDraft.trim()}
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-full bg-secondary px-5 py-2 text-sm font-semibold text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : mem ? (
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
            <div className="mt-4 flex items-center gap-4">
              <button
                onClick={startEditing}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-sage-dark hover:text-foreground"
              >
                <Pencil className="w-3 h-3" aria-hidden="true" />
                {mem.address ? 'Edit profile' : 'Edit profile / add address'}
              </button>
              <button
                onClick={forget}
                className="text-xs font-semibold text-foreground/45 hover:text-foreground/70 underline underline-offset-2"
              >
                Clear saved details
              </button>
            </div>
          </div>
        ) : (
          <div className="surface-float rounded-2xl border border-black/5 bg-white p-5 mb-4 text-center">
            <p className="text-sm text-muted-foreground">
              No saved details yet. <Link to="/home" className="font-semibold text-sage-dark underline underline-offset-2">Book your first job</Link> and we'll remember them here.
            </p>
            <button
              onClick={startEditing}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-sage-dark hover:text-foreground"
            >
              <Pencil className="w-3 h-3" aria-hidden="true" />
              Add your details now
            </button>
          </div>
        )}

        {/* Partner program — THE growth loop (owner call, July 2026): recruit
            students, earn 3% of every job they do. The old Give €5 Get €5
            customer card is parked — its checkout credits still honour, but
            the promotion slot belongs to the network-effect play. */}
        <div className="mb-4">
          <PartnerProgramCard />
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
