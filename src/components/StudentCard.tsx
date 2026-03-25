import React from 'react';
import { TagBadge } from './TagBadge';
import { Heart, Trophy } from 'lucide-react';
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

  return (
    <div
      className="bg-card border border-border rounded-xl p-5 hover:shadow-lg hover:border-primary/20 transition-all duration-200 cursor-pointer"
      onClick={() => navigate(`/students/${student.user_id}`)}
    >
      <div className="flex items-start gap-4">
        {student.avatar_url ? (
          <img src={student.avatar_url} alt={displayName || 'Student'} className="w-12 h-12 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
            {(displayName || 'S')[0].toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-base font-semibold text-foreground truncate">{displayName || 'Student'}</h3>
              {isAdmin && <ModBadge size="sm" />}
              {topInfo && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full border ${MEDAL_STYLES[topInfo.rank]}`}>
                  {MEDAL_LABELS[topInfo.rank]}
                </span>
              )}
              {student.is_available && (
                <span className="inline-block w-2 h-2 rounded-full bg-primary shrink-0" title="Available" />
              )}
            </div>
            {showFavourite && onToggleFavourite && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleFavourite(student.user_id); }}
                className="p-1 hover:bg-secondary rounded-lg transition-colors shrink-0"
                title={isFavourite ? 'Remove favourite' : 'Add favourite'}
              >
                {isFavourite ? (
                  <Heart size={16} className="text-primary fill-primary" />
                ) : (
                  <Heart size={16} className="text-muted-foreground" />
                )}
              </button>
            )}
          </div>
          {student.hourly_rate > 0 && (
            <p className="text-sm font-medium text-primary mb-2">€{student.hourly_rate}/hr</p>
          )}
          {student.bio && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{student.bio}</p>
          )}
          {student.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
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
