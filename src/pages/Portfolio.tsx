import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { TagBadge } from '@/components/TagBadge';
import { ReviewList } from '@/components/ReviewList';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { Star, Award, MessageCircle, ExternalLink, Share2, ArrowUpRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { parseWorkLinksJson } from '@/lib/socialLinks';
import { FreelancerPublicHeader } from '@/components/FreelancerPublicHeader';

const Portfolio = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [student, setStudent] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [portfolioItems, setPortfolioItems] = useState<any[]>([]);
  const [completedGigs, setCompletedGigs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [currentUserType, setCurrentUserType] = useState<string | null>(null);

  useEffect(() => {
    if (userId) loadPortfolio();
  }, [userId]);

  const loadPortfolio = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user || null);

    if (session?.user) {
      const { data: myProf } = await supabase.from('profiles').select('user_type').eq('user_id', session.user.id).maybeSingle();
      setCurrentUserType(myProf?.user_type || null);
    }

    const [{ data: sp }, { data: prof }, { data: revs }, { data: badges }, { data: items }, { data: gigs }] = await Promise.all([
      supabase.from('student_profiles').select('*').eq('user_id', userId!).maybeSingle(),
      supabase.from('profiles').select('*').eq('user_id', userId!).maybeSingle(),
      supabase.from('reviews').select('*').eq('reviewee_id', userId!).order('created_at', { ascending: false }),
      supabase.from('student_achievements').select('*').eq('user_id', userId!),
      supabase.from('portfolio_items').select('*').eq('user_id', userId!).order('created_at', { ascending: false }),
      supabase.from('job_applications').select('id').eq('student_id', userId!).eq('status', 'accepted'),
    ]);

    setStudent(sp);
    setProfile(prof);
    setAchievements(badges || []);
    setPortfolioItems(items || []);
    setCompletedGigs(gigs?.length || 0);

    if (revs && revs.length > 0) {
      const reviewerIds = revs.map((r) => r.reviewer_id);
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', reviewerIds);
      setReviews(revs.map((r) => ({
        ...r,
        reviewerName: profiles?.find((p) => p.user_id === r.reviewer_id)?.display_name || 'Anonymous',
      })));
    }

    setLoading(false);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: 'Link copied!' });
  };

  const handleMessage = async () => {
    if (!user || !userId) return;
    if (currentUserType === 'student' && profile?.user_type === 'business') {
      toast({ title: 'Not allowed', description: 'You can only message businesses through their gig listings.', variant: 'destructive' });
      return;
    }
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_1.eq.${user.id},participant_2.eq.${userId}),and(participant_1.eq.${userId},participant_2.eq.${user.id})`)
      .maybeSingle();
    if (existing) { navigate('/messages'); return; }
    await supabase.from('conversations').insert({ participant_1: user.id, participant_2: userId });
    navigate('/messages');
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!student || !profile) return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 pt-24 text-center">
        <h1 className="text-2xl font-bold mb-4">Profile Not Found</h1>
        <button onClick={() => navigate('/students')} className="text-primary hover:underline">Browse Freelancers</button>
      </div>
    </div>
  );

  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;

  const badgeIcons: Record<string, string> = {
    'first_shift': '🎉', 'five_shifts': '⭐', 'ten_shifts': '🔥',
    'twenty_shifts': '💎', 'five_star': '🌟', 'reliable': '✅',
  };

  const onlineWorkLinks = parseWorkLinksJson(student?.work_links);
  const tiktokPublic = student?.tiktok_url?.trim() || '';

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead title={`${profile.display_name || 'Freelancer'} – Portfolio – VANO`} description={student.bio?.substring(0, 160) || 'Freelancer portfolio on VANO'} />
      <Navbar />
      <div className="mx-auto max-w-4xl space-y-5 px-3 sm:px-4 md:px-8 pt-20 sm:pt-24 pb-12 sm:pb-16">
        <FreelancerPublicHeader
          displayName={profile.display_name || 'Freelancer'}
          bannerUrl={student.banner_url}
          avatarUrl={student.avatar_url}
          isAvailable={student.is_available}
          serviceArea={student.service_area}
          hourlyRate={student.hourly_rate}
          typicalBudgetMin={student.typical_budget_min}
          typicalBudgetMax={student.typical_budget_max}
          avgRating={avgRating || undefined}
          reviewCount={reviews.length}
          bio={student.bio || undefined}
          footnote={completedGigs > 0 ? `${completedGigs} gig${completedGigs === 1 ? '' : 's'} completed on VANO` : null}
          actionRow={
            <>
              {user && user.id !== userId && !(currentUserType === 'student' && profile?.user_type === 'business') && (
                <button
                  type="button"
                  onClick={handleMessage}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-semibold shadow-sm transition-colors hover:bg-secondary/80 sm:w-auto sm:min-w-[9rem] sm:px-6"
                >
                  <MessageCircle size={18} strokeWidth={2} /> Message
                </button>
              )}
              <button
                type="button"
                onClick={handleShare}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary/30 py-3 text-sm font-semibold transition-colors hover:bg-secondary/50 sm:w-auto sm:px-6"
              >
                <Share2 size={18} strokeWidth={2} /> Share page
              </button>
            </>
          }
        />

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Gigs Done', value: completedGigs },
            { label: 'Reviews', value: reviews.length },
            { label: 'Rating', value: avgRating || '—' },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Skills */}
        {student.skills?.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-6 mb-6">
            <h2 className="text-sm font-semibold mb-3">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {student.skills.map((skill: string) => <TagBadge key={skill} tag={skill} />)}
            </div>
          </div>
        )}

        {(tiktokPublic || onlineWorkLinks.length > 0) && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Work online</p>
            <h2 className="mt-1 text-base font-semibold">Links &amp; social</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {tiktokPublic && (
                <a
                  href={tiktokPublic}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/25 px-4 py-3.5 transition-all hover:border-primary/35 hover:bg-secondary/40"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                    <ExternalLink size={16} className="shrink-0 text-primary" />
                    TikTok
                  </span>
                  <ArrowUpRight size={16} className="shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </a>
              )}
              {onlineWorkLinks.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/25 px-4 py-3.5 transition-all hover:border-primary/35 hover:bg-secondary/40"
                >
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

        {/* Achievements */}
        {achievements.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-6 mb-6">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Award size={16} className="text-primary" /> Achievements</h2>
            <div className="flex flex-wrap gap-2">
              {achievements.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary rounded-xl text-sm font-medium">
                  {badgeIcons[a.badge_key] || '🏅'} {a.badge_label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Portfolio */}
        {portfolioItems.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-6 mb-6">
            <h2 className="text-sm font-semibold mb-4">Portfolio</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {portfolioItems.map((item) => (
                <div key={item.id} className="border border-border rounded-xl overflow-hidden">
                  {item.image_url && (
                    <img src={item.image_url} alt={item.title} className="w-full h-48 object-cover" />
                  )}
                  <div className="p-4">
                    <h3 className="font-semibold text-sm">{item.title}</h3>
                    {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reviews */}
        <div className="mt-6">
          <ReviewList reviews={reviews} />
        </div>
      </div>
    </div>
  );
};

export default Portfolio;
