import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SEOHead } from '@/components/SEOHead';
import { Navbar } from '@/components/Navbar';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { format } from 'date-fns';
import {
  Shield, ShieldCheck, ShieldOff, Users, Briefcase, Calendar, Trash2, Search,
  ChevronLeft, ChevronRight, Eye, Ban, RefreshCw, MessageSquare, ClipboardList,
  AlertTriangle, ExternalLink,
} from 'lucide-react';
import { ModBadge } from '@/components/ModBadge';
import { StatusChip } from '@/components/ui/StatusChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { cardWarning } from '@/lib/cardStyles';
import {
  AdminListingReviewModal,
  type ListingRequestRow,
} from '@/components/AdminListingReviewModal';


// ── Types ──

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  user_type: string | null;
  created_at: string;
  bio: string | null;
}

interface StudentDataRow {
  user_id: string;
  phone: string | null;
  university: string | null;
}

interface JobRow {
  id: string;
  title: string;
  location: string;
  hourly_rate: number;
  shift_date: string;
  status: string;
  posted_by: string;
  created_at: string;
  poster_name?: string;
}

interface EventRow {
  id: string;
  title: string;
  creator: string;
  date: string;
  time: string;
  address: string;
  created_by: string;
}

interface FeedbackRow {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string;
}

type Tab = 'users' | 'gigs' | 'events' | 'feedback' | 'listings' | 'disputes';

// Row shape for a disputed Vano Pay payment (held, flagged by hirer).
// Joined via profiles on the fly for display names; service-role
// admin RLS on vano_payments lets moderators read cross-account.
interface DisputedPaymentRow {
  id: string;
  conversation_id: string | null;
  business_id: string;
  freelancer_id: string;
  amount_cents: number;
  fee_cents: number;
  dispute_reason: string;
  disputed_at: string | null;
  auto_release_at: string | null;
  stripe_payment_intent_id: string | null;
  stripe_session_id: string | null;
  business_name: string | null;
  freelancer_name: string | null;
}
const PAGE_SIZE = 20;

// ── Component ──

const Admin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('users');
  const [search, setSearch] = useState('');

  // Data
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [gigs, setGigs] = useState<JobRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackRow[]>([]);
  const [listingRequests, setListingRequests] = useState<ListingRequestRow[]>([]);
  const [reviewRequest, setReviewRequest] = useState<ListingRequestRow | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [disputes, setDisputes] = useState<DisputedPaymentRow[]>([]);
  // Per-row sentinel for the active resolve action so the button shows
  // a spinner + other dispute rows stay interactive. Resolving one row
  // shouldn't lock the whole tab.
  const [resolvingDispute, setResolvingDispute] = useState<{ id: string; action: 'release' | 'refund' } | null>(null);

  const adminPagePassword = import.meta.env.VITE_ADMIN_PAGE_PASSWORD as string | undefined;
  const needsAdminPassword = Boolean(adminPagePassword && adminPagePassword.length > 0);
  const [passwordGateOk, setPasswordGateOk] = useState(() => {
    if (!needsAdminPassword) return true;
    try {
      return sessionStorage.getItem('vano_admin_gate') === '1';
    } catch {
      return false;
    }
  });
  const [passwordInput, setPasswordInput] = useState('');

  // Admin user IDs
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());

  // Student data (phone + university)
  const [studentDataMap, setStudentDataMap] = useState<Record<string, StudentDataRow>>({});
  const [showNoPhone, setShowNoPhone] = useState(false);

  // Pagination
  const [page, setPage] = useState(0);

  // ── Auth guard ──
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }

      // Server-side admin check via database role (not hardcoded emails)
      const { data: roleCheck } = await supabase.rpc('has_role', { _user_id: session.user.id, _role: 'admin' });
      if (!roleCheck) {
        toast({ title: 'Access denied', description: 'This page is restricted.', variant: 'destructive' });
        navigate('/', { replace: true });
        return;
      }

      setAuthed(true);
      setLoading(false);
    })();
  }, [navigate, toast]);

  // ── Fetch admin user IDs ──
  const fetchAdminIds = useCallback(async () => {
    const { data } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');
    setAdminUserIds(new Set((data || []).map((r) => r.user_id)));
  }, []);

  // ── Data fetchers ──
  const fetchUsers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url, user_type, created_at, bio')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    const rows = data || [];
    setUsers(rows);

    const studentIds = rows.filter((u) => u.user_type === 'student').map((u) => u.user_id);
    if (studentIds.length > 0) {
      const { data: spData } = await supabase
        .from('student_profiles')
        .select('user_id, phone, university')
        .in('user_id', studentIds);
      const map: Record<string, StudentDataRow> = {};
      (spData || []).forEach((sp) => { map[sp.user_id] = sp; });
      setStudentDataMap(map);
    } else {
      setStudentDataMap({});
    }
  }, [page]);

  const fetchGigs = useCallback(async () => {
    const { data } = await supabase
      .from('jobs')
      .select('id, title, location, hourly_rate, shift_date, status, posted_by, created_at')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (data && data.length > 0) {
      // Fetch poster names
      const posterIds = [...new Set(data.map((g) => g.posted_by))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', posterIds);

      const nameMap = new Map((profiles || []).map((p) => [p.user_id, p.display_name]));
      setGigs(data.map((g) => ({ ...g, poster_name: nameMap.get(g.posted_by) || 'Unknown' })));
    } else {
      setGigs([]);
    }
  }, [page]);

  const fetchEvents = useCallback(async () => {
    const { data } = await supabase
      .from('events')
      .select('id, title, creator, date, time, address, created_by')
      .order('date', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    setEvents(data || []);
  }, [page]);

  const fetchListingRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('community_listing_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) {
      if (import.meta.env.DEV) console.error('[Admin] community_listing_requests fetch failed', error);
      setListingRequests([]);
      return;
    }
    const rows = data || [];
    if (rows.length > 0) {
      const ids = [...new Set(rows.map((r) => r.user_id))];
      const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', ids);
      const map = new Map((profs || []).map((p) => [p.user_id, p.display_name as string | null]));
      setListingRequests(
        rows.map((r) => ({
          ...r,
          requester_name: map.get(r.user_id) || undefined,
        })),
      );
    } else {
      setListingRequests([]);
    }
  }, [page]);

  // Held payments that the hirer has flagged as a problem. These
  // are paused by the auto-release cron (dispute_reason IS NOT NULL
  // is the skip condition) so they'd sit forever without an admin
  // intervening. The inbox gives ops a single place to see them,
  // read the reason, and resolve in one click — release to the
  // freelancer (work was delivered) or refund the hirer (it wasn't).
  // Both buttons call the shared release/refund edge functions with
  // the admin override branch, so there's no separate admin-only
  // Stripe code path to maintain.
  const fetchDisputes = useCallback(async () => {
    const { data, error } = await supabase
      .from('vano_payments')
      .select('id, conversation_id, business_id, freelancer_id, amount_cents, fee_cents, dispute_reason, disputed_at, auto_release_at, stripe_payment_intent_id, stripe_session_id')
      .not('dispute_reason', 'is', null)
      .eq('status', 'paid')
      .order('disputed_at', { ascending: false, nullsFirst: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) {
      if (import.meta.env.DEV) console.error('[Admin] disputes fetch failed', error);
      setDisputes([]);
      return;
    }
    const rows = (data ?? []) as Array<Omit<DisputedPaymentRow, 'business_name' | 'freelancer_name'>>;
    if (rows.length === 0) {
      setDisputes([]);
      return;
    }
    const ids = Array.from(new Set(rows.flatMap((r) => [r.business_id, r.freelancer_id])));
    const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', ids);
    const nameByUserId = new Map((profs || []).map((p) => [p.user_id, (p.display_name ?? null) as string | null]));
    setDisputes(
      rows.map((r) => ({
        ...r,
        dispute_reason: r.dispute_reason ?? '',
        business_name: nameByUserId.get(r.business_id) ?? null,
        freelancer_name: nameByUserId.get(r.freelancer_id) ?? null,
      })),
    );
  }, [page]);

  // Release held funds to the freelancer (work delivered) or refund
  // them to the hirer (work not delivered). Each button maps to the
  // existing release-/refund-vano-payment edge function, which carries
  // an admin-override branch — so this is a thin wrapper, not a
  // separate Stripe code path. On success we optimistically drop the
  // row from the list (it's no longer in 'paid' + disputed state).
  const resolveDispute = async (dispute: DisputedPaymentRow, action: 'release' | 'refund') => {
    const amountEuro = `€${(dispute.amount_cents / 100).toFixed(2)}`;
    const confirmMsg = action === 'release'
      ? `Release ${amountEuro} to ${dispute.freelancer_name ?? 'the freelancer'}? This sends the money (minus the Vano fee) via Stripe. Cannot be undone.`
      : `Refund ${amountEuro} to ${dispute.business_name ?? 'the hirer'}? This returns the full payment to their card via Stripe. Cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;
    setResolvingDispute({ id: dispute.id, action });
    const fnName = action === 'release' ? 'release-vano-payment' : 'refund-vano-payment';
    const { data, error } = await supabase.functions.invoke(fnName, {
      body: { payment_id: dispute.id },
    });
    setResolvingDispute(null);
    if (error || (data && (data as { error?: string }).error)) {
      const msg = (data as { error?: string })?.error || error?.message || 'Action failed';
      toast({ title: 'Could not resolve dispute', description: msg, variant: 'destructive' });
      return;
    }
    toast({
      title: action === 'release' ? 'Released to freelancer' : 'Refunded to hirer',
      description: `${amountEuro} · payment ${dispute.id.slice(0, 8)}…`,
    });
    // Drop the resolved row. Refetch would also work but the optimistic
    // remove keeps the UI responsive even if the server read lags.
    setDisputes((prev) => prev.filter((d) => d.id !== dispute.id));
  };

  const fetchFeedback = useCallback(async () => {
    const { data } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1) as any;

    if (data && data.length > 0) {
      const userIds = [...new Set((data as FeedbackRow[]).map((f) => f.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      const nameMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      setFeedbacks((data as FeedbackRow[]).map((f) => ({
        ...f,
        sender_name: (nameMap.get(f.user_id) as any)?.display_name || 'Unknown',
        sender_avatar: (nameMap.get(f.user_id) as any)?.avatar_url || '',
      })));
    } else {
      setFeedbacks([]);
    }
  }, [page]);

  useEffect(() => {
    if (!authed) return;
    setPage(0);
  }, [tab, authed]);

  useEffect(() => {
    if (!authed) return;
    if (tab === 'users') { fetchUsers(); fetchAdminIds(); }
    if (tab === 'gigs') fetchGigs();
    if (tab === 'events') fetchEvents();
    if (tab === 'feedback') fetchFeedback();
    if (tab === 'listings') fetchListingRequests();
    if (tab === 'disputes') fetchDisputes();
  }, [authed, tab, page, fetchUsers, fetchGigs, fetchEvents, fetchAdminIds, fetchFeedback, fetchListingRequests, fetchDisputes]);

  // ── Actions ──
  const toggleAdmin = async (userId: string) => {
    const isCurrentlyAdmin = adminUserIds.has(userId);
    if (isCurrentlyAdmin) {
      if (!window.confirm('Remove admin privileges from this user?')) return;
      const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', 'admin');
      if (error) {
        toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      } else {
        toast({ title: 'Admin removed' });
        fetchAdminIds();
      }
    } else {
      if (!window.confirm('Grant admin privileges to this user?')) return;
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: 'admin' });
      if (error) {
        toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      } else {
        toast({ title: 'Admin granted' });
        fetchAdminIds();
      }
    }
  };

  const deleteUser = async (userId: string) => {
    if (!window.confirm('Delete this user\'s profile and all their data? This cannot be undone.')) return;
    // Cascade: student_profiles, jobs, applications, etc.
    await supabase.from('student_profiles').delete().eq('user_id', userId);
    await supabase.from('portfolio_items').delete().eq('user_id', userId);
    await supabase.from('saved_jobs').delete().eq('user_id', userId);
    await supabase.from('notifications').delete().eq('user_id', userId);
    await supabase.from('freelancer_preferences').delete().eq('user_id', userId);
    await supabase.from('favourite_students').delete().eq('business_user_id', userId);
    await supabase.from('favourite_students').delete().eq('student_user_id', userId);
    // Delete their jobs (and cascaded data)
    const { data: userJobs } = await supabase.from('jobs').select('id').eq('posted_by', userId);
    if (userJobs) {
      for (const job of userJobs) {
        await supabase.from('job_applications').delete().eq('job_id', job.id);
        await supabase.from('saved_jobs').delete().eq('job_id', job.id);
        await supabase.from('reviews').delete().eq('job_id', job.id);
      }
      await supabase.from('jobs').delete().eq('posted_by', userId);
    }
    // Delete conversations and messages
    const { data: convos } = await supabase
      .from('conversations')
      .select('id')
      .or(`participant_1.eq.${userId},participant_2.eq.${userId}`);
    if (convos) {
      for (const c of convos) {
        await supabase.from('messages').delete().eq('conversation_id', c.id);
      }
      await supabase.from('conversations').delete().or(`participant_1.eq.${userId},participant_2.eq.${userId}`);
    }
    // Delete profile last
    const { error } = await supabase.from('profiles').delete().eq('user_id', userId);
    if (error) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } else {
      toast({ title: 'User deleted' });
      fetchUsers();
    }
  };

  const deleteGig = async (jobId: string) => {
    if (!window.confirm('Delete this gig and all related data?')) return;
    await supabase.from('job_applications').delete().eq('job_id', jobId);
    await supabase.from('saved_jobs').delete().eq('job_id', jobId);
    await supabase.from('reviews').delete().eq('job_id', jobId);
    const { error } = await supabase.from('jobs').delete().eq('id', jobId);
    if (error) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } else {
      toast({ title: 'Gig deleted' });
      fetchGigs();
    }
  };

  const deleteEvent = async (eventId: string) => {
    if (!window.confirm('Delete this event?')) return;
    await supabase.from('event_registrations').delete().eq('event_id', eventId);
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } else {
      toast({ title: 'Event deleted' });
      fetchEvents();
    }
  };

  const deleteFeedback = async (id: string) => {
    if (!window.confirm('Delete this feedback?')) return;
    const { error } = await supabase.from('feedback').delete().eq('id', id) as any;
    if (error) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } else {
      toast({ title: 'Feedback deleted' });
      fetchFeedback();
    }
  };

  // ── Filter ──
  const q = search.toLowerCase();
  const filteredUsers = users.filter((u) => {
    const matchesSearch = (u.display_name || '').toLowerCase().includes(q) || (u.user_type || '').toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (showNoPhone) {
      if (u.user_type !== 'student') return false;
      const sp = studentDataMap[u.user_id];
      if (sp?.phone?.trim()) return false;
    }
    return true;
  });
  const filteredGigs = gigs.filter((g) =>
    g.title.toLowerCase().includes(q) ||
    g.location.toLowerCase().includes(q) ||
    (g.poster_name || '').toLowerCase().includes(q)
  );
  const filteredEvents = events.filter((ev) =>
    ev.title.toLowerCase().includes(q) ||
    ev.creator.toLowerCase().includes(q)
  );
  const filteredFeedbacks = feedbacks.filter((f) =>
    f.message.toLowerCase().includes(q) ||
    (f.sender_name || '').toLowerCase().includes(q)
  );
  const filteredListings = listingRequests.filter((r) =>
    r.title.toLowerCase().includes(q) ||
    r.category.toLowerCase().includes(q) ||
    (r.requester_name || '').toLowerCase().includes(q) ||
    (r.applicant_email || '').toLowerCase().includes(q)
  );

  // ── Render ──

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authed) return null;

  const unlockAdminGate = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === adminPagePassword) {
      try {
        sessionStorage.setItem('vano_admin_gate', '1');
      } catch {
        /* ignore */
      }
      setPasswordGateOk(true);
      setPasswordInput('');
      toast({ title: 'Unlocked', description: 'Admin tools are available for this browser session.' });
    } else {
      toast({ title: 'Wrong password', variant: 'destructive' });
    }
  };

  if (needsAdminPassword && !passwordGateOk) {
    return (
      <div className="min-h-screen bg-background pb-16 md:pb-0">
        <SEOHead title="Admin – VANO" description="Restricted" noindex />
        <Navbar />
        <div className="max-w-sm mx-auto px-4 pt-28 pb-12">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="text-primary" size={22} />
              <h1 className="text-lg font-semibold">Admin access</h1>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Enter the admin password to open the dashboard. You must also be a VANO moderator account.
            </p>
            <form onSubmit={unlockAdminGate} className="space-y-3">
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full border border-input rounded-xl px-4 py-2.5 text-sm bg-background"
                placeholder="Password"
                autoComplete="current-password"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                Continue
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // text-base (16px) — avoids iOS Safari's zoom-on-focus for any
  // input with computed font-size under 16px.
  const inputClass = "w-full border border-input rounded-xl px-4 py-2.5 text-base bg-background focus:outline-none focus:ring-2 focus:ring-ring";

  const tabs: { key: Tab; label: string; icon: ReactNode; count: number }[] = [
    { key: 'users', label: 'Users', icon: <Users size={16} />, count: filteredUsers.length },
    { key: 'gigs', label: 'Gigs', icon: <Briefcase size={16} />, count: filteredGigs.length },
    { key: 'events', label: 'Events', icon: <Calendar size={16} />, count: filteredEvents.length },
    { key: 'listings', label: 'Community', icon: <ClipboardList size={16} />, count: filteredListings.length },
    { key: 'disputes', label: 'Disputes', icon: <AlertTriangle size={16} />, count: disputes.length },
    { key: 'feedback', label: 'Feedback', icon: <MessageSquare size={16} />, count: filteredFeedbacks.length },
  ];

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead title="Mod Dashboard – VANO" description="Moderate users, gigs, and events" noindex />
      <Navbar />

      <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-8 pt-20 sm:pt-24 pb-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="text-primary" size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Mod Dashboard</h1>
            <p className="text-sm text-muted-foreground">Users, gigs, Community listing requests &amp; more</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSearch(''); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {t.icon} {t.label}
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                tab === t.key ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${tab}...`}
            className={`${inputClass} pl-9`}
          />
        </div>

        {/* ── Users tab ── */}
        {tab === 'users' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={() => setShowNoPhone((v) => !v)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  showNoPhone
                    ? 'bg-destructive/10 border-destructive/30 text-destructive'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {showNoPhone ? '✕ Clear filter' : '⚠ No phone number'}
              </button>
              {showNoPhone && (
                <span className="text-xs text-muted-foreground">{filteredUsers.length} account{filteredUsers.length !== 1 ? 's' : ''} flagged</span>
              )}
            </div>
            {filteredUsers.length === 0 && (
              <p className="text-center text-muted-foreground py-12 text-sm">No users found</p>
            )}
            {filteredUsers.map((u) => {
              const sp = studentDataMap[u.user_id];
              return (
              <div key={u.user_id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-secondary overflow-hidden shrink-0">
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm font-bold">
                      {(u.display_name || '?')[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{u.display_name || 'Unnamed'}</p>
                    {adminUserIds.has(u.user_id) && <ModBadge size="sm" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {u.user_type === 'student' ? '🎓 Freelancer' : u.user_type === 'business' ? '🏢 Account' : 'No type'} · Joined {format(new Date(u.created_at), 'MMM d, yyyy')}
                  </p>
                  {u.user_type === 'student' && (
                    <p className="text-xs mt-0.5">
                      {sp?.phone?.trim()
                        ? <span className="text-emerald-600">📞 {sp.phone}{sp?.university ? ` · ${sp.university}` : ''}</span>
                        : <span className="text-destructive font-medium">⚠ No phone number</span>
                      }
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleAdmin(u.user_id)}
                    className={`p-2 rounded-lg transition-colors ${
                      adminUserIds.has(u.user_id)
                        ? 'text-primary hover:text-destructive hover:bg-destructive/10'
                        : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                    }`}
                    title={adminUserIds.has(u.user_id) ? 'Remove admin' : 'Make admin'}
                  >
                    {adminUserIds.has(u.user_id) ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
                  </button>
                  <button
                    onClick={() => navigate(`/students/${u.user_id}`)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    title="View profile"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={() => deleteUser(u.user_id)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete user"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* ── Gigs tab ── */}
        {tab === 'gigs' && (
          <div className="space-y-2">
            {filteredGigs.length === 0 && (
              <p className="text-center text-muted-foreground py-12 text-sm">No gigs found</p>
            )}
            {filteredGigs.map((g) => (
              <div key={g.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{g.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.poster_name} · {g.location} · €{g.hourly_rate}/hr · {format(new Date(g.shift_date), 'MMM d, yyyy')}
                  </p>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full mt-1 inline-block ${
                    g.status === 'open' ? 'bg-primary/10 text-primary' :
                    g.status === 'completed' ? 'bg-green-100 text-green-700' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {g.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/jobs/${g.id}`)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    title="View gig"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={() => deleteGig(g.id)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete gig"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Events tab ── */}
        {tab === 'events' && (
          <div className="space-y-2">
            {filteredEvents.length === 0 && (
              <p className="text-center text-muted-foreground py-12 text-sm">No events found</p>
            )}
            {filteredEvents.map((ev) => (
              <div key={ev.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{ev.title}</p>
                  <p className="text-xs text-muted-foreground">
                    By {ev.creator} · {ev.date} at {ev.time} · {ev.address}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => deleteEvent(ev.id)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete event"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Community listing requests ── */}
        {tab === 'listings' && (
          <div className="space-y-2">
            <AdminListingReviewModal
              request={reviewRequest}
              open={reviewOpen}
              onOpenChange={(o) => {
                setReviewOpen(o);
                if (!o) setReviewRequest(null);
              }}
              onApproved={() => void fetchListingRequests()}
            />
            {filteredListings.length === 0 && (
              <p className="text-center text-muted-foreground py-12 text-sm">No pending listing requests</p>
            )}
            {filteredListings.map((r) => (
              <div key={r.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">{r.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.category} · {r.requester_name || 'Unknown'} · {r.applicant_email || 'no email'}
                    </p>
                    <p className="text-xs text-muted-foreground">{format(new Date(r.created_at), 'MMM d, yyyy · h:mm a')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReviewRequest(r);
                      setReviewOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                  >
                    Review &amp; approve
                  </button>
                </div>
                <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap line-clamp-4">{r.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Disputes tab ── */}
        {tab === 'disputes' && (
          <div className="space-y-3">
            {disputes.length === 0 ? (
              <EmptyState
                tone="success"
                icon={ShieldCheck}
                title="No active disputes"
                description="Hirers who flag a held payment land here. Each row is paused from auto-release until resolved. None open right now."
              />
            ) : (
              disputes.map((d) => {
                const amountEuro = `€${(d.amount_cents / 100).toFixed(2)}`;
                const netEuro = `€${((d.amount_cents - d.fee_cents) / 100).toFixed(2)}`;
                const disputedAgo = d.disputed_at
                  ? format(new Date(d.disputed_at), 'MMM d, h:mm a')
                  : 'date unknown';
                const stripeUrl = d.stripe_payment_intent_id
                  ? `https://dashboard.stripe.com/payments/${d.stripe_payment_intent_id}`
                  : null;
                const threadUrl = d.conversation_id
                  ? `/messages?open=${d.conversation_id}`
                  : null;
                return (
                  <div key={d.id} className={cn(cardWarning, 'p-4')}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                          <AlertTriangle size={13} className="text-amber-600" />
                          {amountEuro} held · {netEuro} to freelancer
                        </p>
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                          {d.business_name ?? 'Hirer'} → {d.freelancer_name ?? 'Freelancer'} · flagged {disputedAgo}
                        </p>
                      </div>
                      <StatusChip tone="warning" size="sm" className="shrink-0">Frozen</StatusChip>
                    </div>
                    {d.dispute_reason && (
                      <p className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] leading-relaxed text-foreground">
                        {d.dispute_reason}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] font-semibold">
                      {threadUrl && (
                        <a
                          href={threadUrl}
                          onClick={(e) => { e.preventDefault(); navigate(threadUrl); }}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-foreground hover:bg-muted"
                        >
                          <MessageSquare size={11} /> Open thread
                        </a>
                      )}
                      {stripeUrl && (
                        <a
                          href={stripeUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-foreground hover:bg-muted"
                        >
                          Stripe payment <ExternalLink size={10} />
                        </a>
                      )}
                      <span className="ml-auto text-[10.5px] font-normal text-muted-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        payment_id: {d.id.slice(0, 8)}…
                      </span>
                    </div>
                    {/* Resolution buttons — each fires the same release/
                         refund edge function the hirer would call, but
                         with the admin override so the row's dispute
                         freeze doesn't block it. Release = work was
                         done, send the money. Refund = work wasn't
                         done, return to hirer. */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(() => {
                        const busy = resolvingDispute?.id === d.id;
                        const isReleasing = busy && resolvingDispute?.action === 'release';
                        const isRefunding = busy && resolvingDispute?.action === 'refund';
                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => resolveDispute(d, 'release')}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11.5px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {isReleasing ? 'Releasing…' : `Release ${netEuro} to freelancer`}
                            </button>
                            <button
                              type="button"
                              onClick={() => resolveDispute(d, 'refund')}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[11.5px] font-semibold text-destructive shadow-sm transition hover:bg-destructive/15 disabled:opacity-60"
                            >
                              {isRefunding ? 'Refunding…' : `Refund ${amountEuro} to hirer`}
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Feedback tab ── */}
        {tab === 'feedback' && (
          <div className="space-y-2">
            {filteredFeedbacks.length === 0 && (
              <EmptyState
                icon={MessageSquare}
                title="No feedback yet"
                description="User messages submitted through the feedback widget land here. None so far."
              />
            )}
            {filteredFeedbacks.map((f) => (
              <div key={f.id} className="bg-card border border-border rounded-xl p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-secondary overflow-hidden shrink-0">
                  {f.sender_avatar ? (
                    <img src={f.sender_avatar} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm font-bold">
                      {(f.sender_name || '?')[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-sm">{f.sender_name}</p>
                    <span className="text-xs text-muted-foreground">{format(new Date(f.created_at), 'MMM d, yyyy · h:mm a')}</span>
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">{f.message}</p>
                </div>
                <button
                  onClick={() => deleteFeedback(f.id)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                  title="Delete feedback"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="p-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-muted-foreground">Page {page + 1}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={
              (tab === 'users' && filteredUsers.length < PAGE_SIZE) ||
              (tab === 'gigs' && filteredGigs.length < PAGE_SIZE) ||
              (tab === 'events' && filteredEvents.length < PAGE_SIZE) ||
              (tab === 'listings' && filteredListings.length < PAGE_SIZE) ||
              (tab === 'disputes' && disputes.length < PAGE_SIZE) ||
              (tab === 'feedback' && filteredFeedbacks.length < PAGE_SIZE)
            }
            className="p-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-40 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Admin;
