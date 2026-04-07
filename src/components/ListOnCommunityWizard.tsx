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
import { Checkbox } from '@/components/ui/checkbox';
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
  ChevronLeft,
  ImagePlus,
  Loader2,
  ClipboardList,
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
import { normalizeTikTokUrl, workLinksToJson, type WorkLinkEntry } from '@/lib/socialLinks';
import { TagBadge } from '@/components/TagBadge';
import { cn } from '@/lib/utils';
import { getSupabaseErrorMessage, logSupabaseError } from '@/lib/supabaseError';
import { getUserFriendlyError } from '@/lib/errorMessages';

const STEP_LABELS = [
  'Get started',
  'What you do',
  'Your work',
  'Your pitch',
  'Your details',
  'Your price',
  'Go live',
];

const STEP_HEADINGS: Record<number, string> = {
  0: 'Get listed in 5 minutes',
  1: 'What do you do?',
  2: 'Show your work',
  3: 'Tell them about you',
  4: 'Your details',
  5: 'Set your price',
  6: 'Review & go live',
};

const STEP_DESCRIPTIONS: Record<number, string> = {
  0: 'Businesses in Galway are looking for people like you.',
  1: 'Pick your main skill — this is how businesses find you.',
  2: 'A strong cover photo makes businesses click. This is the first thing they see.',
  3: 'Write a short pitch — what you do, what makes you different.',
  4: 'Help businesses know where you\'re based and how to reach you.',
  5: 'Be upfront — businesses prefer freelancers who are clear on pricing.',
  6: 'Check everything looks good — you can always edit later.',
};

export interface ListOnCommunityInitial {
  bannerUrl: string;
  tiktokUrl: string;
  workLinks: WorkLinkEntry[];
  skills: string[];
  serviceArea: string;
  typicalBudgetMin: string;
  typicalBudgetMax: string;
  hourlyRate: string;
  bio: string;
  university: string;
  phone?: string | null;
}

interface ListOnCommunityDraft {
  step: number;
  category: CommunityCategoryId | null;
  bannerUrl: string;
  title: string;
  description: string;
  aboutMe: string;
  tiktokUrl: string;
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
      category: isCommunityCategoryId(typeof parsed.category === 'string' ? parsed.category : null)
        ? parsed.category
        : null,
      bannerUrl: typeof parsed.bannerUrl === 'string' ? parsed.bannerUrl : '',
      title: typeof parsed.title === 'string' ? parsed.title : '',
      description: typeof parsed.description === 'string' ? parsed.description : '',
      aboutMe: typeof parsed.aboutMe === 'string' ? parsed.aboutMe : '',
      tiktokUrl: typeof parsed.tiktokUrl === 'string' ? parsed.tiktokUrl : '',
      workLinks: parseDraftWorkLinks(parsed.workLinks),
      serviceArea: typeof parsed.serviceArea === 'string' ? parsed.serviceArea : '',
      university: typeof parsed.university === 'string' ? parsed.university : '',
      rateUnit: typeof parsed.rateUnit === 'string' ? parsed.rateUnit : 'hourly',
      rateMin: typeof parsed.rateMin === 'string' ? parsed.rateMin : '',
      rateMax: typeof parsed.rateMax === 'string' ? parsed.rateMax : '',
      profileHourly: typeof parsed.profileHourly === 'string' ? parsed.profileHourly : '',
      typicalBudgetMin: typeof parsed.typicalBudgetMin === 'string' ? parsed.typicalBudgetMin : '',
      typicalBudgetMax: typeof parsed.typicalBudgetMax === 'string' ? parsed.typicalBudgetMax : '',
      skills: Array.isArray(parsed.skills) ? parsed.skills.filter((s): s is string => typeof s === 'string') : [],
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
  const [submitting, setSubmitting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const listingInputRef = useRef<HTMLInputElement>(null);
  const MAX_LISTING_IMAGES = 5;

  useEffect(() => {
    if (!open) {
      setDraftReady(false);
      return;
    }

    setDraftReady(false);
    setStep(startAtStep ?? 0);

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
    setUniversity(initial.university || '');
    setTiktokUrl(initial.tiktokUrl || '');
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
        setStep(draft.step);
        setCategory(draft.category);
        setBannerUrl(draft.bannerUrl || initial.bannerUrl || '');
        setTitle(draft.title);
        setDescription(draft.description);
        setAboutMe(draft.aboutMe || '');
        setUniversity(draft.university || '');
        if (typeof (draft as any).phone === 'string') setPhone((draft as any).phone);
        setTiktokUrl(draft.tiktokUrl);
        setWorkLinks(draft.workLinks);
        setServiceArea(draft.serviceArea);
        setRateUnit(draft.rateUnit);
        setRateMin(draft.rateMin);
        setRateMax(draft.rateMax);
        setProfileHourly(draft.profileHourly);
        setTypicalBudgetMin(draft.typicalBudgetMin);
        setTypicalBudgetMax(draft.typicalBudgetMax);
        setSkills(normalizeFreelancerSkills(draft.skills));
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
  ]);

  // Websites = project-only pricing
  useEffect(() => {
    if (category === 'websites') setRateUnit('project');
  }, [category]);

  const totalSteps = STEP_LABELS.length;
  const canNext = (): boolean => {
    switch (step) {
      case 0:
        return true;
      case 1:
        return category !== null;
      case 2:
        return !!(bannerFile || bannerUrl);
      case 3:
        return title.trim().length > 0 && description.trim().length > 0;
      case 4: {
        // University + phone required for new listings, optional when editing existing
        const isEditing = !!(initial as any).existingPost;
        return isEditing || (university.trim().length > 0 && phone.trim().length > 0);
      }
      case 5:
        return true;
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
        const ext = file.name.split('.').pop();
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
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
      if (rateUnit === 'negotiable') {
        rate_min = null;
        rate_max = null;
        rate_unit_out = 'negotiable';
      } else {
        if (rateMin.trim()) {
          const n = parseFloat(rateMin.replace(',', '.'));
          if (!Number.isNaN(n) && n >= 0) rate_min = n;
        }
        if (rateMax.trim()) {
          const n = parseFloat(rateMax.replace(',', '.'));
          if (!Number.isNaN(n) && n >= 0) rate_max = n;
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
      const hourly_rate = !Number.isNaN(hourlyNum) && hourlyNum > 0 ? hourlyNum : 0;

      const studentPatch: Record<string, unknown> = {
        tiktok_url: normalizeTikTokUrl(tiktokUrl),
        work_links: workLinksToJson(workLinks) as unknown,
        service_area: serviceArea.trim() || null,
        typical_budget_min: tbMin,
        typical_budget_max: tbMax,
        skills,
        hourly_rate,
        community_board_status: 'approved',
        bio: aboutMe.trim() || description.trim(),
      };
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

      await supabase.from('community_posts').delete().eq('user_id', userId);

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

      toast({
        title: "You're live!",
        description: 'Your listing is now visible on the Community board.',
      });
      try {
        localStorage.removeItem(listOnCommunityDraftKey(userId));
      } catch {
        // Ignore storage restrictions - successful publish is the important part.
      }
      onOpenChange(false);
      onSubmittedForReview(category);
    } catch (err: unknown) {
      logSupabaseError('ListOnCommunityWizard: publish', err);
      const msg = getUserFriendlyError(err);
      toast({ title: 'Could not publish', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92dvh,44rem)] w-[calc(100vw-1.25rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-2xl border p-0 sm:w-full isolate bg-background">
        <div className="border-b border-border bg-muted/40 px-5 py-4">
          <DialogHeader className="space-y-3 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Community</p>
            <DialogTitle className="text-xl font-semibold tracking-tight">{STEP_HEADINGS[step] ?? 'List yourself'}</DialogTitle>
            <div className="flex gap-1 pt-1">
              {STEP_LABELS.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-colors',
                    i <= step ? 'bg-primary' : 'bg-border',
                  )}
                />
              ))}
            </div>
            <p className="text-[11px] font-medium text-muted-foreground">
              Step {step + 1} of {totalSteps}
              {step > 0 ? ` · ${STEP_LABELS[step]}` : ''}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">{STEP_DESCRIPTIONS[step]}</p>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <ClipboardList className="h-5 w-5" strokeWidth={2} />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Your listing goes{' '}
                <span className="font-medium text-foreground">live straight away</span>. Here&apos;s what we&apos;ll ask:
              </p>
              <ul className="space-y-2 text-sm text-foreground/90">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
                  Your skill category &amp; a cover photo
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
                  A short pitch about you and your work
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
                  Your rates, skills, and contact details
                </li>
              </ul>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Which board fits you best?</p>
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
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <Label className="text-sm font-medium">Cover photo</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your wide cover image — shown at the top of your public profile.
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
                <Label className="text-sm font-medium">Sample work photos (optional)</Label>
                <p className="mt-1 text-xs text-muted-foreground">Up to {MAX_LISTING_IMAGES} photos of your work — shown in your portfolio and on your card.</p>
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

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="lc-title">Your title</Label>
                <Input
                  id="lc-title"
                  className="mt-1.5 h-11"
                  placeholder={
                    category === 'websites' ? 'e.g. Custom React websites & Shopify stores' :
                    category === 'social_media' ? 'e.g. Social media management & content creation' :
                    category === 'photography' ? 'e.g. Wedding & event photography — Galway' :
                    'e.g. Event videography & short-form reels'
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div>
                <Label htmlFor="lc-desc">About your work</Label>
                <Textarea
                  id="lc-desc"
                  className="mt-1.5 min-h-[120px] text-sm"
                  placeholder={
                    category === 'websites'
                      ? "What tech stack do you work with? Have you built e-commerce sites, portfolios, or landing pages? Any past client examples?"
                      : category === 'social_media'
                      ? "What platforms do you manage? What content formats do you create? Have you run paid ads or grown accounts from scratch?"
                      : "What do you shoot? What gear do you use (camera, drone, etc.)? What kind of events or clients have you worked with?"
                  }
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                />
              </div>
              <div>
                <Label htmlFor="lc-about">A bit about you <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea
                  id="lc-about"
                  className="mt-1.5 min-h-[80px] text-sm"
                  placeholder="Where you're from, what you're passionate about, fun facts — helps clients get to know you."
                  value={aboutMe}
                  onChange={(e) => setAboutMe(e.target.value)}
                  maxLength={500}
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <Label>Phone number {!(initial as any).existingPost && <span className="text-rose-500">*</span>}</Label>
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
                <Label>University {!(initial as any).existingPost && <span className="text-rose-500">*</span>}</Label>
                <Input
                  className="mt-1.5 h-11"
                  placeholder="e.g. University of Galway"
                  value={university}
                  onChange={(e) => setUniversity(e.target.value)}
                />
              </div>
              <div>
                <Label>TikTok</Label>
                <Input
                  className="mt-1.5 h-11"
                  placeholder="https://tiktok.com/@you or @you"
                  value={tiktokUrl}
                  onChange={(e) => setTiktokUrl(e.target.value)}
                />
              </div>
              <div>
                <Label>Links to past work</Label>
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
              <div>
                <Label>Where you work</Label>
                <Input
                  className="mt-1.5 h-11"
                  placeholder="e.g. Galway city · Remote OK"
                  value={serviceArea}
                  onChange={(e) => setServiceArea(e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              {category === 'websites' ? (
                <>
                  <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    Websites are priced per project — set the range you typically charge below.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">From (€)</Label>
                      <Input className="mt-1.5 h-11" inputMode="decimal" placeholder="e.g. 200" value={rateMin} onChange={(e) => setRateMin(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Up to (€)</Label>
                      <Input className="mt-1.5 h-11" inputMode="decimal" placeholder="e.g. 2000" value={rateMax} onChange={(e) => setRateMax(e.target.value)} />
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
                  {rateUnit !== 'negotiable' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">From (€)</Label>
                        <Input className="mt-1.5 h-11" inputMode="decimal" placeholder="e.g. 25" value={rateMin} onChange={(e) => setRateMin(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Up to (€)</Label>
                        <Input className="mt-1.5 h-11" inputMode="decimal" placeholder="Optional" value={rateMax} onChange={(e) => setRateMax(e.target.value)} />
                      </div>
                    </div>
                  )}
                  <div>
                    <Label>Your hourly rate (€)</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Shown on your profile — for ongoing or recurring work.</p>
                    <Input className="mt-1.5 h-11" inputMode="decimal" placeholder="e.g. 35" value={profileHourly} onChange={(e) => setProfileHourly(e.target.value)} />
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
            </div>
          )}

          {step === 6 && category && (
            <div className="space-y-4 text-sm">
              <p className="font-medium text-foreground">Ready to go live</p>
              <div className="space-y-2 rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Board</p>
                <p className="font-medium">{COMMUNITY_CATEGORIES[category].label}</p>
              </div>
              <div className="space-y-2 rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Listing</p>
                <p className="font-semibold">{title || '—'}</p>
                <p className="line-clamp-4 text-muted-foreground">{description || '—'}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
                We&apos;ll save your profile details (banner, links, location, skills, rates) and{' '}
                <span className="font-medium text-foreground">publish your listing immediately</span>. It will be visible on the Community board right away.
              </div>
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <Checkbox
                    checked={agreedToTerms}
                    onCheckedChange={(v) => setAgreedToTerms(v === true)}
                    className="mt-0.5"
                  />
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    I agree to the{' '}
                    <Link to="/terms" target="_blank" className="text-primary hover:underline underline-offset-2">Terms of Service</Link>
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <Checkbox
                    checked={agreedToPrivacy}
                    onCheckedChange={(v) => setAgreedToPrivacy(v === true)}
                    className="mt-0.5"
                  />
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    I agree to the{' '}
                    <Link to="/privacy" target="_blank" className="text-primary hover:underline underline-offset-2">Privacy Policy</Link>
                  </span>
                </label>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Live preview</p>
                    <p className="mt-1 text-sm text-muted-foreground">This is how businesses will roughly see your card.</p>
                  </div>
                  <div className="rounded-full border border-border bg-muted/50 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                    Autosaves on this device
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
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border bg-background px-5 py-4">
          {step > 0 ? (
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
          {step < totalSteps - 1 ? (
            <Button
              type="button"
              className="h-11 flex-1 rounded-xl font-semibold"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext()}
            >
              Continue
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              className="h-11 flex-1 rounded-xl font-semibold"
              onClick={publish}
              disabled={submitting || !category || !title.trim() || !agreedToTerms || !agreedToPrivacy}
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
      </DialogContent>
    </Dialog>
  );
};
