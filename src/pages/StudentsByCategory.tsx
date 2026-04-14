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

const CATEGORY_META: Record<CommunityCategoryId, { label: string; sub: string; icon: typeof Monitor }> = {
  videography: { label: 'Videography', sub: 'Filming, reels & promos', icon: Video },
  digital_sales: { label: 'Digital Sales', sub: 'Outbound, lead gen & closing', icon: TrendingUp },
  websites:    { label: 'Website Design', sub: 'Get a site built or fixed', icon: Monitor },
  social_media:{ label: 'Social Media', sub: 'Content, strategy & growth', icon: Megaphone },
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
      supabase.from('student_profiles').select('*').eq('is_available', true).eq('community_board_status', 'approved').not('bio', 'is', null).not('skills', 'eq', '{}'),
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

  const meta = CATEGORY_META[categoryId];
  const Icon = meta.icon;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead
        title={`${meta.label} Freelancers in Galway`}
        description={`Hire ${meta.label.toLowerCase()} freelancers in Galway on VANO. ${meta.sub}. Browse profiles, ratings and availability — and book in minutes.`}
        keywords={`${meta.label.toLowerCase()} galway, hire ${meta.label.toLowerCase()} galway, freelance ${meta.label.toLowerCase()} ireland, ${meta.label.toLowerCase()} student galway`}
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
            <span className="ml-auto rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-500/20">
              {students.length} available
            </span>
          )}
        </div>

        {/* "On VANO now" label */}
        <p className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/60">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          On VANO now
        </p>

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
          <div className="flex flex-col gap-4" aria-busy aria-label="Loading freelancers">
            {[1, 2, 3].map((i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-foreground/10 bg-card shadow-sm animate-pulse">
                <div className="h-48 w-full bg-muted/60" />
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 shrink-0 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-32 rounded-md bg-muted" />
                      <div className="h-2.5 w-24 rounded-md bg-muted" />
                    </div>
                  </div>
                  <div className="h-3 w-full rounded-md bg-muted" />
                  <div className="h-3 w-4/5 rounded-md bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-foreground/15 bg-muted/30 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users size={20} strokeWidth={2} />
            </div>
            <p className="max-w-xs text-sm font-medium text-foreground">
              No {meta.label.toLowerCase()} freelancers yet — be the first.
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Build your profile and businesses can hire you straight from this board.
            </p>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
            >
              List yourself
              <ArrowRight size={13} strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {students.map((student, idx) => {
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
