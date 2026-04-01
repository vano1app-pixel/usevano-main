import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Phone, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatTypicalBudget } from '@/lib/freelancerProfile';

/** Deterministic banner gradient — same FNV-1a hash used in StudentCard / LandingTalentPreview. */
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

type FreelancerRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  skills: string[];
  hourly_rate: number | null;
  typical_budget_min: number | null;
  typical_budget_max: number | null;
  is_available: boolean;
};

export function BlurredTalentMarquee() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FreelancerRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: sprofs } = await supabase
        .from('student_profiles')
        .select('user_id, skills, is_available, hourly_rate, typical_budget_min, typical_budget_max')
        .eq('community_board_status', 'approved')
        .not('skills', 'eq', '{}')
        .limit(20);
      if (!sprofs?.length || cancelled) return;
      const uids = sprofs.map((s: any) => s.user_id);
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', uids);
      if (cancelled) return;
      const profMap: Record<string, any> = {};
      (profs || []).forEach((p: any) => { profMap[p.user_id] = p; });
      const combined: FreelancerRow[] = sprofs
        .map((sp: any) => ({
          user_id: sp.user_id,
          display_name: profMap[sp.user_id]?.display_name || '',
          avatar_url: profMap[sp.user_id]?.avatar_url || null,
          skills: sp.skills || [],
          hourly_rate: sp.hourly_rate || null,
          typical_budget_min: sp.typical_budget_min || null,
          typical_budget_max: sp.typical_budget_max || null,
          is_available: sp.is_available ?? false,
        }))
        .filter((s: FreelancerRow) => s.display_name && !s.display_name.toUpperCase().startsWith('VANO'));
      setRows(combined);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  if (rows.length === 0) return null;

  // Duplicate for seamless infinite loop
  const loop = [...rows, ...rows];

  return (
    <div className="mt-10 -mx-4 md:-mx-8">
      {/* Section label */}
      <p className="px-4 md:px-8 mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Freelancers ready to work
      </p>

      {/* Marquee */}
      <div className="relative overflow-hidden">
        {/* Gradient fade — left */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent" />
        {/* Gradient fade — right */}
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent" />

        <div className="flex gap-3 will-change-[transform] animate-scroll-left-fast">
          {loop.map((f, i) => {
            const budget = formatTypicalBudget(f.typical_budget_min, f.typical_budget_max);
            const rateLabel = f.hourly_rate ? `€${f.hourly_rate}/hr` : budget ?? null;
            const skill = f.skills[0] ?? null;

            return (
              <button
                key={`${f.user_id}-${i}`}
                type="button"
                onClick={() => navigate('/auth?mode=signup')}
                className="group relative flex w-40 shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
              >
                {/* Banner strip */}
                <div
                  className="h-10 w-full shrink-0"
                  style={{ background: cardGradient(f.user_id) }}
                />

                {/* Avatar — blurred */}
                <div className="flex justify-center -mt-5 z-10">
                  {f.avatar_url ? (
                    <img
                      src={f.avatar_url}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover ring-2 ring-card blur-sm brightness-75"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div
                      className="h-10 w-10 rounded-full ring-2 ring-card blur-sm brightness-75 flex items-center justify-center text-white font-bold text-sm"
                      style={{ background: cardGradient(f.user_id) }}
                    >
                      {f.display_name[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2">
                  {/* Blurred name */}
                  <p className="text-xs font-semibold text-foreground blur-sm select-none leading-snug">
                    {f.display_name}
                  </p>

                  {/* Availability dot + skill */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {f.is_available && (
                      <span className="flex h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/25" />
                    )}
                    {skill && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary leading-tight truncate max-w-[6rem]">
                        {skill}
                      </span>
                    )}
                  </div>

                  {/* Rate */}
                  {rateLabel && (
                    <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 leading-tight">
                      {rateLabel}
                    </p>
                  )}
                </div>
              </button>
            );
          })}

          {/* Lock card */}
          <button
            type="button"
            onClick={() => navigate('/auth?mode=signup')}
            className="flex w-40 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/60 px-4 py-6 text-center transition-all hover:border-primary/40 hover:bg-muted/30"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Lock size={16} className="text-primary" />
            </div>
            <p className="text-xs font-semibold text-foreground leading-snug">Sign in to<br />view profiles</p>
          </button>
        </div>
      </div>

      {/* Business contact strip */}
      <div className="px-4 md:px-8 mt-6 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 rounded-2xl border border-border/60 bg-card/60 mx-0 p-5">
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <p className="text-sm font-semibold text-foreground leading-snug">Need someone fast? Talk to us.</p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-snug">Tell us what you need and we'll find the right person.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="https://wa.me/353899817111"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 active:scale-[0.97]"
          >
            <MessageCircle size={14} />
            WhatsApp us
          </a>
          <a
            href="tel:+353899817111"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:border-foreground/25 hover:bg-muted/40 active:scale-[0.97]"
          >
            <Phone size={14} />
            089 981 7111
          </a>
        </div>
      </div>
    </div>
  );
}
