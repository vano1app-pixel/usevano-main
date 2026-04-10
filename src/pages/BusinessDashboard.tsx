import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  MessageCircle,
  MessagesSquare,
  MoreHorizontal,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import { format, parseISO, differenceInHours } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/* ─── animation ─── */
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 20, filter: 'blur(4px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.5, ease: EASE_OUT },
  },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

/* ─── types ─── */
interface HiredFreelancer {
  applicationId: string;
  studentId: string;
  displayName: string;
  avatarUrl: string | null;
  skills: string[] | null;
  university: string | null;
  bio: string | null;
  hourlyRate: number | null;
  isAvailable: boolean;
  jobId: string;
  jobTitle: string;
  jobStatus: string;
  businessConfirmed: boolean;
  paymentConfirmed: boolean;
  appliedAt: string;
  avgRating: number | null;
  reviewCount: number;
}

interface RecentConvo {
  id: string;
  otherName: string;
  otherAvatar: string | null;
  lastMessage: string;
  updatedAt: string;
}

/* ─── helpers ─── */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function statusColor(status: string): string {
  switch (status) {
    case 'open': return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300';
    case 'filled': return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300';
    case 'completed': return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
    case 'closed': return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400';
    default: return '';
  }
}

function getProgress(f: HiredFreelancer): number {
  if (f.jobStatus === 'completed') return 100;
  if (f.paymentConfirmed) return 75;
  if (f.businessConfirmed) return 50;
  return 25;
}

/* ─── component ─── */
export default function BusinessDashboard() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [allApplications, setAllApplications] = useState<any[]>([]);
  const [hiredFreelancers, setHiredFreelancers] = useState<HiredFreelancer[]>([]);
  const [recentConvos, setRecentConvos] = useState<RecentConvo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [detailFreelancer, setDetailFreelancer] = useState<HiredFreelancer | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { navigate('/auth', { replace: true }); return; }
      const uid = session.user.id;

      const { data: prof } = await supabase
        .from('profiles')
        .select('display_name, user_type')
        .eq('user_id', uid)
        .maybeSingle();

      if (!cancelled && prof) {
        if (prof.user_type !== 'business') { navigate('/profile', { replace: true }); return; }
        setDisplayName(prof.display_name ?? '');
      }

      // Jobs
      const { data: jobsData } = await supabase
        .from('jobs')
        .select('*')
        .eq('posted_by', uid)
        .order('created_at', { ascending: false });

      const myJobs = jobsData ?? [];
      if (!cancelled) setJobs(myJobs);

      // Applications
      const jobIds = myJobs.map(j => j.id);
      let apps: any[] = [];
      if (jobIds.length > 0) {
        const { data } = await supabase
          .from('job_applications')
          .select('*')
          .in('job_id', jobIds);
        apps = data ?? [];
      }
      if (!cancelled) setAllApplications(apps);

      // Student data for accepted freelancers
      const accepted = apps.filter(a => a.status === 'accepted');
      const studentIds = [...new Set(accepted.map(a => a.student_id))];

      if (studentIds.length > 0) {
        const [spRes, snRes, rvRes] = await Promise.all([
          supabase.from('student_profiles')
            .select('user_id, avatar_url, skills, hourly_rate, is_available, university, bio')
            .in('user_id', studentIds),
          supabase.from('profiles')
            .select('user_id, display_name, avatar_url')
            .in('user_id', studentIds),
          supabase.from('reviews')
            .select('reviewee_id, rating')
            .in('reviewee_id', studentIds),
        ]);

        const spMap = new Map((spRes.data ?? []).map(s => [s.user_id, s]));
        const snMap = new Map((snRes.data ?? []).map(s => [s.user_id, s]));

        const ratingGroups: Record<string, number[]> = {};
        for (const r of rvRes.data ?? []) {
          if (!ratingGroups[r.reviewee_id]) ratingGroups[r.reviewee_id] = [];
          ratingGroups[r.reviewee_id].push(r.rating);
        }

        const jobMap = new Map(myJobs.map(j => [j.id, j]));

        const freelancers: HiredFreelancer[] = accepted.map(app => {
          const sp = spMap.get(app.student_id);
          const sn = snMap.get(app.student_id);
          const job = jobMap.get(app.job_id);
          const ratings = ratingGroups[app.student_id];
          const avgRating = ratings
            ? Math.round((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) * 10) / 10
            : null;

          return {
            applicationId: app.id,
            studentId: app.student_id,
            displayName: sn?.display_name ?? 'Freelancer',
            avatarUrl: sn?.avatar_url ?? sp?.avatar_url ?? null,
            skills: sp?.skills ?? null,
            university: sp?.university ?? null,
            bio: sp?.bio ?? null,
            hourlyRate: sp?.hourly_rate ?? null,
            isAvailable: sp?.is_available ?? false,
            jobId: app.job_id,
            jobTitle: job?.title ?? 'Job',
            jobStatus: job?.status ?? 'open',
            businessConfirmed: app.business_confirmed,
            paymentConfirmed: app.payment_confirmed,
            appliedAt: app.applied_at,
            avgRating,
            reviewCount: ratings?.length ?? 0,
          };
        });

        if (!cancelled) setHiredFreelancers(freelancers);
      }

      // Conversations
      const { data: convos } = await supabase
        .from('conversations')
        .select('id, participant_1, participant_2, updated_at')
        .or(`participant_1.eq.${uid},participant_2.eq.${uid}`)
        .order('updated_at', { ascending: false })
        .limit(3);

      if (!cancelled && convos && convos.length > 0) {
        const otherIds = convos.map(c =>
          c.participant_1 === uid ? c.participant_2 : c.participant_1
        );
        const convoIds = convos.map(c => c.id);

        const [{ data: otherProfiles }, { data: lastMsgs }] = await Promise.all([
          supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', otherIds),
          supabase.from('messages').select('conversation_id, content, created_at').in('conversation_id', convoIds).order('created_at', { ascending: false }),
        ]);

        const profileMap = new Map((otherProfiles ?? []).map(p => [p.user_id, p]));
        const lastMsgMap = new Map<string, string>();
        for (const msg of lastMsgs ?? []) {
          if (!lastMsgMap.has(msg.conversation_id)) {
            lastMsgMap.set(msg.conversation_id, msg.content ?? '');
          }
        }

        if (!cancelled) {
          setRecentConvos(
            convos.map(c => {
              const otherId = c.participant_1 === uid ? c.participant_2 : c.participant_1;
              const p = profileMap.get(otherId);
              return {
                id: c.id,
                otherName: p?.display_name ?? 'User',
                otherAvatar: p?.avatar_url ?? null,
                lastMessage: lastMsgMap.get(c.id) ?? '',
                updatedAt: c.updated_at,
              };
            })
          );
        }
      }

      if (!cancelled) setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [navigate]);

  /* ─── derived data ─── */
  const stats = useMemo(() => ({
    totalJobs: jobs.length,
    activeJobs: jobs.filter(j => j.status === 'open' || j.status === 'filled').length,
    completedJobs: jobs.filter(j => j.status === 'completed').length,
    uniqueFreelancers: new Set(hiredFreelancers.map(f => f.studentId)).size,
  }), [jobs, hiredFreelancers]);

  const spendingData = useMemo(() => {
    if (!jobs.length || !allApplications.length) return [];
    const jobMap = new Map(jobs.map(j => [j.id, j]));
    const monthTotals: Record<string, number> = {};
    const accepted = allApplications.filter(a => a.status === 'accepted');

    for (const app of accepted) {
      const job = jobMap.get(app.job_id);
      if (!job) continue;
      let amount = 0;
      if (job.payment_type === 'fixed' && job.fixed_price != null) {
        amount = Number(job.fixed_price);
      } else if (job.shift_start && job.shift_end) {
        const hours = Math.max(1, differenceInHours(
          new Date(`2000-01-01T${job.shift_end}`),
          new Date(`2000-01-01T${job.shift_start}`)
        ));
        amount = hours * job.hourly_rate;
      } else {
        amount = Number(job.hourly_rate) || 0;
      }
      const dateStr = app.paid_at || app.confirmed_at || app.applied_at;
      const monthKey = format(parseISO(dateStr), 'yyyy-MM');
      monthTotals[monthKey] = (monthTotals[monthKey] || 0) + amount;
    }

    return Object.entries(monthTotals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, total]) => ({
        month: format(parseISO(`${key}-01`), 'MMM'),
        total: Math.round(total),
      }));
  }, [jobs, allApplications]);

  const filteredFreelancers = useMemo(() => {
    if (!searchQuery.trim()) return hiredFreelancers;
    const q = searchQuery.toLowerCase();
    return hiredFreelancers.filter(f =>
      f.displayName.toLowerCase().includes(q) ||
      f.jobTitle.toLowerCase().includes(q) ||
      f.skills?.some(s => s.toLowerCase().includes(q))
    );
  }, [hiredFreelancers, searchQuery]);

  const jobsWithCounts = useMemo(() => {
    return jobs.map(j => {
      const jobApps = allApplications.filter(a => a.job_id === j.id);
      return {
        ...j,
        applicantCount: jobApps.length,
        hiredCount: jobApps.filter(a => a.status === 'accepted').length,
      };
    });
  }, [jobs, allApplications]);

  const STAT_CARDS = [
    { label: 'Total jobs', value: stats.totalJobs, icon: Briefcase, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Active', value: stats.activeJobs, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'Completed', value: stats.completedJobs, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Freelancers', value: stats.uniqueFreelancers, icon: Users, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  ];

  return (
    <>
      <Navbar />
      <main className="min-h-[100dvh] bg-background pb-28 md:pb-20">
        <div className="mx-auto max-w-5xl px-4 pt-24 sm:px-6 sm:pt-28 lg:px-8">

          {/* ── Header ── */}
          <motion.section variants={stagger} initial="hidden" animate="visible" className="mb-10">
            <motion.div variants={fadeUp} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="mb-2 inline-block rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
                  Dashboard
                </span>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {displayName ? <>Hey, {displayName}</> : <>Welcome back</>}
                </h1>
                <p className="mt-1.5 text-[14px] text-muted-foreground">
                  Here's what's happening with your projects.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="rounded-xl text-[13px] transition-all active:scale-[0.97]" onClick={() => navigate('/hire')}>
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  Hire talent
                </Button>
                <Button className="rounded-xl text-[13px] transition-all active:scale-[0.97]" onClick={() => navigate('/post-job')}>
                  <Briefcase className="mr-1.5 h-4 w-4" />
                  Post a job
                </Button>
              </div>
            </motion.div>
          </motion.section>

          {/* ── Stats ── */}
          <motion.section variants={stagger} initial="hidden" animate="visible" className="mb-10">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STAT_CARDS.map(s => (
                <motion.div
                  key={s.label}
                  variants={fadeUp}
                  className="flex items-center gap-3.5 rounded-2xl border border-foreground/[0.06] bg-card p-4 transition-all duration-300 hover:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.06)]"
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.bg}`}>
                    <s.icon className={`h-[18px] w-[18px] ${s.color}`} strokeWidth={1.8} />
                  </span>
                  <div>
                    <p className="text-2xl font-bold tabular-nums tracking-tight">{loading ? '–' : s.value}</p>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* ── Spending Chart ── */}
          <motion.section variants={stagger} initial="hidden" animate="visible" className="mb-10">
            <motion.div variants={fadeUp} className="rounded-2xl border border-foreground/[0.06] bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">Spending</h2>
                {spendingData.length > 0 && (
                  <span className="text-[13px] text-muted-foreground">
                    Total: <span className="font-semibold text-foreground tabular-nums">
                      €{spendingData.reduce((sum, d) => sum + d.total, 0).toLocaleString()}
                    </span>
                  </span>
                )}
              </div>
              {loading ? (
                <div className="flex h-52 items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : spendingData.length === 0 ? (
                <div className="flex h-52 flex-col items-center justify-center text-center">
                  <Briefcase className="mb-2 h-8 w-8 text-muted-foreground/30" strokeWidth={1.4} />
                  <p className="text-[13px] text-muted-foreground">Complete your first job to see spending here.</p>
                </div>
              ) : (
                <div className="h-52 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={spendingData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `€${v}`} />
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '12px',
                          fontSize: '13px',
                        }}
                        formatter={(value: number) => [`€${value.toLocaleString()}`, 'Spent']}
                      />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </motion.div>
          </motion.section>

          {/* ── Your Freelancers ── */}
          <motion.section variants={stagger} initial="hidden" animate="visible" className="mb-10">
            <motion.div variants={fadeUp} className="mb-5">
              <h2 className="text-xl font-bold tracking-tight">Your Freelancers</h2>
            </motion.div>

            {hiredFreelancers.length > 0 && (
              <motion.div variants={fadeUp} className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                  <Input
                    placeholder="Search by name, job, or skill..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="rounded-xl pl-10 text-[13px]"
                  />
                </div>
              </motion.div>
            )}

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-4 rounded-2xl border border-foreground/[0.04] bg-muted/40 p-4">
                    <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-20 animate-pulse rounded bg-muted/70" />
                    </div>
                  </div>
                ))}
              </div>
            ) : hiredFreelancers.length === 0 ? (
              <motion.div variants={fadeUp} className="rounded-2xl border border-dashed border-foreground/10 px-6 py-16 text-center">
                <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" strokeWidth={1.4} />
                <p className="text-[15px] font-medium text-muted-foreground">No freelancers hired yet</p>
                <p className="mt-1.5 text-[13px] text-muted-foreground/70">Post a job or browse talent to get started.</p>
                <div className="mt-5 flex justify-center gap-3">
                  <Button variant="outline" className="rounded-xl text-[13px]" onClick={() => navigate('/students')}>Browse talent</Button>
                  <Button className="rounded-xl text-[13px]" onClick={() => navigate('/post-job')}>Post a job</Button>
                </div>
              </motion.div>
            ) : filteredFreelancers.length === 0 ? (
              <motion.div variants={fadeUp} className="rounded-2xl border border-dashed border-foreground/10 px-6 py-12 text-center">
                <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" strokeWidth={1.4} />
                <p className="text-[14px] text-muted-foreground">No freelancers match your search.</p>
              </motion.div>
            ) : (
              <div className="space-y-3">
                {filteredFreelancers.map(f => (
                  <motion.div
                    key={f.applicationId}
                    variants={fadeUp}
                    className="group rounded-2xl border border-foreground/[0.06] bg-card transition-all duration-300 hover:border-foreground/[0.12] hover:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.06)]"
                  >
                    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                      <div className="flex flex-1 items-center gap-4 min-w-0">
                        <div className="relative">
                          <Avatar className="h-11 w-11 border border-border/60">
                            <AvatarImage src={f.avatarUrl ?? undefined} />
                            <AvatarFallback className="bg-primary/5 text-primary font-semibold">
                              {f.displayName[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {f.isAvailable && (
                            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold text-foreground/90">{f.displayName}</p>
                          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                            {f.skills?.slice(0, 3).join(' · ') || 'No skills listed'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:min-w-[180px]">
                        <div className="min-w-0 flex-1 sm:text-right">
                          <p className="truncate text-[13px] font-medium">{f.jobTitle}</p>
                          <Badge variant="outline" className={`mt-1 text-[10px] ${statusColor(f.jobStatus)}`}>
                            <span className="capitalize">{f.jobStatus}</span>
                          </Badge>
                        </div>
                      </div>

                      <div className="sm:min-w-[100px]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-muted-foreground">Progress</span>
                          <span className="text-[10px] font-medium tabular-nums">{getProgress(f)}%</span>
                        </div>
                        <Progress value={getProgress(f)} className="h-1.5" />
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-lg">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[160px]">
                          <DropdownMenuItem onClick={() => setDetailFreelancer(f)}>
                            <Eye className="mr-2 h-3.5 w-3.5" /> View details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/students/${f.studentId}`)}>
                            <ExternalLink className="mr-2 h-3.5 w-3.5" /> View profile
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate('/messages')}>
                            <MessageCircle className="mr-2 h-3.5 w-3.5" /> Message
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.section>

          {/* ── Your Jobs ── */}
          <motion.section variants={stagger} initial="hidden" animate="visible" className="mb-10">
            <motion.div variants={fadeUp} className="mb-5">
              <h2 className="text-xl font-bold tracking-tight">Your Jobs</h2>
            </motion.div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2].map(i => (
                  <div key={i} className="flex items-center gap-4 rounded-2xl border border-foreground/[0.04] bg-muted/40 p-4">
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-24 animate-pulse rounded bg-muted/70" />
                    </div>
                  </div>
                ))}
              </div>
            ) : jobsWithCounts.length === 0 ? (
              <motion.div variants={fadeUp} className="rounded-2xl border border-dashed border-foreground/10 px-6 py-16 text-center">
                <Briefcase className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" strokeWidth={1.4} />
                <p className="text-[15px] font-medium text-muted-foreground">No jobs posted yet</p>
                <p className="mt-1.5 text-[13px] text-muted-foreground/70">Create your first job listing to attract talent.</p>
                <Button className="mt-5 rounded-xl text-[13px]" onClick={() => navigate('/post-job')}>Post your first job</Button>
              </motion.div>
            ) : (
              <div className="space-y-2">
                {jobsWithCounts.map(j => (
                  <motion.div key={j.id} variants={fadeUp}>
                    <Link
                      to={`/jobs/${j.id}`}
                      className="group flex items-center gap-4 rounded-2xl border border-foreground/[0.06] bg-card p-4 transition-all duration-300 hover:border-foreground/[0.12] hover:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.06)] active:scale-[0.99]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-foreground/90 transition-colors group-hover:text-primary">{j.title}</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">Posted {timeAgo(j.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-[12px] text-muted-foreground">{j.applicantCount} applicant{j.applicantCount !== 1 ? 's' : ''}</p>
                          <p className="text-[12px] font-medium text-primary">{j.hiredCount} hired</p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${statusColor(j.status)}`}>
                          <span className="capitalize">{j.status}</span>
                        </Badge>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.section>

          {/* ── Messages ── */}
          <motion.section variants={stagger} initial="hidden" animate="visible" className="mb-12">
            <motion.div variants={fadeUp} className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">Messages</h2>
              {recentConvos.length > 0 && (
                <Button variant="outline" className="rounded-xl text-[13px]" onClick={() => navigate('/messages')}>View all</Button>
              )}
            </motion.div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2].map(i => (
                  <div key={i} className="flex items-center gap-4 rounded-2xl border border-foreground/[0.04] bg-muted/40 p-4">
                    <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-28 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-40 animate-pulse rounded bg-muted/70" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentConvos.length === 0 ? (
              <motion.div variants={fadeUp} className="rounded-2xl border border-dashed border-foreground/10 px-6 py-12 text-center">
                <MessagesSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" strokeWidth={1.4} />
                <p className="text-[15px] font-medium text-muted-foreground">No conversations yet</p>
                <p className="mt-1.5 text-[13px] text-muted-foreground/70">Start a conversation with a freelancer.</p>
              </motion.div>
            ) : (
              <div className="space-y-2">
                {recentConvos.map(c => (
                  <motion.div key={c.id} variants={fadeUp}>
                    <Link
                      to={`/messages?with=${c.otherName}`}
                      className="group flex items-center gap-4 rounded-2xl border border-foreground/[0.06] bg-card p-4 transition-all duration-300 hover:border-foreground/[0.12] hover:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.06)] active:scale-[0.99]"
                    >
                      <Avatar className="h-10 w-10 border border-border/60">
                        <AvatarImage src={c.otherAvatar ?? undefined} />
                        <AvatarFallback className="bg-primary/5 text-primary text-sm font-semibold">
                          {c.otherName[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="truncate text-[14px] font-medium text-foreground/90 transition-colors group-hover:text-primary">{c.otherName}</p>
                          <span className="shrink-0 text-[11px] text-muted-foreground/60">{timeAgo(c.updatedAt)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                          {c.lastMessage || 'No messages yet'}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.section>

        </div>
      </main>

      {/* ── Freelancer Detail Dialog ── */}
      <Dialog open={!!detailFreelancer} onOpenChange={(open) => !open && setDetailFreelancer(null)}>
        <DialogContent className="sm:max-w-md">
          {detailFreelancer && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 border border-border/60">
                    <AvatarImage src={detailFreelancer.avatarUrl ?? undefined} />
                    <AvatarFallback className="bg-primary/5 text-primary font-semibold">
                      {detailFreelancer.displayName[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <span className="text-[16px]">{detailFreelancer.displayName}</span>
                    {detailFreelancer.university && (
                      <p className="text-[12px] font-normal text-muted-foreground">{detailFreelancer.university}</p>
                    )}
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="mt-4 space-y-4">
                {detailFreelancer.skills && detailFreelancer.skills.length > 0 && (
                  <div>
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detailFreelancer.skills.map(s => (
                        <Badge key={s} variant="secondary" className="text-[11px]">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {detailFreelancer.bio && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">About</p>
                    <p className="text-[13px] text-foreground/80 leading-relaxed">{detailFreelancer.bio}</p>
                  </div>
                )}

                <div className="rounded-xl border border-foreground/[0.06] bg-muted/30 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Job</span>
                    <span className="text-[13px] font-medium">{detailFreelancer.jobTitle}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Status</span>
                    <Badge variant="outline" className={`text-[10px] ${statusColor(detailFreelancer.jobStatus)}`}>
                      <span className="capitalize">{detailFreelancer.jobStatus}</span>
                    </Badge>
                  </div>
                  {detailFreelancer.hourlyRate != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-muted-foreground">Rate</span>
                      <span className="text-[13px] font-semibold text-primary">€{detailFreelancer.hourlyRate}/hr</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Hired</span>
                    <span className="text-[12px]">{timeAgo(detailFreelancer.appliedAt)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Available</span>
                    <span className={`text-[12px] font-medium ${detailFreelancer.isAvailable ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                      {detailFreelancer.isAvailable ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Progress</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Application accepted', done: true },
                      { label: 'Work confirmed', done: detailFreelancer.businessConfirmed },
                      { label: 'Payment confirmed', done: detailFreelancer.paymentConfirmed },
                      { label: 'Job completed', done: detailFreelancer.jobStatus === 'completed' },
                    ].map((m, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${m.done ? 'bg-emerald-500/10' : 'bg-muted'}`}>
                          {m.done
                            ? <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />}
                        </span>
                        <span className={`text-[12px] ${m.done ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{m.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-xl text-[13px]"
                    onClick={() => { setDetailFreelancer(null); navigate(`/students/${detailFreelancer.studentId}`); }}
                  >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Full profile
                  </Button>
                  <Button
                    className="flex-1 rounded-xl text-[13px]"
                    onClick={() => { setDetailFreelancer(null); navigate('/messages'); }}
                  >
                    <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Message
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
