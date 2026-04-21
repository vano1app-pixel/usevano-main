import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Navbar } from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { useToast } from '@/hooks/use-toast';
import { AvatarUpload } from '@/components/AvatarUpload';
import { useNavigate } from 'react-router-dom';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import { FreshListingCelebration } from '@/components/FreshListingCelebration';
import { Briefcase, Trash2, CheckCircle2, Link2, Check, ImagePlus, Pencil, ExternalLink, Plus, Camera, LogOut, MapPin, Share2, Loader2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import { ShareCardFrame } from '@/components/ShareCardFrame';
import { COMMUNITY_CATEGORIES, isCommunityCategoryId } from '@/lib/communityCategories';
import { isIrelandCounty, formatLocation } from '@/lib/irelandCounties';
import { formatTypicalBudget } from '@/lib/freelancerProfile';
import { PortfolioManager } from '@/components/PortfolioManager';
import { SalesReferralsPanel } from '@/components/SalesReferralsPanel';
import { nameToSlug } from '@/lib/slugify';
import { getSiteOrigin } from '@/lib/siteUrl';
import { ModBadge } from '@/components/ModBadge';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { format } from 'date-fns';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { normalizeTikTokUrl, parseWorkLinksJson, workLinksToJson, type WorkLinkEntry } from '@/lib/socialLinks';
import { ListOnCommunityWizard, type ListOnCommunityInitial } from '@/components/ListOnCommunityWizard';
import { HireRequestsInboxLink } from '@/components/HireRequestsInboxLink';
import { ProfileStrengthCards } from '@/components/ProfileStrengthCards';
import { SalesPipelineBoard } from '@/components/SalesPipelineBoard';
import { normalizeFreelancerSkills } from '@/lib/freelancerSkills';
import { resolveUniversityKey } from '@/lib/universities';
import { Button } from '@/components/ui/button';
import { RequestFeatureLink } from '@/components/RequestFeatureLink';
import { cn } from '@/lib/utils';
import { cardBase, cardDanger } from '@/lib/cardStyles';
import { computeProfileChecks } from '@/lib/profileCompleteness';
import { VanoPaySetupCard } from '@/components/VanoPaySetupCard';

const ModBadgeIfAdmin = ({ userId }: { userId: string }) => {
  const isAdmin = useIsAdmin(userId);
  return isAdmin ? <ModBadge /> : null;
};

/** Reject after `ms` if the underlying promise hasn't settled. Prevents
 *  a single hung Supabase query from leaving the page on a perpetual
 *  spinner — particularly painful on flaky 3G/mobile sessions. */
function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    Promise.resolve(p).then(
      (v) => { window.clearTimeout(t); resolve(v); },
      (e) => { window.clearTimeout(t); reject(e); },
    );
  });
}

const Profile = () => {
  const navigate = useNavigate();
  useProfileCompletion();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // "You're live" celebration — only fires once, when ListOnCommunity
  // redirects here with ?welcome=1 right after the Quick-start publish.
  // We strip the flag on dismiss so a browser back/refresh doesn't
  // re-open it.
  const [showWelcome, setShowWelcome] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('welcome') === '1';
  });
  // Remembers that the celebration modal was rendered this session,
  // even after it's dismissed. Used below to suppress the top-of-page
  // VanoPaySetupCard when it would immediately re-pitch Vano Pay to a
  // user who just saw the same CTA inside the celebration. Without
  // this, closing the celebration "Set up later" and finding the
  // same CTA five inches lower reads as nagging, not helpful. Next
  // visit (no ?welcome=1), the top card renders normally.
  const [celebrationShownThisSession] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('welcome') === '1';
  });
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
  const [instagramUrl, setInstagramUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [expectedBonusAmount, setExpectedBonusAmount] = useState('');
  const [expectedBonusUnit, setExpectedBonusUnit] = useState<'percentage' | 'flat'>('percentage');
  const [workLinks, setWorkLinks] = useState<WorkLinkEntry[]>([{ url: '', label: '' }]);
  const [bannerUrl, setBannerUrl] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  // Stage 3 structured location — county (Ireland-wide enum) + remote
  // flag. Written through to student_profiles alongside service_area
  // for back-compat while legacy readers migrate off the free-text
  // field. Digital-category freelancers auto-get remote_ok = true;
  // local (videography) freelancers pick a county and toggle remote.
  const [county, setCounty] = useState<string>('');
  const [remoteOk, setRemoteOk] = useState<boolean>(true);
  const [typicalBudgetMin, setTypicalBudgetMin] = useState('');
  const [typicalBudgetMax, setTypicalBudgetMax] = useState('');
  const [listCommunityOpen, setListCommunityOpen] = useState(false);
  const [wizardStartStep, setWizardStartStep] = useState<number | undefined>(undefined);
  // Skip-mode flag for the wizard. When the freelancer already has a
  // published listing, tapping the generic "Edit listing" button opens
  // the chip-picker grid instead of the linear 4-step flow so they can
  // tweak one thing and close.
  const [wizardInPicker, setWizardInPicker] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  // "Share as image" flow. The ShareCardFrame is only mounted while
  // `sharingState === 'rendering'` — an off-screen 1080×1080 DOM node that
  // html-to-image rasterises to PNG. The frame is unmounted as soon as the
  // capture finishes so it doesn't sit in the tree permanently.
  const [sharingState, setSharingState] = useState<'idle' | 'rendering'>('idle');
  const shareFrameRef = useRef<HTMLDivElement | null>(null);
  const [qualityExpanded, setQualityExpanded] = useState(false);
  const [existingPost, setExistingPost] = useState<any>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [portfolioCount, setPortfolioCount] = useState(0);

  // Sticky "Save Profile" floating bar — shows when the real Save button at
  // the bottom of the long form scrolls out of view. Uses IntersectionObserver
  // rather than dirty-state tracking because the form has 20+ fields; just
  // mirroring the bottom button is simpler and equally useful for the "I've
  // scrolled up and can't remember where Save is" problem.
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const [saveButtonVisible, setSaveButtonVisible] = useState(true);
  useEffect(() => {
    const el = saveButtonRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => setSaveButtonVisible(entries[0]?.isIntersecting ?? true),
      { rootMargin: '0px 0px -40px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [existingPost, profile]);
  const bannerFileInputRef = React.useRef<HTMLInputElement>(null);

  const listOnCommunityInitial = useMemo((): ListOnCommunityInitial => ({
    bannerUrl,
    tiktokUrl,
    instagramUrl,
    linkedinUrl,
    websiteUrl,
    workLinks,
    skills,
    serviceArea,
    county,
    remoteOk,
    typicalBudgetMin,
    typicalBudgetMax,
    hourlyRate,
    bio,
    university,
    phone,
    expectedBonusAmount,
    expectedBonusUnit,
    existingPost: existingPost ?? null,
  }), [bannerUrl, tiktokUrl, instagramUrl, linkedinUrl, websiteUrl, workLinks, skills, serviceArea, county, remoteOk, typicalBudgetMin, typicalBudgetMax, hourlyRate, bio, university, phone, expectedBonusAmount, expectedBonusUnit, existingPost]);

  // Bumped on every loadProfile() call; any in-flight load whose id no
  // longer matches the current one short-circuits before touching state.
  // Bumped again in the cleanup so a load that started right before unmount
  // can't fire setLoading(false) on a dead component.
  const loadIdRef = useRef(0);

  useEffect(() => {
    void loadProfile();
    return () => { loadIdRef.current += 1; };
  }, []);

  /* ── Share-as-image capture effect ──
     Watches `sharingState`. When it flips to 'rendering', the off-screen
     ShareCardFrame has just mounted; we wait briefly for remote avatar/banner
     images to settle, rasterise the node with html-to-image, then either open
     the Web Share sheet (mobile) or trigger a PNG download (desktop). Must
     live here above the `if (loading) return` early exit below so the hook
     order stays stable. */
  useEffect(() => {
    if (sharingState !== 'rendering') return;
    let cancelled = false;

    const t = window.setTimeout(async () => {
      if (cancelled) return;
      const node = shareFrameRef.current;
      if (!node) {
        setSharingState('idle');
        return;
      }
      try {
        const dataUrl = await toPng(node, {
          cacheBust: true,
          pixelRatio: 1,
          backgroundColor: '#ffffff',
        });
        if (cancelled) return;

        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `vano-${nameToSlug(displayName) || 'profile'}.png`, { type: 'image/png' });
        const shareUrl = `${getSiteOrigin()}/u/${nameToSlug(displayName)}`;

        const nav = navigator as unknown as {
          canShare?: (data: { files?: File[] }) => boolean;
          share?: (data: { files?: File[]; title?: string; text?: string; url?: string }) => Promise<void>;
        };
        const canShareFiles = typeof nav.canShare === 'function' && nav.canShare({ files: [file] });
        if (canShareFiles && typeof nav.share === 'function') {
          try {
            await nav.share({
              files: [file],
              title: 'Find me on Vano',
              text: `I'm on Vano — ${shareUrl}`,
              url: shareUrl,
            });
          } catch {
            // User dismissed the share sheet — not an error.
          }
        } else {
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast({ title: 'Saved to your device', description: 'Post it on Instagram, TikTok, or WhatsApp.' });
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error('share card render failed', err);
        toast({ title: 'Could not create image', description: 'Try again in a moment.', variant: 'destructive' });
      } finally {
        if (!cancelled) setSharingState('idle');
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [sharingState, displayName, toast]);

  const loadProfile = async () => {
    const myId = ++loadIdRef.current;
    const stale = () => loadIdRef.current !== myId;

    setLoading(true);
    try {
      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(), 8000, 'auth session',
      );
      if (stale()) return;
      if (!session) {
        navigate('/auth');
        return;
      }
      setUser(session.user);

      let { data: prof } = await withTimeout(
        supabase.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle(),
        10000, 'profile',
      );
      if (stale()) return;

      // Auto-create profile if missing
      if (!prof) {
        const { data: newProf } = await supabase.from('profiles').insert({
          user_id: session.user.id,
          display_name: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || '',
        }).select().single();
        if (stale()) return;
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
        const { data: gigs } = await withTimeout(
          supabase.from('jobs').select('*').eq('posted_by', session.user.id).order('created_at', { ascending: false }),
          10000, 'business jobs',
        );
        if (stale()) return;
        setMyGigs(gigs || []);
      }

      if (prof?.user_type === 'student') {
        setWorkDescription(prof?.work_description || '');
        const { data: sp } = await withTimeout(
          supabase.from('student_profiles').select('*').eq('user_id', session.user.id).maybeSingle(),
          10000, 'student profile',
        );
        if (stale()) return;
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
          setInstagramUrl((sp as any).instagram_url || '');
          setLinkedinUrl((sp as any).linkedin_url || '');
          setWebsiteUrl((sp as any).website_url || '');
          {
            const amt = (sp as any).expected_bonus_amount;
            setExpectedBonusAmount(amt != null && amt > 0 ? String(amt) : '');
            const unit = (sp as any).expected_bonus_unit;
            setExpectedBonusUnit(unit === 'flat' ? 'flat' : 'percentage');
          }
          setBannerUrl((sp as any).banner_url || '');
          setServiceArea((sp as any).service_area || '');
          // Prefer the structured county; ignore junk legacy values so
          // a malformed backfill doesn't wedge the dropdown.
          const loadedCounty = (sp as any).county;
          setCounty(isIrelandCounty(loadedCounty) ? loadedCounty : '');
          setRemoteOk((sp as any).remote_ok !== false);
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

        // Three independent queries — parallelise so total wait time is the
        // slowest single one, not the sum. Each has its own timeout so a
        // single hung query can't lock the page.
        const [piRes, gigsRes, postRes] = await Promise.all([
          withTimeout(
            supabase.from('portfolio_items')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', session.user.id),
            10000, 'portfolio count',
          ),
          withTimeout(
            supabase.from('jobs')
              .select('*')
              .eq('posted_by', session.user.id)
              .order('created_at', { ascending: false }),
            10000, 'student jobs',
          ),
          withTimeout(
            supabase.from('community_posts')
              .select('id, category, title, description, image_url, rate_min, rate_max, rate_unit, likes_count, created_at')
              .eq('user_id', session.user.id)
              .eq('moderation_status', 'approved')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            10000, 'community post',
          ),
        ]);
        if (stale()) return;
        setPortfolioCount(piRes.count ?? 0);
        setMyGigs(gigsRes.data || []);
        const postRow = postRes.data;
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
      if (stale()) return;
      if (import.meta.env.DEV) console.error('Failed to load profile:', err);
      toast({
        title: "Couldn't load your profile",
        description: 'Pull to refresh, or check your connection.',
        variant: 'destructive',
      });
    } finally {
      if (!stale()) setLoading(false);
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
          // Clamp to [0, 20] — parseFloat accepts negatives and scientific
          // notation (`-10`, `1e2`), so we guard both ends rather than just
          // the upper cap.
          hourly_rate: Math.max(0, Math.min(parseFloat(hourlyRate) || 0, 20)),
          phone,
          is_available: isAvailable,
          banner_url: bannerUrl || null,
          // Keep writing service_area as a mirror of county for legacy
          // readers that haven't migrated to the structured pair yet.
          service_area: county.trim() || serviceArea.trim() || null,
          county: county.trim() || null,
          remote_ok: remoteOk,
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
      if (import.meta.env.DEV) console.error('Failed to save profile:', err);
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

  // text-base (16px) — under iOS Safari, any focused input with
  // computed font-size <16px auto-zooms the viewport. Keeping this at
  // 16px across the board is the Apple-recommended fix and matches
  // what Gmail / Stripe / Airbnb do. Desktop visuals take the 2px hit.
  const inputClass = "w-full border border-input rounded-xl px-4 py-3 text-base bg-background focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors duration-200";

  /* ── Share-as-image handler ──
     Click → flip sharingState to 'rendering' which mounts the off-screen
     ShareCardFrame. The effect (hoisted above the `if (loading)` early return
     so rules-of-hooks is satisfied) waits a tick for images to load, then
     captures the frame to PNG and hands it to the native share sheet (mobile)
     or triggers a download (desktop / unsupported browsers). */
  const handleShareAsImage = () => {
    if (sharingState !== 'idle') return;
    if (!displayName) {
      toast({ title: 'Add your name first', description: 'So we know what to put on the card.' });
      return;
    }
    setSharingState('rendering');
  };

  /* ── Progress Ring helper ── */
  const ProgressRing = ({ done, total, size = 64, stroke = 5 }: { done: number; total: number; size?: number; stroke?: number }) => {
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const pct = total > 0 ? done / total : 0;
    const offset = circ * (1 - pct);
    // Color shifts: red → amber → blue → green as completion grows
    const ringColor = pct >= 1 ? '#10b981' : pct >= 0.75 ? '#3b82f6' : pct >= 0.4 ? '#f59e0b' : '#ef4444';
    return (
      <svg width={size} height={size} className="shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={ringColor}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          className="animate-progress-ring"
          // One-shot `progress-ring-fill` keyframe handles the first-mount
          // sweep; the transition handles subsequent value changes (e.g.,
          // user saves a field and % bumps from 70 → 80). Without the
          // transition the strokeDashoffset prop jumps instantly on
          // re-render, which looks glitchy.
          style={{
            '--ring-circumference': circ,
            '--ring-offset': offset,
            transition: 'stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1), stroke 300ms ease-out',
          } as React.CSSProperties}
        />
      </svg>
    );
  };

  /* ── Unified profile progress card ──
     Single source of truth for "how done is this profile". Replaces the
     earlier pair of widgets (inline % bar + big checklist card) which
     duplicated the same information and together made the page feel
     alarm-y. Uses the weighted checks from `computeProfileChecks` so the
     percentage matches what's shown on the public profile tier badge. */
  const renderProgressCard = (
    checks: { key: string; label: string; done: boolean; weight: number }[],
    actionFor: Record<string, () => void>,
  ) => {
    const filled = checks.filter((c) => c.done).reduce((sum, c) => sum + c.weight, 0);
    const incomplete = checks
      .filter((c) => !c.done)
      .sort((a, b) => b.weight - a.weight);
    const complete = checks.filter((c) => c.done);

    // 100% — fold down to a calm emerald pill so the reward stays once
    // and doesn't keep drawing attention after the work is done.
    if (filled >= 100 || incomplete.length === 0) {
      return (
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/[0.06] px-3.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 size={14} className="text-emerald-500" />
          Profile complete — you're all set
        </div>
      );
    }

    const motivationMsg =
      filled >= 75
        ? 'Almost there — just a few more!'
        : filled >= 50
          ? 'Halfway done — keep going!'
          : filled > 0
            ? 'Good start — complete your profile to get seen'
            : 'Get started — fill in your profile to attract businesses';

    // Short second-line hints per check. Kept here (rather than inside
    // `computeProfileChecks`) so the shared scoring helper stays neutral
    // and the editor-only copy lives with the editor.
    const detailFor: Record<string, string> = {
      name: 'Businesses see your name in search results',
      avatar: 'Profiles with a real face get far more messages',
      bio: 'A short intro builds trust before someone messages you',
      banner: 'Cover photos make your card stand out on the talent board',
      phone: 'So businesses can reach you when they hire',
      university: 'Adds trust — businesses prefer verified students',
      skills: 'Businesses search by skill to find you',
      portfolio: 'Profiles with work samples get way more views',
    };

    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {/* Header: ring + motivation + preview */}
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="relative">
            <ProgressRing done={filled} total={100} size={64} stroke={5} />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="text-base font-bold tabular-nums text-foreground leading-none">{filled}%</span>
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{motivationMsg}</p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {complete.length} of {checks.length} complete
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/students/${user.id}`)}
            className="shrink-0 rounded-xl border border-border px-3 py-1.5 text-[12px] font-semibold text-foreground/70 transition-all duration-200 hover:border-foreground/20 hover:text-foreground hover:shadow-sm"
          >
            Preview
          </button>
        </div>

        {/* Incomplete rows — neutral card background with a small amber
            dot per row. The heavy `border-l-amber-400 bg-amber-50/50`
            wash the previous design used made the whole page feel
            alarm-y; the dot still reads as "needs attention" without
            overwhelming. */}
        <ul className="border-t border-border/50">
          {incomplete.map((check) => {
            const handler = actionFor[check.key];
            return (
              <li key={check.key}>
                <button
                  type="button"
                  onClick={handler}
                  disabled={!handler}
                  className="group flex w-full items-center gap-3 border-b border-border/50 px-5 py-3 text-left last:border-b-0 transition-colors hover:bg-muted/30 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{check.label}</p>
                    {detailFor[check.key] && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{detailFor[check.key]}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">+{check.weight}%</span>
                  {handler && (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-transparent px-2.5 py-1 text-xs font-semibold text-primary transition-colors group-hover:border-primary/30 group-hover:bg-primary/5">
                      Fix
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Collapsed "completed" drawer. Hidden by default so the card
            stays compact; reassurance is a click away. */}
        {complete.length > 0 && (
          <div className="border-t border-border/50">
            <button
              type="button"
              onClick={() => setQualityExpanded((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left transition-colors hover:bg-muted/30"
              aria-expanded={qualityExpanded}
            >
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 size={12} className="text-emerald-500" />
                {complete.length} done
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">
                {qualityExpanded ? 'Hide' : 'Show'}
              </span>
            </button>
            {qualityExpanded && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/50 bg-muted/20 px-5 py-3">
                {complete.map((c) => (
                  <span key={c.key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 size={12} className="text-emerald-500" />
                    <span className="line-through">{c.label}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead title="My Profile – VANO" description="Manage your VANO profile." noindex />
      <FreshListingCelebration
        open={showWelcome}
        shareUrl={`${getSiteOrigin()}/u/${nameToSlug(displayName || 'profile')}`}
        onClose={() => {
          setShowWelcome(false);
          // Strip the flag so refresh / back doesn't re-open the overlay.
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('welcome');
            url.searchParams.delete('listed');
            window.history.replaceState({}, '', url.toString());
          }
          // Point them at the "View public profile" link so they know
          // they can see exactly what a client sees. Without this, a
          // first-time freelancer often forgets they have a public-facing
          // page until they get their first message. Toast persists for
          // ~6s so they catch it after the modal closes.
          toast({
            title: 'You can see your listing from a client\'s view',
            description: 'Tap "View public profile" at the top to preview what businesses see.',
            duration: 6000,
          });
        }}
      />
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
            {/* The old "You're not on the talent board yet" nudge banner was
                removed here — it duplicated the amber "Not visible yet" card
                rendered further down (with its "Get listed" button), and the
                two had different behaviours: the nudge navigated away to
                /list-on-community, while the amber card opens the wizard
                inline as a modal. Keeping one path (the modal) per the
                user's note about "two different edit profile things". */}

            {/* Top-of-profile Vano Pay surface — for freelancers who
                haven't started Stripe Connect onboarding yet. The detail
                card (same component) used to live ~1000 lines further
                down the profile form, so a new freelancer would never
                see the payouts path without scrolling past 10+ fields
                first. Lifting it above the grid puts the revenue path
                above the fold; once stripe_account_id is set, this top
                instance disappears and the card reverts to its regular
                place in the left column so it doesn't crowd returning
                users. The eyebrow frames it as a guided first step. */}
            {!studentProfile?.stripe_account_id && !celebrationShownThisSession && (
              <div className="mb-6" id="vano-pay-setup">
                <div className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/12 text-[11px] font-semibold text-primary">1</span>
                  Set up how you get paid
                </div>
                <VanoPaySetupCard userId={user.id} />
              </div>
            )}

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

                {/* ── Unified profile completeness card ──
                    One widget for the whole page. Replaces the earlier
                    pair (inline % bar + big checklist card) which showed
                    the same weighted checks twice and together dominated
                    the layout. Uses the shared `computeProfileChecks`
                    helper so the percentage matches the public profile
                    tier badge exactly. Collapses to a small emerald pill
                    once the profile hits 100%. */}
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
                  // Per-check action — where to send the user when they
                  // tap a row. Keys match the CompletenessCheck.key union.
                  // Banner goes to the existing inline file picker so users
                  // don't have to re-open a 4-step wizard for one upload;
                  // the rest still open the wizard at the right step.
                  const actionFor: Record<string, () => void> = {
                    name: () => document.querySelector<HTMLInputElement>('input[placeholder*="Your name"]')?.focus(),
                    avatar: () => document.querySelector('[data-avatar-upload]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
                    bio: () => openWizardAtStep(2),
                    banner: () => bannerFileInputRef.current?.click(),
                    phone: () => openWizardAtStep(2),
                    university: () => openWizardAtStep(2),
                    skills: () => openWizardAtStep(3),
                    portfolio: () => openWizardAtStep(1),
                  };

                  // Hand-picked "high-impact basics" panel that surfaces for
                  // freshly-published freelancers (Quick Start path leaves
                  // banner / phone / skills empty by design). Renders ABOVE
                  // the full completeness card and only when there's at
                  // least one easy win to nail. Disappears once everything
                  // important is filled in — no permanent nag.
                  const isLive = studentProfile?.community_board_status === 'approved';
                  const basics = [
                    {
                      key: 'banner',
                      done: !!bannerUrl,
                      label: 'Add a cover photo',
                      hint: 'Listings with a cover get 3× more messages.',
                      action: () => bannerFileInputRef.current?.click(),
                      cta: 'Upload photo',
                    },
                    {
                      key: 'phone',
                      done: !!phone?.trim(),
                      label: 'Add your phone number',
                      hint: "We'll text you the second a business reaches out.",
                      action: () => openWizardAtStep(2),
                      cta: 'Add phone',
                    },
                    {
                      key: 'skills',
                      done: skills.length >= 3,
                      label: skills.length === 0
                        ? 'Pick a few skills'
                        : 'Add a few more skills',
                      hint: 'Three or more lets businesses find you in search.',
                      action: () => openWizardAtStep(3),
                      cta: skills.length === 0 ? 'Pick skills' : 'Add skills',
                    },
                    {
                      // Vano Pay activation. We treat "done" generously
                      // here: as long as the freelancer has started Connect
                      // onboarding (stripe_account_id present), we don't
                      // nag them. The VanoPaySetupCard below already shows
                      // a "Finish setup" CTA for the pending state. Only
                      // show this row when nothing has been started yet.
                      key: 'vano_pay',
                      done: !!(studentProfile?.stripe_account_id),
                      label: 'Get paid through Vano',
                      hint: 'One 3-min Stripe setup. Money in your bank in 1–2 days. 3% fee.',
                      action: () => {
                        document
                          .getElementById('vano-pay-setup')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      },
                      cta: 'Set up',
                    },
                  ];
                  const remainingBasics = basics.filter((b) => !b.done);
                  const showBasicsPanel = isLive && remainingBasics.length > 0;

                  return (
                    <>
                      {showBasicsPanel && (
                        <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.06] via-card to-card p-5 shadow-sm">
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
                            Finish setting up
                          </p>
                          <h3 className="mt-1 text-base font-semibold text-foreground sm:text-lg">
                            You&apos;re live — now make your listing pop
                          </h3>
                          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                            Quick wins that take a minute each. Skip what you don&apos;t need.
                          </p>
                          <ul className="mt-3 space-y-2">
                            {remainingBasics.map((b) => (
                              <li
                                key={b.key}
                                className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-3.5 py-3"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-[13px] font-semibold text-foreground">{b.label}</p>
                                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{b.hint}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={b.action}
                                  className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground shadow-sm transition hover:brightness-110 active:scale-[0.97]"
                                >
                                  {b.cta}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {renderProgressCard(checks, actionFor)}
                    </>
                  );
                })()}

                {/* Listing status card — splits the old "not approved" catch-all
                     into three distinct messages so the freelancer knows what's
                     happening. Publish flow currently fast-paths to 'approved',
                     but 'pending' and 'rejected' are valid states an admin can
                     set via the review modal — under the old UI both read as
                     "complete your listing to go live," which is misleading
                     when the listing is already complete and sitting in review
                     (or needs edits after a rejection). */}
                {studentProfile?.community_board_status === 'pending' && (
                  <div className={cn(cardBase, 'px-5 py-4')}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="flex h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                          <p className="text-sm font-semibold text-foreground">Listing under review</p>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                          Your submission is with the Vano team. We&apos;ll email you the moment it goes live — usually within a business day. You can keep editing in the meantime; any changes re-queue for review.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="lg"
                        variant="outline"
                        className="h-11 w-full shrink-0 rounded-xl px-5 text-sm font-semibold sm:h-12 sm:w-auto sm:min-w-[9.5rem]"
                        onClick={() => setListCommunityOpen(true)}
                      >
                        Edit listing
                      </Button>
                    </div>
                  </div>
                )}
                {studentProfile?.community_board_status === 'rejected' && (
                  <div className={cn(cardDanger, 'px-5 py-4')}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="flex h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                          <p className="text-sm font-semibold text-foreground">Listing needs changes</p>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                          An admin flagged something on your listing — check your email for the details, then re-open the wizard to address it. You&apos;ll go live again as soon as it&apos;s resubmitted.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="lg"
                        className="h-11 w-full shrink-0 rounded-xl px-5 text-sm font-semibold shadow-md sm:h-12 sm:w-auto sm:min-w-[9.5rem] transition-all duration-200 hover:shadow-lg hover:-translate-y-[1px]"
                        onClick={() => setListCommunityOpen(true)}
                      >
                        Open wizard
                      </Button>
                    </div>
                  </div>
                )}
                {/* Not visible yet CTA — calm card treatment. Only renders for
                     freelancers who haven't submitted a listing at all (null
                     status). Pending and rejected get their own cards above. */}
                {!studentProfile?.community_board_status && (
                  <div className={cn(cardBase, 'px-5 py-4')}>
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

                {/* Publish-then-polish nudges — only for LIVE listings.
                    Cold freelancers who haven't published yet see the
                    "Get listed" CTA above instead; there's no point
                    pushing polish tasks at someone who hasn't gone live.
                    The component returns null when every task is done
                    so it self-retires as the listing matures. */}
                {studentProfile?.community_board_status === 'approved' && (
                  <ProfileStrengthCards
                    slots={{
                      hasCover: !!(existingPost?.image_url || (studentProfile as any)?.banner_url),
                      strengthsCount: Array.isArray((studentProfile as any)?.strengths)
                        ? (studentProfile as any).strengths.length
                        : 0,
                      skillsCount: Array.isArray(studentProfile?.skills)
                        ? studentProfile.skills.length
                        : 0,
                      hasBio: !!(studentProfile?.bio && String(studentProfile.bio).trim().length > 0),
                      hasAnySocial: !!(
                        studentProfile?.tiktok_url ||
                        studentProfile?.instagram_url ||
                        studentProfile?.linkedin_url ||
                        studentProfile?.website_url
                      ),
                      hasSpecialty: !!((studentProfile as any)?.specialty),
                    }}
                    onJumpToStep={(step) => {
                      setWizardInPicker(false);
                      openWizardAtStep(step);
                    }}
                  />
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
                        onClick={() => {
                          // Published listings open in skip-mode so a
                          // returning freelancer can tweak one thing
                          // and close, instead of walking 4 steps again.
                          setWizardInPicker(true);
                          setListCommunityOpen(true);
                        }}
                        className="text-[12px] font-semibold text-primary transition-colors duration-200 hover:text-primary/80 hover:underline"
                      >
                        Edit listing
                      </button>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-card">
                      {/* ── COVER section ── The cover image itself is a
                          strong visual signal; the uppercase "Cover"
                          header was removed so the card reads cleanly
                          and the preview dominates. */}
                      <div>
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
                          {/* Location chip — mirrors the StudentCard banner so
                              freelancers see exactly what buyers see on the
                              talent board. Uses the structured
                              county + remote_ok pair via formatLocation;
                              falls back to legacy service_area only for
                              rows that haven't migrated yet. */}
                          {(() => {
                            if (!(existingPost.image_url || bannerUrl)) return null;
                            const label = formatLocation({ county, remote_ok: remoteOk }) ?? (serviceArea.trim() || null);
                            if (!label) return null;
                            return (
                              <div className="absolute left-3 top-3">
                                <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
                                  <MapPin size={9} className="shrink-0 text-white/80" />
                                  <span className="max-w-[160px] truncate">{label}</span>
                                </span>
                              </div>
                            );
                          })()}

                          {/* Price pill — right side, high-contrast, same
                              treatment as the live StudentCard. Hourly wins
                              when set; otherwise shows typical-project budget. */}
                          {(existingPost.image_url || bannerUrl) && (() => {
                            const rate = parseFloat(hourlyRate.replace(',', '.'));
                            const budgetLabel = formatTypicalBudget(
                              typicalBudgetMin ? parseInt(typicalBudgetMin, 10) : null,
                              typicalBudgetMax ? parseInt(typicalBudgetMax, 10) : null,
                            );
                            if (!(rate > 0) && !budgetLabel) return null;
                            return (
                              <div className="absolute right-3 top-3">
                                <span className="inline-flex items-baseline gap-1 rounded-lg bg-white/95 px-2.5 py-1 shadow-md backdrop-blur-sm">
                                  {rate > 0 ? (
                                    <>
                                      <span className="text-[13px] font-bold text-emerald-600">€{rate}</span>
                                      <span className="text-[10px] font-semibold text-muted-foreground/80">/hr</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-[13px] font-bold text-emerald-600">{budgetLabel}</span>
                                      <span className="text-[10px] font-semibold text-muted-foreground/80">/project</span>
                                    </>
                                  )}
                                </span>
                              </div>
                            );
                          })()}

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

                      {/* ── ABOUT section ── The in-card placeholder
                          copy ("Add a headline…") already signals the
                          empty state, so the redundant uppercase "About"
                          header was dropped. Padding bumped to py-3.5
                          for a calmer vertical rhythm. */}
                      <button
                        type="button"
                        onClick={() => openWizardAtStep(2)}
                        className="group w-full border-t border-foreground/8 px-4 py-3.5 text-left transition-all duration-200 hover:bg-muted/30 active:bg-muted/40"
                      >
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

                      {/* ── SKILLS section (opens wizard) ── Dashed
                          placeholder pills signal empty state; the
                          uppercase "Skills" header was redundant. */}
                      <button
                        type="button"
                        onClick={() => openWizardAtStep(3)}
                        className="group w-full border-t border-foreground/8 px-4 py-3.5 text-left transition-all duration-200 hover:bg-muted/30 active:bg-muted/40"
                      >
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

                      {/* ── PRICING section (inline editable) ── Kept
                          a heading here because, unlike the other
                          sub-sections, this one shows form inputs and
                          needs a label to scan. Sentence-case to match
                          the rest of the page. */}
                      <div className="border-t border-foreground/8 px-4 py-3.5">
                        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
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

                      {/* ── LINKS section ── Placeholder copy ("Add
                          portfolio links…") carries the empty state, so
                          the uppercase header was dropped. */}
                      <button
                        type="button"
                        onClick={() => openWizardAtStep(2)}
                        className="group w-full border-t border-foreground/8 px-4 py-3.5 text-left transition-all duration-200 hover:bg-muted/30 active:bg-muted/40"
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
                )}

                {/* Pre- and post-approval quality checklists used to
                    live here as two separate `renderChecklist` cards.
                    Both were collapsed into the single progress card at
                    the top of the column so the page shows one widget
                    for "how done is my profile" instead of two. */}

                {/* ── Your Details card ── */}
                <div>
                  <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    <div className="border-b border-border/50 px-5 py-3">
                      <p className="text-sm font-semibold text-foreground">Your details</p>
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
                        ref={saveButtonRef}
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold shadow-sm transition-all duration-200 hover:bg-primary/90 hover:shadow-md hover:brightness-105 disabled:opacity-50 disabled:hover:shadow-sm"
                      >
                        {saving ? 'Saving...' : 'Save Profile'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Vano Pay setup — detail card for freelancers who've
                    already kicked off Stripe onboarding (pending) or
                    finished it (enabled). The not-set-up state renders
                    above the profile form instead (see the top-of-page
                    block), so we skip it here to avoid a duplicate.
                    The wrapper id lets the post-publish basics card
                    scroll-into-view on tap. */}
                {studentProfile?.stripe_account_id && (
                  <div id="vano-pay-setup">
                    <VanoPaySetupCard userId={user.id} />
                  </div>
                )}

              </div>
              {/* ── END LEFT COLUMN ── */}

              {/* ── RIGHT COLUMN: Sidebar (quality + link) ── */}
              <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">

                {/* ── Portfolio section ── */}
                <div>
                  <PortfolioManager userId={user.id} />
                </div>

                {/* ── Clients I brought (digital_sales only) ── */}
                {existingPost?.category === 'digital_sales' && user?.id && (
                  <div>
                    <SalesReferralsPanel mode="sales" currentUserId={user.id} />
                  </div>
                )}

                {/* ── Sales deal pipeline (digital_sales only) ──
                    Lives below the Referrals panel because referrals is
                    the "clients I brought" lifetime stat; the pipeline
                    is the operational "what's cooking now" view. Both
                    only render for digital_sales freelancers — a
                    videographer has no use for a pipeline surface. */}
                {existingPost?.category === 'digital_sales' && user?.id && (
                  <div>
                    <SalesPipelineBoard
                      userId={user.id}
                      defaultBonusRate={
                        typeof (studentProfile as any)?.expected_bonus_amount === 'number'
                          ? (studentProfile as any).expected_bonus_amount as number
                          : null
                      }
                      defaultBonusUnit={
                        (studentProfile as any)?.expected_bonus_unit === 'flat'
                          ? 'flat'
                          : (studentProfile as any)?.expected_bonus_unit === 'percentage'
                          ? 'percentage'
                          : null
                      }
                    />
                  </div>
                )}

                {/* Shareable profile link — sidebar on desktop */}
                {displayName && (
                  <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    <div className="border-b border-border/50 px-5 py-3">
                      <p className="text-sm font-semibold text-foreground">Your profile link</p>
                    </div>
                    <div className="p-5 space-y-3">
                      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                        <Link2 size={14} className="shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">
                          {getSiteOrigin()}/u/{nameToSlug(displayName)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(`${getSiteOrigin()}/u/${nameToSlug(displayName)}`);
                            setLinkCopied(true);
                            toast({ title: 'Link copied' });
                            setTimeout(() => setLinkCopied(false), 2000);
                          }}
                          className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground transition-all duration-200 hover:border-foreground/20 hover:shadow-sm inline-flex items-center justify-center gap-1.5"
                        >
                          {linkCopied ? <><Check size={14} className="text-emerald-500" />Copied!</> : <><Link2 size={14} />Copy link</>}
                        </button>
                        <button
                          type="button"
                          onClick={handleShareAsImage}
                          disabled={sharingState === 'rendering'}
                          className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground transition-all duration-200 hover:border-foreground/20 hover:shadow-sm inline-flex items-center justify-center gap-1.5 disabled:cursor-progress disabled:opacity-70"
                        >
                          {sharingState === 'rendering'
                            ? <><Loader2 size={14} className="animate-spin" />Creating…</>
                            : <><Share2 size={14} />Share as image</>}
                        </button>
                      </div>
                      <div className="rounded-xl bg-muted/40 px-3.5 py-2.5">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Put the link in your Instagram bio, or share the image on Stories & WhatsApp.
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
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold text-muted-foreground transition-all duration-200 hover:border-foreground/20 hover:bg-muted/50 hover:text-foreground"
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
                if (!v) {
                  setWizardStartStep(undefined);
                  setWizardInPicker(false);
                }
              }}
              userId={user.id}
              initial={listOnCommunityInitial}
              startAtStep={wizardStartStep}
              startInPicker={wizardInPicker}
              onSubmittedForReview={() => {
                void loadProfile();
              }}
            />

            {/* Off-screen share-card frame. Mounted only while the capture
                is in flight; otherwise not in the tree at all. Positioned
                top:-99999px so it doesn't paint into the layout but still
                has real computed dimensions for html-to-image to rasterise. */}
            {sharingState === 'rendering' && (
              <div
                style={{ position: 'fixed', left: -99999, top: -99999, pointerEvents: 'none' }}
                aria-hidden
              >
                <ShareCardFrame
                  ref={shareFrameRef}
                  displayName={displayName}
                  bannerUrl={existingPost?.image_url || bannerUrl || null}
                  avatarUrl={avatarUrl || null}
                  bio={(existingPost?.description as string | null) || bio || null}
                  skills={skills}
                  categoryLabel={(() => {
                    const id = existingPost?.category;
                    return id && isCommunityCategoryId(id) ? COMMUNITY_CATEGORIES[id].label : undefined;
                  })()}
                  categoryId={(existingPost?.category as string | null) || null}
                  hourlyRate={hourlyRate ? Number(hourlyRate) : null}
                  budgetLabel={formatTypicalBudget(
                    typicalBudgetMin ? parseInt(typicalBudgetMin, 10) : null,
                    typicalBudgetMax ? parseInt(typicalBudgetMax, 10) : null,
                  )}
                  serviceArea={formatLocation({ county, remote_ok: remoteOk }) ?? serviceArea ?? null}
                  profileUrl={`${getSiteOrigin().replace(/^https?:\/\//, '')}/u/${nameToSlug(displayName)}`}
                />
              </div>
            )}

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
                  ref={saveButtonRef}
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
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold text-muted-foreground transition-all duration-200 hover:border-foreground/20 hover:bg-muted/50 hover:text-foreground"
              >
                <LogOut size={12} />
                Sign out / switch account
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sticky save bar — mirrors the bottom Save button when it scrolls out
          of view. Sits above the mobile bottom nav (which owns bottom: 0 on
          mobile) so the two don't overlap. Hidden on /auth screens etc. via
          the `!== approved` gate isn't needed — presence just follows the
          existence of a saveButtonRef-attached button in the DOM. */}
      {!saveButtonVisible && saveButtonRef.current && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/40 bg-card/95 px-4 py-3 shadow-[0_-6px_16px_-8px_rgba(0,0,0,0.12)] backdrop-blur-md md:bottom-0 safe-area-bottom pb-[max(0.75rem,calc(env(safe-area-inset-bottom,0px)+0.5rem+3.25rem))] md:pb-3">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <p className="truncate text-[12px] font-medium text-muted-foreground">
              Don't forget to save your changes
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="shrink-0 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-md transition-all duration-200 hover:brightness-110 hover:shadow-lg active:scale-[0.97] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
