import React, { useState, useEffect, useMemo } from 'react';
import { Navbar } from '@/components/Navbar';
import { StudentCard } from '@/components/StudentCard';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { Search, ArrowLeft, Monitor, Video, Megaphone } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
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
  { cat: 'websites', label: 'Website Design', sub: 'Get a site built or fixed', icon: Monitor },
  { cat: 'videographer', label: 'Video & Photography', sub: 'Weddings, events & reels', icon: Video },
  { cat: 'social_media', label: 'Social Media', sub: 'Content, strategy & growth', icon: Megaphone },
];

/** Category view title + subtitle (matches Home tiles, not Community board names). */
const TALENT_CATEGORY_META: Record<CommunityCategoryId, { label: string; sub: string }> = {
  websites: { label: 'Website Design', sub: 'Get a site built or fixed' },
  videographer: { label: 'Video & Photography', sub: 'Weddings, events & reels' },
  social_media: { label: 'Social Media', sub: 'Content, strategy & growth' },
};

/** Home-style category row; `selectedCategory` highlights the active card (e.g. blue icon well). */
function TalentNeedCategoryRow({
  selectedCategory,
  onSelectCategory,
}: {
  selectedCategory: CommunityCategoryId | null;
  onSelectCategory: (id: CommunityCategoryId) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">What do you need?</p>
      <div className="grid grid-cols-3 gap-3">
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
  videographer: ['video', 'photo', 'film', 'camera', 'edit', 'photography', 'videography', 'reel', 'wedding', 'drone', 'premiere', 'davinci'],
  social_media: ['social', 'marketing', 'content', 'instagram', 'tiktok', 'facebook', 'twitter', 'media', 'canva', 'strategy', 'linkedin', 'copywriting'],
};

function primaryCategoryForStudent(student: any, displayName: string): CommunityCategoryId {
  const text = `${displayName} ${student.bio || ''} ${(student.skills || []).join(' ')}`.toLowerCase();
  const order: CommunityCategoryId[] = ['websites', 'videographer', 'social_media'];
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
  const [searchParams, setSearchParams] = useSearchParams();
  const catParam = searchParams.get('cat');
  const activeCategory: CommunityCategoryId | null = isCommunityCategoryId(catParam) ? catParam : null;

  const [students, setStudents] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    const { data: studentData, error: studentErr } = await supabase.from('student_profiles').select('*').eq('is_available', true);
    const { data: profileData, error: profileErr } = await supabase.from('profiles').select('user_id, display_name');
    if (studentErr || profileErr) {
      setFetchError(true);
      setLoading(false);
      return;
    }
    setStudents(studentData || []);
    setProfiles(profileData || []);
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
    const out: Record<CommunityCategoryId, any[]> = { websites: [], videographer: [], social_media: [] };
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
      websites: forCat('websites'),
      videographer: forCat('videographer'),
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
          />
        </div>

        {!activeCategory ? (
          <div className="mt-6 flex flex-col gap-4">
            {!loading && students.length > 0 && (
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                On VANO now
              </p>
            )}
            {!loading && students.length > 0 && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{students.length}</span> freelancers available — pick a category above.
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="mt-8 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">On VANO now</p>

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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-busy aria-label="Loading freelancers">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-64 animate-pulse rounded-xl border border-border bg-card" />
                ))}
              </div>
            ) : !hasRows ? (
              <p className="py-12 text-center text-muted-foreground">
                {searchQ ? 'No freelancers or examples match that search on this board.' : 'No freelancers on this board yet — check back soon.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {realsActive.map((student) => (
                  <StudentCard
                    key={student.id}
                    student={student}
                    displayName={getDisplayName(student.user_id)}
                    showFavourite={false}
                  />
                ))}
                {demosActive.map((demo) => {
                  const row = talentBoardDemoToStudentRow(demo);
                  return (
                    <StudentCard
                      key={`demo-${demo.post.id}`}
                      student={row}
                      displayName={demo.profile.display_name}
                      showFavourite={false}
                      demoExample
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
