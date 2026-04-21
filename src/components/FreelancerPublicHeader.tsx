import React from 'react';
import { MapPin, Star, Clock, Wallet, GraduationCap } from 'lucide-react';
import { formatTypicalBudget } from '@/lib/freelancerProfile';
import { getUniversityLabel } from '@/lib/universities';
import { formatLocation } from '@/lib/irelandCounties';
import { cn } from '@/lib/utils';
import { cardBase } from '@/lib/cardStyles';

export interface FreelancerPublicHeaderProps {
  displayName: string;
  nameAccessory?: React.ReactNode;
  bannerUrl?: string | null;
  avatarUrl?: string | null;
  isAvailable?: boolean | null;
  /** Legacy free-text location. Used only as a fallback when the
   *  structured `county` + `remoteOk` pair is absent (pre-migration rows). */
  serviceArea?: string | null;
  /** Ireland-wide county enum (one of the 26 ROI counties). */
  county?: string | null;
  /** Whether the freelancer accepts work from outside their county. */
  remoteOk?: boolean | null;
  hourlyRate?: number | null;
  typicalBudgetMin?: number | null;
  typicalBudgetMax?: number | null;
  avgRating?: string | null;
  reviewCount?: number;
  bio?: string | null;
  /** Listing title shown as a tagline below the name, e.g. "Event videography & short-form reels" */
  subtitle?: string | null;
  university?: string | null;
  actionRow?: React.ReactNode;
  /** e.g. "3 gigs completed" on portfolio */
  footnote?: string | null;
}

export const FreelancerPublicHeader: React.FC<FreelancerPublicHeaderProps> = ({
  displayName,
  nameAccessory,
  bannerUrl,
  avatarUrl,
  isAvailable,
  serviceArea,
  county,
  remoteOk,
  hourlyRate,
  typicalBudgetMin,
  typicalBudgetMax,
  avgRating,
  reviewCount,
  bio,
  subtitle,
  university,
  actionRow,
  footnote,
}) => {
  // Ireland-wide: prefer the structured county/remote pair, fall back
  // to legacy free-text service_area, or hide the chip entirely if
  // nothing is set (was previously a hard-coded "Galway area · Ireland"
  // default, which lied for any Cork/Dublin/etc. freelancer).
  const locationLine = formatLocation({ county, remote_ok: remoteOk }) || (serviceArea?.trim() || null);
  const budgetLabel = formatTypicalBudget(typicalBudgetMin, typicalBudgetMax);
  const showHourly = hourlyRate != null && hourlyRate > 0;

  return (
    <div className={cn(cardBase, 'overflow-hidden')}>
      <div className="relative h-56 sm:h-64 overflow-hidden">
        {bannerUrl ? (
          <img src={bannerUrl} alt="" className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.02]" />
        ) : (
          // Richer branded fallback — layered radial gradients + a subtle dot
          // pattern so an un-uploaded banner still feels intentional, not empty.
          <div className="relative h-full w-full">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `
                  radial-gradient(ellipse 65% 55% at 12% 18%, hsl(var(--primary) / 0.34), transparent 60%),
                  radial-gradient(ellipse 55% 50% at 90% 30%, hsl(262 60% 55% / 0.22), transparent 60%),
                  radial-gradient(ellipse 70% 60% at 70% 100%, hsl(186 70% 55% / 0.18), transparent 55%),
                  linear-gradient(135deg, hsl(var(--primary) / 0.14) 0%, hsl(var(--muted)) 100%)
                `,
              }}
            />
            <div
              className="absolute inset-0 opacity-30 mix-blend-overlay"
              style={{
                backgroundImage: `radial-gradient(hsl(var(--foreground) / 0.14) 1px, transparent 1px)`,
                backgroundSize: '22px 22px',
              }}
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/10 to-transparent" />
      </div>

      <div className="relative z-[1] px-4 pb-5 pt-0 sm:px-6 sm:pb-6">
        <div className="-mt-16 flex flex-col gap-4 sm:-mt-20 sm:flex-row sm:items-end sm:gap-6">
          <div className="shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-28 w-28 rounded-full border-4 border-card object-cover shadow-lg ring-2 ring-primary/15 sm:h-32 sm:w-32"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-card bg-primary/12 text-3xl font-bold text-primary shadow-lg ring-2 ring-primary/15 sm:h-32 sm:w-32 sm:text-4xl">
                {displayName[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pb-0 sm:pb-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl md:text-3xl">{displayName}</h1>
              {nameAccessory}
              {isAvailable && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/[0.06] px-3 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Available
                </span>
              )}
            </div>

            {/* Prominent rating — only render when there are real reviews
                (no fake social proof on brand-new profiles). This is the
                single most persuasive thing a hirer reads, so it gets its
                own line instead of being mixed into the micro-badges. */}
            {avgRating && reviewCount != null && reviewCount > 0 && (
              <div className="mt-2.5 flex items-center gap-1.5">
                <Star size={18} className="shrink-0 fill-amber-400 text-amber-400" strokeWidth={0} />
                <span className="text-base font-bold text-foreground sm:text-lg">{avgRating}</span>
                <span className="text-sm text-muted-foreground">
                  · {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
                </span>
              </div>
            )}

            {/* At-a-glance info chips — unified shell, identity
                carried by the colored lucide icon rather than four
                separate color washes. Previously each chip had its own
                bg/border/text triple (blue, emerald, amber, neutral)
                which made the row read as four different widgets; this
                version scans as one row with typed accents. */}
            <div className="mt-3 flex flex-wrap gap-2">
              {/* Location — only renders when we have a real signal.
                  No more "Galway area · Ireland" fallback for out-of-
                  Galway freelancers. */}
              {locationLine && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground/80 transition-colors duration-200 hover:bg-muted/50">
                  <MapPin size={14} className="shrink-0 text-blue-500" />
                  {locationLine}
                </span>
              )}

              {/* Hourly rate */}
              {showHourly && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground/80 transition-colors duration-200 hover:bg-muted/50">
                  <Clock size={14} className="shrink-0 text-emerald-500" />
                  €{Number(hourlyRate).toLocaleString('en-IE', { maximumFractionDigits: 2 })}/hr
                  <span className="text-muted-foreground">· hourly</span>
                </span>
              )}

              {/* Typical project budget */}
              {budgetLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground/80 transition-colors duration-200 hover:bg-muted/50">
                  <Wallet size={14} className="shrink-0 text-amber-500" />
                  <span className="text-muted-foreground">Typical project</span>
                  {budgetLabel}
                </span>
              )}

              {/* University */}
              {university && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground/80 transition-colors duration-200 hover:bg-muted/50">
                  <GraduationCap size={13} className="shrink-0 text-foreground/50" />
                  {getUniversityLabel(university)}
                </span>
              )}
            </div>

            {subtitle && (
              <p className="mt-2.5 text-sm font-semibold text-foreground/80 sm:max-w-2xl">{subtitle}</p>
            )}

            {footnote && <p className="mt-2 text-xs font-medium text-muted-foreground">{footnote}</p>}

            {bio && (
              <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-muted-foreground sm:max-w-2xl">{bio}</p>
            )}

            {actionRow && <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">{actionRow}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
