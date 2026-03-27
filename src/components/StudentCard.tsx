import React from 'react';
import { TagBadge } from './TagBadge';
import { Heart, MapPin } from 'lucide-react';
import { formatTypicalBudget } from '@/lib/freelancerProfile';
import { useNavigate } from 'react-router-dom';
import { ModBadge } from './ModBadge';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import type { TopStudentInfo } from '@/hooks/useTopStudents';
import { cn } from '@/lib/utils';

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
}

interface StudentCardProps {
  student: StudentProfile;
  displayName?: string;
  isFavourite?: boolean;
  onToggleFavourite?: (studentUserId: string) => void;
  showFavourite?: boolean;
  topInfo?: TopStudentInfo;
}

const MEDAL_STYLES = [
  'bg-yellow-100 text-yellow-700 border-yellow-300', // 1st
  'bg-gray-100 text-gray-600 border-gray-300',       // 2nd
  'bg-amber-50 text-amber-700 border-amber-300',     // 3rd
];
const MEDAL_LABELS = ['🥇 #1', '🥈 #2', '🥉 #3'];

/** Deterministic banner gradient from user_id */
function cardGradient(userId: string): string {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  const palettes = [
    ['hsl(var(--primary))', 'hsl(262 50% 52%)'],   // primary → purple
    ['hsl(200 70% 42%)', 'hsl(var(--primary))'],    // teal → primary
    ['hsl(152 48% 35%)', 'hsl(200 55% 38%)'],       // forest → teal
    ['hsl(262 42% 40%)', 'hsl(316 45% 38%)'],       // plum → pink
    ['hsl(22 55% 38%)', 'hsl(var(--primary))'],     // rust → primary
  ];
  const [a, b] = palettes[u % palettes.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export const StudentCard: React.FC<StudentCardProps> = ({ student, displayName, isFavourite, onToggleFavourite, showFavourite, topInfo }) => {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin(student.user_id);
  const budgetLabel = formatTypicalBudget(student.typical_budget_min, student.typical_budget_max);
  const area = student.service_area?.trim();

  return (
    <div
      className="cursor-pointer overflow-hidden rounded-2xl border border-foreground/10 bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.18)]"
      onClick={() => navigate(`/students/${student.user_id}`)}
    >
      {/* Banner */}
      <div className="relative h-20 w-full overflow-hidden sm:h-24">
        {student.banner_url ? (
          <img
            src={student.banner_url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{ background: cardGradient(student.user_id) }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
      </div>

      <div className="flex items-start gap-3 px-4 pb-4 pt-0">
        {/* Avatar */}
        <div className="relative shrink-0">
          {student.avatar_url ? (
            <img
              src={student.avatar_url}
              alt={displayName || 'Freelancer'}
              className="-mt-7 h-14 w-14 rounded-full border-[3px] border-card object-cover shadow-md ring-1 ring-foreground/10 sm:-mt-8 sm:h-16 sm:w-16"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="-mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[3px] border-card bg-primary/12 text-lg font-bold text-primary shadow-md ring-1 ring-foreground/10 sm:-mt-8 sm:h-16 sm:w-16 sm:text-xl">
              {(displayName || 'S')[0].toUpperCase()}
            </div>
          )}
          {student.is_available && (
            <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500 shadow-sm" />
          )}
        </div>

        <div className="min-w-0 flex-1 pt-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="truncate text-base font-semibold text-foreground">{displayName || 'Freelancer'}</h3>
                {isAdmin && <ModBadge size="sm" />}
                {topInfo && (
                  <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${MEDAL_STYLES[topInfo.rank]}`}>
                    {MEDAL_LABELS[topInfo.rank]}
                  </span>
                )}
                {student.is_available && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                    Available
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin size={11} className="shrink-0 text-primary/70" />
                  {area || 'Galway area'}
                </span>
                {student.hourly_rate > 0 && (
                  <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    €{student.hourly_rate}/hr
                  </span>
                )}
                {budgetLabel && (
                  <span className="text-xs font-medium text-foreground/70">{budgetLabel} projects</span>
                )}
              </div>
            </div>
            {showFavourite && onToggleFavourite && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavourite(student.user_id);
                }}
                className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-secondary"
                title={isFavourite ? 'Remove favourite' : 'Add favourite'}
              >
                {isFavourite ? (
                  <Heart size={16} className="fill-primary text-primary" />
                ) : (
                  <Heart size={16} className="text-muted-foreground" />
                )}
              </button>
            )}
          </div>
          {student.bio && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{student.bio}</p>}
          {student.skills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {student.skills.slice(0, 5).map((skill) => (
                <TagBadge key={skill} tag={skill} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
