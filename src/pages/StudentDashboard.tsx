import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Clock, CheckCircle2, MapPin, Loader2, Star, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/logo.png';

// Household tables not yet in generated types — remove once migration is applied and types are regenerated
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hdb = supabase as any;

interface Booking {
  id: string;
  category: string;
  scheduled_date: string;
  time_slot: string;
  is_express: boolean;
  status: string;
  customer_name: string;
  customer_address: string;
  price_estimate_cents: number | null;
  student_id: string | null;
  created_at: string;
}

interface Payout {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Shopping run',
  'dog-walk': 'Dog walk',
  garden: 'Garden help',
  moving: 'Moving help',
  cleaning: 'Cleaning',
  tutoring: 'Tutoring',
};

const SLOT_LABELS: Record<string, string> = {
  morning: 'Morning · 8am–12pm',
  afternoon: 'Afternoon · 12–5pm',
  evening: 'Evening · 5–8pm',
};

function formatDate(d: string): string {
  const lower = d.toLowerCase();
  if (lower === 'today') return 'Today';
  if (lower === 'tomorrow') return 'Tomorrow';
  if (lower === 'flexible' || lower === 'this weekend' || lower === 'next week') return d;
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString('en-IE', { weekday: 'short', month: 'short', day: 'numeric' });
}

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<'available' | 'mine' | 'earnings'>('available');
  const [availableJobs, setAvailableJobs] = useState<Booking[]>([]);
  const [myJobs, setMyJobs] = useState<Booking[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  // Availability toggle — only shown when the user has a linked household_helpers row
  const [helperId, setHelperId] = useState<string | null>(null);
  const [helperAvailable, setHelperAvailable] = useState<boolean | null>(null);
  const [helperCity, setHelperCity] = useState<string | null>(null);
  const [helperCategories, setHelperCategories] = useState<string[]>([]);
  const [togglingAvailable, setTogglingAvailable] = useState(false);
  const [helperName, setHelperName] = useState<string | null>(null);
  const [helperPhoto, setHelperPhoto] = useState<string | null>(null);

  const loadData = useCallback(async (uid: string, city?: string | null, categories?: string[]) => {
    let availableQuery = hdb
      .from('household_bookings')
      .select('*')
      .eq('status', 'pending')
      .is('student_id', null)
      .order('created_at', { ascending: false })
      .limit(30);
    if (city) availableQuery = availableQuery.eq('city', city);
    if (categories && categories.length > 0) availableQuery = availableQuery.in('category', categories);

    const [available, mine, earnedPayouts] = await Promise.all([
      availableQuery,
      hdb.from('household_bookings')
        .select('*')
        .eq('student_id', uid)
        .not('status', 'in', '(pending,cancelled)')
        .order('created_at', { ascending: false })
        .limit(20),
      hdb.from('household_payouts')
        .select('*')
        .eq('student_id', uid)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (available.data) setAvailableJobs(available.data as Booking[]);
    if (mine.data) setMyJobs(mine.data as Booking[]);
    if (earnedPayouts.data) setPayouts(earnedPayouts.data as Payout[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { navigate('/auth', { replace: true }); return; }
      if (cancelled) return;
      const uid = session.user.id;
      setUserId(uid);

      // Load helper profile first so we can filter jobs by city + categories
      const { data: helperRow } = await hdb
        .from('household_helpers')
        .select('id, name, photo_url, is_available, city, categories')
        .eq('user_id', uid)
        .maybeSingle();

      const city = (helperRow?.city as string | null) ?? null;
      const categories = (helperRow?.categories as string[] | null) ?? [];
      if (!cancelled && helperRow) {
        setHelperId(helperRow.id as string);
        setHelperAvailable(helperRow.is_available as boolean);
        setHelperCity(city);
        setHelperCategories(categories);
        setHelperName((helperRow.name as string | null) ?? null);
        setHelperPhoto((helperRow.photo_url as string | null) ?? null);
      }

      await loadData(uid, city, categories);
    };
    void run();
    return () => { cancelled = true; };
  }, [navigate, loadData]);

  const toggleAvailable = async () => {
    if (!helperId || helperAvailable === null || togglingAvailable) return;
    setTogglingAvailable(true);
    const next = !helperAvailable;
    const { error } = await hdb
      .from('household_helpers')
      .update({ is_available: next })
      .eq('id', helperId);
    if (!error) setHelperAvailable(next);
    setTogglingAvailable(false);
  };

  const acceptJob = async (jobId: string) => {
    if (!userId) return;
    setAccepting(jobId);
    // Use .select('id') so we can detect a race — if data is empty, someone else got there first
    const { data: claimed, error } = await hdb
      .from('household_bookings')
      .update({ student_id: userId, status: 'accepted' })
      .eq('id', jobId)
      .eq('status', 'pending')
      .is('student_id', null)
      .select('id');

    if (error || !claimed?.length) {
      toast({ title: 'Job just taken', description: 'Someone else got there first — try another job.', variant: 'destructive' });
      setAccepting(null);
      void loadData(userId, helperCity, helperCategories);
      return;
    }

    // Email the customer + admin fire-and-forget, then go to the job detail
    void supabase.functions.invoke('notify-household-accepted', { body: { booking_id: jobId } });
    navigate(`/student-job/${jobId}?claimed=1`);
  };

  const totalEarned = payouts
    .filter((p) => p.status === 'transferred')
    .reduce((sum, p) => sum + p.amount_cents, 0);

  const pendingEarned = payouts
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + p.amount_cents, 0);

  const TABS = [
    { id: 'available' as const, label: 'Available', count: availableJobs.length },
    { id: 'mine' as const,      label: 'My jobs',   count: myJobs.filter((j) => j.status !== 'completed').length },
    { id: 'earnings' as const,  label: 'Earnings',  count: null },
  ];

  return (
    <div className="min-h-dvh bg-background">
      <SEOHead title="Student dashboard — VANO" description="Pick up household jobs near you." noindex />

      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 h-16 flex items-center justify-between px-4 bg-background/95 backdrop-blur-xl border-b border-border/50">
        <div className="w-16" />
        <button
          onClick={() => navigate('/student-account')}
          className="flex flex-col items-center gap-0.5"
          aria-label="My account"
        >
          <img src={logo} alt="VANO" className="h-6 w-auto" />
          {(helperName || helperPhoto) && (
            <div className="flex items-center gap-1">
              {helperPhoto ? (
                <img src={helperPhoto} className="w-3.5 h-3.5 rounded-full object-cover flex-shrink-0" alt="" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full bg-sage/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[7px] font-bold text-sage leading-none">{helperName?.[0]?.toUpperCase()}</span>
                </div>
              )}
              <span className="text-[10px] text-muted-foreground font-medium leading-none">{helperName?.split(' ')[0]}</span>
            </div>
          )}
        </button>
        <div className="w-16" />
      </header>

      <main className="pt-16 max-w-sm mx-auto px-4">
        {/* Page title */}
        <div className="pt-6 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Pick up jobs near you</p>
            </div>
            {helperAvailable !== null && (
              <button
                onClick={() => void toggleAvailable()}
                disabled={togglingAvailable}
                className={cn(
                  'mt-1 flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold border transition-all duration-200 flex-shrink-0',
                  helperAvailable
                    ? 'bg-sage/10 text-sage border-sage/30'
                    : 'bg-secondary text-muted-foreground border-border',
                )}
              >
                {togglingAvailable ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <span className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    helperAvailable ? 'bg-sage animate-pulse' : 'bg-muted-foreground/40',
                  )} />
                )}
                {helperAvailable ? 'Available' : 'Off duty'}
              </button>
            )}
          </div>
          {helperAvailable === false && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
              <Zap size={11} className="text-amber-500 flex-shrink-0" />
              Go available so new jobs reach you faster
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-secondary rounded-2xl mb-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 h-9 rounded-xl text-xs font-semibold transition-[background-color,color] duration-150',
                tab === t.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              {t.count !== null && t.count > 0 && (
                <span className={cn(
                  'ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold',
                  tab === t.id ? 'bg-sage text-white' : 'bg-border text-muted-foreground',
                )}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] as const }}
            >
            {/* Available jobs tab */}
            {tab === 'available' && (
              <div className="pb-10">
                {availableJobs.length === 0 ? (
                  <EmptyState message="No open jobs right now. Check back soon." />
                ) : (
                  <div className="flex flex-col gap-3">
                    {availableJobs.map((job, i) => (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="rounded-2xl border border-border/60 bg-background p-4"
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-foreground">
                                {CATEGORY_LABELS[job.category] ?? job.category}
                              </span>
                              {job.is_express && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-express-orange/10 text-express-orange border border-express-orange/20">
                                  Express
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(job.scheduled_date)}{job.time_slot ? ` · ${SLOT_LABELS[job.time_slot]}` : ''}
                            </p>
                          </div>
                          {job.price_estimate_cents && (
                            <span className="text-lg font-bold text-foreground tabular-nums flex-shrink-0">
                              €{(job.price_estimate_cents / 100).toFixed(0)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
                          <MapPin size={11} className="flex-shrink-0" />
                          <span className="truncate">{job.customer_address}</span>
                        </div>
                        <button
                          onClick={() => void acceptJob(job.id)}
                          disabled={accepting === job.id}
                          className="w-full h-11 rounded-xl bg-sage text-white font-semibold text-sm transition-[background-color,opacity] duration-150 hover:bg-sage-dark disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                          {accepting === job.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : 'Accept job'}
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* My jobs tab */}
            {tab === 'mine' && (
              <div className="pb-10">
                {myJobs.length === 0 ? (
                  <EmptyState message="No active jobs. Accept one from the available tab." />
                ) : (
                  <div className="flex flex-col gap-3">
                    {myJobs.map((job, i) => (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <button
                          onClick={() => navigate(`/student-job/${job.id}`)}
                          className="w-full rounded-2xl border border-border/60 bg-background p-4 text-left transition-colors hover:bg-secondary/40 active:scale-[0.99]"
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {CATEGORY_LABELS[job.category] ?? job.category}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDate(job.scheduled_date)}{job.time_slot ? ` · ${SLOT_LABELS[job.time_slot]}` : ''}
                              </p>
                            </div>
                            <StatusPill status={job.status} />
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPin size={11} className="flex-shrink-0" />
                            <span className="truncate">{job.customer_address}</span>
                          </div>
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Earnings tab */}
            {tab === 'earnings' && (
              <div className="pb-10">
                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="rounded-2xl bg-sage-light border border-sage/20 p-4">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Paid out</p>
                    <p className="text-2xl font-bold text-foreground tabular-nums">
                      €{(totalEarned / 100).toFixed(0)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-secondary border border-border/40 p-4">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Pending</p>
                    <p className="text-2xl font-bold text-foreground tabular-nums">
                      €{(pendingEarned / 100).toFixed(0)}
                    </p>
                  </div>
                </div>

                {/* Payout list */}
                {payouts.length === 0 ? (
                  <EmptyState message="No earnings yet. Complete jobs to get paid." />
                ) : (
                  <div className="rounded-2xl border border-border/60 overflow-hidden">
                    {payouts.map((p, i) => (
                      <div
                        key={p.id}
                        className={cn('flex items-center justify-between px-4 py-3.5', i !== payouts.length - 1 && 'border-b border-border/40')}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center',
                            p.status === 'transferred' ? 'bg-sage/10' : 'bg-secondary',
                          )}>
                            {p.status === 'transferred'
                              ? <CheckCircle2 size={15} className="text-sage" />
                              : <Clock size={15} className="text-muted-foreground" />
                            }
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground capitalize">{p.status}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(p.created_at).toLocaleDateString('en-IE', { month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <span className="font-semibold text-sm tabular-nums text-foreground">
                          +€{(p.amount_cents / 100).toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Rating placeholder */}
                <div className="mt-5 rounded-2xl border border-border/60 p-4 flex items-center gap-4">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map((n) => (
                      <Star key={n} size={16} className="fill-gold text-gold" />
                    ))}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Rating visible after first job</p>
                    <p className="text-xs text-muted-foreground">Customers rate you after each completed job.</p>
                  </div>
                </div>
              </div>
            )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
};

const StatusPill = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; className: string }> = {
    accepted:    { label: 'Accepted',     className: 'bg-sage/10 text-sage border-sage/20' },
    on_way:      { label: 'On the way',   className: 'bg-sky-50 text-sky-600 border-sky-200' },
    arrived:     { label: 'Arrived',      className: 'bg-sky-50 text-sky-600 border-sky-200' },
    in_progress: { label: 'In progress',  className: 'bg-amber-50 text-amber-600 border-amber-200' },
    completed:   { label: 'Complete',     className: 'bg-sage/10 text-sage border-sage/20' },
    cancelled:   { label: 'Cancelled',    className: 'bg-destructive/10 text-destructive border-destructive/20' },
  };
  const s = map[status] ?? { label: status, className: 'bg-secondary text-muted-foreground border-border' };
  return (
    <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0', s.className)}>
      {s.label}
    </span>
  );
};

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mb-3">
      <CheckCircle2 size={22} className="text-muted-foreground/40" strokeWidth={1.5} />
    </div>
    <p className="text-sm text-muted-foreground max-w-[200px] leading-relaxed">{message}</p>
  </div>
);

export default StudentDashboard;
