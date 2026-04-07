import React from 'react';
import { MapPin, Star, Clock, Wallet, GraduationCap } from 'lucide-react';
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
  const locationLine = serviceArea?.trim() || 'Galway area · Ireland';
  const budgetLabel = formatTypicalBudget(typicalBudgetMin, typicalBudgetMax);
  const showHourly = hourlyRate != null && hourlyRate > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="relative h-56 sm:h-64 overflow-hidden">
        {bannerUrl ? (
          <img src={bannerUrl} alt="" className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.02]" />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: `linear-gradient(135deg, hsl(var(--primary) / 0.28) 0%, hsl(var(--primary) / 0.08) 50%, hsl(var(--muted)) 100%)`,
              backgroundImage: `radial-gradient(ellipse 90% 80% at 15% 20%, hsl(var(--primary) / 0.22), transparent 55%),
                radial-gradient(ellipse 60% 60% at 85% 75%, hsl(262 50% 55% / 0.14), transparent 50%)`,
            }}
          />
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
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-3 py-1 text-[11px] font-semibold text-emerald-600 ring-1 ring-emerald-500/25 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Available
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {/* Location — blue */}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/8 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 transition-colors duration-200 hover:bg-blue-500/15">
                <MapPin size={14} className="shrink-0 text-blue-500" />
                {locationLine}
              </span>

              {/* Hourly rate — green */}
              {showHourly && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/8 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 transition-colors duration-200 hover:bg-emerald-500/15">
                  <Clock size={14} className="shrink-0 text-emerald-500" />
                  €{Number(hourlyRate).toLocaleString('en-IE', { maximumFractionDigits: 2 })}/hr
                  <span className="opacity-60">· hourly</span>
                </span>
              )}

              {/* Typical project budget — amber */}
              {budgetLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/8 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 transition-colors duration-200 hover:bg-amber-500/15">
                  <Wallet size={14} className="shrink-0 text-amber-500" />
                  <span className="opacity-70">Typical project</span>
                  {budgetLabel}
                </span>
              )}

              {/* University */}
              {university && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground/70 transition-colors duration-200 hover:bg-foreground/5">
                  <GraduationCap size={13} className="shrink-0 text-foreground/50" />
                  {university}
                </span>
              )}

              {/* Rating — amber with filled star */}
              {avgRating && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/8 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 transition-colors duration-200 hover:bg-amber-500/15">
                  <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" />
                  {avgRating}
                  {reviewCount != null && reviewCount > 0 && (
                    <span className="opacity-60">({reviewCount})</span>
                  )}
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
