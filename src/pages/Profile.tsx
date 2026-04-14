import React, { useState, useEffect, useMemo } from 'react';
import { Navbar } from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { useToast } from '@/hooks/use-toast';
import { AvatarUpload } from '@/components/AvatarUpload';
import { useNavigate } from 'react-router-dom';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import { Briefcase, Trash2, CheckCircle2, Circle, Link2, Check, ImagePlus, Pencil, ExternalLink, Plus, Camera, Image, LogOut, ArrowRight } from 'lucide-react';
import { PortfolioManager } from '@/components/PortfolioManager';
import { nameToSlug } from '@/lib/slugify';
import { getSiteOrigin } from '@/lib/siteUrl';
import { ModBadge } from '@/components/ModBadge';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { format } from 'date-fns';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { normalizeTikTokUrl, parseWorkLinksJson, workLinksToJson, type WorkLinkEntry } from '@/lib/socialLinks';
import { ListOnCommunityWizard, type ListOnCommunityInitial } from '@/components/ListOnCommunityWizard';
import { HireRequestsInboxLink } from '@/components/HireRequestsInboxLink';
import { normalizeFreelancerSkills } from '@/lib/freelancerSkills';
import { resolveUniversityKey } from '@/lib/universities';
import { Button } from '@/components/ui/button';
import { RequestFeatureLink } from '@/components/RequestFeatureLink';
import { cn } from '@/lib/utils';
import { computeProfileChecks } from '@/lib/profileCompleteness';

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
    phone,
    existingPost: existingPost ?? null,
  }), [bannerUrl, tiktokUrl, workLinks, skills, serviceArea, typicalBudgetMin, typicalBudgetMax, hourlyRate, bio, university, phone, existingPost]);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
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
          setUniversity(resolveUniversityKey((sp as any).university) || '');
          setPaymentDetails((sp as any).payment_details || '');
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

        // First-time freelancers haven't listed yet — open the wizard for them
        // so they don't have to hunt for a button. Scoped per-user and only
        // fires once so a freelancer who closes the wizard isn't re-prompted.
        const autoOpenKey = `vano_listing_wizard_auto_opened_${session.user.id}`;
        try {
          if (!postRow && !localStorage.getItem(autoOpenKey)) {
            localStorage.setItem(autoOpenKey, '1');
            setListCommunityOpen(true);
          }
        } catch {
          /* ignore storage errors */
        }
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
      toast({ title: 'Something went wrong', description: 'Could not load your profile. Try refreshing.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openWizardAtStep = (step: number) => {
    setWizardStartStep(step);
    setListCommunityOpen(true);
  };

  const handleBannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Upload JPEG, PNG, WebP, or GIF.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 5MB.', variant: 'destructive' });
      return;
    }
    setBannerUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
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
    try {
      const profileUpdate: any = { display_name: displayName, avatar_url: avatarUrl };

      if (profile?.user_type === 'business') {
        profileUpdate.bio = bio;
        profileUpdate.work_description = '';
      } else if (profile?.user_type === 'student') {
        profileUpdate.work_description = workDescription;
      }

      const { error: profErr } = await supabase.from('profiles').update(profileUpdate).eq('user_id', user.id);
      if (profErr) throw profErr;

      if (profile?.user_type === 'student') {
        const studentData = {
          bio,
          skills: normalizeFreelancerSkills(skills),
          hourly_rate: Math.min(parseFloat(hourlyRate) || 0, 20),
          phone,
          is_available: isAvailable,
          banner_url: bannerUrl || null,
          service_area: serviceArea.trim() || null,
          typical_budget_min: parseInt(typicalBudgetMin, 10) > 0 ? Math.min(parseInt(typicalBudgetMin, 10), 500) : null,
          typical_budget_max: parseInt(typicalBudgetMax, 10) > 0 ? Math.min(parseInt(typicalBudgetMax, 10), 500) : null,
          payment_details: paymentDetails,
          university,
          tiktok_url: normalizeTikTokUrl(tiktokUrl),
          work_links: workLinksToJson(workLinks) as any,
        };
        if (studentProfile) {
          const { error: spErr } = await supabase.from('student_profiles').update(studentData as any).eq('user_id', user.id);
          if (spErr) throw spErr;
        } else {
          const { error: spErr } = await supabase.from('student_profiles').insert({ user_id: user.id, ...studentData } as any);
          if (spErr) throw spErr;
        }
      }
      toast({ title: 'Profile saved!' });
    } catch (err: any) {
      console.error('Failed to save profile:', err);
      toast({ title: 'Could not save', description: getUserFriendlyError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
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

  const inputClass = "w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors duration-200";

  // The legacy ProgressRing + renderChecklist widgets (the 8-question
  // quality checklist and 5-item profile-strength checklist) were removed
  // in favor of the concise Profile completeness meter rendered inline
  // below. The meter reads from the shared helper in
  // src/lib/profileCompleteness.ts so the same weights drive the public
  // profile's Top/Verified tier badge.

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead title="My Profile – VANO" description="Manage your VANO profile." />
      <Navbar />
      <div className="mx-auto max-w-lg px-4 pt-20 sm:max-w-xl sm:px-5 sm:pt-24 lg:max-w-4xl lg:px-8 pb-12 sm:pb-16">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl mb-1 flex flex-wrap items-center gap-2 sm:gap-3">
            My Profile
            {user && <ModBadgeIfAdmin userId={user.id} />}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {profile?.user_type === 'student'
              ? 'Manage your listing and see what businesses see.'
              : 'Your account — a short intro is enough; set location when you hire'}
          </p>
          {profile?.user_type === 'student' && user && (
            <a
              href={`/students/${user.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mt-1"
            >
              <ExternalLink size={14} /> View public profile
            </a>
          )}
        </div>

        {profile?.user_type === 'student' && user && (
          <>
            {/* Hidden file input for quick banner change */}
            <input
              ref={bannerFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleBannerFileChange}
            />

            {/* ══ Two-column grid on desktop ══ */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px] lg:gap-8">

              {/* ── LEFT COLUMN: Main content ── */}
              <div className="space-y-6">

                {/* ── Profile completeness meter ──
                    Loss-aversion + operant reward: shows missing points
                    rather than gained ones, and the fill bar shifts from
                    rose → amber → emerald as the freelancer climbs out of
                    the red zone. Fades away once they hit 100%. */}
                {studentProfile && (() => {
                  const checks = computeProfileChecks({
                    displayName,
                    avatarUrl,
                    bio,
                    bannerUrl,
                    phone,
                    university,
                    skills,
                    portfolioCount,
                  });
                  // Per-check action — where to send the user when they tap a row
                  const actionFor: Record<string, () => void> = {
                    name: () => document.querySelector<HTMLInputElement>('input[placeholder*="appear"]')?.focus(),
                    avatar: () => document.querySelector('[data-avatar-upload]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
                    bio: () => openWizardAtStep(2),
                    banner: () => openWizardAtStep(1),
                    phone: () => openWizardAtStep(2),
                    university: () => openWizardAtStep(2),
                    skills: () => openWizardAtStep(3),
                    portfolio: () => openWizardAtStep(1),
                  };
                  const filled = checks.filter((c) => c.done).reduce((sum, c) => sum + c.weight, 0);
                  const missing = checks.filter((c) => !c.done).sort((a, b) => b.weight - a.weight);
                  if (filled >= 100 || missing.length === 0) return null;

                  // Progressive fill color — rose (incomplete) → amber
                  // (getting there) → emerald (almost done).
                  const barClass = filled < 40
                    ? 'bg-rose-500'
                    : filled < 70
                    ? 'bg-amber-500'
                    : 'bg-emerald-500';
                  const zoneTint = filled < 40
                    ? 'border-rose-500/25 bg-rose-500/[0.04]'
                    : filled < 70
                    ? 'border-amber-500/25 bg-amber-500/[0.04]'
                    : 'border-emerald-500/25 bg-emerald-500/[0.04]';
                  const percentClass = filled < 40
                    ? 'text-rose-600 dark:text-rose-400'
                    : filled < 70
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400';

                  return (
                    <div className={cn('rounded-2xl border p-5 shadow-tinted-sm transition-colors duration-500 sm:p-6', zoneTint)}>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                        <p className="text-sm font-semibold text-foreground sm:text-base">
                          Your profile is <span className={cn('font-bold', percentClass)}>{filled}% complete</span>
                        </p>
                        <p className="text-[11px] font-medium text-muted-foreground sm:text-xs">
                          {missing.length} quick win{missing.length === 1 ? '' : 's'} left
                        </p>
                      </div>
                      <div className="relative mt-3 h-2 w-full overflow-hidden rounded-full bg-border">
                        <div
                          className={cn('h-full rounded-full transition-all duration-500 ease-out', barClass)}
                          style={{ width: `${filled}%` }}
                        />
                      </div>
                      <div className="mt-5 flex flex-col gap-2.5">
                        {missing.slice(0, 3).map((m) => (
                          <button
                            key={m.key}
                            type="button"
                            onClick={actionFor[m.key]}
                            className="group flex w-full items-center justify-between gap-4 rounded-xl border border-border/70 bg-background px-4 py-3 text-left text-sm text-foreground shadow-tinted-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
                          >
                            <span className="min-w-0 flex-1 truncate">{m.label}</span>
                            <span className="shrink-0 inline-flex items-center gap-1.5">
                              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">+{m.weight}%</span>
                              <ArrowRight size={14} className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Not visible yet CTA — before listing editor */}
                {studentProfile?.community_board_status !== 'approved' && (
                  <div className="rounded-2xl border border-amber-400/40 bg-amber-50/60 dark:bg-amber-900/15 px-5 py-4">
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
                        data-mascot="get-listed"
                        className="h-11 w-full shrink-0 rounded-xl px-5 text-sm font-semibold shadow-md sm:h-12 sm:w-auto sm:min-w-[9.5rem] transition-all duration-200 hover:shadow-lg hover:-translate-y-[1px]"
                        onClick={() => setListCommunityOpen(true)}
                      >
                        Get listed
                      </Button>
                    </div>
                  </div>
                )}

                {/* Hire requests inbox (freelancers with a live listing) */}
                {studentProfile?.community_board_status === 'approved' && (
                  <HireRequestsInboxLink />
                )}

                {/* ── Live listing editor card ── */}
                {studentProfile?.community_board_status === 'approved' && existingPost && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Live on talent board</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openWizardAtStep(1)}
                        className="text-[12px] font-semibold text-primary transition-colors duration-200 hover:text-primary/80 hover:underline"
                      >
                        Edit full listing
                      </button>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-card">
                      {/* ── COVER section ── */}
                      <div>
                        <p className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                          <span className={cn("h-1.5 w-1.5 rounded-full", (existingPost.image_url || bannerUrl) ? "bg-emerald-500" : "bg-amber-400")} />
                          Cover
                        </p>
                        <button
                          type="button"
                          onClick={() => bannerFileInputRef.current?.click()}
                          disabled={bannerUploading}
                          className="group relative mt-1.5 block h-36 w-full overflow-hidden"
                          title="Tap to change cover photo"
                        >
                          {existingPost.image_url || bannerUrl ? (
                            <>
                              <img
                                src={existingPost.image_url || bannerUrl}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover transition-all duration-300 group-hover:scale-[1.02] group-hover:opacity-90"
                              />
                              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/75" />
                            </>
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center border-2 border-dashed border-foreground/15 bg-muted/30 transition-colors duration-200 group-hover:border-primary/30 group-hover:bg-primary/5">
                              <Camera size={24} className="text-muted-foreground/50 mb-1.5" />
                              <p className="text-xs text-muted-foreground/70">Add a cover photo</p>
                            </div>
                          )}
                          {(existingPost.image_url || bannerUrl) && (
                            <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus:opacity-100">
                              {bannerUploading
                                ? <span className="animate-pulse">Uploading…</span>
                                : <><ImagePlus size={12} />Change cover</>
                              }
                            </div>
                          )}
                          {/* Name / category overlay at bottom */}
                          {(existingPost.image_url || bannerUrl) && (
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
                          )}
                        </button>
                      </div>

                      {/* ── ABOUT section ── */}
                      <button
                        type="button"
                        onClick={() => openWizardAtStep(2)}
                        className="group w-full border-t border-foreground/8 px-4 pb-3 pt-2.5 text-left transition-all duration-200 hover:bg-muted/30 active:bg-muted/40"
                      >
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                          <span className={cn("h-1.5 w-1.5 rounded-full", (existingPost.title || existingPost.description) ? "bg-emerald-500" : "bg-amber-400")} />
                          About
                        </p>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            {existingPost.title ? (
                              <p className="text-sm font-semibold leading-snug text-foreground">{existingPost.title}</p>
                            ) : (
                              <p className="text-sm text-muted-foreground/50 italic">Add a headline…</p>
                            )}
                            {existingPost.description ? (
                              <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{existingPost.description}</p>
                            ) : (
                              <p className="text-[13px] text-muted-foreground/40 italic">Add a description so businesses know what you offer.</p>
                            )}
                          </div>
                          <Pencil size={13} className="mt-0.5 shrink-0 text-muted-foreground transition-opacity md:opacity-0 md:group-hover:opacity-100" />
                        </div>
                      </button>

                      {/* ── SKILLS section (opens wizard) ── */}
                      <button
                        type="button"
                        onClick={() => openWizardAtStep(3)}
                        className="group w-full border-t border-foreground/8 px-4 pb-3.5 pt-2.5 text-left transition-all duration-200 hover:bg-muted/30 active:bg-muted/40"
                      >
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                          <span className={cn("h-1.5 w-1.5 rounded-full", skills.length > 0 ? "bg-emerald-500" : "bg-amber-400")} />
                          Skills
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {skills.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {skills.slice(0, 5).map((s) => (
                                  <span key={s} className="rounded-md border border-foreground/10 bg-background/70 px-2 py-0.5 text-[11px] text-foreground/75">{s}</span>
                                ))}
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                {[1, 2, 3].map(i => (
                                  <span key={i} className="rounded-md border border-dashed border-foreground/10 px-4 py-0.5 text-[11px] text-muted-foreground/30">skill</span>
                                ))}
                              </div>
                            )}
                            {(existingPost.rate_min != null || existingPost.rate_max != null) && (
                              <p className="mt-1.5 text-[11px] text-muted-foreground">
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

                      {/* ── PRICING section (inline editable) ── */}
                      <div className="border-t border-foreground/8 px-4 pb-3.5 pt-2.5">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                          <span className={cn("h-1.5 w-1.5 rounded-full", (hourlyRate && Number(hourlyRate) > 0) ? "bg-emerald-500" : "bg-amber-400")} />
                          Pricing
                        </p>
                        <div className="space-y-2.5">
                          <div>
                            <label className="text-[11px] text-muted-foreground">Hourly rate (€)</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={hourlyRate}
                              onChange={(e) => setHourlyRate(e.target.value)}
                              placeholder="e.g. 15"
                              className="mt-1 block w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-sm focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                            />
                            {parseFloat(hourlyRate.replace(',', '.')) > 20 && (
                              <p className="mt-1 text-xs font-medium text-red-500">Can't exceed €20/hr</p>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[11px] text-muted-foreground">Budget from (€)</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={typicalBudgetMin}
                                onChange={(e) => setTypicalBudgetMin(e.target.value)}
                                placeholder="e.g. 100"
                                className="mt-1 block w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-sm focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-muted-foreground">Budget up to (€)</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={typicalBudgetMax}
                                onChange={(e) => setTypicalBudgetMax(e.target.value)}
                                placeholder="e.g. 500"
                                className="mt-1 block w-full rounded-lg border border-foreground/10 bg-background px-3 py-2 text-sm focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                              />
                              {parseInt(typicalBudgetMax, 10) > 500 && (
                                <p className="mt-1 text-xs font-medium text-red-500">Can't exceed €500</p>
                              )}
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground/60">Saves when you hit "Save Profile"</p>
                        </div>
                      </div>

                      {/* ── LINKS section ── */}
                      <button
                        type="button"
                        onClick={() => openWizardAtStep(2)}
                        className="group w-full border-t border-foreground/8 px-4 pb-3.5 pt-2.5 text-left transition-all duration-200 hover:bg-muted/30 active:bg-muted/40"
                      >
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                          <span className={cn("h-1.5 w-1.5 rounded-full", workLinks.some(l => l.url.trim()) ? "bg-emerald-500" : "bg-amber-400")} />
                          Links
                        </p>
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
                )}

                {/* ── Your Details card ── */}
                <div>
                  <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    <div className="border-b border-border/50 px-5 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your details</p>
                    </div>
                    <div className="space-y-5 p-5">
                      {!avatarUrl && (
                        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 dark:border-amber-800/40 dark:bg-amber-900/20">
                          <Camera size={16} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                          <p className="text-sm text-amber-800 dark:text-amber-400">
                            Add a photo — listings with a real face get significantly more messages.
                          </p>
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
                          <p className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground/60">{displayName.length}/50</p>
                        </div>
                      </div>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold shadow-sm transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:brightness-105 disabled:opacity-50 disabled:hover:shadow-sm"
                      >
                        {saving ? 'Saving...' : 'Save Profile'}
                      </button>
                    </div>
                  </div>
                </div>

              </div>
              {/* ── END LEFT COLUMN ── */}

              {/* ── RIGHT COLUMN: Sidebar (quality + link) ── */}
              <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">

                {/* ── Portfolio section ── */}
                <div>
                  <PortfolioManager userId={user.id} />
                </div>

                {/* Shareable profile link — sidebar on desktop */}
                {displayName && (
                  <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    <div className="border-b border-border/50 px-5 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your profile link</p>
                    </div>
                    <div className="p-5 space-y-3">
                      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                        <Link2 size={14} className="shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">
                          {getSiteOrigin()}/u/{nameToSlug(displayName)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(`${getSiteOrigin()}/u/${nameToSlug(displayName)}`);
                          setLinkCopied(true);
                          toast({ title: 'Link copied' });
                          setTimeout(() => setLinkCopied(false), 2000);
                        }}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground transition-all duration-200 hover:border-foreground/20 hover:shadow-sm inline-flex items-center justify-center gap-1.5"
                      >
                        {linkCopied ? <><Check size={14} className="text-emerald-500" />Copied!</> : <><Link2 size={14} />Copy link</>}
                      </button>
                      <div className="rounded-xl bg-muted/40 px-3.5 py-2.5">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Put this in your Instagram bio, TikTok, or WhatsApp status so people can find you.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Signed in as + Sign out */}
                <div className="flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
                  <RequestFeatureLink className="text-xs" />
                  <p className="text-xs text-muted-foreground">
                    Signed in as {user?.email}
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      await supabase.auth.signOut({ scope: 'global' });
                      Object.keys(localStorage).forEach((key) => {
                        if (key.startsWith('sb-') || key.includes('supabase')) {
                          localStorage.removeItem(key);
                        }
                      });
                      window.location.href = '/auth?mode=signup';
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-xs font-semibold text-blue-700 transition-all duration-200 hover:bg-blue-100 hover:border-blue-400 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50 dark:hover:border-blue-600"
                  >
                    <LogOut size={12} />
                    Sign out / switch account
                  </button>
                </div>
              </div>
              {/* ── END RIGHT COLUMN ── */}

            </div>
            {/* ── END 2-col grid ── */}

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

        {/* ══ Business user layout ══ */}
        {profile?.user_type === 'business' && (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="border-b border-border/50 px-5 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your profile</p>
              </div>
              <div className="space-y-5 p-5 sm:space-y-6">
                {myGigs.length === 0 && (
                  <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-card p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Get started</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">You're set up as a business</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Post a gig to find a freelancer fast — set a budget, deadline, and location. Or browse the talent board to message someone directly.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button size="sm" className="rounded-xl text-xs font-semibold" asChild>
                        <a href="/hire">Post a gig</a>
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-xl text-xs font-semibold" asChild>
                        <a href="/students">Browse talent</a>
                      </Button>
                    </div>
                  </div>
                )}
                <div data-avatar-upload className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
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
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold shadow-sm transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:brightness-105 disabled:opacity-50 disabled:hover:shadow-sm"
                >
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </div>

            {/* Business gigs */}
            {myGigs !== undefined && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">My Posted Gigs</h2>
                {myGigs.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card/50 py-10 px-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Briefcase className="text-muted-foreground" size={22} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">No gigs posted yet</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Post a gig to find freelancers fast</p>
                    </div>
                    <Button size="sm" className="mt-1 rounded-xl text-xs font-semibold" asChild>
                      <a href="/hire"><Plus size={14} className="mr-1" />Post your first gig</a>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {myGigs.map((gig) => (
                      <div key={gig.id} className="group overflow-hidden rounded-xl border border-border bg-card flex items-stretch transition-all duration-200 hover:border-primary/20 hover:shadow-sm">
                        <div className={cn(
                          "w-1 shrink-0",
                          gig.status === 'open' ? 'bg-emerald-500' :
                          gig.status === 'completed' ? 'bg-blue-500' :
                          'bg-muted-foreground/30'
                        )} />
                        <div className="min-w-0 flex-1 cursor-pointer p-4" onClick={() => navigate(`/jobs/${gig.id}`)}>
                          <h3 className="font-semibold text-sm truncate">{gig.title}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {gig.location}
                            {' · '}
                            {gig.payment_type === 'fixed' ? `€${gig.fixed_price ?? 0} total` : `€${gig.hourly_rate}/hr`}
                            {' · '}
                            {format(new Date(gig.shift_date), 'MMM d, yyyy')}
                          </p>
                          <span className={cn(
                            "text-[11px] font-semibold px-2.5 py-0.5 rounded-full mt-1.5 inline-block capitalize",
                            gig.status === 'open' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                            gig.status === 'completed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                            'bg-muted text-muted-foreground'
                          )}>{gig.status}</span>
                        </div>
                        <button
                          onClick={() => deleteGig(gig.id)}
                          disabled={deletingGig === gig.id}
                          className="p-4 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors shrink-0 disabled:opacity-50"
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

            {/* Email info + Sign out */}
            <div className="flex flex-col items-center gap-3 text-center">
              <RequestFeatureLink className="text-xs" />
              <p className="text-xs text-muted-foreground">
                Signed in as {user?.email}
              </p>
              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut({ scope: 'global' });
                  Object.keys(localStorage).forEach((key) => {
                    if (key.startsWith('sb-') || key.includes('supabase')) {
                      localStorage.removeItem(key);
                    }
                  });
                  window.location.href = '/auth?mode=signup';
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-xs font-semibold text-blue-700 transition-all duration-200 hover:bg-blue-100 hover:border-blue-400 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50 dark:hover:border-blue-600"
              >
                <LogOut size={12} />
                Sign out / switch account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
