import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { formatTypicalBudget } from '@/lib/freelancerProfile';
import { ArrowRight, Users } from 'lucide-react';

/** Deterministic banner gradient — mirrors StudentCard logic, no shared import needed. */
function cardGradient(userId: string): string {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) { h ^= userId.charCodeAt(i); h = Math.imul(h, 16777619); }
  const u = h >>> 0;
  const palettes = [
    ['hsl(221 83% 53%)', 'hsl(262 50% 52%)'],
    ['hsl(200 70% 42%)', 'hsl(221 83% 53%)'],
    ['hsl(152 48% 35%)', 'hsl(200 55% 38%)'],
    ['hsl(262 42% 40%)', 'hsl(316 45% 38%)'],
    ['hsl(22 55% 38%)', 'hsl(221 83% 53%)'],
  ];
  const [a, b] = palettes[u % palettes.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

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
  created_at?: string | null;
};

/**
 * Home page snippet of available freelancers; card click → `/students/:id` (same as Talent tab).
 */
export function LandingTalentPreview() {
  const navigate = useNavigate();
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
        created_at: s.created_at ?? null,
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
          <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex w-56 shrink-0 flex-col gap-2 rounded-2xl border border-foreground/10 bg-card p-3 animate-pulse"
              >
                <div className="flex gap-2.5">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-muted" />
                  <div className="flex-1 space-y-1.5 pt-0.5">
                    <div className="h-3 w-24 rounded bg-muted" />
                    <div className="h-2.5 w-16 rounded bg-muted" />
                  </div>
                </div>
                <div className="h-2 w-full rounded bg-muted" />
                <div className="h-2 w-5/6 rounded bg-muted" />
                <div className="h-2 w-4/6 rounded bg-muted" />
                <div className="mt-1 flex gap-1">
                  <div className="h-5 w-14 rounded-md bg-muted" />
                  <div className="h-5 w-12 rounded-md bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <motion.div
            className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-20px' }}
            variants={stagger}
          >
            {students.map((s) => {
              const name = displayNames[s.user_id] ?? 'Student';
              const isNew =
                s.created_at &&
                Date.now() - new Date(s.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;
              const budgetLabel = formatTypicalBudget(s.typical_budget_min, s.typical_budget_max);
              const skillPills = s.skills.slice(0, 2);
              const hourly = s.hourly_rate;
              return (
                <motion.div key={s.user_id} variants={fadeUp} transition={{ duration: 0.4 }} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/students/${s.user_id}`)}
                    className="group flex w-56 flex-col overflow-hidden rounded-2xl border border-foreground/10 bg-card text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.98]"
                  >
                    {/* Banner strip */}
                    <div
                      className="h-12 w-full shrink-0"
                      style={s.banner_url
                        ? { backgroundImage: `url(${s.banner_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                        : { background: cardGradient(s.user_id) }
                      }
                    />
                    {/* Card body */}
                    <div className="flex flex-col gap-2 px-3 pb-3">
                      {/* Avatar row with overlap */}
                      <div className="flex items-end justify-between -mt-5 mb-0.5">
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-card bg-muted shadow-sm">
                          {s.avatar_url ? (
                            <img
                              src={s.avatar_url}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-sm font-bold text-foreground/30">
                              {name[0].toUpperCase()}
                            </div>
                          )}
                          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
                        </div>
                        {isNew && (
                          <span className="mb-0.5 shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-primary-foreground">
                            New
                          </span>
                        )}
                      </div>
                      {/* Name */}
                      <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{name}</p>
                      {/* Rate */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                        {hourly > 0 && (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">€{hourly}/hr</span>
                        )}
                        {budgetLabel && (
                          <span className="font-medium text-muted-foreground">{budgetLabel} projects</span>
                        )}
                      </div>
                      {/* Bio */}
                      {s.bio?.trim() && (
                        <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{s.bio.trim()}</p>
                      )}
                      {/* Skills */}
                      {skillPills.length > 0 && (
                        <div className="mt-auto flex flex-wrap gap-1 pt-0.5">
                          {skillPills.map((sk) => (
                            <span
                              key={sk}
                              className="max-w-full truncate rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary"
                            >
                              {sk}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                </motion.div>
              );
            })}
            <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="shrink-0">
              <button
                type="button"
                onClick={() => navigate('/students')}
                className="flex w-56 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-foreground/15 bg-muted/20 p-4 transition-all hover:border-foreground/30 hover:bg-muted/40 min-h-[9.5rem]"
              >
                <ArrowRight size={22} className="text-muted-foreground" />
                <p className="text-center text-[12px] font-semibold text-muted-foreground">See all on Talent</p>
              </button>
            </motion.div>
          </motion.div>
        )}
      </div>
    </section>
  );
}
