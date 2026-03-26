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
          <div className="rounded-2xl border border-foreground/10 bg-card/80 px-6 py-16 text-center shadow-sm backdrop-blur-[2px]">
            <p className="font-medium text-foreground">Nothing in {boardTitle} yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {isStudent
                ? 'Be the first to list your services in this board.'
                : 'Check back soon, or browse another board.'}
            </p>
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
