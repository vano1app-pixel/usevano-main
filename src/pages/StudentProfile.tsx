import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { TagBadge } from '@/components/TagBadge';
import { ReviewList } from '@/components/ReviewList';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { Star, Award, MessageCircle, Briefcase, MapPin, Sparkles, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ModBadge } from '@/components/ModBadge';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { parseWorkLinksJson } from '@/lib/socialLinks';

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
  const [aiSummary, setAiSummary] = useState<string>('');
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

    const [{ data: prof }, { data: sp }, { data: revs }, { data: badges }, { data: items }] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', id!).maybeSingle(),
      supabase.from('student_profiles').select('*').eq('user_id', id!).maybeSingle(),
      supabase.from('reviews').select('*').eq('reviewee_id', id!).order('created_at', { ascending: false }),
      supabase.from('student_achievements').select('*').eq('user_id', id!),
      supabase.from('portfolio_items').select('*').eq('user_id', id!).order('created_at', { ascending: false }),
    ]);

    setProfile(prof);
    setStudent(sp);
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

      // Generate AI summary if 3+ reviews
      if (revs.length >= 3) {
        try {
          const { data: summaryData } = await supabase.functions.invoke('ai-review-summary', {
            body: { reviews: revs.map(r => ({ rating: r.rating, comment: r.comment })) },
          });
          if (summaryData?.summary) setAiSummary(summaryData.summary);
        } catch { /* silently fail */ }
      }
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
  const avatarUrl = isBusiness ? profile.avatar_url : (student?.avatar_url || profile.avatar_url);
  const displayName = profile.display_name || (isBusiness ? 'Client' : 'Freelancer');
  const bioText = isBusiness ? profile.bio : student?.bio;
  const workDesc = profile.work_description;
  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;

  const badgeIcons: Record<string, string> = {
    'first_shift': '🎉', 'five_shifts': '⭐', 'ten_shifts': '🔥',
    'twenty_shifts': '💎', 'five_star': '🌟', 'reliable': '✅',
  };

  const onlineWorkLinks = !isBusiness && student ? parseWorkLinksJson(student.work_links) : [];
  const tiktokPublic = !isBusiness ? student?.tiktok_url?.trim() : '';

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead title={`${displayName} – VANO`} description={bioText?.substring(0, 160) || `${displayName} on VANO`} />
      <Navbar />
      <div className="max-w-3xl mx-auto px-3 sm:px-4 md:px-8 pt-20 sm:pt-24 pb-12 sm:pb-16">
        {/* Profile header card */}
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8">
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
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground">
                  {isBusiness ? 'Account' : 'Freelancer'}
                </span>
                {!isBusiness && student?.is_available && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">Available</span>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2 flex-wrap">
                <span className="flex items-center gap-1"><MapPin size={14} /> Galway, Ireland</span>
                {!isBusiness && student?.hourly_rate > 0 && <span className="font-semibold text-primary">€{student.hourly_rate}/hr</span>}
                {avgRating && (
                  <span className="flex items-center gap-1"><Star size={14} className="text-yellow-500 fill-yellow-500" /> {avgRating} ({reviews.length})</span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 mb-6">
            {user && user.id !== id && !(currentUserType === 'student' && profile?.user_type === 'business') && (
              <button onClick={handleMessage} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition-colors flex items-center justify-center gap-2">
                <MessageCircle size={16} /> Message
              </button>
            )}
            {!isBusiness && (
              <button onClick={() => navigate(`/portfolio/${id}`)} className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                View Full Portfolio
              </button>
            )}
          </div>

          {!isBusiness && (tiktokPublic || onlineWorkLinks.length > 0) && (
            <div className="mb-6 rounded-xl border border-border bg-secondary/20 p-4">
              <h2 className="text-sm font-semibold mb-3">TikTok &amp; past work online</h2>
              <ul className="flex flex-col gap-2">
                {tiktokPublic && (
                  <li>
                    <a
                      href={tiktokPublic}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    >
                      <ExternalLink size={14} className="shrink-0" />
                      TikTok profile
                    </a>
                  </li>
                )}
                {onlineWorkLinks.map((link) => (
                  <li key={link.url}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    >
                      <ExternalLink size={14} className="shrink-0" />
                      <span className="min-w-0">{link.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* About me / about */}
          {bioText && (
            <div className="mb-5">
              <h2 className="text-sm font-semibold mb-2">{isBusiness ? 'About me' : 'About'}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{bioText}</p>
            </div>
          )}

          {/* Work experience — freelancers only (account profiles use About me + gig locations) */}
          {workDesc && !isBusiness && (
            <div className="mb-5">
              <h2 className="text-sm font-semibold mb-2">Work experience</h2>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{workDesc}</p>
            </div>
          )}

          {/* Skills (freelancers) */}
          {!isBusiness && student?.skills?.length > 0 && (
            <div className="mb-5">
              <h2 className="text-sm font-semibold mb-2">Skills</h2>
              <div className="flex flex-wrap gap-2">
                {student.skills.map((skill: string) => <TagBadge key={skill} tag={skill} />)}
              </div>
            </div>
          )}

          {/* Achievements */}
          {achievements.length > 0 && (
            <div className="mb-5">
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
        </div>

        {/* Portfolio items */}
        {portfolioItems.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-6 mt-4">
            <h2 className="text-sm font-semibold mb-4">Portfolio</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {portfolioItems.map((item) => (
                <div key={item.id} className="border border-border rounded-xl overflow-hidden">
                  {item.image_url && <img src={item.image_url} alt={item.title} className="w-full h-40 object-cover" />}
                  <div className="p-3">
                    <h3 className="font-semibold text-sm">{item.title}</h3>
                    {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Previous work / gigs */}
        {completedJobs.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-6 mt-4">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Briefcase size={16} className="text-primary" />
              {isBusiness ? 'Gigs Posted' : 'Gigs Completed'}
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
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    job.status === 'completed' ? 'bg-primary/10 text-primary' : 'bg-secondary text-secondary-foreground'
                  }`}>
                    {job.status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Reviews */}
        {reviews.length > 0 && (
          <div className="mt-4">
            {aiSummary && (
              <div className="flex items-center gap-2 mb-3 px-1">
                <Sparkles size={14} className="text-primary shrink-0" />
                <p className="text-sm font-medium text-muted-foreground italic">"{aiSummary}"</p>
              </div>
            )}
            <ReviewList reviews={reviews} />
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentProfile;
