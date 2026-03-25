import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Trophy, Star, Medal } from 'lucide-react';

const CATEGORIES = ['All', 'Web Design', 'Marketing', 'Photography', 'Tutoring', 'Events', 'Graphic Design', 'Writing', 'Cleaning'];

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  avg_rating: number;
  review_count: number;
  skills: string[];
}

export const StudentLeaderboard: React.FC = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    // Get all reviews grouped by reviewee
    const { data: reviews } = await supabase.from('reviews').select('reviewee_id, rating');
    if (!reviews || reviews.length === 0) { setLoading(false); return; }

    // Aggregate by reviewee
    const agg: Record<string, { total: number; count: number }> = {};
    reviews.forEach((r) => {
      if (!agg[r.reviewee_id]) agg[r.reviewee_id] = { total: 0, count: 0 };
      agg[r.reviewee_id].total += r.rating;
      agg[r.reviewee_id].count += 1;
    });

    const userIds = Object.keys(agg);
    if (userIds.length === 0) { setLoading(false); return; }

    // Get profiles and student_profiles
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', userIds);
    const { data: studentProfiles } = await supabase.from('student_profiles').select('user_id, skills').in('user_id', userIds);

    const skillsMap: Record<string, string[]> = {};
    (studentProfiles || []).forEach((sp) => { skillsMap[sp.user_id] = sp.skills || []; });

    const result: LeaderboardEntry[] = (profiles || []).map((p) => ({
      user_id: p.user_id,
      display_name: p.display_name || 'Student',
      avatar_url: p.avatar_url,
      avg_rating: agg[p.user_id] ? agg[p.user_id].total / agg[p.user_id].count : 0,
      review_count: agg[p.user_id]?.count || 0,
      skills: skillsMap[p.user_id] || [],
    }));

    result.sort((a, b) => b.avg_rating - a.avg_rating || b.review_count - a.review_count);
    setEntries(result);
    setLoading(false);
  };

  const filtered = category === 'All'
    ? entries
    : entries.filter((e) => e.skills.some((s) => s.toLowerCase() === category.toLowerCase()));

  const top = filtered.slice(0, 10);
  const medalColor = (i: number) => {
    if (i === 0) return 'text-yellow-500';
    if (i === 1) return 'text-gray-400';
    if (i === 2) return 'text-amber-600';
    return 'text-muted-foreground';
  };

  return (
    <div className="bg-card border border-border rounded-xl sm:rounded-2xl p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={18} className="text-primary" />
        <h3 className="font-semibold">Top Students</h3>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              category === cat
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : top.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No rated students yet{category !== 'All' ? ` in ${category}` : ''}.</p>
      ) : (
        <div className="space-y-2">
          {top.map((entry, i) => (
            <button
              key={entry.user_id}
              onClick={() => navigate(`/students/${entry.user_id}`)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/50 transition-colors text-left"
            >
              <span className="w-6 text-center font-bold text-sm shrink-0">
                {i < 3 ? <Medal size={18} className={medalColor(i)} /> : <span className="text-muted-foreground">{i + 1}</span>}
              </span>
              <div className="w-9 h-9 rounded-full bg-secondary overflow-hidden shrink-0">
                {entry.avatar_url ? (
                  <img src={entry.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                    {entry.display_name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{entry.display_name}</p>
                <p className="text-xs text-muted-foreground">{entry.review_count} review{entry.review_count !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Star size={14} className="text-primary fill-primary" />
                <span className="text-sm font-bold">{entry.avg_rating.toFixed(1)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
