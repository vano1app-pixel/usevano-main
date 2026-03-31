import React, { useState, useEffect, useMemo } from 'react';
import { Navbar } from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { useToast } from '@/hooks/use-toast';
import { AvatarUpload } from '@/components/AvatarUpload';
import { useNavigate } from 'react-router-dom';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import { Briefcase, Trash2, CheckCircle2, Circle, Link2, Check } from 'lucide-react';
import { nameToSlug } from '@/lib/slugify';
import { getSiteOrigin } from '@/lib/siteUrl';
import { ModBadge } from '@/components/ModBadge';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { format } from 'date-fns';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { normalizeTikTokUrl, parseWorkLinksJson, workLinksToJson, type WorkLinkEntry } from '@/lib/socialLinks';
import { ListOnCommunityWizard, type ListOnCommunityInitial } from '@/components/ListOnCommunityWizard';
import { normalizeFreelancerSkills } from '@/lib/freelancerSkills';
import { Button } from '@/components/ui/button';
import { RequestFeatureLink } from '@/components/RequestFeatureLink';
import { cn } from '@/lib/utils';

const ModBadgeIfAdmin = ({ userId }: { userId: string }) => {
  const isAdmin = useIsAdmin(userId);
  return isAdmin ? <ModBadge /> : null;
};

const Profile = () => {
  const navigate = useNavigate();
  useProfileCompletion();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [hourlyRate, setHourlyRate] = useState('');
  const [phone, setPhone] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [university, setUniversity] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [paymentDetails, setPaymentDetails] = useState('');
  const [myGigs, setMyGigs] = useState<any[]>([]);
  const [deletingGig, setDeletingGig] = useState<string | null>(null);
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [workLinks, setWorkLinks] = useState<WorkLinkEntry[]>([{ url: '', label: '' }]);
  const [bannerUrl, setBannerUrl] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [typicalBudgetMin, setTypicalBudgetMin] = useState('');
  const [typicalBudgetMax, setTypicalBudgetMax] = useState('');
  const [listCommunityOpen, setListCommunityOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const listOnCommunityInitial = useMemo((): ListOnCommunityInitial => ({
    bannerUrl,
    tiktokUrl,
    workLinks,
    skills,
    serviceArea,
    typicalBudgetMin,
    typicalBudgetMax,
    hourlyRate,
    bio,
  }), [bannerUrl, tiktokUrl, workLinks, skills, serviceArea, typicalBudgetMin, typicalBudgetMax, hourlyRate, bio]);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
      return;
    }
    setUser(session.user);

    let { data: prof } = await supabase.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle();

    // Auto-create profile if missing
    if (!prof) {
      const { data: newProf } = await supabase.from('profiles').insert({
        user_id: session.user.id,
        display_name: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || '',
      }).select().single();
      prof = newProf;
    }

    setProfile(prof);
    setDisplayName(prof?.display_name || '');
    setAvatarUrl(prof?.avatar_url || '');

    if (!prof?.user_type) {
      navigate('/choose-account-type', { replace: true });
      setLoading(false);
      return;
    }

    if (prof?.user_type === 'business') {
      setBio(prof?.bio || '');
      setWorkDescription('');
      const { data: gigs } = await supabase.from('jobs').select('*').eq('posted_by', session.user.id).order('created_at', { ascending: false });
      setMyGigs(gigs || []);
    }

    if (prof?.user_type === 'student') {
      setWorkDescription(prof?.work_description || '');
      const { data: sp } = await supabase.from('student_profiles').select('*').eq('user_id', session.user.id).maybeSingle();
      if (sp) {
        setStudentProfile(sp);
        setBio(sp.bio || '');
        setSkills(normalizeFreelancerSkills(sp.skills));
        setHourlyRate(sp.hourly_rate?.toString() || '');
        setPhone(sp.phone || '');
        setIsAvailable(sp.is_available);
        setUniversity((sp as any).university || '');
        setPaymentDetails((sp as any).payment_details || '');
        if (sp.avatar_url) setAvatarUrl(sp.avatar_url);
        setTiktokUrl(sp.tiktok_url || '');
        setBannerUrl((sp as any).banner_url || '');
        setServiceArea((sp as any).service_area || '');
        setTypicalBudgetMin(
          (sp as any).typical_budget_min != null && (sp as any).typical_budget_min > 0
            ? String((sp as any).typical_budget_min)
            : '',
        );
        setTypicalBudgetMax(
          (sp as any).typical_budget_max != null && (sp as any).typical_budget_max > 0
            ? String((sp as any).typical_budget_max)
            : '',
        );
        const parsed = parseWorkLinksJson(sp.work_links);
        setWorkLinks(
          parsed.length > 0
            ? parsed.map((p) => ({ url: p.url, label: p.label }))
            : [{ url: '', label: '' }]
        );
      }
      const { data: gigs } = await supabase.from('jobs').select('*').eq('posted_by', session.user.id).order('created_at', { ascending: false });
      setMyGigs(gigs || []);

    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const profileUpdate: any = { display_name: displayName, avatar_url: avatarUrl };

    if (profile?.user_type === 'business') {
      profileUpdate.bio = bio;
      profileUpdate.work_description = '';
    } else if (profile?.user_type === 'student') {
      profileUpdate.work_description = workDescription;
    }

    await supabase.from('profiles').update(profileUpdate).eq('user_id', user.id);

    if (profile?.user_type === 'student') {
      const studentData = {
        bio,
        skills: normalizeFreelancerSkills(skills),
        hourly_rate: parseFloat(hourlyRate) || 0,
        phone,
        is_available: isAvailable,
        avatar_url: avatarUrl,
        banner_url: bannerUrl || null,
        service_area: serviceArea.trim() || null,
        typical_budget_min: parseInt(typicalBudgetMin, 10) > 0 ? parseInt(typicalBudgetMin, 10) : null,
        typical_budget_max: parseInt(typicalBudgetMax, 10) > 0 ? parseInt(typicalBudgetMax, 10) : null,
        payment_details: paymentDetails,
        university,
        tiktok_url: normalizeTikTokUrl(tiktokUrl),
        work_links: workLinksToJson(workLinks) as any,
      };
      if (studentProfile) {
        await supabase.from('student_profiles').update(studentData as any).eq('user_id', user.id);
      } else {
        await supabase.from('student_profiles').insert({ user_id: user.id, ...studentData } as any);
      }
    }
    toast({ title: 'Profile saved!' });
    setSaving(false);
  };

  const deleteGig = async (jobId: string) => {
    if (!window.confirm('Are you sure you want to delete this gig? This cannot be undone.')) return;
    setDeletingGig(jobId);
    await supabase.from('job_applications').delete().eq('job_id', jobId);
    await supabase.from('saved_jobs').delete().eq('job_id', jobId);
    await supabase.from('reviews').delete().eq('job_id', jobId);
    const { error } = await supabase.from('jobs').delete().eq('id', jobId);
    if (error) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } else {
      toast({ title: 'Gig deleted successfully' });
      setMyGigs((prev) => prev.filter((g) => g.id !== jobId));
    }
    setDeletingGig(null);
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading profile...</p>
      </div>
    </div>
  );

  const inputClass = "w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead title="My Profile – VANO" description="Manage your VANO profile." />
      <Navbar />
      <div className="mx-auto max-w-lg px-4 pt-20 sm:max-w-xl sm:px-5 sm:pt-24 md:max-w-2xl md:px-8 pb-12 sm:pb-16">
        <div className="mb-5 sm:mb-7">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl md:text-3xl mb-1 flex flex-wrap items-center gap-2 sm:gap-3">
            My Profile
            {user && <ModBadgeIfAdmin userId={user.id} />}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {profile?.user_type === 'student'
              ? 'Your name and photo here.'
              : 'Your account — a short intro is enough; set location when you post a gig'}
          </p>
        </div>

        {profile?.user_type === 'student' && user && (
          <>
            {/* Profile strength widget */}
            {(() => {
              const steps = [
                {
                  done: !!avatarUrl,
                  label: 'Profile photo',
                  why: 'Listings with a photo get far more clicks',
                  action: 'Upload below',
                },
                {
                  done: skills.length >= 2,
                  label: 'Skills listed',
                  why: 'Businesses search by skill — you won\'t show up without them',
                  action: 'Add in Get listed',
                },
                {
                  done: !!hourlyRate && Number(hourlyRate) > 0,
                  label: 'Hourly rate set',
                  why: 'People skip listings with no rate — they assume it\'s expensive',
                  action: 'Set in Get listed',
                },
                {
                  done: bio.trim().length >= 30,
                  label: 'Bio written',
                  why: 'A short intro builds trust before someone messages you',
                  action: 'Write in Get listed',
                },
                {
                  done: workLinks.some(l => l.url.trim().length > 0),
                  label: 'Portfolio link added',
                  why: 'Instagram, Behance, GitHub — link your actual work',
                  action: 'Add in Get listed',
                },
              ];
              const doneCount = steps.filter(s => s.done).length;
              const pct = Math.round((doneCount / steps.length) * 100);
              const nextStep = steps.find(s => !s.done);
              const allDone = doneCount === steps.length;

              return (
                <div className="mb-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:mb-6">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3.5 sm:px-5">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Profile strength</p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground">
                        {allDone ? '🎉 Fully set up — looking great!' : `${doneCount} of ${steps.length} steps done`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/students/${user.id}`)}
                      className="shrink-0 rounded-xl border border-border px-3 py-1.5 text-[12px] font-semibold text-foreground/70 transition-colors hover:border-foreground/20 hover:text-foreground"
                    >
                      Preview →
                    </button>
                  </div>

                  {/* Progress bar */}
                  <div className="mx-4 mb-3 h-2 overflow-hidden rounded-full bg-muted sm:mx-5">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Steps */}
                  <ul className="divide-y divide-border/50">
                    {steps.map((step) => (
                      <li key={step.label} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                        {step.done
                          ? <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
                          : <Circle size={16} className="shrink-0 text-foreground/20" />
                        }
                        <span className={cn(
                          'flex-1 text-sm',
                          step.done ? 'text-muted-foreground line-through' : 'font-medium text-foreground'
                        )}>
                          {step.label}
                        </span>
                        {!step.done && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">{step.action}</span>
                        )}
                      </li>
                    ))}
                  </ul>

                  {/* Next action tip */}
                  {nextStep && (
                    <div className="border-t border-border/50 bg-amber-50/60 px-4 py-3 dark:bg-amber-900/10 sm:px-5">
                      <p className="text-[12px] text-amber-800 dark:text-amber-400">
                        <span className="font-semibold">Next: {nextStep.label}.</span>{' '}
                        {nextStep.why}
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            {studentProfile?.community_board_status === 'approved' ? (
              <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] px-4 py-3.5 sm:mb-6">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">You're live on the talent board</p>
                    <p className="text-xs text-muted-foreground">Businesses can find and message you now.</p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 rounded-xl text-xs font-semibold"
                  onClick={() => setListCommunityOpen(true)}
                >
                  Edit listing
                </Button>
              </div>
            ) : (
              <div className="mb-5 rounded-2xl border border-amber-400/40 bg-amber-50/60 dark:bg-amber-900/15 px-4 py-3.5 sm:mb-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                      <p className="text-sm font-semibold text-foreground">Not visible on the talent board yet</p>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      Complete your listing to go live — businesses search here for freelancers.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="lg"
                    className="h-11 w-full shrink-0 rounded-xl px-5 text-sm font-semibold shadow-md sm:h-12 sm:w-auto sm:min-w-[9.5rem]"
                    onClick={() => setListCommunityOpen(true)}
                  >
                    Get listed
                  </Button>
                </div>
              </div>
            )}
            <ListOnCommunityWizard
              open={listCommunityOpen}
              onOpenChange={setListCommunityOpen}
              userId={user.id}
              initial={listOnCommunityInitial}
              onSubmittedForReview={() => {
                void loadProfile();
              }}
            />

            {/* Shareable profile link */}
            {displayName && (
              <div className="mb-5 sm:mb-6">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your profile link</p>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                  <Link2 size={14} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">
                    {getSiteOrigin()}/u/{nameToSlug(displayName)}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(`${getSiteOrigin()}/u/${nameToSlug(displayName)}`);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
                    }}
                    className="shrink-0 rounded-lg border border-border bg-background px-2.5 py-1 text-[12px] font-semibold text-foreground transition-colors hover:border-foreground/20 inline-flex items-center gap-1"
                  >
                    {linkCopied ? <><Check size={12} className="text-emerald-500" />Copied!</> : 'Copy'}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">Put this in your Instagram bio, TikTok, or WhatsApp status.</p>
              </div>
            )}
          </>
        )}

        <div className="space-y-5 rounded-xl border border-border bg-card p-4 sm:space-y-6 sm:rounded-2xl sm:p-5 md:p-7">
          {/* Freelancer: photo + display name only (listing lives in Get listed) */}
          {profile?.user_type === 'student' ? (
            <>
              {!avatarUrl && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-[13px] text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-400">
                  📸 Add a photo — listings with a real face get significantly more messages than ones with just an initial.
                </div>
              )}
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <AvatarUpload
                  userId={user.id}
                  currentUrl={avatarUrl}
                  table="student_profiles"
                  onUploaded={(url) => {
                    setAvatarUrl(url);
                    setStudentProfile((prev: any) => prev ? { ...prev, avatar_url: url } : prev);
                  }}
                />
                <div className="w-full min-w-0 flex-1 sm:pt-0">
                  <label className="mb-1.5 block text-sm font-medium">Display name</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} placeholder="Your name" />
                </div>
              </div>
              <button onClick={handleSave} disabled={saving} className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </>
          ) : (
            <>
              {myGigs.length === 0 && (
                <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-card p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Get started</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">You're set up as a business</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Post a gig to find a freelancer fast — set a budget, deadline, and location. Or browse the talent board to message someone directly.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button size="sm" className="rounded-xl text-xs font-semibold" asChild>
                      <a href="/post-job">Post a gig</a>
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-xl text-xs font-semibold" asChild>
                      <a href="/students">Browse talent</a>
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <AvatarUpload
                  userId={user.id}
                  currentUrl={avatarUrl}
                  table="profiles"
                  onUploaded={(url) => setAvatarUrl(url)}
                />
                <div className="w-full min-w-0 flex-1 sm:pt-0">
                  <label className="mb-1.5 block text-sm font-medium">Name</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} placeholder="How you'd like to appear" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">About me</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className={`${inputClass} min-h-[100px] resize-none sm:min-h-[120px]`}
                  placeholder="A quick intro is enough — who you are and what you usually hire help for. You'll add the exact location on each gig when you post it."
                />
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  No need to add your address here. When you post a gig, you can set city or area (and any other details) for that specific job.
                </p>
              </div>
              <button onClick={handleSave} disabled={saving} className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </>
          )}
        </div>

        {/* My Posted Gigs — all users */}
        {myGigs !== undefined && (
          <div className="mt-6">
            <h2 className="text-xl font-bold mb-4">My Posted Gigs</h2>
            {myGigs.length === 0 ? (
              <div className="text-center py-12 bg-card border border-border rounded-2xl">
                <Briefcase className="mx-auto text-muted-foreground mb-3" size={28} />
                <p className="text-muted-foreground text-sm">No gigs posted yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myGigs.map((gig) => (
                  <div key={gig.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between hover:border-primary/20 transition-colors">
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/jobs/${gig.id}`)}>
                      <h3 className="font-semibold text-sm truncate">{gig.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {gig.location}
                        {' · '}
                        {gig.payment_type === 'fixed' ? `€${gig.fixed_price ?? 0} total` : `€${gig.hourly_rate}/hr`}
                        {' · '}
                        {format(new Date(gig.shift_date), 'MMM d, yyyy')}
                      </p>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full mt-1 inline-block ${
                        gig.status === 'open' ? 'bg-primary/10 text-primary' :
                        gig.status === 'completed' ? 'bg-green-100 text-green-700' :
                        'bg-muted text-muted-foreground'
                      }`}>{gig.status}</span>
                    </div>
                    <button
                      onClick={() => deleteGig(gig.id)}
                      disabled={deletingGig === gig.id}
                      className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-colors ml-3 shrink-0 disabled:opacity-50"
                      title="Delete gig"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Email info */}
        <div className="mt-6 flex flex-col items-center gap-2 text-center">
          <RequestFeatureLink className="text-xs" />
          <p className="text-xs text-muted-foreground">
            Signed in as {user?.email}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Profile;
