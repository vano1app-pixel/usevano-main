import React, { useState, useEffect, useMemo } from 'react';
import { Navbar } from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { useToast } from '@/hooks/use-toast';
import { AvatarUpload } from '@/components/AvatarUpload';
import { useNavigate } from 'react-router-dom';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import { Briefcase, Trash2, CheckCircle2, Circle, Link2, Check, ImagePlus, Pencil } from 'lucide-react';
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
  const [wizardStartStep, setWizardStartStep] = useState<number | undefined>(undefined);
  const [linkCopied, setLinkCopied] = useState(false);
  const [qualityExpanded, setQualityExpanded] = useState(false);
  const [existingPost, setExistingPost] = useState<any>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [portfolioCount, setPortfolioCount] = useState(0);
  const bannerFileInputRef = React.useRef<HTMLInputElement>(null);

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
    university,
    existingPost: existingPost ?? null,
  }), [bannerUrl, tiktokUrl, workLinks, skills, serviceArea, typicalBudgetMin, typicalBudgetMax, hourlyRate, bio, university, existingPost]);

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

      // Portfolio item count for quality widget
      const { count: piCount } = await supabase
        .from('portfolio_items')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id);
      setPortfolioCount(piCount ?? 0);

      const { data: gigs } = await supabase.from('jobs').select('*').eq('posted_by', session.user.id).order('created_at', { ascending: false });
      setMyGigs(gigs || []);

      // Load existing community post so wizard can pre-fill and inline card can render
      const { data: postRow } = await supabase
        .from('community_posts')
        .select('id, category, title, description, image_url, rate_min, rate_max, rate_unit, likes_count, created_at')
        .eq('user_id', session.user.id)
        .eq('moderation_status', 'approved')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setExistingPost(postRow ?? null);
    }
    setLoading(false);
  };

  const openWizardAtStep = (step: number) => {
    setWizardStartStep(step);
    setListCommunityOpen(true);
  };

  const handleBannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setBannerUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/banner.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${pub.publicUrl}?t=${Date.now()}`;
      await supabase.from('student_profiles').upsert({ user_id: user.id, banner_url: url }, { onConflict: 'user_id' });
      setBannerUrl(url);
      toast({ title: 'Cover updated', description: 'Your listing banner has been updated.' });
    } catch {
      toast({ title: 'Upload failed', description: 'Could not update banner. Try again.', variant: 'destructive' });
    } finally {
      setBannerUploading(false);
      if (bannerFileInputRef.current) bannerFileInputRef.current.value = '';
    }
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
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl mb-1 flex flex-wrap items-center gap-2 sm:gap-3">
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
            {/* Profile strength widget — hidden once live */}
            {studentProfile?.community_board_status !== 'approved' && (() => {
              const steps = [
                {
                  done: !!avatarUrl,
                  label: 'Profile photo',
                  why: 'Listings with a photo get far more clicks',
                  action: 'Upload below',
                },
                {
                  done: skills.length >= 3,
                  label: 'At least 3 skills added',
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
                <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:mb-8">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3.5 sm:px-5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Profile strength</p>
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

            {/* Hidden file input for quick banner change */}
            <input
              ref={bannerFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleBannerFileChange}
            />

            {studentProfile?.community_board_status === 'approved' && existingPost ? (
              /* ── Live listing editor card ── */
              <div className="mb-6 sm:mb-8">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Live on talent board</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openWizardAtStep(0)}
                    className="text-[12px] font-semibold text-primary hover:underline"
                  >
                    Edit full listing →
                  </button>
                </div>

                <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-card shadow-sm">
                  {/* ── Banner — tap to change ── */}
                  <button
                    type="button"
                    onClick={() => bannerFileInputRef.current?.click()}
                    disabled={bannerUploading}
                    className="group relative block h-36 w-full overflow-hidden"
                    title="Tap to change cover photo"
                  >
                    {existingPost.image_url || bannerUrl ? (
                      <>
                        <img
                          src={existingPost.image_url || bannerUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover transition-opacity group-hover:opacity-85"
                        />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/75" />
                      </>
                    ) : (
                      <div
                        className="absolute inset-0"
                        style={{ background: 'linear-gradient(145deg, hsl(248 62% 32%) 0%, hsl(270 58% 18%) 100%)' }}
                      >
                        <div className="absolute -right-10 -top-8 h-40 w-40 rounded-full bg-fuchsia-300/30 blur-2xl" />
                        <div className="absolute -left-8 bottom-0 h-28 w-28 rounded-full bg-cyan-300/20 blur-2xl" />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/70" />
                      </div>
                    )}
                    {/* Change cover — always visible on mobile, hover on desktop */}
                    <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus:opacity-100">
                      {bannerUploading
                        ? <span className="animate-pulse">Uploading…</span>
                        : <><ImagePlus size={12} />Change cover</>
                      }
                    </div>
                    {/* Name / category overlay at bottom */}
                    <div className="absolute bottom-0 left-0 right-0 flex items-end gap-3 px-4 pb-3">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white/40" />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white ring-2 ring-white/35">
                          {displayName?.[0]?.toUpperCase() || 'Y'}
                        </div>
                      )}
                      <div className="pb-0.5">
                        <p className="text-sm font-semibold leading-tight text-white">{displayName || 'Your name'}</p>
                        <p className="text-[11px] text-white/65">{existingPost.category}</p>
                      </div>
                    </div>
                  </button>

                  {/* ── Pitch — tap to edit ── */}
                  <button
                    type="button"
                    onClick={() => openWizardAtStep(3)}
                    className="group w-full px-4 pb-3 pt-3 text-left transition-colors hover:bg-muted/30 active:bg-muted/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1.5">
                        <p className="text-sm font-semibold leading-snug text-foreground">{existingPost.title || 'Add a headline'}</p>
                        <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                          {existingPost.description || 'Add a description so businesses know what you offer.'}
                        </p>
                      </div>
                      <Pencil size={13} className="mt-0.5 shrink-0 text-muted-foreground transition-opacity md:opacity-0 md:group-hover:opacity-100" />
                    </div>
                  </button>

                  {/* ── Skills / rates — tap to edit ── */}
                  <button
                    type="button"
                    onClick={() => openWizardAtStep(5)}
                    className="group w-full border-t border-foreground/8 px-4 pb-3.5 pt-2.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {skills.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {skills.slice(0, 5).map((s) => (
                              <span key={s} className="rounded border border-foreground/10 bg-background/70 px-2 py-0.5 text-[11px] text-foreground/75">{s}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[12px] text-muted-foreground">Add skills so businesses can find you</p>
                        )}
                        {(existingPost.rate_min != null || existingPost.rate_max != null) && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {existingPost.rate_min != null && existingPost.rate_max != null
                              ? `€${existingPost.rate_min}–€${existingPost.rate_max}`
                              : existingPost.rate_min != null
                                ? `From €${existingPost.rate_min}`
                                : `Up to €${existingPost.rate_max}`}
                            {existingPost.rate_unit && existingPost.rate_unit !== 'negotiable'
                              ? ` / ${existingPost.rate_unit}`
                              : existingPost.rate_unit === 'negotiable' ? ' · Negotiable' : ''}
                          </p>
                        )}
                      </div>
                      <Pencil size={13} className="shrink-0 text-muted-foreground transition-opacity md:opacity-0 md:group-hover:opacity-100" />
                    </div>
                  </button>

                  {/* ── Links — tap to edit ── */}
                  <button
                    type="button"
                    onClick={() => openWizardAtStep(4)}
                    className="group w-full border-t border-foreground/8 px-4 pb-3.5 pt-2.5 text-left transition-colors hover:bg-muted/30 active:bg-muted/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] text-muted-foreground">
                        {workLinks.some(l => l.url.trim())
                          ? workLinks.filter(l => l.url.trim()).map(l => l.label || l.url).join(' · ')
                          : 'Add portfolio links, social profiles…'}
                      </p>
                      <Pencil size={13} className="shrink-0 text-muted-foreground transition-opacity md:opacity-0 md:group-hover:opacity-100" />
                    </div>
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">Tap any section to edit. Changes go live immediately.</p>
              </div>
            ) : studentProfile?.community_board_status !== 'approved' ? (
              <div className="mb-6 rounded-2xl border border-amber-400/40 bg-amber-50/60 dark:bg-amber-900/15 px-4 py-3.5 sm:mb-8">
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
            ) : null}

            {/* Post-publish profile quality widget */}
            {studentProfile?.community_board_status === 'approved' && (() => {
              const qualityChecks: {
                id: string;
                label: string;
                detail: string;
                done: boolean;
                count: string | null;
                wizardStep: number | null;
                profileAction?: string;
              }[] = [
                {
                  id: 'photo',
                  label: 'Profile photo',
                  detail: 'Profiles with a real face get far more messages',
                  done: !!avatarUrl,
                  count: null,
                  wizardStep: null,
                  profileAction: 'Upload photo below',
                },
                {
                  id: 'banner',
                  label: 'Cover photo',
                  detail: 'No cover — your card looks plain without one',
                  done: !!bannerUrl,
                  count: null,
                  wizardStep: 2,
                },
                {
                  id: 'bio',
                  label: 'Description written',
                  detail: bio.trim().length === 0
                    ? 'No description — businesses need to know what you offer'
                    : `Too short (${bio.trim().length} chars — need 30+)`,
                  done: bio.trim().length >= 30,
                  count: null,
                  wizardStep: 3,
                },
                {
                  id: 'skills',
                  label: 'At least 3 skills',
                  detail: skills.length === 0
                    ? 'No skills — businesses search by skill to find you'
                    : `${skills.length}/3 minimum — add ${3 - skills.length} more`,
                  done: skills.length >= 3,
                  count: skills.length < 3 ? `${skills.length}/3` : null,
                  wizardStep: 5,
                },
                {
                  id: 'rate',
                  label: 'Rate set',
                  detail: 'No rate shown — people skip listings with no price',
                  done: !!hourlyRate && Number(hourlyRate) > 0,
                  count: null,
                  wizardStep: 5,
                },
                {
                  id: 'link',
                  label: 'Portfolio or social link',
                  detail: 'Add a link to your Instagram, Behance, GitHub, etc.',
                  done: workLinks.some((l) => l.url.trim().length > 0),
                  count: null,
                  wizardStep: 4,
                },
                {
                  id: 'university',
                  label: 'University',
                  detail: 'Add your university — builds trust with businesses',
                  done: !!university.trim(),
                  count: null,
                  wizardStep: 4,
                },
                {
                  id: 'portfolio',
                  label: 'Portfolio photos',
                  detail: 'Add sample work photos — profiles with images get way more views',
                  done: portfolioCount > 0,
                  count: null,
                  wizardStep: 2,
                },
              ];

              const doneCount = qualityChecks.filter((c) => c.done).length;
              const missingCount = qualityChecks.length - doneCount;
              const allDone = missingCount === 0;

              if (allDone) {
                return (
                  <div className="mb-6 flex items-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-50/50 px-4 py-3 dark:bg-emerald-900/15 sm:mb-8">
                    <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-400">
                      Profile looks great — all {qualityChecks.length} sections complete
                    </p>
                  </div>
                );
              }

              return (
                <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:mb-8">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3.5 sm:px-5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Profile quality</p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground">
                        {doneCount} of {qualityChecks.length} complete
                        <span className="ml-1.5 text-muted-foreground">· {missingCount} to go</span>
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
                      style={{ width: `${Math.round((doneCount / qualityChecks.length) * 100)}%` }}
                    />
                  </div>

                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => setQualityExpanded(v => !v)}
                    className="mx-4 mb-1 text-xs font-semibold text-primary hover:underline sm:mx-5"
                  >
                    {qualityExpanded ? 'Show less' : `Show all ${qualityChecks.length} checks`}
                  </button>

                  {/* Check rows */}
                  <ul className="divide-y divide-border/50">
                    {(qualityExpanded ? qualityChecks : qualityChecks.filter(c => !c.done).slice(0, 2)).map((check) => (
                      <li
                        key={check.id}
                        className="flex items-center gap-3 px-4 py-2.5 sm:px-5"
                      >
                        {check.done
                          ? <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
                          : <Circle size={16} className="shrink-0 text-muted-foreground/40" />
                        }
                        <div className="min-w-0 flex-1">
                          <p className={cn(
                            'text-sm',
                            check.done ? 'text-muted-foreground line-through' : 'font-medium text-foreground',
                          )}>
                            {check.label}
                            {check.count && (
                              <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                {check.count}
                              </span>
                            )}
                          </p>
                          {!check.done && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{check.detail}</p>
                          )}
                        </div>
                        {!check.done && check.wizardStep !== null && (
                          <button
                            type="button"
                            onClick={() => openWizardAtStep(check.wizardStep!)}
                            className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                          >
                            Fix →
                          </button>
                        )}
                        {!check.done && check.wizardStep === null && (
                          <span className="shrink-0 text-xs text-muted-foreground">{check.profileAction}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            <ListOnCommunityWizard
              open={listCommunityOpen}
              onOpenChange={(v) => {
                setListCommunityOpen(v);
                if (!v) setWizardStartStep(undefined);
              }}
              userId={user.id}
              initial={listOnCommunityInitial}
              startAtStep={wizardStartStep}
              onSubmittedForReview={() => {
                void loadProfile();
              }}
            />

          </>
        )}

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {profile?.user_type === 'student' ? 'Your details' : 'Your profile'}
        </p>
        <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:space-y-6 sm:p-6 md:p-7">
          {/* Freelancer: photo + display name only (listing lives in Get listed) */}
          {profile?.user_type === 'student' ? (
            <>
              {!avatarUrl && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-400">
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
              <button onClick={handleSave} disabled={saving} className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Profile'}
              </button>

              {/* Shareable profile link */}
              {displayName && (
                <div className="border-t border-border pt-5">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your profile link</p>
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
                      className="shrink-0 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:border-foreground/20 inline-flex items-center gap-1"
                    >
                      {linkCopied ? <><Check size={12} className="text-emerald-500" />Copied!</> : 'Copy'}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">Put this in your Instagram bio, TikTok, or WhatsApp status.</p>
                </div>
              )}
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
              <button onClick={handleSave} disabled={saving} className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </>
          )}
        </div>

        {/* My Posted Gigs — all users */}
        {myGigs !== undefined && (
          <div className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">My Posted Gigs</h2>
            {myGigs.length === 0 ? (
              <div className="text-center py-8 bg-card border border-border rounded-2xl">
                <Briefcase className="mx-auto text-muted-foreground mb-3" size={28} />
                <p className="text-muted-foreground text-sm">No gigs posted yet</p>
              </div>
            ) : (
              <div className="space-y-2">
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
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
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
