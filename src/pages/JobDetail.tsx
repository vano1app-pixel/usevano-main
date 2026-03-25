import React, { useState, useEffect } from 'react';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { TagBadge } from '@/components/TagBadge';
import { ReviewForm } from '@/components/ReviewForm';
import { ReviewList } from '@/components/ReviewList';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { MapPin, Clock, ArrowLeft, MessageCircle, Wifi, Building2, Flame, Sparkles, Loader2 } from 'lucide-react';
import { formatJobScheduleDetail } from '@/lib/jobSchedule';
import { useToast } from '@/hooks/use-toast';

const JobDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState('');
  const [hasApplied, setHasApplied] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [poster, setPoster] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);

  useEffect(() => {
    fetchJob();
    checkUser();
    loadReviews();
  }, [id]);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user || null);
    if (session?.user && id) {
      const { data } = await supabase
        .from('job_applications')
        .select('id')
        .eq('job_id', id)
        .eq('student_id', session.user.id)
        .maybeSingle();
      setHasApplied(!!data);

      const { data: reviewData } = await supabase
        .from('reviews')
        .select('id')
        .eq('job_id', id)
        .eq('reviewer_id', session.user.id)
        .maybeSingle();
      setHasReviewed(!!reviewData);
    }
  };

  const fetchJob = async () => {
    if (!id) return;
    const { data, error } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
    if (error || !data) { setLoading(false); return; }
    setJob(data);
    const { data: p } = await supabase.from('profiles').select('display_name, avatar_url').eq('user_id', data.posted_by).maybeSingle();
    setPoster(p || null);
    setLoading(false);
  };

  const loadReviews = async () => {
    if (!id) return;
    const { data } = await supabase.from('reviews').select('*').eq('job_id', id).order('created_at', { ascending: false });
    if (data && data.length > 0) {
      const reviewerIds = data.map((r) => r.reviewer_id);
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', reviewerIds);
      const enriched = data.map((r) => ({
        ...r,
        reviewerName: profiles?.find((p) => p.user_id === r.reviewer_id)?.display_name || 'Anonymous',
      }));
      setReviews(enriched);
    } else {
      setReviews([]);
    }
  };

  const handleApply = async () => {
    if (!user) { toast({ title: 'Please sign in to apply', variant: 'destructive' }); return; }
    setApplying(true);
    const { error } = await supabase.from('job_applications').insert({
      job_id: id!,
      student_id: user.id,
      message,
    });
    if (error) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } else {
      toast({ title: 'Applied!', description: 'Your application has been sent.' });
      setHasApplied(true);
    }
    setApplying(false);
  };

  const handleMessagePoster = async () => {
    if (!user || !job) return;
    // Check for existing conversation
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('job_id', job.id)
      .or(`and(participant_1.eq.${user.id},participant_2.eq.${job.posted_by}),and(participant_1.eq.${job.posted_by},participant_2.eq.${user.id})`)
      .maybeSingle();

    if (existing) {
      navigate(`/messages`);
      return;
    }

    // Create new conversation
    const { data: newConvo, error } = await supabase.from('conversations').insert({
      job_id: job.id,
      participant_1: user.id,
      participant_2: job.posted_by,
    }).select('id').single();

    if (error) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } else {
      navigate(`/messages`);
    }
  };

  // Determine if shift is in the past (for review eligibility)
  const isShiftPast = job ? new Date(job.shift_date) < new Date() : false;
  const canReview = user && isShiftPast && !hasReviewed && job && user.id !== job.posted_by;

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  if (!job) return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 pt-24 text-center">
        <h1 className="text-2xl font-bold mb-4">Job Not Found</h1>
        <button onClick={() => navigate('/jobs')} className="text-primary hover:underline">Browse Gigs</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead title={`${job.title} – VANO`} description={job.description?.substring(0, 160)} />
      <Navbar />
      <div className="max-w-3xl mx-auto px-3 sm:px-4 md:px-8 pt-20 sm:pt-24 pb-12 sm:pb-16">
        <button onClick={() => navigate('/jobs')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
          <ArrowLeft size={16} /> Back to Gigs
        </button>

        <div className={`bg-card border overflow-hidden rounded-xl sm:rounded-2xl ${job.is_urgent ? 'border-destructive/40' : 'border-border'}`}>
          {poster && (
            <div className="flex items-center gap-3 border-b border-border/80 bg-muted/25 px-4 py-3 sm:px-6">
              {poster.avatar_url ? (
                <img src={poster.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-background" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 text-sm font-semibold ring-2 ring-background">
                  {(poster.display_name || 'C')[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{poster.display_name || 'Client'}</p>
                <p className="text-xs text-muted-foreground">Posted this gig</p>
              </div>
            </div>
          )}
          <div className="p-4 sm:p-6 md:p-8">
          {job.is_urgent && (
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive mb-4">
              <Flame size={16} className="fill-destructive" /> Urgent — Needed ASAP
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">{job.title}</h1>
            <span className="text-lg sm:text-xl font-bold text-primary whitespace-nowrap">
              {(job as any).payment_type === 'fixed'
                ? `€${(job as any).fixed_price ?? 0} total`
                : `€${job.hourly_rate}/hr`}
            </span>
          </div>

          <div className="flex flex-col gap-2 mb-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><MapPin size={16} /> {job.location || 'Remote'}</div>
            <div className="flex items-center gap-2"><Clock size={16} /> {formatJobScheduleDetail(job)}</div>
            <div className="flex items-center gap-2">
              {job.work_type === 'remote' ? <Wifi size={16} /> : <Building2 size={16} />}
              <span className="capitalize">{job.work_type || 'on-site'}</span>
            </div>
          </div>

          {job.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {job.tags.map((tag: string) => <TagBadge key={tag} tag={tag} />)}
            </div>
          )}

          {job.description && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-foreground mb-2">Description</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{job.description}</p>
            </div>
          )}

          {/* Message poster button */}
          {user && user.id !== job.posted_by && (
            <button
              onClick={handleMessagePoster}
              className="w-full py-2.5 mb-4 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-2"
            >
              <MessageCircle size={16} /> Message Poster
            </button>
          )}

          {/* Apply section */}
          {hasApplied ? (
            <div className="bg-primary/10 text-primary rounded-xl p-4 text-center text-sm font-medium">
              ✓ You've already applied to this gig
            </div>
          ) : user?.id !== job.posted_by ? (
            <div className="border-t border-border pt-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold">Apply for this gig</h2>
                <button
                  type="button"
                  onClick={async () => {
                    setGeneratingCover(true);
                    try {
                      const { data: sp } = await supabase.from('student_profiles').select('bio, skills').eq('user_id', user.id).maybeSingle();
                      const { data, error } = await supabase.functions.invoke('ai-cover-letter', {
                        body: { jobTitle: job.title, jobDescription: job.description, jobTags: job.tags, studentSkills: sp?.skills, studentBio: sp?.bio },
                      });
                      if (error) throw error;
                      if (data?.message) setMessage(data.message);
                    } catch (err: any) {
                      toast({ title: 'Error', description: err?.message || 'Failed to generate', variant: 'destructive' });
                    } finally {
                      setGeneratingCover(false);
                    }
                  }}
                  disabled={generatingCover}
                  className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {generatingCover ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {generatingCover ? 'Writing...' : '✨ Write with AI'}
                </button>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a message (optional)..."
                className="w-full border border-input rounded-xl p-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring mb-4 min-h-[80px] resize-none"
              />
              <button
                onClick={handleApply}
                disabled={applying}
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {applying ? 'Applying...' : 'Apply Now'}
              </button>
            </div>
          ) : null}
          </div>
        </div>

        {/* Reviews section */}
        <div className="mt-6 space-y-4">
          {canReview && (
            <ReviewForm
              jobId={job.id}
              revieweeId={job.posted_by}
              reviewerId={user.id}
              onReviewSubmitted={() => { loadReviews(); setHasReviewed(true); }}
            />
          )}
          <ReviewList reviews={reviews} />
        </div>
      </div>
    </div>
  );
};

export default JobDetail;
