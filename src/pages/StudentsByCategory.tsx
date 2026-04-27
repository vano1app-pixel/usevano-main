import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { StudentCard } from '@/components/StudentCard';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { breadcrumbSchema } from '@/lib/structuredData';
import { ArrowLeft, Monitor, Video, Megaphone, TrendingUp, Users, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { type CommunityCategoryId } from '@/lib/communityCategories';
import { isAdminOwnerEmail } from '@/lib/adminOwner';
import { cn } from '@/lib/utils';
import { StatusChip } from '@/components/ui/StatusChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardSkeletonList } from '@/components/ui/CardSkeleton';

const CATEGORY_META: Record<CommunityCategoryId, { label: string; sub: string; icon: typeof Monitor }> = {
  videography: { label: 'Videography', sub: 'Filming, reels & promos', icon: Video },
  digital_sales: { label: 'Digital Sales', sub: 'Outbound, lead gen & closing', icon: TrendingUp },
  websites:    { label: 'Website Design', sub: 'Get a site built or fixed', icon: Monitor },
  social_media:{ label: 'Content Creation', sub: 'UGC & social media management', icon: Megaphone },
};

const CAT_KEYWORDS: Record<CommunityCategoryId, string[]> = {
  websites:     ['web', 'website', 'wordpress', 'html', 'css', 'developer', 'coding', 'design', 'frontend', 'shopify', 'react', 'next', 'figma', 'typescript', 'tailwind', 'supabase', 'webflow', 'framer'],
  videography:  ['video', 'film', 'filming', 'videography', 'reel', 'drone', 'premiere', 'davinci', 'motion', 'promo', 'colour grading', 'wedding film', 'corporate video'],
  digital_sales: ['sales', 'sdr', 'bdr', 'cold call', 'cold email', 'outbound', 'lead gen', 'lead generation', 'prospect', 'closing', 'saas sales', 'b2b', 'appointment setting', 'linkedin prospecting', 'crm', 'hubspot', 'salesforce', 'negotiation'],
  social_media: ['social', 'marketing', 'content', 'instagram', 'tiktok', 'facebook', 'twitter', 'media', 'canva', 'strategy', 'linkedin', 'copywriting'],
};

function primaryCategoryForStudent(student: any, displayName: string): CommunityCategoryId {
  const text = `${displayName} ${student.bio || ''} ${(student.skills || []).join(' ')}`.toLowerCase();
  const order: CommunityCategoryId[] = ['websites', 'videography', 'digital_sales', 'social_media'];
  let best: CommunityCategoryId = 'websites';
  let bestScore = 0;
  for (const cat of order) {
    const score = CAT_KEYWORDS[cat].filter((kw) => text.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return best;
}

interface Props { categoryId: CommunityCategoryId; }

const StudentsByCategory = ({ categoryId }: Props) => {
  const navigate = useNavigate();

  const [students, setStudents] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [reviewMap, setReviewMap] = useState<Record<string, { avg: string; count: number }>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [isViewerAdmin, setIsViewerAdmin] = useState(false);
  // Budget filter chips — "all" (default), "<€30/hr", "€30–60/hr", "€60+/hr".
  // Filters in-memory against student_profiles.hourly_rate; students with a
  // 0 or null rate are kept in all buckets because "negotiable" is common
  // and we'd rather surface them than hide them.
  const [rateFilter, setRateFilter] = useState<'all' | 'lt30' | '30to60' | 'gt60'>('all');
  // Location filter — sits above rate because it answers a coarser
  // question first ("can this person actually do the work for me?")
  // before the budget question. Galway is the brand promise (the
  // platform's home county), so it gets its own chip; the more
  // expansive options sit either side. Counties live on
  // student_profiles.county (added in migration 20260416120000) and
  // `remote_ok` is the boolean flag the wizard collects; freelancers
  // without a county set stay visible in 'all' so we don't hide
  // willing-to-work-anywhere listings.
  const [locFilter, setLocFilter] = useState<'all' | 'galway' | 'remote'>('all');
  // Sort order on the visible list. Default is "newest" (updated_at desc)
  // so freshly-listed or recently-edited freelancers surface to the top —
  // the page used to render in raw insertion order, which gave anyone
  // listing after the first cohort effectively zero visibility. "Top
  // rated" uses the reviewMap aggregate and falls back to newest on tie
  // so a brand-new 5-star freelancer doesn't get stuck behind an ancient
  // one with the same score.
  const [sortBy, setSortBy] = useState<'newest' | 'top_rated'>('newest');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsViewerAdmin(isAdminOwnerEmail(session?.user?.email));
    });
  }, []);

  useEffect(() => {
    fetchData();
  }, [categoryId]);

  const fetchData = async () => {
    const [{ data: studentData, error: studentErr }, { data: profileData, error: profileErr }] = await Promise.all([
      // community_board_status='approved' already guarantees they've completed
      // the wizard; bio is now an optional personal line (null is fine), so we
      // don't filter on it. Keep the skills check as a sanity filter.
      supabase.from('student_profiles').select('*').eq('is_available', true).eq('community_board_status', 'approved').not('skills', 'eq', '{}'),
      supabase.from('profiles').select('user_id, display_name, avatar_url'),
    ]);

    // Only surface a hard error when the primary query (the list itself) fails.
    // A profiles-enrichment failure is non-fatal — the cards still render with
    // a default display name, so there's no reason to scare the user with a
    // banner when they can see the list fine.
    if (studentErr) {
      console.error('StudentsByCategory: failed to load student_profiles', studentErr);
      setFetchError(true);
      setLoading(false);
      return;
    }
    if (profileErr) {
      console.warn('StudentsByCategory: profile enrichment failed, continuing with defaults', profileErr);
    }
    setFetchError(false);

    const rows = studentData || [];
    const profs = profileData || [];

    // Filter to this category only
    const getDisplayName = (uid: string) => profs.find((p: any) => p.user_id === uid)?.display_name || 'Student';
    const filtered = rows.filter((s: any) => primaryCategoryForStudent(s, getDisplayName(s.user_id)) === categoryId);

    setStudents(filtered);
    setProfiles(profs);

    if (filtered.length > 0) {
      const ids = filtered.map((s: any) => s.user_id);
      const { data: revData } = await supabase.from('reviews').select('reviewee_id, rating').in('reviewee_id', ids);
      if (revData && revData.length > 0) {
        const map: Record<string, { sum: number; count: number }> = {};
        for (const r of revData) {
          if (!map[r.reviewee_id]) map[r.reviewee_id] = { sum: 0, count: 0 };
          map[r.reviewee_id].sum += r.rating;
          map[r.reviewee_id].count += 1;
        }
        const result: Record<string, { avg: string; count: number }> = {};
        for (const [uid, { sum, count }] of Object.entries(map)) {
          result[uid] = { avg: (sum / count).toFixed(1), count };
        }
        setReviewMap(result);
      }
    }

    setLoading(false);
  };

  const getDisplayName = (uid: string) => profiles.find((p: any) => p.user_id === uid)?.display_name || 'Student';
  const getProfileAvatar = (uid: string) => profiles.find((p: any) => p.user_id === uid)?.avatar_url || null;

  // Apply the budget-chip filter in memory. Negotiable / unset rates stay
  // visible in every bucket so we don't hide willing-to-chat freelancers.
  const visibleStudents = students
    .filter((s) => {
      // Location: 'galway' shows only freelancers based in Galway county;
      // 'remote' shows only those who flagged remote_ok. 'all' shows
      // everyone. Freelancers with no county set stay visible in 'all'
      // (we'd rather surface them than hide them) but get filtered out
      // of the geo-specific buckets so the chip's promise holds.
      if (locFilter === 'galway') {
        const county = (s.county || '').toString().toLowerCase();
        if (county !== 'galway') return false;
      }
      if (locFilter === 'remote') {
        if (!s.remote_ok) return false;
      }
      if (rateFilter === 'all') return true;
      const r = Number(s.hourly_rate);
      if (!r || Number.isNaN(r) || r <= 0) return true;
      if (rateFilter === 'lt30') return r < 30;
      if (rateFilter === '30to60') return r >= 30 && r <= 60;
      if (rateFilter === 'gt60') return r > 60;
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === 'top_rated') {
        const aInfo = reviewMap[a.user_id];
        const bInfo = reviewMap[b.user_id];
        const aScore = aInfo ? parseFloat(aInfo.avg) : -1;
        const bScore = bInfo ? parseFloat(bInfo.avg) : -1;
        if (aScore !== bScore) return bScore - aScore;
        // Tiebreaker: count (more reviews = more confidence), then newest.
        const aCount = aInfo?.count ?? 0;
        const bCount = bInfo?.count ?? 0;
        if (aCount !== bCount) return bCount - aCount;
      }
      // Default + top-rated tiebreak: most-recently-updated first. Falls
      // back to created_at if the row predates the updated_at stamp.
      const aDate = a.updated_at || a.created_at || '';
      const bDate = b.updated_at || b.created_at || '';
      return bDate.localeCompare(aDate);
    });

  const meta = CATEGORY_META[categoryId];
  const Icon = meta.icon;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead
        title={`${meta.label} Freelancers on VANO`}
        description={`Hire ${meta.label.toLowerCase()} freelancers on VANO. ${meta.sub}. Browse profiles, ratings and availability — and book in minutes.`}
        keywords={`${meta.label.toLowerCase()}, hire ${meta.label.toLowerCase()}, freelance ${meta.label.toLowerCase()}, ${meta.label.toLowerCase()} ireland, ${meta.label.toLowerCase()} galway`}
        jsonLd={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Freelancers', path: '/students' },
          { name: meta.label, path: `/students/${categoryId}` },
        ])}
      />
      <Navbar />

      <div
        className="mx-auto max-w-3xl px-3 sm:px-4 md:px-8 pb-12 sm:pb-16
        pt-[max(4.5rem,calc(env(safe-area-inset-top,0px)+3.25rem))]
        sm:pt-20 md:pt-24"
      >
        {/* Back */}
        <button
          type="button"
          onClick={() => navigate('/students')}
          className="group mb-5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-sm font-medium text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-foreground/5"
        >
          <ArrowLeft size={16} strokeWidth={2} className="transition-transform group-hover:-translate-x-1" />
          All categories
        </button>

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
            <Icon size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{meta.label}</h1>
            <p className="text-sm text-muted-foreground">{meta.sub}</p>
          </div>
          {!loading && (
            <StatusChip tone="success" className="ml-auto">
              {visibleStudents.length} {rateFilter === 'all' && locFilter === 'all' ? 'available' : `of ${students.length}`}
            </StatusChip>
          )}
        </div>

        {/* Live online counter. Replaced the old "On VANO now" label
            (pulsing dot + no data) so visitors can see pool density
            at a glance instead of inferring it by scrolling. Hidden
            during loading and when the pool is empty — both cases
            have their own copy elsewhere. The dot still pulses so
            the "live" signal carries, but now it's a signal attached
            to a real number. */}
        {!loading && students.length > 0 && (
          <p className="mb-4 inline-flex items-baseline gap-1.5 text-[12px] font-semibold text-foreground/75">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse self-center" />
            <span className="text-foreground tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {students.length}
            </span>
            <span className="text-foreground/55">
              {students.length === 1 ? 'freelancer online now' : 'freelancers online now'}
            </span>
          </p>
        )}

        {/* Location filter chips — answer "can they do the work for me?"
            before the budget question. Galway is the brand-home county, so
            it sits in the middle as a primary option. Freelancers with no
            county set stay visible in "Anywhere" (we don't hide willing-to-
            work-anywhere listings) but get filtered out of the geo buckets. */}
        {!loading && students.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {([
              { id: 'all', label: 'Anywhere' },
              { id: 'galway', label: 'Galway' },
              { id: 'remote', label: 'Remote OK' },
            ] as const).map((chip) => {
              const active = locFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setLocFilter(chip.id)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors',
                    active
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-border bg-card text-foreground/70 hover:border-emerald-500/40 hover:text-foreground',
                  )}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Budget filter chips — helps budget-constrained hirers narrow down
            without bouncing on "too expensive" cards. Students with a 0 / null
            rate stay visible in every bucket since "open to chat" is common.
            Sort toggle sits on the right so the two controls (what rates,
            what order) share one row on desktop and stack cleanly on mobile. */}
        {!loading && students.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {([
                { id: 'all', label: 'All rates' },
                { id: 'lt30', label: '< €30/hr' },
                { id: '30to60', label: '€30–60/hr' },
                { id: 'gt60', label: '€60+/hr' },
              ] as const).map((chip) => {
                const active = rateFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setRateFilter(chip.id)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground/70 hover:border-primary/40 hover:text-foreground',
                    )}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <div
              role="tablist"
              aria-label="Sort freelancers"
              className="inline-flex overflow-hidden rounded-full border border-border bg-card p-0.5 text-[11px] font-semibold"
            >
              {([
                { id: 'newest', label: 'Newest' },
                { id: 'top_rated', label: 'Top rated' },
              ] as const).map((opt) => {
                const active = sortBy === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSortBy(opt.id)}
                    className={cn(
                      'rounded-full px-3 py-1 transition-colors',
                      active
                        ? 'bg-foreground text-background'
                        : 'text-foreground/60 hover:text-foreground',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Single-column card list */}
        {fetchError ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-foreground/15 bg-muted/30 px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">Couldn&apos;t load the board</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => { setFetchError(false); setLoading(true); fetchData(); }}
              className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <CardSkeletonList count={3} variant="full" label="Loading freelancers" />
        ) : students.length === 0 ? (
          // Dual-audience empty state. The old copy assumed the viewer
          // was a freelancer ("be the first") — reads oddly for hirers
          // who just landed on an empty category and came here to hire.
          // Now we show both paths: freelancer can list themselves,
          // hirer can go straight to the AI Find flow (pre-filled with
          // this category) instead of backing out.
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-foreground/15 bg-muted/30 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users size={20} strokeWidth={2} />
            </div>
            <p className="max-w-xs text-sm font-medium text-foreground">
              No {meta.label.toLowerCase()} freelancers listed yet.
            </p>
            <div className="grid w-full max-w-md grid-cols-1 gap-2.5 sm:grid-cols-2">
              {/* Freelancer path */}
              <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-4">
                <p className="text-xs font-semibold text-foreground">Are you a {meta.label.toLowerCase()}?</p>
                <p className="text-[11px] text-muted-foreground">Be the first on the board.</p>
                <button
                  type="button"
                  onClick={() => navigate('/profile')}
                  className="mt-auto inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-[11px] font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
                >
                  List yourself
                  <ArrowRight size={12} strokeWidth={2.5} />
                </button>
              </div>
              {/* Hirer path */}
              <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-4">
                <p className="text-xs font-semibold text-foreground">Looking to hire?</p>
                <p className="text-[11px] text-muted-foreground">Vano AI-matches you in 20 seconds, or hand-picks free in 24h.</p>
                <button
                  type="button"
                  onClick={() => navigate(`/hire?category=${encodeURIComponent(categoryId)}`)}
                  className="mt-auto inline-flex items-center gap-1.5 rounded-xl border border-primary bg-primary/5 px-3.5 py-2 text-[11px] font-semibold text-primary transition hover:bg-primary/10"
                >
                  Try AI Find
                  <ArrowRight size={12} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </div>
        ) : visibleStudents.length === 0 ? (
          <EmptyState
            size="compact"
            title={`No ${meta.label.toLowerCase()} freelancers in this rate band.`}
            description="Widen the filter to see everyone available in this category."
            action={{
              label: 'Show all rates',
              variant: 'outline',
              onClick: () => setRateFilter('all'),
            }}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {visibleStudents.map((student, idx) => {
              const name = getDisplayName(student.user_id);
              const ratingInfo = reviewMap[student.user_id];
              return (
                <div key={student.id} className="animate-fade-in opacity-0" style={{ animationDelay: `${idx * 60}ms` }}>
                  <StudentCard
                    student={student}
                    displayName={name}
                    profileAvatarUrl={getProfileAvatar(student.user_id)}
                    showFavourite={false}
                    category={meta.label}
                    avgRating={ratingInfo?.avg ?? null}
                    reviewCount={ratingInfo?.count}
                    viewerIsAdmin={isViewerAdmin}
                    onRemoved={(uid) => setStudents((prev) => prev.filter((s) => s.user_id !== uid))}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentsByCategory;
