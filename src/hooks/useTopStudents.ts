import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FREELANCER_SKILL_CATEGORIES } from '@/lib/freelancerSkills';

const CATEGORIES = [...FREELANCER_SKILL_CATEGORIES];

export interface TopStudentInfo {
  rank: number; // 0, 1, or 2
  category: string;
}

// Returns a map of user_id → best TopStudentInfo (lowest rank across categories)
let cachedResult: Record<string, TopStudentInfo> | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useTopStudents() {
  const [topStudents, setTopStudents] = useState<Record<string, TopStudentInfo>>(cachedResult || {});
  const [loading, setLoading] = useState(!cachedResult);

  useEffect(() => {
    if (cachedResult && Date.now() - cacheTime < CACHE_TTL) {
      setTopStudents(cachedResult);
      setLoading(false);
      return;
    }
    loadTopStudents();
  }, []);

  const loadTopStudents = async () => {
    const { data: reviews } = await supabase.from('reviews').select('reviewee_id, rating');
    if (!reviews || reviews.length === 0) { setLoading(false); return; }

    const agg: Record<string, { total: number; count: number }> = {};
    reviews.forEach((r) => {
      if (!agg[r.reviewee_id]) agg[r.reviewee_id] = { total: 0, count: 0 };
      agg[r.reviewee_id].total += r.rating;
      agg[r.reviewee_id].count += 1;
    });

    const userIds = Object.keys(agg);
    const { data: studentProfiles } = await supabase
      .from('student_profiles')
      .select('user_id, skills')
      .in('user_id', userIds);

    const skillsMap: Record<string, string[]> = {};
    (studentProfiles || []).forEach((sp) => { skillsMap[sp.user_id] = sp.skills || []; });

    const entries = userIds.map((uid) => ({
      user_id: uid,
      avg_rating: agg[uid].total / agg[uid].count,
      review_count: agg[uid].count,
      skills: skillsMap[uid] || [],
    }));

    const result: Record<string, TopStudentInfo> = {};

    CATEGORIES.forEach((cat) => {
      const filtered = cat === 'All'
        ? entries
        : entries.filter((e) => e.skills.some((s) => s.toLowerCase() === cat.toLowerCase()));

      filtered
        .sort((a, b) => b.avg_rating - a.avg_rating || b.review_count - a.review_count)
        .slice(0, 3)
        .forEach((entry, i) => {
          // Keep best rank across categories
          if (!result[entry.user_id] || i < result[entry.user_id].rank) {
            result[entry.user_id] = { rank: i, category: cat };
          }
        });
    });

    cachedResult = result;
    cacheTime = Date.now();
    setTopStudents(result);
    setLoading(false);
  };

  return { topStudents, loading };
}
