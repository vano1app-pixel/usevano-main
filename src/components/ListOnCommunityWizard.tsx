import React, { useEffect, useRef, useState } from 'react';
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
  Sparkles,
  X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  COMMUNITY_CATEGORY_ORDER,
  COMMUNITY_CATEGORIES,
  type CommunityCategoryId,
} from '@/lib/communityCategories';
import { normalizeTikTokUrl, workLinksToJson, type WorkLinkEntry } from '@/lib/socialLinks';
import { TagBadge } from '@/components/TagBadge';
import { cn } from '@/lib/utils';

const COMMON_SKILLS = [
  'Web Design',
  'Marketing',
  'Graphic Design',
  'Writing',
  'Photography',
  'Video Editing',
  'Social Media',
  'Events',
  'Admin',
];

const STEP_LABELS = [
  'Start',
  'Board',
  'Cover',
  'Listing',
  'Links',
  'Rates',
  'Publish',
];

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
}

interface ListOnCommunityWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  initial: ListOnCommunityInitial;
  /** Called after a successful publish so the parent can refresh state and optionally deep-link to the board. */
  onPublished: (category: CommunityCategoryId) => void;
}

export const ListOnCommunityWizard: React.FC<ListOnCommunityWizardProps> = ({
  open,
  onOpenChange,
  userId,
  initial,
  onPublished,
}) => {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<CommunityCategoryId | null>(null);
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [listingFile, setListingFile] = useState<File | null>(null);
  const [listingPreview, setListingPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [syncBio, setSyncBio] = useState(false);
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [workLinks, setWorkLinks] = useState<WorkLinkEntry[]>([{ url: '', label: '' }]);
  const [serviceArea, setServiceArea] = useState('');
  const [rateUnit, setRateUnit] = useState('hourly');
  const [rateMin, setRateMin] = useState('');
  const [rateMax, setRateMax] = useState('');
  const [profileHourly, setProfileHourly] = useState('');
  const [typicalBudgetMin, setTypicalBudgetMin] = useState('');
  const [typicalBudgetMax, setTypicalBudgetMax] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const listingInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setCategory(null);
    setBannerUrl(initial.bannerUrl || '');
    setBannerFile(null);
    setListingFile(null);
    setListingPreview(null);
    setTitle('');
    setDescription('');
    setSyncBio(false);
    setTiktokUrl(initial.tiktokUrl || '');
    setWorkLinks(
      initial.workLinks.some((r) => r.url.trim() || r.label.trim())
        ? initial.workLinks.map((r) => ({ ...r }))
        : [{ url: '', label: '' }],
    );
    setServiceArea(initial.serviceArea || '');
    setRateUnit('hourly');
    setRateMin('');
    setRateMax('');
    setProfileHourly(initial.hourlyRate || '');
    setTypicalBudgetMin(initial.typicalBudgetMin || '');
    setTypicalBudgetMax(initial.typicalBudgetMax || '');
    setSkills([...initial.skills]);
  }, [open, initial]);

  const totalSteps = STEP_LABELS.length;
  const canNext = (): boolean => {
    switch (step) {
      case 0:
        return true;
      case 1:
        return category !== null;
      case 2:
        return true;
      case 3:
        return title.trim().length > 0 && description.trim().length > 0;
      case 4:
        return true;
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

  const handleListingFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Image too large', description: 'Max 5MB', variant: 'destructive' });
      return;
    }
    setListingFile(file);
    setListingPreview(URL.createObjectURL(file));
  };

  const clearListingImage = () => {
    setListingFile(null);
    setListingPreview(null);
    if (listingInputRef.current) listingInputRef.current.value = '';
  };

  const publish = async () => {
    if (!category || !title.trim()) return;
    setSubmitting(true);
    try {
      let uploadedBanner: string | null = null;
      if (bannerFile) {
        const ext = bannerFile.name.split('.').pop() || 'jpg';
        const path = `${userId}/banner.${ext}`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, bannerFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
        uploadedBanner = `${pub.publicUrl}?t=${Date.now()}`;
      }

      let image_url: string | null = null;
      if (listingFile) {
        const ext = listingFile.name.split('.').pop();
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: liErr } = await supabase.storage.from('community-images').upload(path, listingFile);
        if (liErr) throw liErr;
        const { data: pub } = supabase.storage.from('community-images').getPublicUrl(path);
        image_url = pub.publicUrl;
      }

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

      const tbMin =
        typicalBudgetMin.trim() && parseInt(typicalBudgetMin, 10) > 0 ? parseInt(typicalBudgetMin, 10) : null;
      const tbMax =
        typicalBudgetMax.trim() && parseInt(typicalBudgetMax, 10) > 0 ? parseInt(typicalBudgetMax, 10) : null;
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
      };
      if (syncBio) {
        studentPatch.bio = description.trim();
      }
      if (uploadedBanner) {
        studentPatch.banner_url = uploadedBanner;
      } else {
        const keep =
          (bannerUrl.startsWith('http') ? bannerUrl : null) ||
          (initial.bannerUrl?.startsWith('http') ? initial.bannerUrl : null);
        if (keep) studentPatch.banner_url = keep;
      }

      const { error: spErr } = await supabase.from('student_profiles').update(studentPatch).eq('user_id', userId);
      if (spErr) throw spErr;

      const { error: postErr } = await supabase.from('community_posts').insert({
        user_id: userId,
        category,
        title: title.trim(),
        description: description.trim(),
        image_url,
        rate_min,
        rate_max,
        rate_unit: rate_unit_out,
      });
      if (postErr) throw postErr;

      toast({ title: "You're listed!", description: 'Opening your board…' });
      onOpenChange(false);
      onPublished(category);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      toast({ title: 'Could not publish', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92dvh,44rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="border-b border-border bg-muted/40 px-5 py-4">
          <DialogHeader className="space-y-3 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Community</p>
            <DialogTitle className="text-xl font-semibold tracking-tight">List yourself on the talent board</DialogTitle>
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
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <Sparkles className="h-5 w-5" strokeWidth={2} />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Clients browse VANO Community by specialty — videography, websites, and social. This short flow saves
                your profile details <span className="font-medium text-foreground">and</span> publishes your listing in
                one go — clear steps, no guesswork.
              </p>
              <ul className="space-y-2 text-sm text-foreground/90">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
                  Profile banner & optional hero image for your card
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
                  Headline, description, TikTok & work links
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
                  Rates, service area, and skills
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
                <Label className="text-sm font-medium">Profile banner</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Wide cover on your public profile — makes your listing feel polished.
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
                <Label className="text-sm font-medium">Listing hero (optional)</Label>
                <p className="mt-1 text-xs text-muted-foreground">Shown at the top of your card on Community only.</p>
                <input ref={listingInputRef} type="file" accept="image/*" className="hidden" onChange={handleListingFile} />
                {listingPreview ? (
                  <div className="relative mt-2 overflow-hidden rounded-xl border border-border">
                    <img src={listingPreview} alt="" className="h-32 w-full object-cover" />
                    <button
                      type="button"
                      onClick={clearListingImage}
                      className="absolute right-2 top-2 rounded-full bg-background/90 p-1 shadow"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => listingInputRef.current?.click()}
                    className="mt-2 flex h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-muted/20 text-xs text-muted-foreground hover:border-primary/30"
                  >
                    <ImagePlus className="h-5 w-5" />
                    Add photo
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="lc-title">Headline</Label>
                <Input
                  id="lc-title"
                  className="mt-1.5 h-11"
                  placeholder="e.g. Event videography & short-form reels"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div>
                <Label htmlFor="lc-desc">What you deliver</Label>
                <Textarea
                  id="lc-desc"
                  className="mt-1.5 min-h-[120px] text-sm"
                  placeholder="Gear, turnaround, style, past clients, what makes you easy to hire…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                />
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/80 bg-muted/20 p-3">
                <Checkbox checked={syncBio} onCheckedChange={(v) => setSyncBio(!!v)} className="mt-0.5" />
                <span className="text-sm leading-snug text-muted-foreground">
                  <span className="font-medium text-foreground">Also save as my profile bio</span> — keeps Browse &amp;
                  portfolio in sync with this pitch.
                </span>
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
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
              <div className="rounded-xl border border-border bg-muted/25 p-4">
                <p className="text-sm font-medium text-foreground">On your Community card</p>
                <Label className="mt-3 text-xs text-muted-foreground">How do you price this listing?</Label>
                <Select value={rateUnit} onValueChange={setRateUnit}>
                  <SelectTrigger className="mt-1.5 h-11 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Per hour</SelectItem>
                    <SelectItem value="day">Per day</SelectItem>
                    <SelectItem value="project">Per project (flat)</SelectItem>
                    <SelectItem value="negotiable">Negotiable</SelectItem>
                  </SelectContent>
                </Select>
                {rateUnit !== 'negotiable' && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">From (€)</Label>
                      <Input
                        className="mt-1 h-11"
                        inputMode="decimal"
                        placeholder="e.g. 25"
                        value={rateMin}
                        onChange={(e) => setRateMin(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Up to (€)</Label>
                      <Input
                        className="mt-1 h-11"
                        inputMode="decimal"
                        placeholder="Optional"
                        value={rateMax}
                        onChange={(e) => setRateMax(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div>
                <Label>Profile hourly rate (€)</Label>
                <p className="mt-1 text-xs text-muted-foreground">Shown on your profile &amp; freelancer browse — use for video, social, ongoing work.</p>
                <Input
                  className="mt-1.5 h-11"
                  inputMode="decimal"
                  placeholder="e.g. 35"
                  value={profileHourly}
                  onChange={(e) => setProfileHourly(e.target.value)}
                />
              </div>
              {category === 'websites' && (
                <div className="rounded-xl border border-border bg-primary/5 p-4">
                  <p className="text-sm font-medium text-foreground">Typical website / project budget (€)</p>
                  <p className="mt-1 text-xs text-muted-foreground">Saved on your profile for fixed-price style work.</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      min={0}
                      placeholder="Min"
                      value={typicalBudgetMin}
                      onChange={(e) => setTypicalBudgetMin(e.target.value)}
                      className="h-11"
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Max"
                      value={typicalBudgetMax}
                      onChange={(e) => setTypicalBudgetMax(e.target.value)}
                      className="h-11"
                    />
                  </div>
                </div>
              )}
              <div>
                <Label className="text-sm font-medium">Skills on your profile</Label>
                <p className="mt-1 text-xs text-muted-foreground">Tap to toggle — shown on Community cards.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {COMMON_SKILLS.map((s) => (
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
                We&apos;ll update your profile (banner, links, area, skills, rates) and publish this post. You can post
                again on another board anytime.
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
              disabled={submitting || !category || !title.trim()}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing…
                </>
              ) : (
                'Publish listing'
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
