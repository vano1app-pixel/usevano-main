import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Briefcase,
  Users,
  CheckCircle2,
  Star,

  Search,
  ArrowRight,
  MessagesSquare,
  Heart,
  ShieldCheck,
  RotateCcw,
  Check,
} from 'lucide-react';
import { SalesReferralsPanel } from '@/components/SalesReferralsPanel';
import { MyTeamPanel } from '@/components/MyTeamPanel';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/* ─── animation helpers ─── */
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

/* ─── chart colors ─── */
const PIE_COLORS = {
  pending: 'hsl(38, 92%, 50%)',
  accepted: 'hsl(142, 71%, 45%)',
  rejected: 'hsl(0, 84%, 60%)',
};

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  filled: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  closed: 'bg-muted text-muted-foreground border-border',
};

const APP_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  accepted: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-600 border-red-500/20',
};

/* ─── types ─── */
interface JobRow {
  id: string;
  title: string;
  status: string;
  hourly_rate: number;
  fixed_price: number | null;
  payment_type: string | null;
  payment_amount?: number | null;
  completed_at?: string | null;
  shift_date?: string | null;
  created_at: string;
}

interface ApplicationRow {
  id: string;
  job_id: string;
  student_id: string;
  status: string;
  applied_at: string;
  job_title?: string;
  student_name?: string;
  student_avatar?: string | null;
}

interface FavFreelancer {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  skills: string[] | null;
  hourly_rate: number | null;
}

interface RecentConvo {
  id: string;
  otherName: string;
  otherAvatar: string | null;
  lastMessage: string;
}

/* ─── component ─── */
export default function BusinessDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [favourites, setFavourites] = useState<FavFreelancer[]>([]);
  const [recentConvos, setRecentConvos] = useState<RecentConvo[]>([]);

  // Vano Pay history — last 5 non-transient payments (held, released,
  // refunded) the hirer has sent. Drives the "Recent Vano Pay" tile
  // so the dashboard shows the escrow pipeline at a glance and
  // investors can see the flow beyond a single transaction.
  type DashboardPaymentRow = {
    id: string;
    conversation_id: string;
    freelancer_id: string;
    amount_cents: number;
    fee_cents: number;
    status: 'paid' | 'transferred' | 'refunded';
    auto_release_at: string | null;
    released_at: string | null;
    refunded_at: string | null;
    created_at: string;
    description: string | null;
    freelancer_name: string | null;
    freelancer_avatar: string | null;
  };
  const [recentPayments, setRecentPayments] = useState<DashboardPaymentRow[]>([]);

  /* ── data fetch ── */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate('/auth', { replace: true });
        return;
      }
      const uid = session.user.id;
      if (!cancelled) setUid(uid);

      // Profile
      const { data: prof } = await supabase
        .from('profiles')
        .select('display_name, user_type')
        .eq('user_id', uid)
        .maybeSingle();

      if (!cancelled && prof) {
        if (prof.user_type !== 'business') {
          navigate('/profile', { replace: true });
          return;
        }
        setDisplayName(prof.display_name ?? '');
      }

      // Jobs
      const { data: jobRows } = await supabase
        .from('jobs')
        .select('id, title, status, hourly_rate, fixed_price, payment_type, payment_amount, completed_at, shift_date, created_at')
        .eq('posted_by', uid)
        .order('created_at', { ascending: false });

      if (!cancelled && jobRows) setJobs(jobRows);

      const jobIds = (jobRows ?? []).map((j) => j.id);

      // Applications (with student info)
      if (jobIds.length > 0) {
        const { data: appRows } = await supabase
          .from('job_applications')
          .select('id, job_id, student_id, status, applied_at')
          .in('job_id', jobIds)
          .order('applied_at', { ascending: false });

        if (!cancelled && appRows && appRows.length > 0) {
          // Get student names + avatars
          const studentIds = [...new Set(appRows.map((a) => a.student_id))];
          const { data: studentProfiles } = await supabase
            .from('profiles')
            .select('user_id, display_name, avatar_url')
            .in('user_id', studentIds);

          const nameMap = new Map(
            (studentProfiles ?? []).map((p) => [p.user_id, p]),
          );
          const jobMap = new Map((jobRows ?? []).map((j) => [j.id, j.title]));

          setApplications(
            appRows.map((a) => ({
              ...a,
              job_title: jobMap.get(a.job_id) ?? 'Job',
              student_name: nameMap.get(a.student_id)?.display_name ?? 'Freelancer',
              student_avatar: nameMap.get(a.student_id)?.avatar_url ?? null,
            })),
          );
        }
      }

      // Reviews (where business is reviewee)
      const { data: reviews } = await supabase
        .from('reviews')
        .select('rating')
        .eq('reviewee_id', uid);

      if (!cancelled && reviews && reviews.length > 0) {
        const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
        setAvgRating(Math.round(avg * 10) / 10);
        setReviewCount(reviews.length);
      }

      // Favourite freelancers
      const { data: favs } = await supabase
        .from('favourite_students')
        .select('student_user_id')
        .eq('business_user_id', uid);

      if (!cancelled && favs && favs.length > 0) {
        const favIds = favs.map((f) => f.student_user_id);
        const [{ data: favProfiles }, { data: favStudentProfiles }] = await Promise.all([
          supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', favIds),
          supabase.from('student_profiles').select('user_id, skills, hourly_rate').in('user_id', favIds),
        ]);

        const studentMap = new Map(
          (favStudentProfiles ?? []).map((s) => [s.user_id, s]),
        );

        setFavourites(
          (favProfiles ?? []).map((p) => ({
            user_id: p.user_id,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            skills: studentMap.get(p.user_id)?.skills ?? null,
            hourly_rate: studentMap.get(p.user_id)?.hourly_rate ?? null,
          })),
        );
      }

      // Recent conversations
      const { data: convos } = await supabase
        .from('conversations')
        .select('id, participant_1, participant_2, updated_at')
        .or(`participant_1.eq.${uid},participant_2.eq.${uid}`)
        .order('updated_at', { ascending: false })
        .limit(3);

      if (!cancelled && convos && convos.length > 0) {
        const otherIds = convos.map((c) =>
          c.participant_1 === uid ? c.participant_2 : c.participant_1,
        );
        const convoIds = convos.map((c) => c.id);

        const [{ data: otherProfiles }, { data: lastMsgs }] = await Promise.all([
          supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', otherIds),
          supabase.from('messages').select('conversation_id, content, created_at').in('conversation_id', convoIds).order('created_at', { ascending: false }),
        ]);

        const profileMap = new Map(
          (otherProfiles ?? []).map((p) => [p.user_id, p]),
        );
        const lastMsgMap = new Map<string, string>();
        for (const msg of lastMsgs ?? []) {
          if (!lastMsgMap.has(msg.conversation_id)) {
            lastMsgMap.set(msg.conversation_id, msg.content ?? '');
          }
        }

        if (!cancelled) {
          setRecentConvos(
            convos.map((c) => {
              const otherId = c.participant_1 === uid ? c.participant_2 : c.participant_1;
              const p = profileMap.get(otherId);
              return {
                id: c.id,
                otherName: p?.display_name ?? 'User',
                otherAvatar: p?.avatar_url ?? null,
                lastMessage: lastMsgMap.get(c.id) ?? '',
              };
            }),
          );
        }
      }

      // Vano Pay recent activity — last 5 held + released + refunded
      // payments for this hirer so the dashboard reflects the escrow
      // pipeline. Joined with profiles for the freelancer's name +
      // avatar; RLS on vano_payments already restricts to the caller.
      const { data: paymentsRaw } = await supabase
        .from('vano_payments')
        .select('id, conversation_id, freelancer_id, amount_cents, fee_cents, status, auto_release_at, released_at, refunded_at, created_at, description')
        .eq('business_id', uid)
        .in('status', ['paid', 'transferred', 'refunded'])
        .order('created_at', { ascending: false })
        .limit(5);

      const payments = (paymentsRaw ?? []) as Array<Omit<DashboardPaymentRow, 'freelancer_name' | 'freelancer_avatar'>>;

      if (payments.length > 0 && !cancelled) {
        const freelancerIds = Array.from(new Set(payments.map((p) => p.freelancer_id)));
        const { data: paymentProfiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', freelancerIds);
        const pMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
        for (const prof of paymentProfiles ?? []) {
          pMap.set(prof.user_id, { display_name: prof.display_name, avatar_url: prof.avatar_url });
        }
        if (!cancelled) {
          setRecentPayments(
            payments.map((p) => {
              const freelancerProfile = pMap.get(p.freelancer_id);
              return {
                ...p,
                freelancer_name: freelancerProfile?.display_name ?? 'Freelancer',
                freelancer_avatar: freelancerProfile?.avatar_url ?? null,
              };
            }),
          );
        }
      }

      if (!cancelled) setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  /* ── derived data ── */
  const activeJobCount = useMemo(
    () => jobs.filter((j) => j.status === 'open' || j.status === 'filled').length,
    [jobs],
  );
  const completedJobCount = useMemo(
    () => jobs.filter((j) => j.status === 'completed').length,
    [jobs],
  );

  const jobChartData = useMemo(() => {
    const monthMap: Record<string, number> = {};
    jobs.forEach((j) => {
      const month = format(parseISO(j.created_at), 'MMM yyyy');
      monthMap[month] = (monthMap[month] ?? 0) + 1;
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .slice(-6)
      .map(([month, count]) => ({ month: month.split(' ')[0], count }));
  }, [jobs]);

  const appStatusData = useMemo(() => {
    const counts = { pending: 0, accepted: 0, rejected: 0 };
    applications.forEach((a) => {
      if (a.status in counts) counts[a.status as keyof typeof counts]++;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [applications]);

  const activeJobs = useMemo(
    () => jobs.filter((j) => j.status === 'open' || j.status === 'filled'),
    [jobs],
  );

  const pendingAppCount = useMemo(
    () => applications.filter((a) => a.status === 'pending').length,
    [applications],
  );

  const recentApps = useMemo(() => applications.slice(0, 5), [applications]);

  const formatPayment = (job: JobRow) => {
    if (job.payment_type === 'fixed' && job.fixed_price != null) return `€${job.fixed_price}`;
    return `€${job.hourly_rate}/hr`;
  };

  /* ── loading skeleton ── */
  if (loading) {
    return (
      <>
        <Navbar />
        <main className="min-h-[100dvh] bg-background pb-28 md:pb-20">
          <div className="mx-auto max-w-6xl px-4 pt-24 sm:px-6 sm:pt-28 lg:px-8">
            <div className="mb-12 space-y-3">
              <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
              <div className="h-4 w-72 animate-pulse rounded bg-muted/70" />
            </div>
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-10">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-foreground/[0.04] bg-muted/40 p-6">
                  <div className="h-4 w-20 animate-pulse rounded bg-muted mb-3" />
                  <div className="h-10 w-16 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 mb-10">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-foreground/[0.04] bg-muted/40 p-6 h-72">
                  <div className="h-4 w-32 animate-pulse rounded bg-muted mb-4" />
                  <div className="h-48 animate-pulse rounded bg-muted/50" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="min-h-[100dvh] bg-background pb-28 md:pb-20">
        <div className="mx-auto max-w-6xl px-4 pt-24 sm:px-6 sm:pt-28 lg:px-8">

          {/* ── Header ── */}
          <motion.section
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="mb-12"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <motion.span
                  variants={fadeUp}
                  className="mb-2 inline-block rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-primary"
                >
                  Dashboard
                </motion.span>
                <motion.h1
                  variants={fadeUp}
                  className="text-3xl font-bold tracking-tight sm:text-4xl bg-clip-text text-transparent animate-shimmer-slow"
                  style={{
                    backgroundImage: 'linear-gradient(90deg, hsl(var(--foreground)) 0%, hsl(221 83% 53%) 25%, hsl(210 80% 60%) 40%, hsl(var(--foreground)) 55%, hsl(221 83% 53%) 75%, hsl(var(--foreground)) 100%)',
                    backgroundSize: '300% auto',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {displayName ? <>Hey, {displayName}</> : <>Welcome back</>}
                </motion.h1>
                <motion.p variants={fadeUp} className="mt-1 text-sm text-muted-foreground">
                  {format(new Date(), 'EEEE, d MMMM yyyy')}
                </motion.p>
              </div>
              <motion.div variants={fadeUp} className="flex gap-2">
                <Button
                  variant="outline"
                  className="rounded-xl transition-all duration-200 active:scale-[0.97]"
                  onClick={() => navigate('/students')}
                >
                  <Search className="mr-2 h-4 w-4" />
                  Browse Talent
                </Button>
              </motion.div>
            </div>
          </motion.section>

          {/* ── Stat Cards ── */}
          <motion.section
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="mb-10"
          >
            <motion.p variants={fadeUp} className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
              Overview
            </motion.p>
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: 'Active Jobs',
                  value: activeJobCount,
                  icon: Briefcase,
                  desc: 'Open & filled',
                  href: '/hire',
                },
                {
                  label: 'Pending',
                  value: pendingAppCount,
                  icon: Users,
                  desc: `${applications.length} total application${applications.length !== 1 ? 's' : ''}`,
                  href: '/hire',
                },
                {
                  label: 'Completed',
                  value: completedJobCount,
                  icon: CheckCircle2,
                  desc: 'Jobs finished',
                  href: '/hire',
                },
                {
                  label: 'Avg Rating',
                  value: avgRating != null ? avgRating.toFixed(1) : '—',
                  icon: Star,
                  desc: reviewCount > 0 ? `${reviewCount} review${reviewCount !== 1 ? 's' : ''}` : 'No reviews yet',
                  href: null as string | null,
                },
              ].map((stat) => {
                const Icon = stat.icon;
                const cardContent = (
                  <Card className={`border-foreground/[0.06] shadow-none hover:border-foreground/[0.12] hover:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.06)] transition-all duration-300 h-full ${stat.href ? 'group/card cursor-pointer' : ''}`}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                          {stat.label}
                        </span>
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                          <Icon className="h-4 w-4 text-primary" strokeWidth={1.8} />
                        </span>
                      </div>
                      <p className="text-4xl font-bold tracking-tight tabular-nums">{stat.value}</p>
                      <p className="mt-1 text-[12px] text-muted-foreground">{stat.desc}</p>
                    </CardContent>
                  </Card>
                );
                return (
                  <motion.div key={stat.label} variants={fadeUp}>
                    {stat.href ? (
                      <Link to={stat.href} className="block h-full">
                        {cardContent}
                      </Link>
                    ) : (
                      cardContent
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.section>

          {/* ── Charts ── */}
          <motion.section
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="mb-10"
          >
            <motion.p variants={fadeUp} className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
              Analytics
            </motion.p>
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              {/* Jobs Over Time */}
              <motion.div variants={fadeUp}>
                <Card className="border-foreground/[0.06] shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[15px] font-semibold">Jobs Posted</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {jobChartData.length === 0 ? (
                      <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
                        Hire your first freelancer to see activity here
                      </div>
                    ) : (
                      <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={jobChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{
                                background: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '12px',
                                fontSize: '13px',
                              }}
                              formatter={(value: number) => [value, 'Jobs']}
                            />
                            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Application Status */}
              <motion.div variants={fadeUp}>
                <Card className="border-foreground/[0.06] shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[15px] font-semibold">Application Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {appStatusData.length === 0 ? (
                      <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
                        No applications yet
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row h-auto sm:h-52 items-center justify-center gap-4 sm:gap-8">
                        <div className="h-36 w-36 sm:h-44 sm:w-44">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={appStatusData}
                                cx="50%"
                                cy="50%"
                                innerRadius={45}
                                outerRadius={70}
                                paddingAngle={3}
                                dataKey="value"
                                strokeWidth={0}
                              >
                                {appStatusData.map((entry) => (
                                  <Cell
                                    key={entry.name}
                                    fill={PIE_COLORS[entry.name as keyof typeof PIE_COLORS]}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                contentStyle={{
                                  background: 'hsl(var(--card))',
                                  border: '1px solid hsl(var(--border))',
                                  borderRadius: '12px',
                                  fontSize: '13px',
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="space-y-3">
                          {appStatusData.map((entry) => (
                            <div key={entry.name} className="flex items-center gap-2.5">
                              <span
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: PIE_COLORS[entry.name as keyof typeof PIE_COLORS] }}
                              />
                              <span className="text-[13px] capitalize text-muted-foreground">
                                {entry.name}
                              </span>
                              <span className="text-[13px] font-semibold tabular-nums">{entry.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </motion.section>

          {/* ── Active Jobs Table ── */}
          <motion.section
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="mb-10"
          >
            <motion.p variants={fadeUp} className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
              Your Jobs
            </motion.p>
            <motion.div variants={fadeUp}>
              <Card className="border-foreground/[0.06] shadow-none">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-[15px] font-semibold">Active Jobs</CardTitle>
                  {jobs.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[12px] text-muted-foreground"
                      onClick={() => navigate('/hire')}
                    >
                      View all
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {activeJobs.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-foreground/10 px-6 py-10 text-center">
                      <Briefcase className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
                      <p className="text-sm font-medium text-muted-foreground">No active jobs</p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        Visit the{' '}
                        <Link to="/hire" className="underline text-muted-foreground hover:text-foreground transition-colors">
                          Hire page
                        </Link>
                        {' '}to find a freelancer and get started.
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="hidden sm:table-cell">Applications</TableHead>
                          <TableHead className="hidden md:table-cell">Payment</TableHead>
                          <TableHead className="hidden md:table-cell">Posted</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeJobs.slice(0, 8).map((job) => {
                          const appCount = applications.filter((a) => a.job_id === job.id).length;
                          const pendingCount = applications.filter((a) => a.job_id === job.id && a.status === 'pending').length;
                          return (
                            <TableRow key={job.id} className="hover:bg-muted/50">
                              <TableCell className="font-medium max-w-[200px] truncate">
                                {job.title}
                              </TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[job.status] ?? ''}`}>
                                  {job.status}
                                </span>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell tabular-nums">
                                <span className="inline-flex items-center gap-2">
                                  {appCount}
                                  {pendingCount > 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                      {pendingCount} new
                                    </span>
                                  )}
                                </span>
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-muted-foreground text-[13px]">
                                {formatPayment(job)}
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-muted-foreground text-[13px]">
                                {format(parseISO(job.created_at), 'd MMM')}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-[12px]"
                                  onClick={() => navigate(`/jobs/${job.id}`)}
                                >
                                  View
                                  <ArrowRight className="ml-1 h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </motion.section>

          {/* ── Recent Applications ── */}
          {recentApps.length > 0 && (
            <motion.section
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="mb-10"
            >
              <motion.p variants={fadeUp} className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                Recent Activity
              </motion.p>
              <motion.div variants={fadeUp}>
                <Card className="border-foreground/[0.06] shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[15px] font-semibold">Recent Applications</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {recentApps.map((app) => (
                        <Link
                          key={app.id}
                          to={`/students/${app.student_id}`}
                          className="group flex items-center gap-4 rounded-xl border border-foreground/[0.04] bg-background p-3.5 transition-all duration-300 hover:border-foreground/[0.1] hover:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] active:scale-[0.99]"
                        >
                          <Avatar className="h-10 w-10 border border-border/60">
                            <AvatarImage src={app.student_avatar ?? undefined} />
                            <AvatarFallback className="bg-primary/5 text-primary text-sm font-semibold">
                              {(app.student_name ?? '?')[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-medium text-foreground/90 group-hover:text-primary transition-colors duration-200">
                              {app.student_name}
                            </p>
                            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                              Applied for <span className="font-medium text-foreground/70">{app.job_title}</span>
                              {' · '}
                              {format(parseISO(app.applied_at), 'd MMM')}
                            </p>
                          </div>
                          <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${APP_STATUS_STYLES[app.status] ?? ''}`}>
                            {app.status}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.section>
          )}

          {/* ── Recent Vano Pay activity ── */}
          {recentPayments.length > 0 && (
            <motion.section
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="mb-10"
            >
              <motion.p variants={fadeUp} className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                Vano Pay
              </motion.p>
              <motion.div variants={fadeUp}>
                <Card className="border-foreground/[0.06] shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[15px] font-semibold">Recent payments</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {recentPayments.map((p) => {
                        const amountEuro = `€${(p.amount_cents / 100).toFixed(2)}`;
                        const statusMeta = p.status === 'paid'
                          ? {
                              label: 'Held',
                              icon: <ShieldCheck size={12} />,
                              tone: 'bg-primary/10 text-primary border-primary/20',
                              hint: p.auto_release_at
                                ? `auto-releases ${format(parseISO(p.auto_release_at), 'd MMM')}`
                                : 'awaiting release',
                            }
                          : p.status === 'transferred'
                          ? {
                              label: 'Paid',
                              icon: <Check size={12} strokeWidth={3} />,
                              tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
                              hint: p.released_at
                                ? `released ${format(parseISO(p.released_at), 'd MMM')}`
                                : 'released',
                            }
                          : {
                              label: 'Refunded',
                              icon: <RotateCcw size={12} />,
                              tone: 'bg-muted text-muted-foreground border-border',
                              hint: p.refunded_at
                                ? `refunded ${format(parseISO(p.refunded_at), 'd MMM')}`
                                : 'refunded',
                            };
                        return (
                          <Link
                            key={p.id}
                            to={`/messages?open=${p.conversation_id}`}
                            className="group flex items-center gap-4 rounded-xl border border-foreground/[0.04] bg-background p-3.5 transition-all duration-300 hover:border-foreground/[0.1] hover:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] active:scale-[0.99]"
                          >
                            <Avatar className="h-10 w-10 border border-border/60">
                              <AvatarImage src={p.freelancer_avatar ?? undefined} />
                              <AvatarFallback className="bg-primary/5 text-primary text-sm font-semibold">
                                {(p.freelancer_name ?? '?')[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14px] font-medium text-foreground/90 group-hover:text-primary transition-colors duration-200" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {amountEuro} · {p.freelancer_name}
                              </p>
                              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                                {p.description ? `${p.description} · ` : ''}{statusMeta.hint}
                              </p>
                            </div>
                            <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusMeta.tone}`}>
                              {statusMeta.icon}
                              {statusMeta.label}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.section>
          )}

          {/* ── Sales Referrals ── */}
          {uid && (
            <motion.section
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="mb-10"
            >
              <motion.p variants={fadeUp} className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                Sales Referrals
              </motion.p>
              <motion.div variants={fadeUp}>
                <SalesReferralsPanel mode="business" currentUserId={uid} />
              </motion.div>
            </motion.section>
          )}

          {/* ── My Team ── */}
          {uid && (
            <motion.section
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="mb-10"
            >
              <motion.p variants={fadeUp} className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                My Team
              </motion.p>
              <motion.div variants={fadeUp}>
                <MyTeamPanel currentUserId={uid} jobs={jobs} applications={applications} />
              </motion.div>
            </motion.section>
          )}

          {/* ── Your Network ── */}
          <motion.section
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="mb-10"
          >
            <motion.p variants={fadeUp} className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
              Your Network
            </motion.p>
            <div className={`grid gap-4 grid-cols-1 ${recentConvos.length > 0 ? 'lg:grid-cols-2' : ''}`}>
              {/* Saved Freelancers */}
              <motion.div variants={fadeUp}>
                <Card className="border-foreground/[0.06] shadow-none h-full">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                      <Heart className="h-4 w-4 text-primary" strokeWidth={1.8} />
                      Saved Freelancers
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[12px] text-muted-foreground"
                      onClick={() => navigate('/students')}
                    >
                      Browse all
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {favourites.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-foreground/10 px-6 py-10 text-center">
                        <Heart className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
                        <p className="text-sm font-medium text-muted-foreground">No saved freelancers</p>
                        <p className="mt-1 text-xs text-muted-foreground/70">
                          Browse talent and save your favourites for quick access.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {favourites.map((f) => (
                          <Link
                            key={f.user_id}
                            to={`/students/${f.user_id}`}
                            className="group flex items-center gap-4 rounded-xl border border-foreground/[0.04] bg-background p-3.5 transition-all duration-300 hover:border-foreground/[0.1] hover:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] active:scale-[0.98]"
                          >
                            <Avatar className="h-10 w-10 border border-border/60">
                              <AvatarImage src={f.avatar_url ?? undefined} />
                              <AvatarFallback className="bg-primary/5 text-primary text-sm font-semibold">
                                {(f.display_name ?? '?')[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14px] font-medium text-foreground/90 group-hover:text-primary transition-colors duration-200">
                                {f.display_name ?? 'Freelancer'}
                              </p>
                              {f.skills?.[0] && (
                                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                                  {f.skills[0]}
                                </span>
                              )}
                            </div>
                            {f.hourly_rate != null && (
                              <span className="shrink-0 rounded-lg bg-primary/5 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-primary">
                                €{f.hourly_rate}/hr
                              </span>
                            )}
                          </Link>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Recent Messages */}
              {recentConvos.length > 0 && (
                <motion.div variants={fadeUp}>
                  <Card className="border-foreground/[0.06] shadow-none h-full">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                        <MessagesSquare className="h-4 w-4 text-primary" strokeWidth={1.8} />
                        Recent Messages
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[12px] text-muted-foreground"
                        onClick={() => navigate('/messages')}
                      >
                        All messages
                        <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {recentConvos.map((c) => (
                          <Link
                            key={c.id}
                            to={`/messages?with=${c.otherName}`}
                            className="group flex items-center gap-4 rounded-xl border border-foreground/[0.04] bg-background p-3.5 transition-all duration-300 hover:border-foreground/[0.1] hover:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] active:scale-[0.99]"
                          >
                            <Avatar className="h-10 w-10 border border-border/60">
                              <AvatarImage src={c.otherAvatar ?? undefined} />
                              <AvatarFallback className="bg-primary/5 text-primary text-sm font-semibold">
                                {c.otherName[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14px] font-medium text-foreground/90 group-hover:text-primary transition-colors duration-200">
                                {c.otherName}
                              </p>
                              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                                {c.lastMessage || 'No messages yet'}
                              </p>
                            </div>
                            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/30 group-hover:translate-x-0.5 group-hover:text-foreground/50 transition-all duration-200" strokeWidth={1.8} />
                          </Link>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </div>
          </motion.section>
        </div>
      </main>
    </>
  );
}
