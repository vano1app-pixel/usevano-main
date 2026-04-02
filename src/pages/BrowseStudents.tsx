import React, { useState, useEffect, useMemo } from 'react';
import { Navbar } from '@/components/Navbar';
import { StudentCard } from '@/components/StudentCard';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { Search, ArrowLeft, Monitor, Video, Megaphone, Camera } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isCommunityCategoryId, type CommunityCategoryId } from '@/lib/communityCategories';
import {
  TALENT_BOARD_DEMO_PROFILES,
  talentBoardDemoToStudentRow,
  type TalentBoardDemoEntry,
} from '@/lib/talentBoardDemoData';

/** Same copy, order, and icons as Home → “What do you need?” */
const TALENT_HUB_CATEGORIES: {
  cat: CommunityCategoryId;
  label: string;
  sub: string;
  icon: typeof Monitor;
}[] = [
  { cat: 'videography', label: 'Videography', sub: 'Filming, reels & promos', icon: Video },
  { cat: 'photography', label: 'Photography', sub: 'Events, brands & portraits', icon: Camera },
  { cat: 'websites', label: 'Website Design', sub: 'Get a site built or fixed', icon: Monitor },
  { cat: 'social_media', label: 'Social Media', sub: 'Content, strategy & growth', icon: Megaphone },
];

/** Category view title + subtitle (matches Home tiles, not Community board names). */
const TALENT_CATEGORY_META: Record<CommunityCategoryId, { label: string; sub: string }> = {
  videography: { label: 'Videography', sub: 'Filming, reels & promos' },
  photography: { label: 'Photography', sub: 'Events, brands & portraits' },
  websites: { label: 'Website Design', sub: 'Get a site built or fixed' },
  social_media: { label: 'Social Media', sub: 'Content, strategy & growth' },
};

/** Home-style category row; `selectedCategory` highlights the active card (e.g. blue icon well). */
function TalentNeedCategoryRow({
  selectedCategory,
  onSelectCategory,
  counts,
}: {
  selectedCategory: CommunityCategoryId | null;
  onSelectCategory: (id: CommunityCategoryId) => void;
  counts?: Partial<Record<CommunityCategoryId, number>>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">What do you need?</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TALENT_HUB_CATEGORIES.map((item) => {
          const Icon = item.icon;
          const isActive = selectedCategory === item.cat;
          return (
            <button
              key={item.cat}
              type="button"
              onClick={() => onSelectCategory(item.cat)}
              className={`group flex flex-col items-start gap-3 rounded-2xl border p-4 text-left shadow-sm transition-all active:scale-[0.98] ${
                isActive
                  ? 'border-primary bg-primary/5 shadow-md'
                  : 'border-foreground/10 bg-card hover:border-foreground/20 hover:shadow-md'
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                  isActive ? 'bg-primary/15' : 'bg-foreground/8 group-hover:bg-primary/10'
                }`}
              >
                <Icon
                  size={18}
                  strokeWidth={2}
                  className={
                    isActive ? 'text-primary' : 'text-foreground transition-colors group-hover:text-primary'
                  }
                />
              </div>
              <div>
                <p className="text-[13px] font-semibold leading-snug text-foreground">{item.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{item.sub}</p>
                {counts?.[item.cat] !== undefined && counts[item.cat]! > 0 && (
                  <p className="mt-1.5 text-[10px] font-semibold text-primary">
                    {counts[item.cat]} freelancer{counts[item.cat] !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Same keyword idea as Home — one primary board per freelancer. */
const CAT_KEYWORDS: Record<CommunityCategoryId, string[]> = {
  websites: ['web', 'website', 'wordpress', 'html', 'css', 'developer', 'coding', 'design', 'frontend', 'shopify', 'react', 'next', 'figma', 'typescript', 'tailwind', 'supabase', 'webflow', 'framer'],
  videography: ['video', 'film', 'filming', 'videography', 'reel', 'drone', 'premiere', 'davinci', 'motion', 'promo', 'colour grading', 'wedding film', 'corporate video'],
  photography: ['photo', 'photography', 'photographer', 'portrait', 'headshot', 'lightroom', 'product photo', 'brand photo', 'food photo', 'event photo', 'wedding photo'],
  social_media: ['social', 'marketing', 'content', 'instagram', 'tiktok', 'facebook', 'twitter', 'media', 'canva', 'strategy', 'linkedin', 'copywriting'],
};

function primaryCategoryForStudent(student: any, displayName: string): CommunityCategoryId {
  const text = `${displayName} ${student.bio || ''} ${(student.skills || []).join(' ')}`.toLowerCase();
  const order: CommunityCategoryId[] = ['websites', 'videography', 'photography', 'social_media'];
  let best: CommunityCategoryId = 'websites';
  let bestScore = 0;
  for (const cat of order) {
    const score = CAT_KEYWORDS[cat].filter((kw) => text.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return best;
}

function demoMatchesSearch(d: TalentBoardDemoEntry, q: string) {
  if (!q) return true;
  const name = d.profile.display_name.toLowerCase();
  const skills = d.studentProfile.skills.join(' ').toLowerCase();
  const title = d.post.title.toLowerCase();
  const desc = d.post.description.toLowerCase();
  return name.includes(q) || skills.includes(q) || title.includes(q) || desc.includes(q);
}

function studentMatchesSearch(student: any, displayName: string, q: string) {
  if (!q) return true;
  const name = displayName.toLowerCase();
  const skillText = (student.skills || []).join(' ').toLowerCase();
  return name.includes(q) || student.bio?.toLowerCase().includes(q) || skillText.includes(q);
}

const BrowseStudents = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const catParam = searchParams.get('cat');
  const activeCategory: CommunityCategoryId | null = isCommunityCategoryId(catParam) ? catParam : null;

  const [students, setStudents] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [reviewMap, setReviewMap] = useState<Record<string, { avg: string; count: number }>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    const [{ data: studentData, error: studentErr }, { data: profileData, error: profileErr }] = await Promise.all([
      supabase.from('student_profiles').select('*').eq('is_available', true).eq('community_board_status', 'approved').not('bio', 'is', null).not('skills', 'eq', '{}'),
      supabase.from('profiles').select('user_id, display_name'),
    ]);
    if (studentErr || profileErr) {
      setFetchError(true);
      setLoading(false);
      return;
    }
    const rows = studentData || [];
    setStudents(rows);
    setProfiles(profileData || []);

    // Fetch review averages for all loaded students
    if (rows.length > 0) {
      const ids = rows.map((s: any) => s.user_id);
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

  const goToCategory = (id: CommunityCategoryId) => {
    setSearchParams({ cat: id }, { replace: false });
  };

  const goToHub = () => {
    setSearchParams({}, { replace: false });
  };

  const getDisplayName = (userId: string) => profiles.find((p) => p.user_id === userId)?.display_name || 'Student';

  const searchQ = search.trim().toLowerCase();

  const realsByCategory = useMemo(() => {
    const q = searchQ;
    const out: Record<CommunityCategoryId, any[]> = { videography: [], photography: [], websites: [], social_media: [] };
    for (const s of students) {
      const name = getDisplayName(s.user_id);
      if (!studentMatchesSearch(s, name, q)) continue;
      const cat = primaryCategoryForStudent(s, name);
      out[cat].push(s);
    }
    return out;
  }, [students, profiles, searchQ]);

  const demosByCategory = useMemo(() => {
    const q = searchQ;
    const forCat = (cat: CommunityCategoryId) =>
      TALENT_BOARD_DEMO_PROFILES.filter((d) => d.category === cat && demoMatchesSearch(d, q));
    return {
      videography: forCat('videography'),
      photography: forCat('photography'),
      websites: forCat('websites'),
      social_media: forCat('social_media'),
    } satisfies Record<CommunityCategoryId, TalentBoardDemoEntry[]>;
  }, [searchQ]);

  const categoryMeta = activeCategory ? TALENT_CATEGORY_META[activeCategory] : null;

  const realsActive = activeCategory ? realsByCategory[activeCategory] : [];
  const demosActive = activeCategory ? demosByCategory[activeCategory] : [];
  const hasRows = realsActive.length > 0 || demosActive.length > 0;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead
        title={categoryMeta ? `${categoryMeta.label} – Find talent · VANO` : 'Find talent – VANO'}
        description="Browse freelancers and students with the skills you need in Galway."
      />
      <Navbar />

      <div
        className="mx-auto max-w-5xl bg-background px-3 sm:px-4 md:px-8 pb-12 sm:pb-16
        pt-[max(4.5rem,calc(env(safe-area-inset-top,0px)+3.25rem))]
        sm:pt-20 md:pt-24"
      >
        {activeCategory && (
          <button
            type="button"
            onClick={goToHub}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={16} strokeWidth={2} />
            All categories
          </button>
        )}

        <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm sm:p-4">
          <TalentNeedCategoryRow
            selectedCategory={activeCategory}
            onSelectCategory={goToCategory}
            counts={loading ? undefined : {
              videography: realsByCategory.videography.length,
              photography: realsByCategory.photography.length,
              websites: realsByCategory.websites.length,
              social_media: realsByCategory.social_media.length,
            }}
          />
        </div>

        {!activeCategory ? (
          <div className="mt-6 flex flex-col gap-5">
            {loading ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted/60" />
                ))}
              </div>
            ) : students.length > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    On VANO now
                  </p>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-500/20">
                    {students.length} available
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {students.slice(0, 3).map((s) => {
                    const name = getDisplayName(s.user_id);
                    return (
                      <div
                        key={s.id}
                        onClick={() => goToCategory(primaryCategoryForStudent(s, name))}
                        className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-foreground/10 bg-card p-3 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                      >
                        {s.avatar_url ? (
                          <img
                            src={s.avatar_url}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-card"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary ring-2 ring-card">
                            {name[0].toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-foreground">{name}</p>
                          {s.hourly_rate > 0 && (
                            <p className="text-[11px] font-medium text-emerald-700">€{s.hourly_rate}/hr</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-center text-xs text-muted-foreground">Pick a category above to browse all freelancers</p>
              </>
            ) : null}
          </div>
        ) : (
          <>
            <p className="mt-8 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/60">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              On VANO now
            </p>

            <div className="relative mt-4 mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" size={18} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, skill, or keyword…"
                className="w-full pl-10 pr-4 py-3.5 border border-input rounded-2xl bg-card text-sm shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
            </div>

            {fetchError && (
              <p className="mb-4 text-center text-sm text-muted-foreground">
                Could not load all live profiles — examples may still show below.
              </p>
            )}

            {loading ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3" aria-busy aria-label="Loading freelancers">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="overflow-hidden rounded-2xl border border-foreground/10 bg-card shadow-sm animate-pulse">
                    <div className="h-24 w-full bg-muted/60" />
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 rounded-full bg-muted" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3.5 w-32 rounded-md bg-muted" />
                          <div className="h-2.5 w-24 rounded-md bg-muted" />
                        </div>
                      </div>
                      <div className="h-3 w-full rounded-md bg-muted" />
                      <div className="h-3 w-4/5 rounded-md bg-muted" />
                      <div className="flex gap-1.5 pt-1">
                        <div className="h-5 w-14 rounded-full bg-muted" />
                        <div className="h-5 w-18 rounded-full bg-muted" />
                        <div className="h-5 w-12 rounded-full bg-muted" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : !hasRows ? (
              <p className="py-12 text-center text-muted-foreground">
                {searchQ ? 'No freelancers or examples match that search on this board.' : 'No freelancers on this board yet — check back soon.'}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {realsActive.map((student) => {
                  const name = getDisplayName(student.user_id);
                  const ratingInfo = reviewMap[student.user_id];
                  return (
                    <StudentCard
                      key={student.id}
                      student={student}
                      displayName={name}
                      showFavourite={false}
                      category={TALENT_CATEGORY_META[primaryCategoryForStudent(student, name)].label}
                      avgRating={ratingInfo?.avg ?? null}
                      reviewCount={ratingInfo?.count}
                      onMessage={(userId) => navigate(`/messages?with=${userId}`)}
                    />
                  );
                })}
                {demosActive.map((demo) => {
                  const row = talentBoardDemoToStudentRow(demo);
                  return (
                    <StudentCard
                      key={`demo-${demo.post.id}`}
                      student={row}
                      displayName={demo.profile.display_name}
                      showFavourite={false}
                      demoExample
                      category={TALENT_CATEGORY_META[demo.category].label}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default BrowseStudents;
