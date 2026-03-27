import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { CommunityPostCard } from '@/components/CommunityPostCard';
import { useToast } from '@/hooks/use-toast';
import {
  COMMUNITY_CATEGORY_ORDER,
  COMMUNITY_CATEGORIES,
  isCommunityCategoryId,
  type CommunityCategoryId,
} from '@/lib/communityCategories';
import { cn } from '@/lib/utils';
import { ensureAutoStudentVerificationFromEmail } from '@/lib/studentVerification';

const ATU_AVATAR = 'https://ui-avatars.com/api/?background=F47920&color=fff&bold=true&size=256';

const DEMO_POSTS: Record<CommunityCategoryId, {
  post: { id: string; user_id: string; title: string; description: string; image_url: null; likes_count: number; created_at: string; rate_min: number; rate_max: number; rate_unit: string };
  profile: { display_name: string; avatar_url: string; user_type: string };
  studentProfile: { skills: string[]; hourly_rate: number; is_available: boolean; university: string; tiktok_url: string; work_links: { url: string; label: string }[] };
  portfolioPreview: { id: string; image_url: null; title: string }[];
}> = {
  videographer: {
    post: {
      id: 'demo-video',
      user_id: 'demo-video-user',
      title: 'Wedding, event & reel filming — Galway & surrounding areas',
      description: `Hi, I'm Cian — a final-year media production student at ATU Galway. I film and edit weddings, corporate events, promo videos, and short-form reels.\n\nI use a Sony A7IV with prime lenses and a DJI Mini 4 Pro drone. Turnaround is 5–7 days for full edits. Happy to travel within Connacht.\n\nDrop me a message and I'll send over my full showreel.`,
      image_url: null,
      likes_count: 14,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      rate_min: 120,
      rate_max: 350,
      rate_unit: 'day',
    },
    profile: {
      display_name: 'Cian Murphy',
      avatar_url: `${ATU_AVATAR}&name=CM`,
      user_type: 'student',
    },
    studentProfile: {
      skills: ['Video Editing', 'Drone Filming', 'Wedding Films', 'Event Coverage', 'Reels', 'Premiere Pro', 'DaVinci Resolve', 'Colour Grading'],
      hourly_rate: 35,
      is_available: true,
      university: 'ATU',
      tiktok_url: 'https://www.tiktok.com/@cianmurphy.film',
      work_links: [
        { url: 'https://cianmurphy.ie', label: 'Portfolio site' },
        { url: 'https://instagram.com/cianmurphy.film', label: 'Instagram' },
        { url: 'https://vimeo.com/cianmurphy', label: 'Vimeo showreel' },
      ],
    },
    portfolioPreview: [
      { id: 'p1', image_url: null, title: 'Galway wedding highlight reel' },
      { id: 'p2', image_url: null, title: 'ATU Grad Ball 2025' },
      { id: 'p3', image_url: null, title: 'Promo video — local café' },
    ],
  },
  websites: {
    post: {
      id: 'demo-web',
      user_id: 'demo-web-user',
      title: 'Custom websites & landing pages — fast, mobile-first builds',
      description: `Hey, I'm Aoife — a software development student at ATU. I build clean, fast websites for small businesses, freelancers, and startups.\n\nI work in React / Next.js and can handle everything from a simple landing page to a full e-commerce store. I also do redesigns if you already have a site that needs freshening up.\n\nFree 30-min consultation before we start. Check out my portfolio below.`,
      image_url: null,
      likes_count: 22,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
      rate_min: 300,
      rate_max: 1200,
      rate_unit: 'project',
    },
    profile: {
      display_name: 'Aoife Walsh',
      avatar_url: `${ATU_AVATAR}&name=AW`,
      user_type: 'student',
    },
    studentProfile: {
      skills: ['React', 'Next.js', 'Tailwind CSS', 'Figma', 'TypeScript', 'SEO', 'Shopify', 'UI/UX Design'],
      hourly_rate: 40,
      is_available: true,
      university: 'ATU',
      tiktok_url: null,
      work_links: [
        { url: 'https://aoifewalsh.dev', label: 'Portfolio' },
        { url: 'https://github.com/aoifewalsh', label: 'GitHub' },
        { url: 'https://dribbble.com/aoifewalsh', label: 'Dribbble designs' },
      ],
    },
    portfolioPreview: [
      { id: 'p4', image_url: null, title: 'Restaurant booking site' },
      { id: 'p5', image_url: null, title: 'Fitness coach landing page' },
      { id: 'p6', image_url: null, title: 'E-commerce — Galway gift shop' },
    ],
  },
  social_media: {
    post: {
      id: 'demo-social',
      user_id: 'demo-social-user',
      title: 'Social media management & content creation — Instagram, TikTok & LinkedIn',
      description: `I'm Darragh — a marketing student at ATU with 2 years running social accounts for local businesses. I handle content planning, shooting, editing, posting, and monthly analytics reports.\n\nI can manage Instagram, TikTok, or LinkedIn — or all three. Packages start from a set number of posts per week. I also do one-off content days if you just need a bank of content shot and edited.\n\nCheck my own pages to see what I produce.`,
      image_url: null,
      likes_count: 31,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
      rate_min: 200,
      rate_max: 600,
      rate_unit: 'month',
    },
    profile: {
      display_name: 'Darragh Ryan',
      avatar_url: `${ATU_AVATAR}&name=DR`,
      user_type: 'student',
    },
    studentProfile: {
      skills: ['Instagram', 'TikTok', 'Content Strategy', 'Reels Editing', 'Copywriting', 'Analytics', 'CapCut', 'Canva'],
      hourly_rate: 30,
      is_available: true,
      university: 'ATU',
      tiktok_url: 'https://www.tiktok.com/@darraghryan.social',
      work_links: [
        { url: 'https://instagram.com/darraghryan.social', label: 'Instagram' },
        { url: 'https://linkedin.com/in/darraghryan', label: 'LinkedIn' },
      ],
    },
    portfolioPreview: [
      { id: 'p7', image_url: null, title: 'Galway café — 3× follower growth' },
      { id: 'p8', image_url: null, title: 'Gym reels package' },
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
          'user_id, skills, hourly_rate, is_available, university, tiktok_url, work_links, student_verified, community_board_status',
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
        if (!sp?.student_verified) return false;
        if (sp.community_board_status === 'rejected') return false;
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

  /** Logged-in freelancers must verify a student email before using the app (including Community). */
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      await ensureAutoStudentVerificationFromEmail(session);
      const { data: prof } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (prof?.user_type !== 'student') return;
      const { data: sp } = await supabase
        .from('student_profiles')
        .select('student_verified')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (sp?.student_verified) return;
      navigate('/verify-student', { replace: true });
    })();
  }, [user, navigate]);

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
              <strong>Profile → Get listed</strong>. Your card is reviewed before it appears here. Hiring accounts cannot
              post on this board.
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
            {posts.map(post => (
              <CommunityPostCard
                key={post.id}
                post={post}
                profile={profiles[post.user_id] || null}
                studentProfile={studentProfiles[post.user_id] || null}
                portfolioPreview={portfolioByUser[post.user_id] || []}
                currentUserId={user?.id || null}
                currentUserType={currentUserType}
                isLiked={likedPostIds.has(post.id)}
                isAdmin={isAdmin}
                onLikeToggle={handleLikeToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

export default Community;
