import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { TagBadge } from '@/components/TagBadge';
import { ReviewList } from '@/components/ReviewList';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { Star, Award, MessageCircle, Briefcase, ExternalLink, ArrowUpRight, Share2, Check, Tag, CheckCircle2, BookOpen, ArrowRight, ShieldCheck, Lock, X, ChevronLeft, ChevronRight, MessageSquareQuote, Zap } from 'lucide-react';
import { QuoteModal } from '@/components/QuoteModal';
import { HireNowModal } from '@/components/HireNowModal';
import { useToast } from '@/hooks/use-toast';
import { ModBadge } from '@/components/ModBadge';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { parseWorkLinksJson } from '@/lib/socialLinks';
import { FreelancerPublicHeader } from '@/components/FreelancerPublicHeader';
import { cn } from '@/lib/utils';
import { nameToSlug } from '@/lib/slugify';
import { getSiteOrigin } from '@/lib/siteUrl';
import { computeProfilePercent, computeProfileTier } from '@/lib/profileCompleteness';

const StudentProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [student, setStudent] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [completedJobs, setCompletedJobs] = useState<any[]>([]);
  const [portfolioItems, setPortfolioItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [currentUserType, setCurrentUserType] = useState<string | null>(null);
  const [communityPost, setCommunityPost] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'about' | 'portfolio' | 'reviews'>('about');
  const tabRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [hireOpen, setHireOpen] = useState(false);

  const scrollToTab = useCallback((tab: 'about' | 'portfolio' | 'reviews') => {
    setActiveTab(tab);
    setTimeout(() => tabRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, []);
  const profileIsAdmin = useIsAdmin(id);

  useEffect(() => {
    if (id) loadAll();
  }, [id]);

  const loadAll = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user || null);

    // Fetch current user's profile type
    if (session?.user) {
      const { data: myProf } = await supabase.from('profiles').select('user_type').eq('user_id', session.user.id).maybeSingle();
      setCurrentUserType(myProf?.user_type || null);
    }

    const [{ data: prof }, { data: sp }, { data: revs }, { data: badges }, { data: items }, { data: post }] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', id!).maybeSingle(),
      supabase.from('student_profiles').select('*').eq('user_id', id!).maybeSingle(),
      supabase.from('reviews').select('*').eq('reviewee_id', id!).order('created_at', { ascending: false }),
      supabase.from('student_achievements').select('*').eq('user_id', id!),
      supabase.from('portfolio_items').select('*').eq('user_id', id!).order('created_at', { ascending: false }),
      supabase.from('community_posts').select('title, description, category').eq('user_id', id!).eq('moderation_status', 'approved').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    setProfile(prof);
    setStudent(sp);
    setCommunityPost(post);
    setAchievements(badges || []);
    setPortfolioItems(items || []);

    // Load completed jobs (posted by this user if business, or applied by if student)
    if (prof?.user_type === 'business') {
      const { data: jobs } = await supabase.from('jobs').select('id, title, shift_date, tags, status').eq('posted_by', id!).order('created_at', { ascending: false }).limit(10);
      setCompletedJobs(jobs || []);
    } else if (sp) {
      const { data: apps } = await supabase.from('job_applications').select('job_id, status').eq('student_id', id!).eq('status', 'accepted');
      if (apps && apps.length > 0) {
        const jobIds = apps.map(a => a.job_id);
        const { data: jobs } = await supabase.from('jobs').select('id, title, shift_date, tags, status').in('id', jobIds).order('shift_date', { ascending: false });
        setCompletedJobs(jobs || []);
      }
    }

    if (revs && revs.length > 0) {
      const reviewerIds = revs.map((r) => r.reviewer_id);
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', reviewerIds);
      const enrichedReviews = revs.map((r) => ({
        ...r,
        reviewerName: profiles?.find((p) => p.user_id === r.reviewer_id)?.display_name || 'Anonymous',
      }));
      setReviews(enrichedReviews);


    }

    setLoading(false);
  };

  const handleMessage = async () => {
    if (!user || !id) return;
    if (currentUserType === 'student' && profile?.user_type === 'business') {
      toast({ title: 'Not allowed', description: 'You can only message businesses through their gig listings.', variant: 'destructive' });
      return;
    }
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_1.eq.${user.id},participant_2.eq.${id}),and(participant_1.eq.${id},participant_2.eq.${user.id})`)
      .maybeSingle();
    if (existing) { navigate('/messages'); return; }
    await supabase.from('conversations').insert({ participant_1: user.id, participant_2: id });
    navigate('/messages');
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  if (!profile) return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 pt-24 text-center">
        <h1 className="text-2xl font-bold mb-4">Profile Not Found</h1>
        <button onClick={() => navigate('/students')} className="text-primary hover:underline">Browse Profiles</button>
      </div>
    </div>
  );

  const isBusiness = profile.user_type === 'business';
  const avatarUrl = profile.avatar_url;
  const displayName = profile.display_name || (isBusiness ? 'Client' : 'Freelancer');
  const bioText = isBusiness ? profile.bio : student?.bio;
  const workDesc = profile.work_description;
  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;

  // Shareable vanity URL
  const profileSlug = nameToSlug(displayName);
  const shareUrl = `${getSiteOrigin()}/u/${profileSlug}`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${displayName} on VANO`, url: shareUrl });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const badgeIcons: Record<string, string> = {
    'first_shift': '🎉', 'five_shifts': '⭐', 'ten_shifts': '🔥',
    'twenty_shifts': '💎', 'five_star': '🌟', 'reliable': '✅',
  };

  const categoryLabels: Record<string, string> = {
    videography: 'Videography',
    photography: 'Photography',
    websites: 'Web & Design',
    social_media: 'Social Media',
  };
  const categoryLabel = communityPost?.category ? categoryLabels[communityPost.category] : null;

  const onlineWorkLinks = !isBusiness && student ? parseWorkLinksJson(student.work_links) : [];
  const tiktokPublic = !isBusiness ? student?.tiktok_url?.trim() : '';

  // Freelancer-profile action buttons.
  // - Viewer is NOT the freelancer themselves AND profile is a freelancer:
  //     Primary: "Ask for a quote" (low-commitment, opens QuoteModal)
  //     Secondary: "Hire now" (instant hire with 2hr timer, opens HireNowModal)
  // - Viewer is signed out: "Sign in to hire" that preserves intent.
  // - Viewer is the freelancer themselves (own profile): show "Full portfolio" only.
  const viewerIsOwner = user?.id === id;
  const canTakeHireAction = !isBusiness && !viewerIsOwner;
  // Students viewing other students shouldn't see "hire"; only businesses or logged-out guests.
  const showHireActions =
    canTakeHireAction && (!user || currentUserType !== 'student' || profile?.user_type === 'business');

  const freelancerActions = (
    <>
      {showHireActions && !user && (
        <a
          href={`/auth?intent=quote&freelancer=${id}`}
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary/92 sm:w-auto sm:min-w-[11rem] sm:px-6 flex items-center justify-center gap-2"
        >
          <MessageSquareQuote size={18} strokeWidth={2} /> Sign in to hire
        </a>
      )}
      {showHireActions && user && (
        <>
          <button
            type="button"
            onClick={() => setQuoteOpen(true)}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary/92 sm:w-auto sm:min-w-[11rem] sm:px-6 flex items-center justify-center gap-2"
          >
            <MessageSquareQuote size={18} strokeWidth={2} /> Ask for a quote
          </button>
          <button
            type="button"
            onClick={() => setHireOpen(true)}
            className="w-full rounded-xl border border-amber-500/50 bg-amber-500/10 py-3 text-sm font-semibold text-amber-700 dark:text-amber-300 shadow-sm transition-colors hover:bg-amber-500/15 sm:w-auto sm:min-w-[10rem] sm:px-6 flex items-center justify-center gap-2"
          >
            <Zap size={18} strokeWidth={2} /> Hire now
          </button>
        </>
      )}
      {/* Keep the plain "Message" button available when hire actions don't apply
          (e.g. freelancer viewing a business, business viewing business) */}
      {!showHireActions && user && !viewerIsOwner && !(currentUserType === 'student' && profile?.user_type === 'business') && (
        <button
          type="button"
          onClick={handleMessage}
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary/92 sm:w-auto sm:min-w-[9rem] sm:px-6 flex items-center justify-center gap-2"
        >
          <MessageCircle size={18} strokeWidth={2} /> Message
        </button>
      )}
      {!isBusiness && (
        <button
          type="button"
          onClick={() => scrollToTab('portfolio')}
          className="w-full rounded-xl border border-border bg-card py-3 text-sm font-semibold shadow-sm transition-colors hover:bg-secondary/80 sm:w-auto sm:min-w-[10rem] sm:px-6 flex items-center justify-center gap-2"
        >
          Full portfolio
        </button>
      )}
    </>
  );

  // Sticky mobile hire bar — always-visible primary actions on small screens
  // so a hirer never has to scroll back up to the hero CTAs. Mirrors the
  // same state/handlers used in the inline hero action row.
  const stickyMobileBar = !isBusiness && showHireActions && !viewerIsOwner && (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-3 py-2.5 shadow-[0_-6px_20px_-12px_rgba(0,0,0,0.25)] backdrop-blur-md sm:hidden"
      style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {!user ? (
        <a
          href={`/auth?intent=quote&freelancer=${id}`}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary/92"
        >
          <MessageSquareQuote size={16} strokeWidth={2} /> Sign in to hire
        </a>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setQuoteOpen(true)}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary/92"
          >
            <MessageSquareQuote size={16} strokeWidth={2} /> Message
          </button>
          <button
            type="button"
            onClick={() => setHireOpen(true)}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-500/50 bg-amber-500/10 text-sm font-semibold text-amber-700 dark:text-amber-300 transition-colors hover:bg-amber-500/15"
          >
            <Zap size={16} strokeWidth={2} /> Hire now
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-background pb-28 sm:pb-16 md:pb-0">
      <SEOHead
        title={!isBusiness
          ? `${displayName} — ${student?.skills?.[0] ?? 'Freelancer'} in Galway`
          : `${displayName} — Hiring on VANO`}
        description={(() => {
          if (isBusiness) return bioText?.substring(0, 160) || `${displayName} is hiring on VANO — Galway's student freelancer platform.`;
          const skills = (student?.skills || []).slice(0, 4).join(', ');
          const rate = student?.hourly_rate ? `€${student.hourly_rate}/hr. ` : '';
          const avail = student?.is_available ? 'Available now. ' : '';
          return `${avail}${rate}${skills ? `Skills: ${skills}. ` : ''}${bioText ? bioText.substring(0, 100) : `Find ${displayName} on VANO, Galway's freelancer platform.`}`;
        })()}
        keywords={[
          displayName,
          ...(student?.skills || []).slice(0, 6),
          'Galway', 'freelancer', 'VANO', student?.university || '',
        ].filter(Boolean).join(', ')}
        image={avatarUrl || undefined}
        url={shareUrl}
      />
      <Navbar />
      <div className="mx-auto max-w-3xl px-3 sm:px-4 md:px-8 pt-20 sm:pt-24 pb-12 sm:pb-16 space-y-5 animate-fade-in">
        {isBusiness ? (
          <div className="rounded-2xl border border-foreground/6 bg-card p-6 md:p-8 shadow-tinted">
            <div className="flex items-start gap-5 mb-5">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover shrink-0" />
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-3xl sm:text-4xl shrink-0">
                  {displayName[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold">{displayName}</h1>
                  {profileIsAdmin && <ModBadge />}
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground">Account</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2 flex-wrap">
                  {avgRating && (
                    <span className="flex items-center gap-1">
                      <Star size={14} className="text-yellow-500 fill-yellow-500" /> {avgRating} ({reviews.length})
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mb-6">
              {!user ? (
                <a
                  href="/auth"
                  className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors flex items-center justify-center gap-2"
                >
                  <MessageCircle size={16} /> Sign in to message
                </a>
              ) : user.id !== id && !(currentUserType === 'student' && profile?.user_type === 'business') && (
                <button
                  type="button"
                  onClick={handleMessage}
                  className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors flex items-center justify-center gap-2"
                >
                  <MessageCircle size={16} /> Message
                </button>
              )}
            </div>
            {bioText && (
              <div className="mb-5">
                <h2 className="text-sm font-semibold mb-2">About me</h2>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{bioText}</p>
              </div>
            )}
            {achievements.length > 0 && (
              <div className="mb-5">
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Award size={16} className="text-primary" /> Achievements
                </h2>
                <div className="flex flex-wrap gap-2">
                  {achievements.map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary rounded-xl text-sm font-medium">
                      {badgeIcons[a.badge_key] || '🏅'} {a.badge_label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : student ? (
          <>
            <FreelancerPublicHeader
              displayName={displayName}
              nameAccessory={
                <>
                  {profileIsAdmin && <ModBadge />}
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-secondary-foreground ring-1 ring-border/80">
                    Freelancer
                  </span>
                  {categoryLabel && (
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary ring-1 ring-primary/20">
                      {categoryLabel}
                    </span>
                  )}
                  {/* Quality-tier badge — only shown for 100% profiles.
                      Gold for "top" (100% + 5+ reviews), emerald tick for
                      "verified" (100%, fewer reviews). Never punishes new
                      freelancers with a negative badge. */}
                  {(() => {
                    const percent = computeProfilePercent({
                      displayName: profile?.display_name,
                      avatarUrl: profile?.avatar_url,
                      bio: student?.bio,
                      bannerUrl: student?.banner_url,
                      phone: student?.phone,
                      university: student?.university,
                      skills: student?.skills,
                      portfolioCount: portfolioItems.length,
                    });
                    const tier = computeProfileTier(percent, reviews.length);
                    if (tier === 'top') {
                      return (
                        <span
                          title={`Top profile · ${reviews.length}+ reviews and a complete profile`}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-950 shadow-sm ring-1 ring-amber-500/50"
                        >
                          <Award size={11} strokeWidth={2.5} /> Top profile
                        </span>
                      );
                    }
                    if (tier === 'verified') {
                      return (
                        <span
                          title="Verified by Vano · complete profile"
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30"
                        >
                          <CheckCircle2 size={11} strokeWidth={2.5} /> Verified by Vano
                        </span>
                      );
                    }
                    return null;
                  })()}
                  <button
                    type="button"
                    onClick={handleShare}
                    title="Copy profile link"
                    className="ml-1 inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-semibold text-foreground/70 shadow-sm transition-colors hover:border-foreground/20 hover:text-foreground"
                  >
                    {copied ? <Check size={11} className="text-emerald-500" /> : <Share2 size={11} />}
                    {copied ? 'Copied!' : 'Share'}
                  </button>
                </>
              }
              bannerUrl={student.banner_url}
              avatarUrl={avatarUrl}
              isAvailable={student.is_available}
              serviceArea={student.service_area}
              hourlyRate={student.hourly_rate}
              typicalBudgetMin={student.typical_budget_min}
              typicalBudgetMax={student.typical_budget_max}
              avgRating={avgRating || undefined}
              reviewCount={reviews.length}
              bio={bioText}
              subtitle={communityPost?.title || null}
              university={student?.university}
              actionRow={freelancerActions}
            />

            {/* Stats row — foxpop style */}
            <div className="rounded-2xl border border-foreground/6 bg-card shadow-tinted overflow-hidden">
              <div className="grid grid-cols-3 divide-x divide-border">
                {[
                  { label: reviews.length === 1 ? 'review' : 'reviews', value: avgRating ?? reviews.length.toString(), sub: avgRating ? `★ (${reviews.length} reviews)` : null },
                  { label: 'Gigs done', value: completedJobs.length.toString(), sub: null },
                  { label: 'Skills', value: (student?.skills?.length || 0).toString(), sub: null },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="flex flex-col items-center justify-center gap-0.5 py-5 px-2">
                    <span className="text-2xl font-bold tabular-nums text-foreground">{value}</span>
                    {sub ? (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">{sub}</span>
                    ) : (
                      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
                    )}
                  </div>
                ))}
              </div>
              {/* Trust bar */}
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border bg-emerald-500/5 px-4 py-2.5">
                {student?.student_verified && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <ShieldCheck size={13} className="text-emerald-500" />
                    Student Verified
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  <Lock size={11} className="text-emerald-500" />
                  Secure Messaging
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  <Check size={11} className="text-emerald-500" />
                  VANO Community
                </span>
              </div>
            </div>

            {/* What I do — surfaced above tabs */}
            {communityPost?.description && (
              <div className="rounded-2xl border border-foreground/6 bg-card p-5 sm:p-6 shadow-tinted">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Briefcase size={14} className="text-primary/70" />What I do
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{communityPost.description}</p>
              </div>
            )}

            {/* Portfolio grid — visible without tapping tab */}
            {portfolioItems.some((i) => i.image_url) && (
              <div className="rounded-2xl border border-foreground/6 bg-card shadow-tinted overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-5 sm:px-6 sm:pt-6">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">Portfolio</h2>
                  <button
                    type="button"
                    onClick={() => scrollToTab('portfolio')}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    View all <ArrowRight size={12} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 p-4 sm:p-5">
                  {portfolioItems.filter((i) => i.image_url).slice(0, 6).map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLightboxIndex(idx)}
                      className="group relative overflow-hidden rounded-xl bg-muted aspect-square transition-all hover:shadow-md active:scale-[0.98]"
                    >
                      <img src={item.image_url} alt={item.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                      <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/30 flex items-end">
                        <div className="translate-y-full group-hover:translate-y-0 transition-transform duration-200 w-full p-2.5 bg-gradient-to-t from-black/70 to-transparent">
                          <p className="text-xs font-semibold text-white truncate">{item.title}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Review snippets — visible without tapping tab */}
            {reviews.length > 0 && (
              <div className="rounded-2xl border border-foreground/6 bg-card p-5 sm:p-6 shadow-tinted">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Star size={14} className="fill-amber-400 text-amber-400" />
                    {avgRating} · {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
                  </h2>
                  <button
                    type="button"
                    onClick={() => scrollToTab('reviews')}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    See all <ArrowRight size={12} />
                  </button>
                </div>
                <div className="space-y-3">
                  {reviews.slice(0, 2).map((review) => (
                    <div key={review.id} className="rounded-xl bg-secondary/50 p-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star key={star} size={11} className={review.rating >= star ? 'fill-primary text-primary' : 'text-muted-foreground/30'} />
                          ))}
                        </div>
                        <span className="text-xs font-medium text-foreground">{review.reviewerName || 'Anonymous'}</span>
                      </div>
                      {review.comment && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{review.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab switcher */}
            <div ref={tabRef} className="rounded-2xl border border-foreground/6 bg-card shadow-tinted overflow-hidden">
              <div className="p-1.5 border-b border-border/60">
                <div className="flex gap-1">
                  {(['about', 'portfolio', 'reviews'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        'flex-1 rounded-xl py-2 text-xs sm:text-sm font-semibold transition-all',
                        activeTab === tab
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      )}
                    >
                      {tab === 'reviews' && reviews.length > 0 ? `Reviews (${reviews.length})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* About tab */}
              {activeTab === 'about' && (
                <div className="p-5 sm:p-6 space-y-5">
                  {bioText && (
                    <div>
                      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><BookOpen size={14} className="text-primary/70" />About</h2>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{bioText}</p>
                    </div>
                  )}
                  {workDesc && (
                    <div>
                      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Briefcase size={14} className="text-primary/70" />Work experience</h2>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{workDesc}</p>
                    </div>
                  )}
                  {student?.skills?.length > 0 && (
                    <div>
                      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2"><Tag size={14} className="text-primary/70" />Skills</h2>
                      <div className="flex flex-wrap gap-2">
                        {student.skills.map((skill: string) => (
                          <TagBadge key={skill} tag={skill} />
                        ))}
                      </div>
                    </div>
                  )}
                  {achievements.length > 0 && (
                    <div>
                      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
                        <Award size={16} className="text-primary" /> Achievements
                      </h2>
                      <div className="flex flex-wrap gap-2">
                        {achievements.map((a) => (
                          <span key={a.id} className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-secondary/40 px-3 py-1.5 text-sm font-medium">
                            {badgeIcons[a.badge_key] || '🏅'} {a.badge_label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(tiktokPublic || onlineWorkLinks.length > 0) && (
                    <div>
                      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3"><ExternalLink size={14} className="text-primary/70" />Links &amp; social proof</h2>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {tiktokPublic && (
                          <a href={tiktokPublic} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/25 px-4 py-3.5 transition-all hover:border-primary/35 hover:bg-secondary/40">
                            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                              <ExternalLink size={16} className="shrink-0 text-primary" />
                              <span className="truncate">TikTok</span>
                            </span>
                            <ArrowUpRight size={16} className="shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                          </a>
                        )}
                        {onlineWorkLinks.map((link) => (
                          <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/25 px-4 py-3.5 transition-all hover:border-primary/35 hover:bg-secondary/40">
                            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                              <ExternalLink size={16} className="shrink-0 text-primary" />
                              <span className="truncate">{link.label || 'Past work'}</span>
                            </span>
                            <ArrowUpRight size={16} className="shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {!bioText && !workDesc && student?.skills?.length === 0 && achievements.length === 0 && !tiktokPublic && onlineWorkLinks.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nothing added yet — check back soon.</p>
                  )}
                </div>
              )}

              {/* Portfolio tab */}
              {activeTab === 'portfolio' && (
                <div className="p-5 sm:p-6">
                  {portfolioItems.length > 0 ? (
                    <>
                      <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        {portfolioItems.map((item, idx) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setLightboxIndex(idx)}
                            className="group relative overflow-hidden rounded-xl bg-muted aspect-square transition-all hover:shadow-md active:scale-[0.98]"
                          >
                            {item.image_url ? (
                              <>
                                <img src={item.image_url} alt={item.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                                <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/30 flex items-end">
                                  <div className="translate-y-full group-hover:translate-y-0 transition-transform duration-200 w-full p-2.5 bg-gradient-to-t from-black/70 to-transparent">
                                    <p className="text-xs font-semibold text-white truncate">{item.title}</p>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="h-full w-full flex items-center justify-center bg-muted">
                                <p className="text-xs text-muted-foreground px-2 text-center">{item.title}</p>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="mt-4 w-full rounded-xl border border-border py-2.5 text-sm font-semibold transition-colors hover:bg-secondary/50"
                      >
                        Back to top
                      </button>
                    </>
                  ) : (
                    <div className="py-8 text-center">
                      <p className="text-sm font-medium text-foreground">No portfolio items yet</p>
                      <p className="mt-1 text-xs text-muted-foreground">Ask them to share samples of their work in chat.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Reviews tab */}
              {activeTab === 'reviews' && (
                <div className="p-5 sm:p-6">
                  {reviews.length > 0 && (
                    <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">What clients say</h2>
                  )}
                  {reviews.length > 0 ? (
                    <ReviewList reviews={reviews} />
                  ) : (
                    <div className="py-8 text-center">
                      <p className="text-sm font-medium text-foreground">No reviews yet</p>
                      <p className="mt-1 text-xs text-muted-foreground">Reviews appear here after completed gigs.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Gigs done (visible on all tabs, below the tab card) */}
            {completedJobs.length > 0 && (
              <div className="rounded-2xl border border-foreground/6 bg-card p-6 shadow-tinted">
                <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Briefcase size={16} className="text-primary" /> Gigs Completed
                </h2>
                <div className="space-y-3">
                  {completedJobs.map((job) => (
                    <button
                      key={job.id}
                      onClick={() => navigate(`/jobs/${job.id}`)}
                      className="w-full flex items-center justify-between p-3 border border-border rounded-xl hover:border-primary/20 transition-colors text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{job.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {job.shift_date && <span className="text-xs text-muted-foreground">{new Date(job.shift_date).toLocaleDateString()}</span>}
                          {job.tags?.slice(0, 2).map((t: string) => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-md bg-secondary text-secondary-foreground">{t}</span>
                          ))}
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${job.status === 'completed' ? 'bg-primary/10 text-primary' : 'bg-secondary text-secondary-foreground'}`}>
                        {job.status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Portfolio lightbox */}
            {lightboxIndex !== null && (() => {
              const imageItems = portfolioItems.filter((i) => i.image_url);
              const item = imageItems[lightboxIndex];
              if (!item) return null;
              return (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
                  onClick={() => setLightboxIndex(null)}
                >
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(null)}
                    className="absolute right-3 top-3 sm:right-4 sm:top-4 flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                  >
                    <X size={18} />
                  </button>
                  {lightboxIndex > 0 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                    >
                      <ChevronLeft size={22} />
                    </button>
                  )}
                  {lightboxIndex < imageItems.length - 1 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                    >
                      <ChevronRight size={22} />
                    </button>
                  )}
                  <div className="max-h-[90vh] max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full max-h-[75vh] object-contain rounded-xl"
                    />
                    <div className="mt-3 text-center">
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      {item.description && <p className="mt-1 text-xs text-white/60">{item.description}</p>}
                      <p className="mt-2 text-[11px] text-white/40">{lightboxIndex + 1} / {imageItems.length}</p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
            <p className="text-sm font-medium text-foreground">Freelancer profile isn&apos;t finished yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">They may still be completing their VANO setup.</p>
          </div>
        )}

        {/* Business gigs posted (only for business accounts — freelancer data is in tabs) */}
        {isBusiness && completedJobs.length > 0 && (
          <div className="rounded-2xl border border-foreground/6 bg-card p-6 shadow-tinted">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Briefcase size={16} className="text-primary" /> Gigs Posted
            </h2>
            <div className="space-y-3">
              {completedJobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="w-full flex items-center justify-between p-3 border border-border rounded-xl hover:border-primary/20 transition-colors text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{job.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {job.shift_date && <span className="text-xs text-muted-foreground">{new Date(job.shift_date).toLocaleDateString()}</span>}
                      {job.tags?.slice(0, 2).map((t: string) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-md bg-secondary text-secondary-foreground">{t}</span>
                      ))}
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${job.status === 'completed' ? 'bg-primary/10 text-primary' : 'bg-secondary text-secondary-foreground'}`}>
                    {job.status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Business reviews */}
        {isBusiness && reviews.length > 0 && (
          <div>
            <ReviewList reviews={reviews} />
          </div>
        )}
      </div>

      {/* Hire-flow modals — only mounted for freelancer profiles */}
      {!isBusiness && id && (
        <>
          <QuoteModal
            open={quoteOpen}
            onOpenChange={setQuoteOpen}
            freelancerId={id}
            freelancerName={displayName}
            category={categoryLabel}
          />
          <HireNowModal
            open={hireOpen}
            onOpenChange={setHireOpen}
            freelancerId={id}
            freelancerName={displayName}
            category={categoryLabel}
          />
        </>
      )}

      {stickyMobileBar}
    </div>
  );
};

export default StudentProfile;
