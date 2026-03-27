import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { CommunityPostCard, type SimilarPost } from '@/components/CommunityPostCard';
import { useToast } from '@/hooks/use-toast';
import {
  COMMUNITY_CATEGORY_ORDER,
  COMMUNITY_CATEGORIES,
  isCommunityCategoryId,
  type CommunityCategoryId,
} from '@/lib/communityCategories';
import { cn } from '@/lib/utils';


const ATU_AVATAR = (initials: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=F47920&color=fff&bold=true&size=256&rounded=false`;

const DEMO_POSTS: Record<CommunityCategoryId, {
  post: { id: string; user_id: string; title: string; description: string; image_url: null; likes_count: number; created_at: string; rate_min: number; rate_max: number; rate_unit: string };
  profile: { display_name: string; avatar_url: string; user_type: string };
  studentProfile: { skills: string[]; hourly_rate: number; is_available: boolean; university: string; tiktok_url: string | null; work_links: { url: string; label: string }[] };
  portfolioPreview: { id: string; image_url: null; title: string }[];
}> = {
  videographer: {
    post: {
      id: 'demo-video',
      user_id: 'demo-video-user',
      title: 'Wedding, event & promo filming — Galway & Connacht',
      description: `Hi, I'm Cian — a final-year Media Production student at ATU Galway. I specialise in weddings, corporate events, brand promos, and short-form content for social.\n\nKit: Sony A7 IV with a set of prime lenses, DJI RS 3 gimbal, and a DJI Mini 4 Pro drone. I shoot LOG and colour grade in DaVinci Resolve for a clean, cinematic look.\n\nTurnaround is 5–7 working days for a full edit. I include one round of revision and deliver in any format you need. Happy to travel within Connacht — fuel costs apply outside Galway city.\n\nDrop me a message with your date and what you have in mind — I'll come back to you within a few hours.`,
      image_url: null,
      likes_count: 47,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      rate_min: 150,
      rate_max: 450,
      rate_unit: 'day',
    },
    profile: {
      display_name: 'Cian Murphy',
      avatar_url: ATU_AVATAR('Cian Murphy'),
      user_type: 'student',
    },
    studentProfile: {
      skills: ['Video Editing', 'Drone Filming', 'Wedding Films', 'Event Coverage', 'Short-form Reels', 'Premiere Pro', 'DaVinci Resolve', 'Colour Grading', 'Corporate Video', 'Instagram Reels'],
      hourly_rate: 45,
      is_available: true,
      university: 'ATU',
      tiktok_url: 'https://www.tiktok.com/@cianmurphy.film',
      work_links: [
        { url: 'https://cianmurphy.ie', label: 'Portfolio — cianmurphy.ie' },
        { url: 'https://vimeo.com/cianmurphy', label: 'Vimeo showreel' },
        { url: 'https://instagram.com/cianmurphy.film', label: 'Instagram' },
        { url: 'https://youtube.com/@cianmurphyfilm', label: 'YouTube channel' },
      ],
    },
    portfolioPreview: [
      { id: 'p1', image_url: null, title: 'Galway wedding highlight film — 2025' },
      { id: 'p2', image_url: null, title: 'ATU Grad Ball 2025 recap' },
      { id: 'p3', image_url: null, title: 'Brand promo — local restaurant' },
      { id: 'p4', image_url: null, title: 'Drone reel — Connemara landscape' },
      { id: 'p5', image_url: null, title: 'Corporate event — Galway Chamber' },
      { id: 'p6', image_url: null, title: 'TikTok content pack — fashion brand' },
    ],
  },
  websites: {
    post: {
      id: 'demo-web',
      user_id: 'demo-web-user',
      title: 'Custom websites & web apps — fast, clean, mobile-first',
      description: `Hey, I'm Aoife — a final-year Software Development student at ATU Galway. I build polished, fast websites and web apps for small businesses, freelancers, and startups.\n\nI work mainly in React and Next.js with Tailwind CSS for styling, and I'm comfortable with Supabase, Stripe, and CMS integrations. Whether you need a landing page, a full e-commerce store, or a complete redesign of an existing site, I can handle it start to finish — design mockup in Figma through to live deployment.\n\nTypical project budgets range from €400 for a clean landing page up to €2,000+ for a full multi-page site with integrations. Free 30-minute discovery call before we start — no obligation.\n\nCheck my portfolio and GitHub below to see recent work.`,
      image_url: null,
      likes_count: 63,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
      rate_min: 400,
      rate_max: 2000,
      rate_unit: 'project',
    },
    profile: {
      display_name: 'Aoife Walsh',
      avatar_url: ATU_AVATAR('Aoife Walsh'),
      user_type: 'student',
    },
    studentProfile: {
      skills: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS', 'Figma', 'UI/UX Design', 'Supabase', 'Shopify', 'SEO', 'Framer Motion'],
      hourly_rate: 45,
      is_available: true,
      university: 'ATU',
      tiktok_url: null,
      work_links: [
        { url: 'https://aoifewalsh.dev', label: 'Portfolio — aoifewalsh.dev' },
        { url: 'https://github.com/aoifewalsh', label: 'GitHub' },
        { url: 'https://dribbble.com/aoifewalsh', label: 'Dribbble designs' },
        { url: 'https://linkedin.com/in/aoife-walsh-dev', label: 'LinkedIn' },
      ],
    },
    portfolioPreview: [
      { id: 'p4', image_url: null, title: 'Restaurant booking site — Next.js' },
      { id: 'p5', image_url: null, title: 'Fitness coach landing page' },
      { id: 'p6', image_url: null, title: 'E-commerce — Galway gift shop (Shopify)' },
      { id: 'p7', image_url: null, title: 'SaaS dashboard UI — Figma to code' },
      { id: 'p8', image_url: null, title: 'Salon booking app — React + Supabase' },
      { id: 'p9', image_url: null, title: 'Personal brand site — freelance photographer' },
    ],
  },
  social_media: {
    post: {
      id: 'demo-social',
      user_id: 'demo-social-user',
      title: 'Social media management & content creation — Instagram, TikTok & LinkedIn',
      description: `I'm Darragh — a final-year Marketing student at ATU with 2+ years managing social accounts for local businesses across Galway.\n\nI handle the full process: strategy, content calendar, shooting, editing, posting, and monthly analytics reports. I work across Instagram, TikTok, and LinkedIn — I can manage one or all three.\n\nMonthly packages are available for ongoing management. I also offer one-off content days if you just need a bank of photos and videos shot and edited ready to post. Content days usually result in 15–25 pieces of content depending on scope.\n\nRecent results: grew a Galway café from 800 to 4,200 followers in 4 months. Built a local gym's TikTok from zero to 12k views per reel average in 6 weeks.\n\nMessage me with your industry and goals — happy to have a quick call first.`,
      image_url: null,
      likes_count: 58,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
      rate_min: 250,
      rate_max: 700,
      rate_unit: 'project',
    },
    profile: {
      display_name: 'Darragh Ryan',
      avatar_url: ATU_AVATAR('Darragh Ryan'),
      user_type: 'student',
    },
    studentProfile: {
      skills: ['Instagram', 'TikTok', 'LinkedIn', 'Content Strategy', 'Reels Editing', 'Copywriting', 'Analytics & Reporting', 'CapCut', 'Canva', 'Content Planning'],
      hourly_rate: 35,
      is_available: true,
      university: 'ATU',
      tiktok_url: 'https://www.tiktok.com/@darraghryan.social',
      work_links: [
        { url: 'https://instagram.com/darraghryan.social', label: 'Instagram — @darraghryan.social' },
        { url: 'https://linkedin.com/in/darraghryan', label: 'LinkedIn' },
        { url: 'https://darraghryan.ie', label: 'Portfolio — darraghryan.ie' },
      ],
    },
    portfolioPreview: [
      { id: 'p7', image_url: null, title: 'Galway café — 800 → 4,200 followers' },
      { id: 'p8', image_url: null, title: 'Gym TikTok — 12k avg views/reel' },
      { id: 'p9', image_url: null, title: 'Monthly content pack — fashion brand' },
      { id: 'p10', image_url: null, title: 'LinkedIn strategy — B2B consultancy' },
      { id: 'p11', image_url: null, title: 'Instagram launch — new restaurant' },
    ],
  },
};

const Community = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const catParam = searchParams.get('cat');
  const activeCategory: CommunityCategoryId | null = isCommunityCategoryId(catParam) ? catParam : null;

  const [user, setUser] = useState<any>(null);
  const [currentUserType, setCurrentUserType] = useState<string | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [studentProfiles, setStudentProfiles] = useState<Record<string, any>>({});
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [portfolioByUser, setPortfolioByUser] = useState<
    Record<string, { id: string; image_url: string | null; title: string }[]>
  >({});

  const loadPosts = useCallback(async (category: CommunityCategoryId) => {
    const { data: { session } } = await supabase.auth.getSession();
    const currentUser = session?.user || null;
    setUser(currentUser);

    const { data: postsData } = await supabase
      .from('community_posts')
      .select('*')
      .eq('category', category)
      .eq('moderation_status', 'approved')
      .order('created_at', { ascending: false });

    const allPosts = postsData || [];

    const userIds = [...new Set(allPosts.map((p: any) => p.user_id))];
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, user_type')
        .in('user_id', userIds);
      const profileMap: Record<string, any> = {};
      (profs || []).forEach((p: any) => { profileMap[p.user_id] = p; });
      setProfiles(profileMap);

      const { data: sprofs } = await supabase
        .from('student_profiles')
        .select(
          'user_id, skills, hourly_rate, is_available, university, tiktok_url, work_links, community_board_status',
        )
        .in('user_id', userIds);
      const spMap: Record<string, any> = {};
      (sprofs || []).forEach((p: any) => { spMap[p.user_id] = p; });
      setStudentProfiles(spMap);

      const { data: pitems } = await supabase
        .from('portfolio_items')
        .select('user_id, id, image_url, title, created_at')
        .in('user_id', userIds);
      const grouped: Record<string, { id: string; image_url: string | null; title: string; created_at: string | null }[]> = {};
      for (const row of pitems || []) {
        if (!grouped[row.user_id]) grouped[row.user_id] = [];
        grouped[row.user_id].push(row);
      }
      const trimmed: Record<string, { id: string; image_url: string | null; title: string }[]> = {};
      for (const uid of Object.keys(grouped)) {
        const sorted = [...grouped[uid]].sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        trimmed[uid] = sorted.slice(0, 6).map(({ id, image_url, title }) => ({ id, image_url, title }));
      }
      setPortfolioByUser(trimmed);

      const visiblePosts = allPosts.filter((p: { user_id: string }) => {
        const prof = profileMap[p.user_id];
        if (!prof || prof.user_type !== 'student') return true;
        const sp = spMap[p.user_id];
        if (sp?.community_board_status === 'rejected') return false;
        return true;
      });
      setPosts(visiblePosts);
    } else {
      setProfiles({});
      setStudentProfiles({});
      setPortfolioByUser({});
      setPosts([]);
    }

    if (currentUser) {
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      setCurrentUserType(myProfile?.user_type || null);

      const { data: likes } = await supabase
        .from('community_post_likes')
        .select('post_id')
        .eq('user_id', currentUser.id);
      setLikedPostIds(new Set((likes || []).map((l: any) => l.post_id)));

      const { data: adminCheck } = await supabase.rpc('has_role', { _user_id: currentUser.id, _role: 'admin' });
      setIsAdmin(!!adminCheck);
    }

    setLoading(false);
  }, []);


  useEffect(() => {
    if (!activeCategory) {
      setLoading(false);
      setPosts([]);
      setProfiles({});
      setStudentProfiles({});
      setPortfolioByUser({});
      (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user || null);
        if (session?.user) {
          const { data: myProfile } = await supabase
            .from('profiles')
            .select('user_type')
            .eq('user_id', session.user.id)
            .maybeSingle();
          setCurrentUserType(myProfile?.user_type || null);
          const { data: adminCheck } = await supabase.rpc('has_role', { _user_id: session.user.id, _role: 'admin' });
          setIsAdmin(!!adminCheck);
        } else {
          setCurrentUserType(null);
          setIsAdmin(false);
        }
      })();
      return;
    }

    setLoading(true);
    loadPosts(activeCategory);
  }, [activeCategory, loadPosts]);

  const handleLikeToggle = (postId: string, liked: boolean) => {
    setLikedPostIds((prev) => {
      const next = new Set(prev);
      if (liked) next.add(postId);
      else next.delete(postId);
      return next;
    });
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, likes_count: p.likes_count + (liked ? 1 : -1) } : p
    ));
  };

  const handleDelete = async (postId: string) => {
    const { error } = await supabase.from('community_posts').delete().eq('id', postId);
    if (error) {
      toast({ title: 'Failed to delete', variant: 'destructive' });
    } else {
      setPosts(prev => prev.filter(p => p.id !== postId));
      toast({ title: 'Post deleted' });
    }
  };

  const isStudent = currentUserType === 'student';

  const goToCategory = (id: CommunityCategoryId) => {
    setSearchParams({ cat: id }, { replace: false });
  };

  const goToHub = () => {
    setSearchParams({}, { replace: false });
  };

  const boardTitle = activeCategory ? COMMUNITY_CATEGORIES[activeCategory].label : 'Community';
  const boardDescription = activeCategory
    ? COMMUNITY_CATEGORIES[activeCategory].description
    : 'Choose a board to see freelancers offering work in that space.';

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background pb-24 md:pb-12">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-30%,hsl(var(--foreground)/0.06),transparent_55%)] dark:bg-[radial-gradient(ellipse_100%_70%_at_50%_-25%,hsl(var(--primary)/0.08),transparent_50%)]"
        aria-hidden
      />
      <SEOHead
        title={activeCategory ? `${boardTitle} – Community · VANO` : 'Community – VANO'}
        description="Browse freelancer listings by specialty — videography, websites, or social media."
      />
      <Navbar />
      <div className="relative mx-auto max-w-xl px-4 pt-20 sm:max-w-2xl sm:pt-24 md:max-w-2xl md:px-8 lg:max-w-[42rem]">
        <header className="mb-9 sm:mb-11">
          {activeCategory && (
            <button
              type="button"
              onClick={goToHub}
              className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft size={16} strokeWidth={2} />
              All boards
            </button>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Talent board</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem] sm:leading-tight">
            {boardTitle}
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground sm:max-w-lg sm:text-base">
            {boardDescription}
          </p>
          {activeCategory && currentUserType === 'student' && (
            <p className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground/90">
              <span className="font-medium text-foreground">Freelancers:</span> list yourself from{' '}
              <strong>Profile → Get listed</strong> — your card goes live straight away.
            </p>
          )}
          {activeCategory && currentUserType === 'business' && (
            <p className="mt-4 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              This board is for freelancer listings only. Post gigs from <strong>Post a gig</strong> to hire talent.
            </p>
          )}
        </header>

        {!activeCategory ? (
          <div className="flex flex-col gap-3 sm:gap-4">
            <p className="text-sm text-muted-foreground">Where do you want to look?</p>
            {COMMUNITY_CATEGORY_ORDER.map((id) => {
              const item = COMMUNITY_CATEGORIES[id];
              const Icon = item.icon;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => goToCategory(id)}
                  className={cn(
                    'group flex w-full items-center gap-4 rounded-2xl border border-foreground/10 bg-card p-4 text-left shadow-sm transition-all',
                    'hover:border-foreground/20 hover:shadow-md active:scale-[0.99]',
                    'sm:p-5'
                  )}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground sm:h-14 sm:w-14">
                    <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-foreground sm:text-lg">{item.label}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </div>
        ) : loading ? (
          <div className="flex flex-col gap-6 sm:gap-7" aria-busy aria-label="Loading listings">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
              >
                <Skeleton className="h-28 w-full rounded-none sm:h-32" />
                <div className="space-y-3 p-4 sm:p-5">
                  <div className="flex gap-4">
                    <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2 pt-1">
                      <Skeleton className="h-4 w-40 max-w-[55%]" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-[88%]" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col gap-6 sm:gap-7">
            <div className="rounded-2xl border border-foreground/10 bg-card/80 px-5 py-4 text-center shadow-sm backdrop-blur-[2px]">
              <p className="text-sm font-medium text-foreground">No listings here yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isStudent ? 'Be the first — here\'s what a completed profile looks like:' : 'Check back soon. Here\'s an example of what freelancers look like:'}
              </p>
            </div>
            {activeCategory && DEMO_POSTS[activeCategory] && (() => {
              const demo = DEMO_POSTS[activeCategory];
              return (
                <div className="relative">
                  <div className="pointer-events-none absolute -inset-px rounded-2xl ring-2 ring-primary/30 z-10" />
                  <div className="absolute -top-3 left-4 z-20">
                    <span className="rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold text-primary-foreground">Example profile</span>
                  </div>
                  <CommunityPostCard
                    post={demo.post}
                    profile={demo.profile}
                    studentProfile={demo.studentProfile}
                    portfolioPreview={demo.portfolioPreview}
                    currentUserId={null}
                    currentUserType={null}
                    isLiked={false}
                    isAdmin={false}
                    onLikeToggle={() => {}}
                    onDelete={() => {}}
                  />
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="flex flex-col gap-6 sm:gap-7">
            {posts.map(post => {
              const similar: SimilarPost[] = posts
                .filter(p => p.id !== post.id)
                .slice(0, 4)
                .map(p => ({
                  post: { id: p.id, user_id: p.user_id, title: p.title, rate_min: p.rate_min, rate_max: p.rate_max, rate_unit: p.rate_unit },
                  profile: profiles[p.user_id] || null,
                  studentProfile: studentProfiles[p.user_id] || null,
                }));
              return (
                <CommunityPostCard
                  key={post.id}
                  post={post}
                  profile={profiles[post.user_id] || null}
                  studentProfile={studentProfiles[post.user_id] || null}
                  portfolioPreview={portfolioByUser[post.user_id] || []}
                  similarPosts={similar}
                  currentUserId={user?.id || null}
                  currentUserType={currentUserType}
                  isLiked={likedPostIds.has(post.id)}
                  isAdmin={isAdmin}
                  onLikeToggle={handleLikeToggle}
                  onDelete={handleDelete}
                />
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};

export default Community;
