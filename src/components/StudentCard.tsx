import React from 'react';
import { TagBadge } from './TagBadge';
import { Heart, MapPin, ArrowRight, MessageCircle, Star } from 'lucide-react';
import { formatTypicalBudget } from '@/lib/freelancerProfile';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ModBadge } from './ModBadge';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import type { TopStudentInfo } from '@/hooks/useTopStudents';

interface StudentProfile {
  id: string;
  user_id: string;
  bio: string;
  skills: string[];
  hourly_rate: number;
  is_available: boolean;
  avatar_url: string;
  banner_url?: string | null;
  service_area?: string | null;
  typical_budget_min?: number | null;
  typical_budget_max?: number | null;
  university?: string | null;
  student_verified?: boolean | null;
}

interface StudentCardProps {
  student: StudentProfile;
  displayName?: string;
  isFavourite?: boolean;
  onToggleFavourite?: (studentUserId: string) => void;
  showFavourite?: boolean;
  topInfo?: TopStudentInfo;
  /** Example profile — no navigation to /students/:id */
  demoExample?: boolean;
  /** Category label shown on the banner (e.g. "Website Design") */
  category?: string;
  /** Called when the message icon is tapped; omit to hide the button */
  onMessage?: (userId: string) => void;
  /** Pre-computed average rating (e.g. "4.8") */
  avgRating?: string | null;
  /** Number of reviews */
  reviewCount?: number;
  /** Override avatar from profiles table (single source of truth) */
  profileAvatarUrl?: string | null;
}

const MEDAL_STYLES = [
  'bg-yellow-100 text-yellow-700 border-yellow-300',
  'bg-gray-100 text-gray-600 border-gray-300',
  'bg-amber-50 text-amber-700 border-amber-300',
];
const MEDAL_LABELS = ['🥇 #1', '🥈 #2', '🥉 #3'];

/** University brand colors and short labels */
const UNI_MAP: { match: string; color: string; abbr: string }[] = [
  { match: 'atu',                     color: '#0066B3', abbr: 'ATU' },
  { match: 'atlantic technological',  color: '#0066B3', abbr: 'ATU' },
  { match: 'university of galway',    color: '#822433', abbr: 'UG' },
  { match: 'nui galway',              color: '#822433', abbr: 'NUIG' },
  { match: 'nuig',                    color: '#822433', abbr: 'NUIG' },
  { match: 'ucd',                     color: '#1A3A6B', abbr: 'UCD' },
  { match: 'university college dublin', color: '#1A3A6B', abbr: 'UCD' },
  { match: 'trinity',                 color: '#003B8E', abbr: 'TCD' },
  { match: 'tcd',                     color: '#003B8E', abbr: 'TCD' },
  { match: 'dcu',                     color: '#C8102E', abbr: 'DCU' },
  { match: 'ucc',                     color: '#002147', abbr: 'UCC' },
  { match: 'university of limerick',  color: '#003087', abbr: 'UL' },
  { match: 'ul ',                     color: '#003087', abbr: 'UL' },
  { match: 'maynooth',                color: '#4A1942', abbr: 'MU' },
  { match: 'dkit',                    color: '#E07B00', abbr: 'DkIT' },
];

function getUniStyle(university: string | null | undefined): { color: string; abbr: string } | null {
  if (!university?.trim()) return null;
  const lower = university.toLowerCase();
  for (const entry of UNI_MAP) {
    if (lower.includes(entry.match)) return { color: entry.color, abbr: entry.abbr };
  }
  return { color: '#6B7280', abbr: university.trim().slice(0, 5).toUpperCase() };
}

/** Deterministic banner gradient from user_id */
function cardGradient(userId: string): string {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  const palettes = [
    ['hsl(var(--primary))', 'hsl(262 50% 52%)'],
    ['hsl(200 70% 42%)', 'hsl(var(--primary))'],
    ['hsl(152 48% 35%)', 'hsl(200 55% 38%)'],
    ['hsl(262 42% 40%)', 'hsl(316 45% 38%)'],
    ['hsl(22 55% 38%)', 'hsl(var(--primary))'],
  ];
  const [a, b] = palettes[u % palettes.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export const StudentCard: React.FC<StudentCardProps> = ({
  student,
  displayName,
  isFavourite,
  onToggleFavourite,
  showFavourite = false,
  topInfo,
  demoExample,
  category,
  onMessage,
  avgRating,
  reviewCount,
  profileAvatarUrl,
}) => {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin(student.user_id);
  const resolvedAvatar = profileAvatarUrl || student.avatar_url;
  const budgetLabel = formatTypicalBudget(student.typical_budget_min, student.typical_budget_max);
  const area = student.service_area?.trim();
  const uniStyle = getUniStyle(student.university);
  const clickable = !demoExample;

  // Top 3 skills for banner keyword line
  const bannerSkills = (student.skills || []).slice(0, 3);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-foreground/8 bg-card shadow-sm transition-all duration-250',
        clickable && 'cursor-pointer hover:-translate-y-[3px] hover:border-primary/30 hover:shadow-lg hover:shadow-primary/8 active:scale-[0.97] group',
        !clickable && 'cursor-default',
      )}
      onClick={clickable ? () => navigate(`/students/${student.user_id}`) : undefined}
    >
      {/* Banner — taller for more visual presence */}
      <div className="relative h-52 w-full overflow-hidden sm:h-60">
        {student.banner_url ? (
          <img src={student.banner_url} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
        ) : (
          <div className="h-full w-full transition-transform duration-500 group-hover:scale-105" style={{ background: cardGradient(student.user_id) }} />
        )}
        {/* Gradient overlay — stronger at bottom */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/50" />

        {/* Top-left: skill keywords line */}
        {bannerSkills.length > 0 && (
          <div className="absolute left-3 top-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/80">
              {bannerSkills.join(' · ')}
            </p>
          </div>
        )}

        {/* Top-right: verified + medal + demo badge + favourite */}
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          {demoExample && (
            <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-black/30 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-white/80 backdrop-blur-sm">
              Example
            </span>
          )}
          {topInfo && (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm ${MEDAL_STYLES[topInfo.rank]}`}>
              {MEDAL_LABELS[topInfo.rank]}
            </span>
          )}
          {showFavourite && onToggleFavourite && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleFavourite(student.user_id); }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm transition-all duration-150 hover:bg-black/50 active:scale-90"
              title={isFavourite ? 'Remove favourite' : 'Save'}
            >
              <Heart size={13} className={isFavourite ? 'fill-white text-white' : 'text-white'} />
            </button>
          )}
        </div>

      </div>

      <div className="px-4 pb-4">
        {/* Avatar row — overlaps banner */}
        <div className="flex items-end justify-between -mt-9 mb-3">
          <div className="flex flex-col items-center gap-0.5">
            <div
              className="relative rounded-full shadow-md"
              style={uniStyle ? {
                padding: '3px',
                background: uniStyle.color,
                borderRadius: '9999px',
              } : {
                padding: '3px',
                background: 'hsl(var(--border))',
                borderRadius: '9999px',
              }}
            >
              {resolvedAvatar ? (
                <img
                  src={resolvedAvatar}
                  alt={displayName || 'Freelancer'}
                  className="h-16 w-16 rounded-full border-2 border-card object-cover sm:h-20 sm:w-20"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-card bg-primary/10 text-xl font-bold text-primary sm:h-20 sm:w-20 sm:text-2xl">
                  {(displayName || 'S')[0].toUpperCase()}
                </div>
              )}
              {student.is_available && (
                <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500 shadow-sm" />
              )}
            </div>
            {uniStyle && (
              <span
                className="mt-1 text-[9px] font-bold uppercase tracking-widest"
                style={{ color: uniStyle.color }}
              >
                {uniStyle.abbr}
              </span>
            )}
          </div>

          {/* Right: available + admin */}
          <div className="flex flex-wrap items-center gap-1 pb-1">
            {isAdmin && <ModBadge size="sm" />}
            {student.is_available && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                Available
              </span>
            )}
          </div>
        </div>

        {/* Name */}
        <h3 className="truncate text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl">
          {displayName || 'Freelancer'}
        </h3>

        {/* Rating row — shown if we have reviews */}
        {avgRating && (
          <div className="mt-1 flex items-center gap-1">
            <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" />
            <span className="text-[12px] font-semibold text-amber-700 dark:text-amber-400">{avgRating}</span>
            {reviewCount != null && reviewCount > 0 && (
              <span className="text-[11px] text-muted-foreground">· {reviewCount} review{reviewCount !== 1 ? 's' : ''}</span>
            )}
          </div>
        )}

        {/* Location + rate row */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {area && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin size={11} className="shrink-0 text-primary/70" />
              {area}
            </span>
          )}
          {student.hourly_rate > 0 && (
            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              from €{student.hourly_rate}/hr
            </span>
          )}
          {budgetLabel && (
            <span className="text-xs font-medium text-foreground/60">{budgetLabel} projects</span>
          )}
        </div>

        {/* Bio */}
        {student.bio && (
          <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
            {student.bio}
          </p>
        )}

        {/* Skills */}
        {student.skills?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {student.skills.slice(0, 4).map((skill) => (
              <TagBadge key={skill} tag={skill} />
            ))}
          </div>
        )}

        {/* CTA */}
        {clickable && (
          <div className="mt-4 pt-3 border-t border-foreground/6 flex gap-2">
            <span className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary/8 px-3 py-2 text-[12px] font-semibold text-primary transition-all duration-200 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-md group-hover:shadow-primary/15">
              View profile <ArrowRight size={12} strokeWidth={2.5} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
            {onMessage && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMessage(student.user_id); }}
                className="flex h-[2.125rem] w-[2.125rem] shrink-0 items-center justify-center rounded-xl border border-foreground/10 bg-muted/60 text-foreground/60 transition-all duration-150 hover:border-primary/30 hover:bg-primary/8 hover:text-primary active:scale-95"
                title="Message"
              >
                <MessageCircle size={14} strokeWidth={2} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
