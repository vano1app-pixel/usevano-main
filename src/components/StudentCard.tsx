import React from 'react';
import { TagBadge } from './TagBadge';
import { Heart, MapPin } from 'lucide-react';
import { formatTypicalBudget } from '@/lib/freelancerProfile';
import { useNavigate } from 'react-router-dom';
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

export const StudentCard: React.FC<StudentCardProps> = ({ student, displayName, isFavourite, onToggleFavourite, showFavourite, topInfo }) => {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin(student.user_id);
  const budgetLabel = formatTypicalBudget(student.typical_budget_min, student.typical_budget_max);
  const area = student.service_area?.trim();

  return (
    <div
      className="cursor-pointer overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-200 hover:border-primary/25 hover:shadow-lg"
      onClick={() => navigate(`/students/${student.user_id}`)}
    >
      {student.banner_url ? (
        <div className="h-16 w-full overflow-hidden sm:h-[4.5rem]">
          <img src={student.banner_url} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="h-14 w-full bg-gradient-to-r from-primary/20 via-primary/10 to-muted sm:h-16" />
      )}
      <div className="flex items-start gap-3 p-4 pt-3">
        {student.avatar_url ? (
          <img
            src={student.avatar_url}
            alt={displayName || 'Student'}
            className="-mt-8 h-14 w-14 shrink-0 rounded-xl border-2 border-card object-cover shadow-md ring-1 ring-border/60 sm:-mt-9 sm:h-16 sm:w-16"
          />
        ) : (
          <div className="-mt-8 flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-card bg-primary/12 text-lg font-bold text-primary shadow-md ring-1 ring-border/60 sm:-mt-9 sm:h-16 sm:w-16 sm:text-xl">
            {(displayName || 'S')[0].toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-foreground">{displayName || 'Student'}</h3>
                {isAdmin && <ModBadge size="sm" />}
                {topInfo && (
                  <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${MEDAL_STYLES[topInfo.rank]}`}>
                    {MEDAL_LABELS[topInfo.rank]}
                  </span>
                )}
                {student.is_available && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" title="Available" />
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 font-medium text-foreground/85">
                  <MapPin size={12} className="shrink-0 text-primary" />
                  {area || 'Galway area'}
                </span>
                {student.hourly_rate > 0 && (
                  <span className="font-semibold text-primary">€{student.hourly_rate}/hr</span>
                )}
                {budgetLabel && <span className="font-medium text-foreground/90">{budgetLabel} projects</span>}
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
