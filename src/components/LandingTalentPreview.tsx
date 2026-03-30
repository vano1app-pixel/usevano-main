import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { StudentCard } from '@/components/StudentCard';
import { useTopStudents } from '@/hooks/useTopStudents';
import { ArrowRight, Users } from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

type StudentRow = {
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
};

/**
 * Home page snippet of available freelancers; card click → `/students/:id` (same as Talent tab).
 */
export function LandingTalentPreview() {
  const navigate = useNavigate();
  const { topStudents } = useTopStudents();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: studentData } = await supabase
        .from('student_profiles')
        .select('*')
        .eq('is_available', true)
        .order('updated_at', { ascending: false })
        .limit(6);

      if (cancelled) return;

      const rows = studentData || [];
      const ids = rows.map((r) => r.user_id);
      const nameMap: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: prof } = await supabase.from('profiles').select('user_id, display_name').in('user_id', ids);
        (prof || []).forEach((p) => {
          nameMap[p.user_id] = (p.display_name?.trim() || 'Student');
        });
      }

      const normalized: StudentRow[] = rows.map((s) => ({
        id: s.id,
        user_id: s.user_id,
        bio: s.bio ?? '',
        skills: Array.isArray(s.skills) ? s.skills : [],
        hourly_rate: typeof s.hourly_rate === 'number' ? s.hourly_rate : 0,
        is_available: s.is_available !== false,
        avatar_url: s.avatar_url ?? '',
        banner_url: s.banner_url,
        service_area: s.service_area,
        typical_budget_min: s.typical_budget_min,
        typical_budget_max: s.typical_budget_max,
      }));

      setDisplayNames(nameMap);
      setStudents(normalized);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && students.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-border/60 bg-muted/25 py-12 md:py-16 px-4 md:px-8">
      <div className="mx-auto max-w-5xl">
        <motion.div
          className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={stagger}
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.45 }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Talent</p>
            <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Freelancers on VANO right now
            </h2>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground sm:text-[15px] leading-relaxed">
              Open a profile for portfolio, rates, and how to get in touch — same list as{' '}
              <span className="font-medium text-foreground/90">Find talent</span>.
            </p>
          </motion.div>
          <motion.div variants={fadeUp} transition={{ duration: 0.45 }}>
            <button
              type="button"
              onClick={() => navigate('/students')}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/50"
            >
              <Users size={18} className="text-primary" />
              View all on Talent
              <ArrowRight size={16} className="opacity-70" />
            </button>
          </motion.div>
        </motion.div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-48 animate-pulse rounded-xl border border-border bg-muted/60"
              />
            ))}
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-20px' }}
            variants={stagger}
          >
            {students.map((student) => (
              <motion.div key={student.user_id} variants={fadeUp} transition={{ duration: 0.4 }}>
                <StudentCard
                  student={student}
                  displayName={displayNames[student.user_id] ?? 'Student'}
                  showFavourite={false}
                  topInfo={topStudents[student.user_id]}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </section>
  );
}
