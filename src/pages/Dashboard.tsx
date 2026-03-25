import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Briefcase, FileText, Clock, CheckCircle, XCircle, Star, TrendingUp, RefreshCw, Euro, Trash2, Ban, ExternalLink, X, Handshake, CreditCard, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { format, differenceInHours, parseISO } from 'date-fns';
import { ShiftCalendar } from '@/components/ShiftCalendar';
import { EarningsChart } from '@/components/EarningsChart';
import { StudentLeaderboard } from '@/components/StudentLeaderboard';
import { ApplicationTracker } from '@/components/ApplicationTracker';
import { AchievementShowcase } from '@/components/AchievementShowcase';
import { RecommendedJobs } from '@/components/RecommendedJobs';

import { useProfileCompletion } from '@/hooks/useProfileCompletion';

const Dashboard = () => {
  
  useProfileCompletion();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [dashBannerDismissed, setDashBannerDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [myJobs, setMyJobs] = useState<any[]>([]);
  const [myApplications, setMyApplications] = useState<any[]>([]);
  const [jobApplications, setJobApplications] = useState<Record<string, any[]>>({});
  const [applicantNames, setApplicantNames] = useState<Record<string, string>>({});
  const [reviews, setReviews] = useState<any[]>([]);
  const [revealedPayments, setRevealedPayments] = useState<Record<string, string>>({});
  const [showPaymentFor, setShowPaymentFor] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate('/auth'); return; }
    setUser(session.user);

    const { data: prof } = await supabase.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle();
    setProfile(prof);

    const { data: reviewData } = await supabase.from('reviews').select('*').eq('reviewee_id', session.user.id);
    setReviews(reviewData || []);

    if (prof?.user_type === 'business') {
      const { data: jobs } = await supabase.from('jobs').select('*').eq('posted_by', session.user.id).order('created_at', { ascending: false });
      setMyJobs(jobs || []);

      if (jobs && jobs.length > 0) {
        const jobIds = jobs.map((j) => j.id);
        const { data: apps } = await supabase.from('job_applications').select('*').in('job_id', jobIds);
        const grouped: Record<string, any[]> = {};
        const studentIds = new Set<string>();
        (apps || []).forEach((app) => {
          if (!grouped[app.job_id]) grouped[app.job_id] = [];
          grouped[app.job_id].push(app);
          studentIds.add(app.student_id);
        });
        setJobApplications(grouped);

        if (studentIds.size > 0) {
          const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', Array.from(studentIds));
          const names: Record<string, string> = {};
          (profiles || []).forEach((p) => { names[p.user_id] = p.display_name || 'Student'; });
          setApplicantNames(names);
        }
      }
    } else {
      const { data: apps } = await supabase.from('job_applications').select('*, jobs(*)').eq('student_id', session.user.id).order('applied_at', { ascending: false });
      setMyApplications(apps || []);
    }
    setLoading(false);
  };

  const updateApplicationStatus = async (appId: string, status: 'accepted' | 'rejected') => {
    const { error } = await supabase.from('job_applications').update({ status }).eq('id', appId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to update application status. Please try again.', variant: 'destructive' });
    } else {
      toast({ title: `Application ${status}` });
      loadDashboard();
    }
  };

  const closeJob = async (jobId: string) => {
    const { error } = await supabase.from('jobs').update({ status: 'closed' as any }).eq('id', jobId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to close job. Please try again.', variant: 'destructive' });
    } else {
      toast({ title: 'Gig closed' });
      loadDashboard();
    }
  };

  const completeJob = async (jobId: string) => {
    const { error } = await supabase.from('jobs').update({ status: 'completed' as any, completed_at: new Date().toISOString() }).eq('id', jobId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to mark gig as completed.', variant: 'destructive' });
    } else {
      toast({ title: 'Gig marked as completed! 🎉' });
      loadDashboard();
    }
  };

  const deleteJob = async (jobId: string) => {
    // Delete related applications first, then the job
    await supabase.from('job_applications').delete().eq('job_id', jobId);
    await supabase.from('saved_jobs').delete().eq('job_id', jobId);
    await supabase.from('reviews').delete().eq('job_id', jobId);
    const { error } = await supabase.from('jobs').delete().eq('id', jobId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to delete job. Please try again.', variant: 'destructive' });
    } else {
      toast({ title: 'Gig deleted' });
      loadDashboard();
    }
  };

  const handleRehire = (studentId: string) => {
    navigate(`/post-job?rehire=${studentId}`);
  };

  const confirmAgreement = async (appId: string, side: 'business' | 'student') => {
    const field = side === 'business' ? 'business_confirmed' : 'student_confirmed';
    const { error } = await supabase.from('job_applications').update({ [field]: true, confirmed_at: new Date().toISOString() } as any).eq('id', appId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to confirm agreement.', variant: 'destructive' });
    } else {
      toast({ title: 'Agreement confirmed! 🤝' });
      loadDashboard();
    }
  };

  const confirmPayment = async (appId: string) => {
    const { error } = await supabase.from('job_applications').update({ payment_confirmed: true, paid_at: new Date().toISOString() } as any).eq('id', appId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to confirm payment.', variant: 'destructive' });
    } else {
      toast({ title: 'Payment confirmed! 💰' });
      loadDashboard();
    }
  };

  const revealPaymentDetails = async (studentId: string, appId: string) => {
    const { data } = await supabase.from('student_profiles').select('payment_details').eq('user_id', studentId).maybeSingle();
    setRevealedPayments((prev) => ({ ...prev, [appId]: (data as any)?.payment_details || 'Not provided' }));
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading dashboard...</p>
      </div>
    </div>
  );

  const statusColor = (s: string) => {
    if (s === 'accepted') return 'text-primary';
    if (s === 'rejected') return 'text-destructive';
    return 'text-muted-foreground';
  };

  const statusBadge = (s: string) => {
    if (s === 'open') return 'bg-primary/10 text-primary';
    if (s === 'filled') return 'bg-accent text-accent-foreground';
    if (s === 'completed') return 'bg-green-100 text-green-700';
    return 'bg-muted text-muted-foreground';
  };

  const avgRating = reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : '—';
  const allApps = Object.values(jobApplications).flat();
  const acceptedApps = allApps.filter((a) => a.status === 'accepted');
  const acceptedStudentIds = [...new Set(acceptedApps.map((a) => a.student_id))];

  const acceptedStudentJobs = myApplications.filter((a) => a.status === 'accepted' && (a as any).jobs);
  const estimatedEarnings = acceptedStudentJobs.reduce((sum, a) => {
    const job = (a as any).jobs;
    if (!job) return sum;
    if (job.payment_type === 'fixed' && job.fixed_price != null) {
      return sum + Number(job.fixed_price);
    }
    if (!job.shift_start || !job.shift_end) {
      return sum + Math.max(0, Number(job.hourly_rate) || 0);
    }
    const hours = Math.max(1, differenceInHours(
      new Date(`2000-01-01T${job.shift_end}`),
      new Date(`2000-01-01T${job.shift_start}`)
    ));
    return sum + hours * job.hourly_rate;
  }, 0);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead title="Dashboard – VANO" description="Manage your jobs and applications on VANO." />
      <Navbar />
      <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-8 pt-20 sm:pt-24 pb-12 sm:pb-16">
        {/* Dev welcome card */}
        {!dashBannerDismissed && (
          <div className="mb-5 bg-primary/5 border border-primary/15 rounded-2xl p-4 sm:p-5 flex items-start gap-3">
            <span className="text-xl mt-0.5">🎉</span>
            <div className="flex-1 text-sm text-foreground/80 leading-relaxed">
              <span className="font-semibold text-foreground">VANO v1.0 is here!</span>{' '}
              <button onClick={() => navigate('/blog/vano-v1')} className="inline-flex items-center gap-1 text-primary font-semibold hover:underline">
                Read more <ArrowRight size={12} />
              </button>
            </div>
            <button onClick={() => setDashBannerDismissed(true)} className="p-1 rounded-lg hover:bg-foreground/5 text-foreground/40 hover:text-foreground/70 transition-colors shrink-0" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">
            Welcome back{profile?.display_name ? `, ${profile.display_name}` : ''} 👋
          </h1>
          <p className="text-muted-foreground">
            {profile?.user_type === 'business' ? 'Manage your posted gigs and applications' : 'Track your gig applications and earnings'}
          </p>
        </div>

        {profile?.user_type === 'business' ? (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3 mb-6 sm:mb-8">
              {[
                { icon: Briefcase, label: 'Gigs Posted', value: myJobs.length, color: 'text-primary' },
                { icon: FileText, label: 'Applications', value: allApps.length, color: 'text-primary' },
                { icon: Clock, label: 'Open Gigs', value: myJobs.filter((j) => j.status === 'open').length, color: 'text-primary' },
                { icon: CheckCircle, label: 'Completed', value: myJobs.filter((j) => j.status === 'completed').length, color: 'text-primary' },
                { icon: Star, label: 'Avg Rating', value: avgRating, color: 'text-primary' },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="bg-card border border-border rounded-xl sm:rounded-2xl p-3 sm:p-5 hover:border-primary/20 transition-colors">
                  <div className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground text-[10px] sm:text-xs font-medium mb-1.5 sm:mb-2 uppercase tracking-wider">
                    <Icon size={12} className={`${color} sm:w-[14px] sm:h-[14px]`} /> {label}
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold">{value}</p>
                </div>
              ))}
            </div>

            {/* Rehire suggestions */}
            {acceptedStudentIds.length > 0 && (
              <div className="bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-2xl p-6 mb-8">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><RefreshCw size={16} className="text-primary" /> Quick Rehire</h3>
                <p className="text-sm text-muted-foreground mb-4">Freelancers you've worked with before</p>
                <div className="flex flex-wrap gap-2">
                  {acceptedStudentIds.map((sid) => (
                    <button
                      key={sid}
                      onClick={() => handleRehire(sid)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-xl text-sm font-medium hover:border-primary/40 hover:shadow-sm transition-all"
                    >
                      <RefreshCw size={14} className="text-primary" />
                      {applicantNames[sid] || 'Student'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Calendar */}
            <div className="mb-8">
              <ShiftCalendar shifts={myJobs.map((j) => ({
                id: j.id,
                title: j.title,
                shift_date: j.shift_date,
                shift_start: j.shift_start,
                shift_end: j.shift_end,
                location: j.location,
                hourly_rate: j.hourly_rate,
                payment_type: j.payment_type,
                fixed_price: j.fixed_price,
              }))} />
            </div>

            {/* Student Leaderboard */}
            <div className="mb-8">
              <StudentLeaderboard />
            </div>

            {/* My Jobs */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold">My Gigs</h2>
              <button onClick={() => navigate('/post-job')} className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
                + Post New Gig
              </button>
            </div>

            {myJobs.length === 0 ? (
              <div className="text-center py-16 bg-card border border-border rounded-2xl">
                <Briefcase className="mx-auto text-muted-foreground mb-3" size={32} />
                <p className="text-muted-foreground mb-4">No gigs posted yet</p>
                <button onClick={() => navigate('/post-job')} className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90">Post Your First Gig</button>
              </div>
            ) : (
              <div className="space-y-4">
                {myJobs.map((job) => (
                  <div key={job.id} className="bg-card border border-border rounded-2xl p-6 hover:border-primary/15 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-lg">{job.title}</h3>
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusBadge(job.status)}`}>
                            {job.status}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{job.location} · €{job.hourly_rate}/hr · {format(new Date(job.shift_date), 'MMM d, yyyy')}</p>
                      </div>
                      <div className="flex items-center gap-1 ml-3 shrink-0">
                        <button
                          onClick={() => navigate(`/jobs/${job.id}`)}
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                          title="View job"
                        >
                          <ExternalLink size={16} />
                        </button>
                        {(job.status === 'open' || job.status === 'filled') && (
                          <button
                            onClick={() => completeJob(job.id)}
                            className="p-2 text-muted-foreground hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Mark as completed"
                          >
                            <CheckCircle size={16} />
                          </button>
                        )}
                        {job.status === 'open' && (
                          <button
                            onClick={() => closeJob(job.id)}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                            title="Close job"
                          >
                            <Ban size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (window.confirm('Are you sure you want to delete this job? This cannot be undone.')) {
                              deleteJob(job.id);
                            }
                          }}
                          className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-colors"
                          title="Delete job"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {jobApplications[job.id]?.length > 0 && (
                      <div className="border-t border-border pt-4 mt-4">
                        <p className="text-sm font-medium mb-3 text-muted-foreground">{jobApplications[job.id].length} application(s)</p>
                        <div className="space-y-2">
                          {jobApplications[job.id].map((app) => {
                            const bothConfirmed = app.business_confirmed && app.student_confirmed;
                            return (
                            <div key={app.id} className="bg-secondary/40 rounded-xl p-4">
                              <div className="flex items-center justify-between">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium">{applicantNames[app.student_id] || 'Student'}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{app.message || 'No message'}</p>
                                  <p className={`text-xs font-semibold mt-1 capitalize ${statusColor(app.status)}`}>{app.status}</p>
                                </div>
                                <div className="flex gap-1.5 ml-3 shrink-0">
                                  {app.status === 'pending' && (
                                    <>
                                      <button onClick={() => updateApplicationStatus(app.id, 'accepted')} className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Accept">
                                        <CheckCircle size={18} />
                                      </button>
                                      <button onClick={() => updateApplicationStatus(app.id, 'rejected')} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors" title="Reject">
                                        <XCircle size={18} />
                                      </button>
                                    </>
                                  )}
                                  {app.status === 'accepted' && (
                                    <button onClick={() => handleRehire(app.student_id)} className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Rehire">
                                      <RefreshCw size={16} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Agreement & Payment flow for accepted applications */}
                              {app.status === 'accepted' && (
                                <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                                  {/* Agreement status */}
                                  <div className="flex items-center gap-2 text-xs">
                                    <Handshake size={14} className={bothConfirmed ? 'text-primary' : 'text-muted-foreground'} />
                                    <span className="text-muted-foreground">
                                      You: {app.business_confirmed ? '✅ Confirmed' : '⏳ Pending'} · Student: {app.student_confirmed ? '✅ Confirmed' : '⏳ Pending'}
                                    </span>
                                  </div>

                                  {!app.business_confirmed && (
                                    <button
                                      onClick={() => confirmAgreement(app.id, 'business')}
                                      className="w-full py-2 bg-primary/10 text-primary text-xs font-medium rounded-lg hover:bg-primary/20 transition-colors flex items-center justify-center gap-1.5"
                                    >
                                      <Handshake size={14} /> Confirm Agreement
                                    </button>
                                  )}

                                  {/* Payment details - only shown after both confirm */}
                                  {bothConfirmed && (
                                    <div className="bg-card border border-primary/20 rounded-lg p-3">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-medium flex items-center gap-1.5">
                                          <CreditCard size={12} className="text-primary" /> Payment Details
                                        </span>
                                        {!revealedPayments[app.id] && (
                                          <button
                                            onClick={() => revealPaymentDetails(app.student_id, app.id)}
                                            className="text-xs text-primary hover:underline flex items-center gap-1"
                                          >
                                            <Eye size={12} /> Reveal
                                          </button>
                                        )}
                                      </div>
                                      {revealedPayments[app.id] ? (
                                        <div className="flex items-center gap-2">
                                          <p className={`text-sm font-mono ${showPaymentFor[app.id] ? '' : 'blur-sm select-none'}`}>
                                            {revealedPayments[app.id]}
                                          </p>
                                          <button onClick={() => setShowPaymentFor((prev) => ({ ...prev, [app.id]: !prev[app.id] }))} className="text-muted-foreground hover:text-foreground">
                                            {showPaymentFor[app.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                          </button>
                                        </div>
                                      ) : (
                                        <p className="text-xs text-muted-foreground">Click reveal to see the student's payment info</p>
                                      )}

                                      {!app.payment_confirmed && (
                                        <button
                                          onClick={() => confirmPayment(app.id)}
                                          className="mt-2 w-full py-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
                                        >
                                          <CheckCircle size={14} /> Mark as Paid
                                        </button>
                                      )}
                                      {app.payment_confirmed && (
                                        <p className="mt-2 text-xs text-primary font-medium flex items-center gap-1">
                                          <CheckCircle size={12} /> Paid ✓
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Student stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-6 sm:mb-8">
              {[
                { icon: FileText, label: 'Applied', value: myApplications.length },
                { icon: CheckCircle, label: 'Accepted', value: acceptedStudentJobs.length },
                { icon: Euro, label: 'Est. Earnings', value: `€${estimatedEarnings.toFixed(0)}` },
                { icon: Star, label: 'Avg Rating', value: avgRating },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="bg-card border border-border rounded-xl sm:rounded-2xl p-3 sm:p-5 hover:border-primary/20 transition-colors">
                  <div className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground text-[10px] sm:text-xs font-medium mb-1.5 sm:mb-2 uppercase tracking-wider">
                    <Icon size={12} className="text-primary sm:w-[14px] sm:h-[14px]" /> {label}
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold">{value}</p>
                </div>
              ))}
            </div>

            {/* AI Recommended Jobs */}
            {user && (
              <div className="mb-6 sm:mb-8">
                <RecommendedJobs userId={user.id} />
              </div>
            )}

            {/* Application Tracker (Kanban) */}
            <div className="mb-6 sm:mb-8">
              <ApplicationTracker applications={myApplications} />
            </div>

            {/* Achievements */}
            {user && (
              <div className="mb-6 sm:mb-8">
                <AchievementShowcase userId={user.id} triggerCheck={true} />
              </div>
            )}

            {/* Earnings Chart */}
            <div className="mb-6 sm:mb-8">
              <EarningsChart applications={myApplications} />
            </div>

            {/* Calendar */}
            <div className="mb-6 sm:mb-8">
              <ShiftCalendar shifts={myApplications
                .filter((a) => a.status === 'accepted' && (a as any).jobs)
                .map((a) => {
                  const job = (a as any).jobs;
                  return {
                    id: job.id,
                    title: job.title,
                    shift_date: job.shift_date,
                    shift_start: job.shift_start,
                    shift_end: job.shift_end,
                    location: job.location,
                    hourly_rate: job.hourly_rate,
                    payment_type: job.payment_type,
                    fixed_price: job.fixed_price,
                  };
                })} />
            </div>

            {/* Student Leaderboard */}
            <div className="mb-6 sm:mb-8">
              <StudentLeaderboard />
            </div>

            <h2 className="text-xl font-bold mb-5">My Applications</h2>
            {myApplications.length === 0 ? (
              <div className="text-center py-16 bg-card border border-border rounded-2xl">
                <FileText className="mx-auto text-muted-foreground mb-3" size={32} />
                <p className="text-muted-foreground mb-4">No applications yet</p>
                <button onClick={() => navigate('/jobs')} className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90">Browse Gigs</button>
              </div>
            ) : (
              <div className="space-y-3">
                {myApplications.map((app) => {
                  const bothConfirmed = app.business_confirmed && app.student_confirmed;
                  return (
                  <div key={app.id} className="bg-card border border-border rounded-2xl p-5 hover:border-primary/20 hover:shadow-sm transition-all">
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => navigate(`/jobs/${app.job_id}`)}>
                      <div className="min-w-0">
                        <h3 className="font-semibold">{(app as any).jobs?.title || 'Job'}</h3>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {(app as any).jobs?.location}
                          {' · '}
                          {(app as any).jobs?.payment_type === 'fixed'
                            ? `€${(app as any).jobs?.fixed_price ?? 0} total`
                            : `€${(app as any).jobs?.hourly_rate}/hr`}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold capitalize px-3 py-1 rounded-full ${
                        app.status === 'accepted' ? 'bg-primary/10 text-primary' :
                        app.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                        'bg-muted text-muted-foreground'
                      }`}>{app.status}</span>
                    </div>

                    {/* Agreement flow for accepted apps */}
                    {app.status === 'accepted' && (
                      <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                        <div className="flex items-center gap-2 text-xs">
                          <Handshake size={14} className={bothConfirmed ? 'text-primary' : 'text-muted-foreground'} />
                          <span className="text-muted-foreground">
                            Business: {app.business_confirmed ? '✅ Confirmed' : '⏳ Pending'} · You: {app.student_confirmed ? '✅ Confirmed' : '⏳ Pending'}
                          </span>
                        </div>

                        {!app.student_confirmed && (
                          <button
                            onClick={() => confirmAgreement(app.id, 'student')}
                            className="w-full py-2 bg-primary/10 text-primary text-xs font-medium rounded-lg hover:bg-primary/20 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Handshake size={14} /> Confirm Agreement
                          </button>
                        )}

                        {bothConfirmed && (
                          <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                            <CreditCard size={12} />
                            {app.payment_confirmed
                              ? <span className="flex items-center gap-1"><CheckCircle size={12} /> Payment received ✓</span>
                              : <span>Payment details shared with business — awaiting payment</span>
                            }
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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

export default Dashboard;
