import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Copy,
  ImagePlus,
  Loader2,
  X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  COMMUNITY_CATEGORY_ORDER,
  COMMUNITY_CATEGORIES,
  isCommunityCategoryId,
  type CommunityCategoryId,
} from '@/lib/communityCategories';
import { SKILLS_BY_CATEGORY, normalizeFreelancerSkills } from '@/lib/freelancerSkills';
import { formatCommunityBudget } from '@/lib/communityBudget';
import {
  normalizeTikTokUrl,
  normalizeInstagramUrl,
  normalizeLinkedInUrl,
  normalizeWebsiteUrl,
  workLinksToJson,
  type WorkLinkEntry,
} from '@/lib/socialLinks';
import { TagBadge } from '@/components/TagBadge';
import { StudentCardPreview } from '@/components/StudentCardPreview';
import { GhostStudentCard } from '@/components/GhostStudentCard';
import { cn } from '@/lib/utils';
import { getSupabaseErrorMessage, logSupabaseError } from '@/lib/supabaseError';
import { UNIVERSITIES, resolveUniversityKey } from '@/lib/universities';
import { markUserActed } from '@/lib/userActivity';
import { track } from '@/lib/track';

const STEP_LABELS = [
  'Your work',
  'Your story',
  'Your price',
  'Review',
];

const STEP_HEADINGS: Record<number, string> = {
  1: 'Show what you do',
  2: 'Tell them about you',
  3: 'Set your price',
  4: 'Looks good?',
};

const STEP_DESCRIPTIONS: Record<number, string> = {
  1: 'Pick your category, upload a cover photo, and share a few samples of your best work.',
  2: 'Write a short pitch, add your contact details, and drop any links to past work.',
  3: 'Set your price and pick your skills.',
  4: 'Quick check before you go live.',
};

// Percent shown at the top of each step. Numbers are intentionally
// front-loaded — step 1 lands at 15% so the flow feels further along
// than a literal 25% split, making the form feel lighter than it is.
const STEP_PROGRESS: Record<number, number> = {
  1: 15,
  2: 45,
  3: 75,
  4: 95,
};

// Legacy drafts can have step values from the old 7-step flow (0-6) or the
// pre-review 3-step flow. Migrate them forward so a user mid-draft isn't stranded.
function migrateDraftStep(old: number): number {
  if (old <= 2) return 1;
  if (old <= 4) return 2;
  if (old <= 6) return 3;
  return Math.min(old, STEP_LABELS.length);
}

/* ─── Student pricing caps ─── */
const MAX_HOURLY_RATE = 20;              // €20/hr for videography, content creation (social_media id)
const MAX_DIGITAL_SALES_HOURLY = 10;     // €10/hr retainer for digital sales — rest of earnings come via expected bonus / commission
const MAX_DAY_OR_PROJECT_RATE = 200;     // €200 per day / per project
const MAX_PROJECT_BUDGET = 500;          // €500 for websites

/** Returns the hourly-rate cap that applies to a given category. */
const hourlyCapFor = (cat: CommunityCategoryId | null): number =>
  cat === 'digital_sales' ? MAX_DIGITAL_SALES_HOURLY : MAX_HOURLY_RATE;

export interface ListOnCommunityInitial {
  bannerUrl: string;
  tiktokUrl: string;
  instagramUrl?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  workLinks: WorkLinkEntry[];
  skills: string[];
  serviceArea: string;
  typicalBudgetMin: string;
  typicalBudgetMax: string;
  hourlyRate: string;
  bio: string;
  university: string;
  phone?: string | null;
  expectedBonusAmount?: string;
  expectedBonusUnit?: 'percentage' | 'flat';
}

interface ListOnCommunityDraft {
  step: number;
  category: CommunityCategoryId | null;
  bannerUrl: string;
  title: string;
  description: string;
  aboutMe: string;
  tiktokUrl: string;
  instagramUrl: string;
  linkedinUrl: string;
  websiteUrl: string;
  workLinks: WorkLinkEntry[];
  serviceArea: string;
  university: string;
  phone: string;
  rateUnit: string;
  rateMin: string;
  rateMax: string;
  profileHourly: string;
  typicalBudgetMin: string;
  typicalBudgetMax: string;
  skills: string[];
  initialClientsBrought: string;
  expectedBonusAmount: string;
  expectedBonusUnit: 'percentage' | 'flat';
}

const listOnCommunityDraftKey = (userId: string) => `vano:list-on-community-draft:${userId}`;

function parseDraftWorkLinks(value: unknown): WorkLinkEntry[] {
  if (!Array.isArray(value)) return [{ url: '', label: '' }];
  const rows = value
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const obj = row as Record<string, unknown>;
      return {
        url: typeof obj.url === 'string' ? obj.url : '',
        label: typeof obj.label === 'string' ? obj.label : '',
      };
    })
    .filter((row): row is WorkLinkEntry => row !== null);
  return rows.length > 0 ? rows : [{ url: '', label: '' }];
}

function parseDraft(raw: string): ListOnCommunityDraft | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      step:
        typeof parsed.step === 'number'
          ? Math.max(0, Math.min(STEP_LABELS.length - 1, parsed.step))
          : 0,
      category: (() => {
        const raw = typeof parsed.category === 'string' ? parsed.category : null;
        // Legacy drafts may have category: 'photography' — coerce to null so the user re-picks.
        if (raw === 'photography') return null;
        return isCommunityCategoryId(raw) ? raw : null;
      })(),
      bannerUrl: typeof parsed.bannerUrl === 'string' ? parsed.bannerUrl : '',
      title: typeof parsed.title === 'string' ? parsed.title : '',
      description: typeof parsed.description === 'string' ? parsed.description : '',
      aboutMe: typeof parsed.aboutMe === 'string' ? parsed.aboutMe : '',
      tiktokUrl: typeof parsed.tiktokUrl === 'string' ? parsed.tiktokUrl : '',
      instagramUrl: typeof parsed.instagramUrl === 'string' ? parsed.instagramUrl : '',
      linkedinUrl: typeof parsed.linkedinUrl === 'string' ? parsed.linkedinUrl : '',
      websiteUrl: typeof parsed.websiteUrl === 'string' ? parsed.websiteUrl : '',
      workLinks: parseDraftWorkLinks(parsed.workLinks),
      serviceArea: typeof parsed.serviceArea === 'string' ? parsed.serviceArea : '',
      university: typeof parsed.university === 'string' ? resolveUniversityKey(parsed.university) : '',
      rateUnit: typeof parsed.rateUnit === 'string' ? parsed.rateUnit : 'hourly',
      rateMin: typeof parsed.rateMin === 'string' ? parsed.rateMin : '',
      rateMax: typeof parsed.rateMax === 'string' ? parsed.rateMax : '',
      profileHourly: typeof parsed.profileHourly === 'string' ? parsed.profileHourly : '',
      typicalBudgetMin: typeof parsed.typicalBudgetMin === 'string' ? parsed.typicalBudgetMin : '',
      typicalBudgetMax: typeof parsed.typicalBudgetMax === 'string' ? parsed.typicalBudgetMax : '',
      skills: Array.isArray(parsed.skills) ? parsed.skills.filter((s): s is string => typeof s === 'string') : [],
      initialClientsBrought: typeof parsed.initialClientsBrought === 'string' ? parsed.initialClientsBrought : '',
      expectedBonusAmount: typeof parsed.expectedBonusAmount === 'string' ? parsed.expectedBonusAmount : '',
      expectedBonusUnit: parsed.expectedBonusUnit === 'flat' ? 'flat' : 'percentage',
    };
  } catch {
    return null;
  }
}

interface ListOnCommunityWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  initial: ListOnCommunityInitial;
  /** Called after the listing goes live. */
  onSubmittedForReview: (category: CommunityCategoryId) => void;
  /** Jump straight to a specific step (0-indexed). Skips draft restore. */
  startAtStep?: number;
}

export const ListOnCommunityWizard: React.FC<ListOnCommunityWizardProps> = ({
  open,
  onOpenChange,
  userId,
  initial,
  onSubmittedForReview,
  startAtStep,
}) => {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<CommunityCategoryId | null>(null);
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [listingFiles, setListingFiles] = useState<File[]>([]);
  const [listingPreviews, setListingPreviews] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [aboutMe, setAboutMe] = useState('');
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [workLinks, setWorkLinks] = useState<WorkLinkEntry[]>([{ url: '', label: '' }]);
  const [serviceArea, setServiceArea] = useState('');
  const [university, setUniversity] = useState('');
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [rateUnit, setRateUnit] = useState('hourly');
  const [rateMin, setRateMin] = useState('');
  const [rateMax, setRateMax] = useState('');
  const [profileHourly, setProfileHourly] = useState('');
  const [typicalBudgetMin, setTypicalBudgetMin] = useState('');
  const [typicalBudgetMax, setTypicalBudgetMax] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [initialClientsBrought, setInitialClientsBrought] = useState('');
  const [expectedBonusAmount, setExpectedBonusAmount] = useState('');
  const [expectedBonusUnit, setExpectedBonusUnit] = useState<'percentage' | 'flat'>('percentage');
  const [submitting, setSubmitting] = useState(false);
  const [published, setPublished] = useState<{ category: CommunityCategoryId; phone: string } | null>(null);
  const [profileLinkCopied, setProfileLinkCopied] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  // Step 2 social fields are optional but visually heavy (4 empty inputs).
  // Hide them behind an "Add social links" toggle so the required fields
  // (bio + phone + university) read as the focus.
  const [showSocialFields, setShowSocialFields] = useState(false);
  // Mobile-only: the live card preview collapses to a slim sticky header to
  // keep the form readable on small screens. Tap to toggle expanded. On
  // desktop (lg+) the preview is always visible in its own column and this
  // flag is ignored.
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const listingInputRef = useRef<HTMLInputElement>(null);
  const MAX_LISTING_IMAGES = 5;

  useEffect(() => {
    if (!open) {
      setDraftReady(false);
      return;
    }

    setDraftReady(false);
    setPublished(null);
    setProfileLinkCopied(false);
    // Skip the info-only intro step — land directly on the category picker.
    // `startAtStep` (when provided by the caller) still takes precedence.
    setStep(startAtStep ?? 1);

    const ep = initial.existingPost ?? null;

    // Pre-fill from existing post when editing; otherwise clear.
    // 'videographer' is the legacy category value — map it to 'videography' so
    // existing listings still open correctly before the DB migration runs.
    const rawCat = ep?.category ?? null;
    const mappedCat = rawCat === 'videographer' ? 'videography' : rawCat;
    setCategory(isCommunityCategoryId(mappedCat) ? mappedCat : null);
    setBannerUrl(initial.bannerUrl || '');
    setBannerFile(null);
    setListingFiles([]);
    setListingPreviews(ep?.image_url ? [ep.image_url] : []);
    setTitle(ep?.title ?? '');
    setDescription(ep?.description ?? '');
    setAboutMe(initial.bio || '');
    setUniversity(resolveUniversityKey(initial.university) || '');
    setTiktokUrl(initial.tiktokUrl || '');
    setInstagramUrl(initial.instagramUrl || '');
    setLinkedinUrl(initial.linkedinUrl || '');
    setWebsiteUrl(initial.websiteUrl || '');
    setWorkLinks(
      initial.workLinks.some((r) => r.url.trim() || r.label.trim())
        ? initial.workLinks.map((r) => ({ ...r }))
        : [{ url: '', label: '' }],
    );
    setServiceArea(initial.serviceArea || '');
    if (ep) {
      setRateUnit(ep.rate_unit ?? 'hourly');
      setRateMin(ep.rate_min != null ? String(ep.rate_min) : '');
      setRateMax(ep.rate_max != null ? String(ep.rate_max) : '');
    } else {
      setRateUnit('hourly');
      setRateMin('');
      setRateMax('');
    }
    setProfileHourly(initial.hourlyRate || '');
    setTypicalBudgetMin(initial.typicalBudgetMin || '');
    setTypicalBudgetMax(initial.typicalBudgetMax || '');
    setSkills(normalizeFreelancerSkills(initial.skills));
    setInitialClientsBrought(
      typeof (initial as unknown as { initialClientsBrought?: number | null }).initialClientsBrought === 'number'
        ? String((initial as unknown as { initialClientsBrought: number }).initialClientsBrought)
        : '',
    );
    setExpectedBonusAmount(initial.expectedBonusAmount ?? '');
    setExpectedBonusUnit(initial.expectedBonusUnit ?? 'percentage');

    // Skip draft restore when jumping to a specific step or editing an existing post
    if (!ep && startAtStep == null) {
      const rawDraft = (() => {
        try {
          return localStorage.getItem(listOnCommunityDraftKey(userId));
        } catch {
          return null;
        }
      })();

      const draft = rawDraft ? parseDraft(rawDraft) : null;
      if (draft) {
        // Migrate legacy 0–6 step values to the 3-step flow.
        setStep(migrateDraftStep(draft.step));
        setCategory(draft.category);
        setBannerUrl(draft.bannerUrl || initial.bannerUrl || '');
        setTitle(draft.title);
        setDescription(draft.description);
        setAboutMe(draft.aboutMe || '');
        setUniversity(resolveUniversityKey(draft.university) || '');
        if (typeof (draft as any).phone === 'string') setPhone((draft as any).phone);
        setTiktokUrl(draft.tiktokUrl);
        setInstagramUrl(draft.instagramUrl || '');
        setLinkedinUrl(draft.linkedinUrl || '');
        setWebsiteUrl(draft.websiteUrl || '');
        setWorkLinks(draft.workLinks);
        setServiceArea(draft.serviceArea);
        setRateUnit(draft.rateUnit);
        setRateMin(draft.rateMin);
        setRateMax(draft.rateMax);
        setProfileHourly(draft.profileHourly);
        setTypicalBudgetMin(draft.typicalBudgetMin);
        setTypicalBudgetMax(draft.typicalBudgetMax);
        setSkills(normalizeFreelancerSkills(draft.skills));
        setInitialClientsBrought(draft.initialClientsBrought || '');
        setExpectedBonusAmount(draft.expectedBonusAmount || '');
        setExpectedBonusUnit(draft.expectedBonusUnit ?? 'percentage');
        toast({
          title: 'Draft restored',
          description: 'We restored your listing draft on this device. Re-add photos if needed.',
        });
      }
    }

    setDraftReady(true);
  }, [open, initial, userId, startAtStep, toast]);

  useEffect(() => {
    if (!open || !draftReady) return;

    const draft: ListOnCommunityDraft = {
      step,
      category,
      bannerUrl: bannerUrl.startsWith('http') ? bannerUrl : '',
      title,
      description,
      aboutMe,
      tiktokUrl,
      instagramUrl,
      linkedinUrl,
      websiteUrl,
      workLinks,
      serviceArea,
      university,
      phone,
      rateUnit,
      rateMin,
      rateMax,
      profileHourly,
      typicalBudgetMin,
      typicalBudgetMax,
      skills,
      initialClientsBrought,
      expectedBonusAmount,
      expectedBonusUnit,
    };

    try {
      localStorage.setItem(listOnCommunityDraftKey(userId), JSON.stringify(draft));
    } catch {
      // Ignore quota/storage restrictions - the wizard should still work without draft persistence.
    }
  }, [
    open,
    draftReady,
    userId,
    step,
    category,
    bannerUrl,
    title,
    description,
    aboutMe,
    tiktokUrl,
    instagramUrl,
    linkedinUrl,
    websiteUrl,
    workLinks,
    serviceArea,
    university,
    phone,
    rateUnit,
    rateMin,
    rateMax,
    profileHourly,
    typicalBudgetMin,
    typicalBudgetMax,
    skills,
    initialClientsBrought,
    expectedBonusAmount,
    expectedBonusUnit,
  ]);

  // Websites = project-only pricing; Digital sales = hourly-only pricing
  useEffect(() => {
    if (category === 'websites') setRateUnit('project');
    else if (category === 'digital_sales') setRateUnit('hourly');
  }, [category]);

  const totalSteps = STEP_LABELS.length;
  const canNext = (): boolean => {
    switch (step) {
      case 1:
        // Your work: category only. Banner used to be required but it gates
        // every first-time listing on a file picker — moved to a "Strong
        // listing" suggestion on the review step instead.
        return category !== null;
      case 2:
        // Your story: title + description + phone + university (always required, also on edit)
        return (
          title.trim().length > 0 &&
          description.trim().length > 0 &&
          university.trim().length > 0 &&
          phone.trim().length > 0
        );
      case 3:
        // Your price + skills. Lowered from 3 to 1 — getting live with one
        // honest tag beats abandoning the form trying to invent two more.
        return skills.length >= 1;
      case 4:
        // Review step is just a summary — Go live button enables when category + title are present.
        return !!category && title.trim().length > 0;
      default:
        return true;
    }
  };

  const addWorkLinkRow = () => {
    if (workLinks.length >= 12) return;
    setWorkLinks((p) => [...p, { url: '', label: '' }]);
  };

  const updateWorkLink = (i: number, field: 'url' | 'label', value: string) => {
    setWorkLinks((p) => p.map((row, j) => (j === i ? { ...row, [field]: value } : row)));
  };

  const removeWorkLink = (i: number) => {
    setWorkLinks((p) => (p.length <= 1 ? [{ url: '', label: '' }] : p.filter((_, j) => j !== i)));
  };

  const toggleSkill = (s: string) => {
    setSkills((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const handleBannerFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: 'Banner too large', description: 'Max 4MB', variant: 'destructive' });
      return;
    }
    setBannerFile(file);
    setBannerUrl(URL.createObjectURL(file));
  };

  const handleListingFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const remaining = MAX_LISTING_IMAGES - listingFiles.length - listingPreviews.filter(p => p.startsWith('http')).length;
    if (remaining <= 0) {
      toast({ title: `Max ${MAX_LISTING_IMAGES} photos`, description: 'Remove one to add more.', variant: 'destructive' });
      return;
    }
    const newFiles: File[] = [];
    const newPreviews: string[] = [];
    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: 'Image too large', description: `${file.name} exceeds 5MB`, variant: 'destructive' });
        continue;
      }
      newFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
    }
    setListingFiles(prev => [...prev, ...newFiles]);
    setListingPreviews(prev => [...prev, ...newPreviews]);
    if (listingInputRef.current) listingInputRef.current.value = '';
  };

  const removeListingImage = (index: number) => {
    const preview = listingPreviews[index];
    const isExisting = preview?.startsWith('http');
    if (isExisting) {
      // Remove an existing image (URL-based preview)
      setListingPreviews(prev => prev.filter((_, i) => i !== index));
    } else {
      // Remove a newly added file — find its index in listingFiles
      const newFileIndex = index - listingPreviews.filter((p, i) => i < index && p.startsWith('http')).length;
      setListingFiles(prev => prev.filter((_, i) => i !== newFileIndex));
      setListingPreviews(prev => prev.filter((_, i) => i !== index));
    }
  };

  const previewRateMin = rateMin.trim()
    ? (() => {
        const n = parseFloat(rateMin.replace(',', '.'));
        return Number.isNaN(n) || n < 0 ? null : n;
      })()
    : null;
  const previewRateMax = rateMax.trim()
    ? (() => {
        const n = parseFloat(rateMax.replace(',', '.'));
        return Number.isNaN(n) || n < 0 ? null : n;
      })()
    : null;
  const previewHourly = (() => {
    const n = parseFloat(profileHourly.replace(',', '.'));
    return Number.isNaN(n) || n <= 0 ? null : n;
  })();
  const previewBudget = formatCommunityBudget(
    rateUnit === 'negotiable' ? null : previewRateMin,
    rateUnit === 'negotiable' ? null : previewRateMax,
    rateUnit === 'negotiable' ? 'negotiable' : rateUnit,
    previewHourly,
  );
  const previewHero = listingPreviews[0] || (bannerUrl.startsWith('http') ? bannerUrl : null);
  const previewSkills = skills.slice(0, 5);
  const previewDescription = description.trim();

  const publish = async () => {
    if (!category || !title.trim()) return;
    setSubmitting(true);
    try {
      const { data: profileRow, error: profileErr } = await supabase
        .from('profiles')
        .select('user_id, user_type')
        .eq('user_id', userId)
        .maybeSingle();
      if (profileErr) {
        logSupabaseError('ListOnCommunityWizard: load profile', profileErr);
        throw profileErr;
      }
      if (!profileRow) {
        throw new Error(
          'Your profile row is missing. Open Profile, save your details, then try listing again.',
        );
      }
      if (profileRow.user_type === 'business') {
        throw new Error(
          'Only freelancer (student) accounts can submit a Community listing. Your account is set as a business.',
        );
      }

      let uploadedBanner: string | null = null;
      if (bannerFile) {
        const ext = bannerFile.name.split('.').pop() || 'jpg';
        const path = `${userId}/banner.${ext}`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, bannerFile, { upsert: true });
        if (upErr) {
          logSupabaseError('ListOnCommunityWizard: avatars upload', upErr);
          throw upErr;
        }
        const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
        uploadedBanner = `${pub.publicUrl}?t=${Date.now()}`;
      }

      // Upload all new listing images to portfolio-images bucket
      const uploadedImageUrls: string[] = [];
      for (const file of listingFiles) {
        const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: liErr } = await supabase.storage.from('portfolio-images').upload(path, file);
        if (liErr) {
          logSupabaseError('ListOnCommunityWizard: portfolio-images upload', liErr);
          throw liErr;
        }
        const { data: pub } = supabase.storage.from('portfolio-images').getPublicUrl(path);
        uploadedImageUrls.push(pub.publicUrl);
      }
      // Combine existing URL previews (kept from previous edit) with newly uploaded
      const existingUrls = listingPreviews.filter(p => p.startsWith('http'));
      const allImageUrls = [...existingUrls, ...uploadedImageUrls];
      const image_url = allImageUrls[0] || null;

      let rate_min: number | null = null;
      let rate_max: number | null = null;
      let rate_unit_out: string | null = rateUnit;
      // Cap: €500 for websites, €50/hr for digital sales retainers, €20/hr for other hourly,
      // €200 day/project for non-website categories
      const ratecap = category === 'websites'
        ? MAX_PROJECT_BUDGET
        : rateUnit === 'hourly' ? hourlyCapFor(category)
        : (rateUnit === 'day' || rateUnit === 'project') ? MAX_DAY_OR_PROJECT_RATE
        : null;
      if (rateUnit === 'negotiable') {
        rate_min = null;
        rate_max = null;
        rate_unit_out = 'negotiable';
      } else {
        if (rateMin.trim()) {
          const n = parseFloat(rateMin.replace(',', '.'));
          if (!Number.isNaN(n) && n >= 0) rate_min = ratecap != null ? Math.min(n, ratecap) : n;
        }
        if (rateMax.trim()) {
          const n = parseFloat(rateMax.replace(',', '.'));
          if (!Number.isNaN(n) && n >= 0) rate_max = ratecap != null ? Math.min(n, ratecap) : n;
        }
        if (rate_min != null && rate_max != null && rate_max < rate_min) {
          toast({ title: 'Invalid range', description: 'Maximum should be ≥ minimum.', variant: 'destructive' });
          setSubmitting(false);
          return;
        }
      }

      // For websites, use the project price range as the typical budget too
      const tbMin = category === 'websites'
        ? (rate_min ?? null)
        : (typicalBudgetMin.trim() && parseInt(typicalBudgetMin, 10) > 0 ? parseInt(typicalBudgetMin, 10) : null);
      const tbMax = category === 'websites'
        ? (rate_max ?? null)
        : (typicalBudgetMax.trim() && parseInt(typicalBudgetMax, 10) > 0 ? parseInt(typicalBudgetMax, 10) : null);
      const hourlyNum = parseFloat(profileHourly.replace(',', '.'));
      const hourly_rate = !Number.isNaN(hourlyNum) && hourlyNum > 0 ? Math.min(hourlyNum, hourlyCapFor(category)) : 0;

      const studentPatch: Record<string, unknown> = {
        tiktok_url: normalizeTikTokUrl(tiktokUrl),
        instagram_url: normalizeInstagramUrl(instagramUrl),
        linkedin_url: normalizeLinkedInUrl(linkedinUrl),
        website_url: normalizeWebsiteUrl(websiteUrl),
        work_links: workLinksToJson(workLinks) as unknown,
        service_area: serviceArea.trim() || null,
        typical_budget_min: tbMin,
        typical_budget_max: tbMax,
        skills,
        hourly_rate,
        community_board_status: 'approved',
        // Bio is the freelancer's personal "About you" line — keep it distinct from
        // the work pitch (community_posts.description). If they leave it blank we
        // store NULL so the profile page doesn't echo their pitch as their bio.
        bio: aboutMe.trim() || null,
      };
      if (category === 'digital_sales') {
        const n = parseInt(initialClientsBrought, 10);
        studentPatch.initial_clients_brought = Number.isNaN(n) || n < 0 ? 0 : n;

        const bonusNum = parseFloat(expectedBonusAmount.replace(',', '.'));
        if (!Number.isNaN(bonusNum) && bonusNum > 0) {
          studentPatch.expected_bonus_amount = bonusNum;
          studentPatch.expected_bonus_unit = expectedBonusUnit;
        } else {
          studentPatch.expected_bonus_amount = null;
          studentPatch.expected_bonus_unit = null;
        }
      }
      if (university.trim()) studentPatch.university = university.trim();
      if (phone.trim()) studentPatch.phone = phone.trim();
      if (uploadedBanner) {
        studentPatch.banner_url = uploadedBanner;
      } else {
        const keep =
          (bannerUrl.startsWith('http') ? bannerUrl : null) ||
          (initial.bannerUrl?.startsWith('http') ? initial.bannerUrl : null);
        if (keep) studentPatch.banner_url = keep;
      }

      const { error: spErr } = await supabase
        .from('student_profiles')
        .upsert({ user_id: userId, ...studentPatch }, { onConflict: 'user_id' });
      if (spErr) {
        logSupabaseError('ListOnCommunityWizard: student_profiles upsert', spErr);
        throw spErr;
      }

      const { error: delErr } = await supabase.from('community_posts').delete().eq('user_id', userId);
      if (delErr) {
        logSupabaseError('ListOnCommunityWizard: community_posts delete', delErr);
        // Non-fatal for first-time listings (nothing to delete), fatal for edits
      }

      const { error: postErr } = await supabase
        .from('community_posts')
        .insert({
          user_id: userId,
          category,
          title: title.trim(),
          description: description.trim(),
          image_url,
          rate_min,
          rate_max,
          rate_unit: rate_unit_out,
          moderation_status: 'approved',
        });
      if (postErr) {
        logSupabaseError('ListOnCommunityWizard: community_posts insert', postErr);
        throw postErr;
      }

      // Save uploaded images as portfolio items
      if (uploadedImageUrls.length > 0) {
        const portfolioRows = uploadedImageUrls.map((url) => ({
          user_id: userId,
          title: title.trim(),
          image_url: url,
        }));
        const { error: piErr } = await supabase.from('portfolio_items').insert(portfolioRows);
        if (piErr) {
          // Non-critical — listing is already live, just log
          logSupabaseError('ListOnCommunityWizard: portfolio_items insert', piErr);
        }
      }

      markUserActed();
      track('listing_published', {
        category,
        has_banner: !!uploadedBanner || !!(initial.bannerUrl?.startsWith('http')),
        has_socials: !!(tiktokUrl || instagramUrl || linkedinUrl || websiteUrl),
        has_work_links: workLinks.length > 0,
        skills_count: skills.length,
      });
      try {
        localStorage.removeItem(listOnCommunityDraftKey(userId));
      } catch {
        // Ignore storage restrictions - successful publish is the important part.
      }
      // Render the in-dialog success screen instead of closing immediately so the
      // freelancer gets a clear "you're live" moment + share link + next steps.
      // onSubmittedForReview is deferred until the user dismisses the success screen
      // — see closeAfterPublish.
      setPublished({ category, phone: phone.trim() });
    } catch (err: unknown) {
      logSupabaseError('ListOnCommunityWizard: publish', err);
      const msg = getSupabaseErrorMessage(err);
      toast({ title: 'Could not publish', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const publicProfilePath = `/students/${userId}`;
  const publicProfileUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${publicProfilePath}` : publicProfilePath;

  const closeAfterPublish = () => {
    if (published) {
      onSubmittedForReview(published.category);
    }
    setPublished(null);
    onOpenChange(false);
  };

  const handleCopyProfileLink = async () => {
    try {
      await navigator.clipboard.writeText(publicProfileUrl);
      setProfileLinkCopied(true);
      setTimeout(() => setProfileLinkCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure context, denied permission). Surface a toast
      // so the user can copy the URL manually from the visible input below.
      toast({
        title: 'Copy failed',
        description: 'Select the link below to copy it manually.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) closeAfterPublish(); else onOpenChange(true); }}>
      <DialogContent className="flex max-h-[min(92dvh,44rem)] w-[calc(100vw-1.25rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-2xl border p-0 sm:w-full isolate bg-background lg:max-w-[64rem] lg:max-h-[min(92dvh,52rem)] lg:flex-row">
        {published ? (
          // Wrapped in a flex-col box so the celebration screen stays
          // stacked vertically even though the parent DialogContent is
          // lg:flex-row (which the wizard form uses for its two-column
          // edit/preview split). Without this wrapper the "You're live"
          // card and the action bar would sit side-by-side on desktop.
          <div className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="sr-only">
              <DialogTitle>You&apos;re live</DialogTitle>
            </DialogHeader>
            <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/12 ring-1 ring-emerald-500/25">
                <CheckCircle2 className="h-9 w-9 text-emerald-500" strokeWidth={2.25} />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  You&apos;re live on the {COMMUNITY_CATEGORIES[published.category].label} board
                </h2>
                <p className="text-sm text-muted-foreground">
                  Businesses can now message you.
                  {published.phone && <> We&apos;ll text <span className="font-medium text-foreground">{published.phone}</span> when they do.</>}
                </p>
              </div>

              <div className="w-full max-w-sm space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground text-left">Your public profile</p>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
                  <Input
                    readOnly
                    value={publicProfileUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-8 flex-1 border-0 bg-transparent px-0 text-xs focus-visible:ring-0"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 px-2 text-xs"
                    onClick={handleCopyProfileLink}
                  >
                    {profileLinkCopied ? (
                      <>
                        <Check className="mr-1 h-3.5 w-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex gap-2 border-t border-border bg-background px-5 py-4">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 rounded-xl"
                onClick={closeAfterPublish}
              >
                Done
              </Button>
              <Button asChild type="button" className="h-11 flex-1 rounded-xl font-semibold">
                <Link to={publicProfilePath} onClick={closeAfterPublish}>
                  View my profile
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        ) : (
        <>
        {/* LEFT column (or full width on mobile): header + scrollable body
            + sticky nav footer. On lg+ this shares the dialog horizontally
            with the live-preview stage to the right. `min-w-0` matters
            here because flex children default to min-width:auto, which
            would let long skill tags push the column wider than its share. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:border-r lg:border-border">
        <div className="border-b border-border bg-muted/40 px-5 py-4">
          <DialogHeader className="space-y-3 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Community</p>
            <DialogTitle className="text-xl font-semibold tracking-tight">{STEP_HEADINGS[step] ?? 'List yourself'}</DialogTitle>
            {/* Percent progress bar — front-loaded (step 1 lands at 20%) so
                the form feels lighter than it is. The tick marks below show
                the three sections at a glance. */}
            {(() => {
              const percent = submitting ? 100 : (STEP_PROGRESS[step] ?? 20);
              return (
                <>
                  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-medium">
                    <span className="text-primary font-semibold">{percent}% complete</span>
                    <span className="text-muted-foreground">
                      {STEP_LABELS[step - 1] ?? ''}
                    </span>
                  </div>
                </>
              );
            })()}
            <p className="text-xs text-muted-foreground leading-relaxed">{STEP_DESCRIPTIONS[step]}</p>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:py-6">
          {/* Mobile-only live preview drawer. Tap the sticky header strip to
              expand the full card inline. Hidden on lg+ because the desktop
              layout shows the preview in its own right column. Uses the same
              StudentCardPreview so there's no second synthetic-profile path
              to maintain. */}
          <div className="lg:hidden mb-5 overflow-hidden rounded-2xl border border-border bg-card">
            <button
              type="button"
              onClick={() => setMobilePreviewOpen((v) => !v)}
              aria-expanded={mobilePreviewOpen}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">
                  {(title?.[0] || 'Y').toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Live preview</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {mobilePreviewOpen ? 'Hide what businesses will see' : 'See what businesses will see'}
                  </p>
                </div>
              </div>
              <ChevronDown
                size={16}
                className={cn('shrink-0 text-muted-foreground transition-transform duration-200', mobilePreviewOpen && 'rotate-180')}
              />
            </button>
            {mobilePreviewOpen && (
              <div className="border-t border-border/60 bg-gradient-to-br from-muted/30 via-background to-muted/20 p-4">
                <StudentCardPreview
                  userId={userId}
                  category={category}
                  bannerUrl={bannerUrl}
                  title={title}
                  description={description}
                  skills={skills}
                  serviceArea={serviceArea}
                  university={university}
                  hourlyRate={rateUnit === 'hourly' ? rateMin : profileHourly}
                  rateMin={typicalBudgetMin || rateMin}
                  rateMax={typicalBudgetMax || rateMax}
                  tiktokUrl={tiktokUrl}
                  instagramUrl={instagramUrl}
                  linkedinUrl={linkedinUrl}
                  websiteUrl={websiteUrl}
                />
              </div>
            )}
          </div>

          {/* ── Step 1: Your work — category + cover photo + work samples ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Pick your category</Label>
                <div className="flex flex-col gap-2">
                  {COMMUNITY_CATEGORY_ORDER.map((id) => {
                    const item = COMMUNITY_CATEGORIES[id];
                    const Icon = item.icon;
                    const sel = category === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setCategory(id)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all',
                          sel
                            ? 'border-primary bg-primary/8 shadow-sm ring-1 ring-primary/20'
                            : 'border-border bg-card hover:border-primary/25',
                        )}
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Icon className="h-5 w-5" strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{item.label}</p>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        </div>
                        {sel && <Check className="ml-auto h-5 w-5 shrink-0 text-primary" strokeWidth={2.5} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Cover photo</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Shown at the top of your public profile — the first thing a business sees.
                </p>
                <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerFile} />
                {bannerUrl ? (
                  <div className="relative mt-2 overflow-hidden rounded-xl border border-border">
                    <img src={bannerUrl} alt="" className="h-28 w-full object-cover sm:h-32" />
                    <button
                      type="button"
                      onClick={() => bannerInputRef.current?.click()}
                      className="absolute bottom-2 right-2 rounded-lg bg-background/90 px-2 py-1 text-xs font-medium shadow"
                    >
                      Replace
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => bannerInputRef.current?.click()}
                    className="mt-2 flex h-28 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-primary/35 hover:text-primary"
                  >
                    <ImagePlus className="h-6 w-6" />
                    <span className="text-xs font-medium">Upload banner</span>
                  </button>
                )}
              </div>

              <div>
                <Label className="text-sm font-medium">Sample work photos <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <p className="mt-1 text-xs text-muted-foreground">Up to {MAX_LISTING_IMAGES} photos of your work.</p>
                <input ref={listingInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleListingFiles} />
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {listingPreviews.map((preview, i) => (
                    <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-border">
                      <img src={preview} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeListingImage(i)}
                        className="absolute right-1 top-1 rounded-full bg-background/90 p-1 shadow"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {listingPreviews.length < MAX_LISTING_IMAGES && (
                    <button
                      type="button"
                      onClick={() => listingInputRef.current?.click()}
                      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-muted/20 text-xs text-muted-foreground hover:border-primary/30"
                    >
                      <ImagePlus className="h-5 w-5" />
                      Add
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Your story — pitch + contact details in one place ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <Label htmlFor="lc-title">Your title</Label>
                <Input
                  id="lc-title"
                  className="mt-1.5 h-11"
                  placeholder={
                    category === 'websites' ? 'e.g. Custom React websites & Shopify stores' :
                    category === 'social_media' ? 'e.g. Social media management & content creation' :
                    category === 'digital_sales' ? 'e.g. B2B sales & lead gen for SaaS' :
                    'e.g. Event videography & short-form reels'
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div>
                <Label htmlFor="lc-desc">What you do</Label>
                <p className="mt-1 text-xs text-muted-foreground">Shown on your listing card and on the board.</p>
                <Textarea
                  id="lc-desc"
                  className="mt-1.5 min-h-[110px] text-sm"
                  placeholder={
                    category === 'websites'
                      ? "What tech stack do you work with? Past clients or launches?"
                      : category === 'social_media'
                      ? "Which platforms, formats, and past results?"
                      : category === 'digital_sales'
                      ? "Who do you sell to, what channels (cold email / LinkedIn / calls), and what results have you gotten?"
                      : "What do you shoot, what gear, and what kind of clients?"
                  }
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                />
              </div>
              <div>
                <Label htmlFor="lc-about">About you <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Shown on your profile page above your work — your background, why you do this. If you leave this blank, your profile page will just show your work pitch.
                </p>
                <Textarea
                  id="lc-about"
                  className="mt-1.5 min-h-[70px] text-sm"
                  placeholder="Where you're from, what you're passionate about."
                  value={aboutMe}
                  onChange={(e) => setAboutMe(e.target.value)}
                  maxLength={500}
                />
              </div>

              <div className="h-px bg-border" />

              <div>
                <Label>Phone number <span className="text-rose-500">*</span></Label>
                <Input
                  type="tel"
                  className="mt-1.5 h-11"
                  placeholder="e.g. 089 981 7111"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">We&apos;ll text you when a business reaches out. Never shared publicly.</p>
              </div>
              <div>
                <Label>University <span className="text-rose-500">*</span></Label>
                <Select value={university} onValueChange={setUniversity}>
                  <SelectTrigger className="mt-1.5 h-11">
                    <SelectValue placeholder="Select your university" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIVERSITIES.map((uni) => (
                      <SelectItem key={uni.key} value={uni.key}>
                        {uni.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Where you work</Label>
                <Input
                  className="mt-1.5 h-11"
                  placeholder="e.g. Galway city · Remote OK"
                  value={serviceArea}
                  onChange={(e) => setServiceArea(e.target.value)}
                />
              </div>
              {/* Socials — optional, collapsed by default to lighten the form.
                  Auto-expands if any social value is already filled (returning
                  drafts) so users don't lose sight of what they entered. */}
              {(() => {
                const anyFilled = !!(tiktokUrl || instagramUrl || linkedinUrl || websiteUrl);
                const expanded = showSocialFields || anyFilled;
                if (!expanded) {
                  return (
                    <button
                      type="button"
                      onClick={() => setShowSocialFields(true)}
                      className="w-full rounded-xl border border-dashed border-border bg-card px-4 py-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                    >
                      + Add social links <span className="text-xs font-normal">(optional — TikTok, Instagram, LinkedIn, website)</span>
                    </button>
                  );
                }
                return (
                  <>
                    <div>
                      <Label>TikTok <span className="font-normal text-muted-foreground">(optional)</span></Label>
                      <Input
                        className="mt-1.5 h-11"
                        placeholder="https://tiktok.com/@you or @you"
                        value={tiktokUrl}
                        onChange={(e) => setTiktokUrl(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Instagram <span className="font-normal text-muted-foreground">(optional)</span></Label>
                      <Input
                        className="mt-1.5 h-11"
                        placeholder="@yourhandle"
                        value={instagramUrl}
                        onChange={(e) => setInstagramUrl(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>LinkedIn <span className="font-normal text-muted-foreground">(optional)</span></Label>
                      <Input
                        className="mt-1.5 h-11"
                        placeholder="https://linkedin.com/in/you"
                        value={linkedinUrl}
                        onChange={(e) => setLinkedinUrl(e.target.value)}
                      />
                      {linkedinUrl.trim() && !normalizeLinkedInUrl(linkedinUrl) && (
                        <p className="mt-1 text-[11px] font-medium text-rose-500">Needs to be a full linkedin.com URL.</p>
                      )}
                    </div>
                    <div>
                      <Label>Website / portfolio URL <span className="font-normal text-muted-foreground">(optional)</span></Label>
                      <Input
                        className="mt-1.5 h-11"
                        placeholder="yourname.com"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                      />
                    </div>
                  </>
                );
              })()}
              <div>
                <Label>Links to past work <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <p className="mt-1 text-xs text-muted-foreground">Portfolio site, Behance, Drive, etc.</p>
                <div className="mt-2 space-y-2">
                  {workLinks.map((row, i) => (
                    <div key={i} className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        placeholder="Label"
                        value={row.label}
                        onChange={(e) => updateWorkLink(i, 'label', e.target.value)}
                        className="h-10"
                      />
                      <Input
                        placeholder="https://…"
                        value={row.url}
                        onChange={(e) => updateWorkLink(i, 'url', e.target.value)}
                        className="h-10 flex-1"
                      />
                      <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" onClick={() => removeWorkLink(i)}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="ghost" size="sm" className="mt-2 h-9 text-xs" onClick={addWorkLinkRow}>
                  + Add link
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Your price — pricing + skills + live preview + Go live ── */}
          {step === 3 && (
            <div className="space-y-5">
              {category === 'digital_sales' ? (
                <>
                  <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    Digital sales is priced per hour — set your retainer rate and your starting client track record below.
                  </div>
                  <div>
                    <Label>Your hourly rate (€)</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Retainer rate businesses pay on top of commission.</p>
                    <Input
                      className="mt-1.5 h-11"
                      inputMode="decimal"
                      placeholder="e.g. 8"
                      value={profileHourly}
                      onChange={(e) => setProfileHourly(e.target.value)}
                    />
                    {parseFloat(profileHourly.replace(',', '.')) > MAX_DIGITAL_SALES_HOURLY && (
                      <p className="mt-1 text-xs font-medium text-red-500">Can't exceed €{MAX_DIGITAL_SALES_HOURLY}/hr</p>
                    )}
                  </div>
                  <div>
                    <Label>Expected bonus per closed deal</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      What you expect on top of the hourly retainer. Shown on your profile so businesses know what you're after.
                    </p>
                    <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-2">
                      <Input
                        inputMode="decimal"
                        placeholder={expectedBonusUnit === 'percentage' ? 'e.g. 10' : 'e.g. 50'}
                        value={expectedBonusAmount}
                        onChange={(e) => setExpectedBonusAmount(e.target.value)}
                        className="h-11"
                      />
                      <Select
                        value={expectedBonusUnit}
                        onValueChange={(v) => setExpectedBonusUnit(v === 'flat' ? 'flat' : 'percentage')}
                      >
                        <SelectTrigger className="h-11 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">% of deal</SelectItem>
                          <SelectItem value="flat">€ per client</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Clients you've already brought in <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Your starting track record — businesses see this on your profile. You can log individual deals later.
                    </p>
                    <Input
                      className="mt-1.5 h-11"
                      inputMode="numeric"
                      placeholder="e.g. 3"
                      value={initialClientsBrought}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^0-9]/g, '');
                        setInitialClientsBrought(cleaned);
                      }}
                    />
                  </div>
                </>
              ) : category === 'websites' ? (
                <>
                  <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    Websites are priced per project — set the range you typically charge below.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">From (€)</Label>
                      <Input className="mt-1.5 h-11" inputMode="decimal" placeholder="e.g. 200" value={rateMin} onChange={(e) => setRateMin(e.target.value)} />
                      {parseFloat(rateMin.replace(',', '.')) > MAX_PROJECT_BUDGET && (
                        <p className="mt-1 text-xs font-medium text-red-500">Can't exceed €{MAX_PROJECT_BUDGET}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Up to (€)</Label>
                      <Input className="mt-1.5 h-11" inputMode="decimal" placeholder="e.g. 500" value={rateMax} onChange={(e) => setRateMax(e.target.value)} />
                      {parseFloat(rateMax.replace(',', '.')) > MAX_PROJECT_BUDGET && (
                        <p className="mt-1 text-xs font-medium text-red-500">Can't exceed €{MAX_PROJECT_BUDGET}</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label>Pricing type</Label>
                    <Select value={rateUnit} onValueChange={setRateUnit}>
                      <SelectTrigger className="mt-1.5 h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hourly">Per hour</SelectItem>
                        <SelectItem value="day">Per day</SelectItem>
                        <SelectItem value="project">Per project (flat)</SelectItem>
                        <SelectItem value="negotiable">Negotiable</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {rateUnit !== 'negotiable' && (() => {
                    const cap = rateUnit === 'hourly' ? MAX_HOURLY_RATE : MAX_DAY_OR_PROJECT_RATE;
                    const label = rateUnit === 'hourly' ? `€${cap}/hr` : `€${cap}`;
                    return (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">From (€)</Label>
                          <Input className="mt-1.5 h-11" inputMode="decimal" placeholder="e.g. 15" value={rateMin} onChange={(e) => setRateMin(e.target.value)} />
                          {parseFloat(rateMin.replace(',', '.')) > cap && (
                            <p className="mt-1 text-xs font-medium text-red-500">Can't exceed {label}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Up to (€)</Label>
                          <Input className="mt-1.5 h-11" inputMode="decimal" placeholder="Optional" value={rateMax} onChange={(e) => setRateMax(e.target.value)} />
                          {parseFloat(rateMax.replace(',', '.')) > cap && (
                            <p className="mt-1 text-xs font-medium text-red-500">Can't exceed {label}</p>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  <div>
                    <Label>Your hourly rate (€)</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Shown on your profile — for ongoing or recurring work.</p>
                    <Input className="mt-1.5 h-11" inputMode="decimal" placeholder="e.g. 15" value={profileHourly} onChange={(e) => setProfileHourly(e.target.value)} />
                    {parseFloat(profileHourly.replace(',', '.')) > MAX_HOURLY_RATE && (
                      <p className="mt-1 text-xs font-medium text-red-500">Can't exceed €{MAX_HOURLY_RATE}/hr</p>
                    )}
                  </div>
                </>
              )}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Skills</Label>
                  <span className={cn(
                    'text-[11px] font-semibold',
                    skills.length < 3 ? 'text-rose-500' : 'text-emerald-600',
                  )}>
                    {skills.length} selected{skills.length < 3 ? ` · need ${3 - skills.length} more` : ' ✓'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Pick at least 3 so businesses can find you.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(category ? SKILLS_BY_CATEGORY[category] : []).map((s) => (
                    <TagBadge key={s} tag={s} selected={skills.includes(s)} onClick={() => toggleSkill(s)} />
                  ))}
                </div>
              </div>

              {category && (
                <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
                  Publishes to the <span className="font-medium text-foreground">{COMMUNITY_CATEGORIES[category].label}</span> board immediately — you can edit any field later.
                </div>
              )}

              {/* Quick wins — conditional nudges that disappear as the user
                  fills the high-impact fields. Each row is a tap-target that
                  jumps back to the relevant screen so they don't get stuck. */}
              {(() => {
                const hasBanner = !!(bannerFile || bannerUrl);
                const workSampleCount =
                  listingFiles.length + listingPreviews.filter((p) => p.startsWith('http')).length;
                const hasEnoughSamples = workSampleCount >= 3;
                const hasEnoughDesc = description.trim().length >= 100;
                const nudges: { key: string; msg: string; target: number }[] = [];
                if (!hasBanner) nudges.push({ key: 'banner', msg: 'Listings with a cover photo get 3× more messages', target: 1 });
                if (!hasEnoughSamples) nudges.push({ key: 'samples', msg: 'Profiles with 3+ work samples get 50% more clicks', target: 1 });
                if (description.trim().length > 0 && !hasEnoughDesc) nudges.push({ key: 'desc', msg: 'Longer descriptions help businesses see your expertise', target: 2 });
                if (nudges.length === 0) return null;
                return (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400 mb-2">Quick wins</p>
                    <ul className="space-y-1.5">
                      {nudges.map((n) => (
                        <li key={n.key} className="flex items-start gap-2">
                          <span className="mt-0.5 text-amber-500">✦</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-foreground leading-relaxed">{n.msg}</p>
                            <button
                              type="button"
                              onClick={() => setStep(n.target)}
                              className="mt-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline underline-offset-2"
                            >
                              Go back →
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              {category && (
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Live preview</p>
                      <p className="mt-1 text-sm text-muted-foreground">How your card looks to businesses.</p>
                    </div>
                    <div className="rounded-full border border-border bg-muted/50 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                      Autosaves
                    </div>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-2xl border border-foreground/10 bg-card shadow-[0_1px_0_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.12)]">
                    <div className="relative h-40 overflow-hidden sm:h-48">
                      {previewHero ? (
                        <>
                          <img
                            src={previewHero}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/80" />
                        </>
                      ) : (
                        <>
                          <div className="absolute inset-0 bg-[linear-gradient(145deg,hsl(248_62%_32%)_0%,hsl(270_58%_18%)_100%)]" />
                          <div className="absolute -right-10 -top-8 h-40 w-40 rounded-full bg-fuchsia-300/35 blur-2xl" />
                          <div className="absolute -left-8 bottom-0 h-28 w-28 rounded-full bg-cyan-300/25 blur-2xl" />
                          <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/70" />
                        </>
                      )}

                      {previewBudget.emphasis && (
                        <div className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/45 px-3 py-1.5 backdrop-blur-sm">
                          <p className="text-[11px] font-semibold text-white">{previewBudget.label}</p>
                        </div>
                      )}

                      <div className="absolute bottom-0 left-0 right-0 flex items-end gap-3 px-4 pb-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-base font-bold text-white shadow-sm ring-2 ring-white/35 backdrop-blur-sm">
                          Y
                        </div>
                        <div className="pb-0.5">
                          <h3 className="text-base font-semibold leading-tight tracking-tight text-white">Your listing</h3>
                          <p className="mt-0.5 text-[11px] text-white/70">
                            {COMMUNITY_CATEGORIES[category].label}
                            {serviceArea.trim() ? <><span className="mx-1.5 text-white/30">·</span>{serviceArea.trim()}</> : null}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 px-4 pb-4 pt-4 sm:px-5">
                      <div className="space-y-2">
                        <p className="text-base font-semibold leading-snug tracking-tight text-foreground">
                          {title.trim() || 'Your headline will appear here'}
                        </p>
                        <p className="text-[14px] leading-relaxed text-muted-foreground">
                          {previewDescription || 'Write a short, specific pitch so businesses understand what you deliver.'}
                        </p>
                      </div>

                      {previewSkills.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {previewSkills.map((skill) => (
                            <span
                              key={skill}
                              className="rounded border border-foreground/10 bg-background/70 px-2 py-0.5 text-[11px] text-foreground/75"
                            >
                              {skill}
                            </span>
                          ))}
                          {skills.length > previewSkills.length && (
                            <span className="rounded border border-foreground/10 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                              +{skills.length - previewSkills.length}
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Add a few skills so businesses instantly know what you do.</p>
                      )}

                      <div className="flex flex-wrap gap-2 border-t border-foreground/10 pt-3 text-[11px] text-muted-foreground">
                        <span className="rounded-full bg-muted px-2.5 py-1">
                          {previewBudget.label}
                        </span>
                        {listingPreviews.length > 0 ? (
                          <span className="rounded-full bg-muted px-2.5 py-1">{listingPreviews.length} portfolio photo{listingPreviews.length === 1 ? '' : 's'}</span>
                        ) : null}
                        {workLinks.some((link) => link.url.trim()) ? (
                          <span className="rounded-full bg-muted px-2.5 py-1">
                            {workLinks.filter((link) => link.url.trim()).length} work link{workLinks.filter((link) => link.url.trim()).length === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Review — final summary before publish ── */}
          {step === 4 && category && (
            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                Here&apos;s how your listing reads. Tap any row to jump back and edit.
              </div>

              {/* Summary list — every row links back to the relevant step. */}
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                <li>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Category</p>
                      <p className="mt-0.5 truncate text-sm font-medium text-foreground">{COMMUNITY_CATEGORIES[category].label}</p>
                    </div>
                    <span className="self-center text-xs font-semibold text-primary">Edit</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Title &amp; pitch</p>
                      <p className="mt-0.5 truncate text-sm font-medium text-foreground">{title.trim() || '—'}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{description.trim() || '—'}</p>
                    </div>
                    <span className="self-center text-xs font-semibold text-primary">Edit</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Contact</p>
                      <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                        {phone.trim() ? phone.trim().replace(/\d(?=\d{2})/g, '•') : 'No phone'}
                        <span className="mx-1.5 text-muted-foreground/40">·</span>
                        {university.trim() ? (
                          <span className="text-foreground/80">{university.trim()}</span>
                        ) : (
                          <span className="text-rose-500">No university</span>
                        )}
                      </p>
                    </div>
                    <span className="self-center text-xs font-semibold text-primary">Edit</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Links</p>
                      <p className="mt-0.5 text-sm text-foreground">
                        {(() => {
                          const parts: string[] = [];
                          if (tiktokUrl.trim()) parts.push('TikTok');
                          if (instagramUrl.trim()) parts.push('Instagram');
                          if (linkedinUrl.trim()) parts.push('LinkedIn');
                          if (websiteUrl.trim()) parts.push('Website');
                          const workCount = workLinks.filter((l) => l.url.trim()).length;
                          if (workCount > 0) parts.push(`${workCount} work link${workCount === 1 ? '' : 's'}`);
                          return parts.length ? parts.join(' · ') : <span className="text-muted-foreground">None added</span>;
                        })()}
                      </p>
                    </div>
                    <span className="self-center text-xs font-semibold text-primary">Edit</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pricing</p>
                      <p className="mt-0.5 truncate text-sm font-medium text-foreground">{previewBudget.label}</p>
                    </div>
                    <span className="self-center text-xs font-semibold text-primary">Edit</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Skills</p>
                      <p className={cn(
                        'mt-0.5 text-sm font-medium',
                        skills.length >= 3 ? 'text-foreground' : 'text-rose-500',
                      )}>
                        {skills.length} selected{skills.length < 3 ? ` · need ${3 - skills.length} more` : ''}
                      </p>
                    </div>
                    <span className="self-center text-xs font-semibold text-primary">Edit</span>
                  </button>
                </li>
              </ul>

              {/* Re-surface the same "Quick wins" warnings from Step 3 so users
                  don't publish a half-finished listing without realising. */}
              {(() => {
                const hasBanner = !!(bannerFile || bannerUrl);
                const workSampleCount =
                  listingFiles.length + listingPreviews.filter((p) => p.startsWith('http')).length;
                const hasEnoughSamples = workSampleCount >= 3;
                const hasEnoughDesc = description.trim().length >= 100;
                const nudges: { key: string; msg: string; target: number }[] = [];
                if (!hasBanner) nudges.push({ key: 'banner', msg: 'No cover photo — listings with one get 3× more messages', target: 1 });
                if (!hasEnoughSamples) nudges.push({ key: 'samples', msg: 'Fewer than 3 work samples — profiles with 3+ get 50% more clicks', target: 1 });
                if (description.trim().length > 0 && !hasEnoughDesc) nudges.push({ key: 'desc', msg: 'Pitch is short — longer descriptions help businesses see your expertise', target: 2 });
                if (nudges.length === 0) return null;
                return (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400 mb-2">Worth fixing first</p>
                    <ul className="space-y-1.5">
                      {nudges.map((n) => (
                        <li key={n.key} className="flex items-start gap-2">
                          <span className="mt-0.5 text-amber-500">✦</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-foreground leading-relaxed">{n.msg}</p>
                            <button
                              type="button"
                              onClick={() => setStep(n.target)}
                              className="mt-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline underline-offset-2"
                            >
                              Go fix →
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              <p className="text-xs text-muted-foreground leading-relaxed">
                By clicking <span className="font-medium text-foreground">Go live</span>, you agree to our{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline underline-offset-2">Terms of Service</a>{' '}
                and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline underline-offset-2">Privacy Policy</a>.
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border bg-background px-5 py-4">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-xl"
              onClick={() => setStep((s) => s - 1)}
              disabled={submitting}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          ) : (
            <Button type="button" variant="ghost" className="h-11 rounded-xl" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
          )}
          {step < totalSteps ? (
            <Button
              type="button"
              className="h-11 flex-1 rounded-xl font-semibold"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext()}
            >
              {step === totalSteps - 1 ? 'Review' : 'Continue'}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              className="h-11 flex-1 rounded-xl font-semibold"
              onClick={publish}
              disabled={submitting || !category || !title.trim() || skills.length < 1}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing…
                </>
              ) : (
                'Go live'
              )}
            </Button>
          )}
        </div>
        </div>
        {/* RIGHT column — desktop-only live preview stage. Static 2×2 mock
            gallery: three muted GhostStudentCards fill the "other freelancers"
            slots, the user's live StudentCardPreview sits in the hero slot and
            updates keystroke-by-keystroke. The backdrop makes the listing
            look like it's joining a curated marketplace even when the real
            talent board is small. Hidden below lg — on mobile we show a
            collapsible mini preview inside the form body instead. */}
        <div className="hidden lg:flex lg:w-[26rem] lg:flex-col lg:bg-gradient-to-br lg:from-muted/40 lg:via-background lg:to-muted/20">
          <div className="border-b border-border/60 px-5 py-3">
            <p className="text-xs font-semibold text-foreground">Live preview</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              What businesses see on the talent board.
            </p>
          </div>
          <div className="relative flex-1 overflow-hidden px-5 py-6">
            <div className="grid grid-cols-2 gap-3">
              {(() => {
                // Pick three ghost categories that differ from the user's
                // choice so the backdrop doesn't duplicate what they're
                // building. Order is stable per category so the card they
                // see stays consistent as they edit.
                const ghostOrder: Array<'videography' | 'websites' | 'social_media' | 'digital_sales'> = [
                  'videography', 'websites', 'social_media', 'digital_sales',
                ];
                const ghosts = ghostOrder.filter((g) => g !== category).slice(0, 3);
                return (
                  <>
                    <GhostStudentCard variant={ghosts[0]} />
                    {/* Live card in hero slot — scale-up + shadow so it
                        reads as the focus of the mock gallery. */}
                    <div className="relative z-10 row-span-2 scale-[1.02] shadow-xl transition-all duration-300">
                      <StudentCardPreview
                        userId={userId}
                        category={category}
                        bannerUrl={bannerUrl}
                        title={title}
                        description={description}
                        skills={skills}
                        serviceArea={serviceArea}
                        university={university}
                        hourlyRate={rateUnit === 'hourly' ? rateMin : profileHourly}
                        rateMin={typicalBudgetMin || rateMin}
                        rateMax={typicalBudgetMax || rateMax}
                        tiktokUrl={tiktokUrl}
                        instagramUrl={instagramUrl}
                        linkedinUrl={linkedinUrl}
                        websiteUrl={websiteUrl}
                      />
                    </div>
                    <GhostStudentCard variant={ghosts[1]} />
                    <GhostStudentCard variant={ghosts[2]} />
                  </>
                );
              })()}
            </div>
          </div>
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
};
