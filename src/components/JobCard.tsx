import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Clock, Bookmark, BookmarkCheck, Flame, Loader2 } from 'lucide-react';
import { TagBadge } from './TagBadge';
import { format, differenceInHours, parseISO } from 'date-fns';
import { formatJobScheduleLine } from '@/lib/jobSchedule';
import { cn } from '@/lib/utils';

interface Job {
  id: string;
  title: string;
  location: string;
  hourly_rate: number;
  fixed_price?: number | null;
  payment_type?: string;
  tags: string[];
  shift_date: string;
  shift_start: string | null;
  shift_end: string | null;
  status: string;
  work_type?: string;
  is_urgent?: boolean;
  posted_by?: string;
}

export interface JobPosterPreview {
  display_name: string | null;
  avatar_url: string | null;
}

interface JobCardProps {
  job: Job;
  poster?: JobPosterPreview | null;
  isSaved?: boolean;
  onToggleSave?: (jobId: string) => Promise<void>;
  showSave?: boolean;
}

export const JobCard: React.FC<JobCardProps> = ({ job, poster, isSaved, onToggleSave, showSave }) => {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);

  const shiftDate = parseISO(job.shift_date);
  const hoursUntil = differenceInHours(shiftDate, new Date());
  const isVerySoon = hoursUntil >= 0 && hoursUntil <= 24;

  const posterName = poster?.display_name?.trim() || 'Client';
  const posterInitial = posterName[0]?.toUpperCase() || 'C';

  const rateLabel =
    job.payment_type === 'fixed'
      ? `€${job.fixed_price ?? 0} total`
      : `€${job.hourly_rate}/hr`;

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/jobs/${job.id}`)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/jobs/${job.id}`); } }}
      onMouseMove={(e) => {
        const rect = cardRef.current?.getBoundingClientRect();
        if (!rect) return;
        setSpot({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
      }}
      onMouseLeave={() => setSpot(null)}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-2xl border border-foreground/10 bg-card text-left shadow-sm transition-all duration-250',
        'hover:-translate-y-[3px] hover:border-foreground/15 hover:shadow-lg active:scale-[0.97]',
        job.is_urgent && 'border-destructive/30'
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-2xl transition-opacity duration-300"
        style={{ background: spot ? `radial-gradient(circle at ${spot.x}% ${spot.y}%, hsl(var(--foreground)/0.055) 0%, transparent 65%)` : 'transparent' }}
      />
      {/* Poster strip — marketplace-style identity */}
      <div className="flex items-center gap-3 border-b border-foreground/5 bg-muted/30 px-4 py-3">
        <div className="relative shrink-0">
          {poster?.avatar_url ? (
            <img
              src={poster.avatar_url}
              alt=""
              className="h-11 w-11 rounded-full object-cover ring-2 ring-background"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground/10 text-sm font-semibold text-foreground ring-2 ring-background">
              {posterInitial}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">{posterName}</p>
          <p className="text-[11px] text-muted-foreground">Posted this gig</p>
        </div>
        {showSave && onToggleSave && (
          <button
            type="button"
            disabled={saving}
            onClick={async (e) => {
              e.stopPropagation();
              setSaving(true);
              await onToggleSave(job.id);
              setSaving(false);
            }}
            className="shrink-0 rounded-lg p-2 text-muted-foreground transition-all duration-150 hover:bg-background hover:text-foreground active:scale-95 disabled:opacity-50"
            title={isSaved ? 'Remove save' : 'Save gig'}
          >
            {saving
              ? <Loader2 size={18} className="animate-spin" />
              : isSaved
                ? <BookmarkCheck size={18} className="text-foreground" />
                : <Bookmark size={18} />
            }
          </button>
        )}
      </div>

      <div className="p-4 sm:p-5">
        {job.is_urgent && (
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
            <Flame size={13} className="fill-destructive" />
            {isVerySoon ? `Needed in ${Math.max(1, hoursUntil)}h` : 'Urgent'}
          </div>
        )}

        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <h3 className="text-lg font-semibold leading-snug tracking-tight text-foreground group-hover:text-foreground/90">
            {job.title}
          </h3>
          <span className="shrink-0 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400 sm:text-right">
            {rateLabel}
          </span>
        </div>

        <div className="mb-4 flex flex-col gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <MapPin size={14} className="shrink-0 opacity-80" />
            <span>{job.location || 'Location TBC'}</span>
          </div>
          <div className="flex items-start gap-1.5">
            <Clock size={14} className="mt-0.5 shrink-0 opacity-80" />
            <span>{formatJobScheduleLine(job)}</span>
          </div>
        </div>

        {job.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {job.tags.slice(0, 5).map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
            {job.tags.length > 5 && (
              <span className="self-center text-xs text-muted-foreground">+{job.tags.length - 5}</span>
            )}
          </div>
        )}

        <div className="mt-4 pt-3.5 border-t border-foreground/8">
          <div className="flex items-center justify-end">
            <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-[13px] font-semibold text-primary transition-colors duration-150 group-hover:bg-primary group-hover:text-primary-foreground">
              View &amp; apply
              <span className="transition-transform duration-150 group-hover:translate-x-0.5">&rarr;</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
