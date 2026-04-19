import React, { useState, useEffect } from 'react';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { TagBadge } from '@/components/TagBadge';
import { ReviewForm } from '@/components/ReviewForm';
import { ReviewList } from '@/components/ReviewList';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { jobPostingSchema } from '@/lib/structuredData';
import { getCanonicalUrl } from '@/lib/siteUrl';
import { MapPin, Clock, ArrowLeft, MessageCircle, Flame, Trash2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [closingGig, setClosingGig] = useState(false);

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

  const handleCloseGig = async () => {
    if (!job) return;
    setClosingGig(true);
    const { error } = await supabase.from('jobs').update({ status: 'closed' }).eq('id', job.id);
    if (error) {
      toast({ title: 'Could not close gig', description: getUserFriendlyError(error), variant: 'destructive' });
    } else {
      setJob({ ...job, status: 'closed' });
      toast({ title: 'Gig closed', description: 'It is no longer visible to applicants.' });
    }
    setClosingGig(false);
  };

  const handleDeleteGig = async () => {
    if (!job) return;
    const { error } = await supabase.from('jobs').delete().eq('id', job.id);
    if (error) {
      toast({ title: 'Could not delete gig', description: getUserFriendlyError(error), variant: 'destructive' });
    } else {
      toast({ title: 'Gig deleted' });
      navigate('/hire');
    }
  };

  // Determine if shift is in the past (for review eligibility)
  const isShiftPast = job ? new Date(job.shift_date) < new Date() : false;
  const canReview = user && isShiftPast && !hasReviewed && job && user.id !== job.posted_by;

  if (loading) return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading gig…</p>
      </div>
    </div>
  );
  if (!job) return (
    <div className="min-h-[100dvh] bg-background">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 pt-24 text-center">
        <h1 className="text-2xl font-bold mb-4">Job Not Found</h1>
        <button onClick={() => navigate('/hire')} className="text-primary hover:underline">Browse Hiring</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-background pb-16 md:pb-0">
      <SEOHead
        title={`${job.title} — Galway gig on VANO`}
        description={(job.description || `Apply for ${job.title} on VANO — local freelance gig in Galway.`).substring(0, 160)}
        keywords={`${job.title}, galway gig, freelance galway, ${job.is_urgent ? 'urgent gig galway, ' : ''}vano jobs`}
        jsonLd={jobPostingSchema({
          title: job.title,
          description: job.description || job.title,
          datePosted: job.created_at,
          validThrough: job.shift_date,
          hiringOrgName: poster?.display_name || null,
          url: getCanonicalUrl(),
          budget: job.hourly_rate ?? null,
          budgetCurrency: 'EUR',
          employmentType: 'CONTRACTOR',
        })}
      />
      <Navbar />
      <div className="max-w-3xl mx-auto px-3 sm:px-4 md:px-8 pt-20 sm:pt-24 pb-12 sm:pb-16">
        <button onClick={() => navigate('/hire')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors">
          <ArrowLeft size={16} /> Back to Hiring
        </button>

        <div className={`bg-card border overflow-hidden rounded-xl sm:rounded-2xl ${job.is_urgent ? 'border-destructive/40' : 'border-border'}`}>
          {poster && (
            <div className="flex items-center gap-3 border-b border-foreground/6 bg-muted/25 px-4 py-3 sm:px-6">
              {poster.avatar_url ? (
                <img src={poster.avatar_url} alt={poster.display_name || 'Client'} className="h-10 w-10 rounded-full object-cover ring-2 ring-background" />
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
            <div className="flex items-center gap-2"><MapPin size={16} /> {job.location || 'Location TBC'}</div>
            <div className="flex items-center gap-2"><Clock size={16} /> {formatJobScheduleDetail(job)}</div>
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

          {/* Poster controls */}
          {user?.id === job.posted_by && (
            <div className="mb-6 flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-4 sm:flex-row">
              <p className="flex-1 text-xs text-muted-foreground self-center">This is your gig.</p>
              {job.status === 'open' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg gap-1.5"
                  disabled={closingGig}
                  onClick={handleCloseGig}
                >
                  <XCircle size={15} />
                  {closingGig ? 'Closing…' : 'Close gig'}
                </Button>
              )}
              {job.status === 'closed' && (
                <span className="text-xs font-medium text-muted-foreground self-center">Gig is closed</span>
              )}
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="rounded-lg gap-1.5"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 size={15} />
                Delete gig
              </Button>
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
          ) : !user ? (
            <div className="border-t border-border pt-6">
              <a
                href="/auth"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Sign in to apply
              </a>
              <p className="mt-2 text-center text-xs text-muted-foreground">Create a free account to apply for gigs</p>
            </div>
          ) : user.id !== job.posted_by ? (
            <div className="border-t border-border pt-6">
              <div className="mb-3">
                <h2 className="text-base font-semibold">Apply for this gig</h2>
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
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {applying && <Loader2 size={16} className="animate-spin" />}
                {applying ? 'Applying…' : 'Apply Now'}
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

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this gig?</DialogTitle>
            <DialogDescription>This permanently removes the gig and all its applications. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" className="flex-1 rounded-xl" onClick={() => { setDeleteConfirmOpen(false); handleDeleteGig(); }}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JobDetail;
