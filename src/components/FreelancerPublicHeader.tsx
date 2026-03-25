import React from 'react';
import { MapPin, Star, Clock, Wallet } from 'lucide-react';
import { formatTypicalBudget } from '@/lib/freelancerProfile';

export interface FreelancerPublicHeaderProps {
  displayName: string;
  nameAccessory?: React.ReactNode;
  bannerUrl?: string | null;
  avatarUrl?: string | null;
  isAvailable?: boolean | null;
  /** Shown on profile; defaults to a Galway-oriented line if empty */
  serviceArea?: string | null;
  hourlyRate?: number | null;
  typicalBudgetMin?: number | null;
  typicalBudgetMax?: number | null;
  avgRating?: string | null;
  reviewCount?: number;
  bio?: string | null;
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
  hourlyRate,
  typicalBudgetMin,
  typicalBudgetMax,
  avgRating,
  reviewCount,
  bio,
  actionRow,
  footnote,
}) => {
  const locationLine = serviceArea?.trim() || 'Galway area · Ireland';
  const budgetLabel = formatTypicalBudget(typicalBudgetMin, typicalBudgetMax);
  const showHourly = hourlyRate != null && hourlyRate > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="relative h-36 sm:h-44">
        {bannerUrl ? (
          <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="h-full w-full bg-gradient-to-br from-primary/[0.22] via-primary/[0.08] to-muted"
            style={{
              backgroundImage: `radial-gradient(ellipse 90% 80% at 20% 20%, hsl(var(--primary) / 0.18), transparent 55%),
                radial-gradient(ellipse 70% 60% at 90% 80%, hsl(var(--primary) / 0.1), transparent 50%)`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
      </div>

      <div className="relative z-[1] px-4 pb-5 pt-0 sm:px-6 sm:pb-6">
        <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end sm:gap-6">
          <div className="shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-24 w-24 rounded-2xl border-4 border-card object-cover shadow-md ring-1 ring-border/80 sm:h-28 sm:w-28"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-card bg-primary/12 text-3xl font-bold text-primary shadow-md ring-1 ring-border/80 sm:h-28 sm:w-28 sm:text-4xl">
                {displayName[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pb-0 sm:pb-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl md:text-3xl">{displayName}</h1>
              {nameAccessory}
              {isAvailable && (
                <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-[11px] font-semibold text-primary ring-1 ring-primary/20">
                  Available
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/90 bg-secondary/40 px-3 py-1 text-xs font-medium text-foreground">
                <MapPin size={13} className="shrink-0 text-primary" />
                {locationLine}
              </span>
              {showHourly && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/90 bg-secondary/40 px-3 py-1 text-xs font-medium text-foreground">
                  <Clock size={13} className="shrink-0 text-primary" />
                  €{Number(hourlyRate).toLocaleString('en-IE', { maximumFractionDigits: 2 })}/hr
                  <span className="text-muted-foreground">· hourly</span>
                </span>
              )}
              {budgetLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/90 bg-secondary/40 px-3 py-1 text-xs font-medium text-foreground">
                  <Wallet size={13} className="shrink-0 text-primary" />
                  <span className="text-muted-foreground">Typical project</span>
                  {budgetLabel}
                </span>
              )}
              {avgRating && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/90 bg-secondary/40 px-3 py-1 text-xs font-medium text-foreground">
                  <Star size={13} className="shrink-0 fill-amber-400 text-amber-500" />
                  {avgRating}
                  {reviewCount != null && reviewCount > 0 && (
                    <span className="text-muted-foreground">({reviewCount})</span>
                  )}
                </span>
              )}
            </div>

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
