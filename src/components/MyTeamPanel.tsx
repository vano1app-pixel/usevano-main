import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowRight, MessageSquare, Users2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { logSupabaseError } from '@/lib/supabaseError';

interface JobLite {
  id: string;
  completed_at?: string | null;
  created_at?: string;
  fixed_price?: number | null;
  payment_amount?: number | null;
  shift_date?: string | null;
}

interface ApplicationLite {
  id: string;
  job_id: string;
  student_id: string;
  status: string;
  applied_at: string;
}

interface StudentInfo {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  skills: string[] | null;
}

interface TeamMember {
  studentId: string;
  displayName: string;
  avatarUrl: string | null;
  primaryCategory: string;
  jobCount: number;
  spent: number;
  lastWorkedAt: string; // ISO
}

interface MyTeamPanelProps {
  currentUserId: string;
  /** Jobs the business has posted (reused from parent to avoid re-querying). */
  jobs: JobLite[];
  /** Applications across those jobs (reused from parent). */
  applications: ApplicationLite[];
}

/**
 * Shows every freelancer the business has accepted at least once — grouped by
 * freelancer with totals, last-worked date, and quick Message / Hire-again
 * actions. Zero new DB tables: purely derived from jobs + job_applications +
 * profiles + student_profiles.
 */
export const MyTeamPanel: React.FC<MyTeamPanelProps> = ({ currentUserId, jobs, applications }) => {
  const navigate = useNavigate();
  const [studentMap, setStudentMap] = useState<Map<string, StudentInfo>>(new Map());
  const [loading, setLoading] = useState(true);

  // Accepted applications are the ones that count as "hired."
  const accepted = useMemo(
    () => applications.filter((a) => a.status === 'accepted'),
    [applications],
  );

  // Build a quick lookup for jobs by id so we can resolve dates + spend per row.
  const jobById = useMemo(() => {
    const m = new Map<string, JobLite>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  const uniqueStudentIds = useMemo(
    () => Array.from(new Set(accepted.map((a) => a.student_id))),
    [accepted],
  );

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;

    const load = async () => {
      if (uniqueStudentIds.length === 0) {
        setStudentMap(new Map());
        setLoading(false);
        return;
      }
      setLoading(true);
      const [{ data: profs, error: pErr }, { data: sprofs, error: sErr }] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', uniqueStudentIds),
        supabase
          .from('student_profiles')
          .select('user_id, skills')
          .in('user_id', uniqueStudentIds),
      ]);
      if (pErr) logSupabaseError('MyTeamPanel: profiles', pErr);
      if (sErr) logSupabaseError('MyTeamPanel: student_profiles', sErr);
      if (cancelled) return;

      const skillsById = new Map((sprofs ?? []).map((s) => [s.user_id, s.skills ?? null]));
      const m = new Map<string, StudentInfo>();
      for (const p of profs ?? []) {
        m.set(p.user_id, {
          user_id: p.user_id,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          skills: skillsById.get(p.user_id) ?? null,
        });
      }
      setStudentMap(m);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, uniqueStudentIds]);

  const team = useMemo<TeamMember[]>(() => {
    const groups = new Map<string, ApplicationLite[]>();
    for (const app of accepted) {
      const arr = groups.get(app.student_id) ?? [];
      arr.push(app);
      groups.set(app.student_id, arr);
    }

    const out: TeamMember[] = [];
    for (const [studentId, apps] of groups) {
      let spent = 0;
      let lastISO: string | null = null;
      for (const app of apps) {
        const job = jobById.get(app.job_id);
        if (job) {
          const amt = job.payment_amount ?? job.fixed_price ?? 0;
          if (typeof amt === 'number') spent += amt;
          const iso = job.completed_at ?? job.shift_date ?? job.created_at ?? app.applied_at;
          if (iso && (!lastISO || iso > lastISO)) lastISO = iso;
        } else if (!lastISO || app.applied_at > lastISO) {
          lastISO = app.applied_at;
        }
      }
      const info = studentMap.get(studentId);
      out.push({
        studentId,
        displayName: info?.display_name ?? 'Freelancer',
        avatarUrl: info?.avatar_url ?? null,
        primaryCategory: info?.skills?.[0] ?? 'General',
        jobCount: apps.length,
        spent,
        lastWorkedAt: lastISO ?? new Date().toISOString(),
      });
    }

    return out.sort((a, b) => b.lastWorkedAt.localeCompare(a.lastWorkedAt));
  }, [accepted, jobById, studentMap]);

  const totals = useMemo(() => {
    return {
      teamSize: team.length,
      spent: team.reduce((s, m) => s + m.spent, 0),
      mostRecent: team[0]?.lastWorkedAt ?? null,
    };
  }, [team]);

  if (loading && team.length === 0 && accepted.length > 0) {
    return (
      <Card className="border-foreground/[0.06] shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
            <Users2 className="h-4 w-4 text-primary" strokeWidth={1.8} /> My Team
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-foreground/[0.06] shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
          <Users2 className="h-4 w-4 text-primary" strokeWidth={1.8} /> My Team
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Totals strip */}
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-foreground/[0.04] bg-muted/30 p-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Team size</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{totals.teamSize}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total spent</p>
            <p className="mt-1 text-lg font-bold tabular-nums">€{totals.spent.toFixed(0)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Most recent</p>
            <p className="mt-1 text-sm font-semibold">
              {totals.mostRecent ? format(parseISO(totals.mostRecent), 'd MMM yyyy') : '—'}
            </p>
          </div>
        </div>

        {team.length === 0 ? (
          <div className="rounded-xl border border-dashed border-foreground/10 px-6 py-10 text-center">
            <Users2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
            <p className="text-sm font-medium text-muted-foreground">No hires yet</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              When you accept a freelancer's application, they'll appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-foreground/[0.04] rounded-xl border border-foreground/[0.06] bg-background">
            {team.map((m) => (
              <div key={m.studentId} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => navigate(`/students/${m.studentId}`)}
                  className="group flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Avatar className="h-10 w-10 shrink-0 border border-border/60">
                    <AvatarImage src={m.avatarUrl ?? undefined} />
                    <AvatarFallback className="bg-primary/5 text-primary text-sm font-semibold">
                      {m.displayName[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-foreground/90 group-hover:text-primary transition-colors">
                      {m.displayName}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {m.primaryCategory} · {m.jobCount} job{m.jobCount !== 1 ? 's' : ''}
                      {m.spent > 0 ? ` · €${m.spent.toFixed(0)} spent` : ''}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70">
                      Last worked {format(parseISO(m.lastWorkedAt), 'd MMM yyyy')}
                    </p>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-[12px]"
                    onClick={() => navigate(`/messages?with=${encodeURIComponent(m.displayName)}`)}
                  >
                    <MessageSquare className="mr-1 h-3.5 w-3.5" strokeWidth={1.8} />
                    Message
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-[12px]"
                    onClick={() => navigate(`/hire?freelancer=${m.studentId}`)}
                  >
                    Hire again
                    <ArrowRight className="ml-1 h-3.5 w-3.5" strokeWidth={2} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
