import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_ORDER,
  type CommunityCategoryId,
} from '@/lib/communityCategories';
import { Loader2, Sparkles, ArrowRight } from 'lucide-react';

// First-time "Quick list" entry point for freelancers. Collapses the full
// 4-step wizard to a single screen with just the three fields anyone needs
// to be discoverable: category + one-sentence pitch + phone. Everything
// else (bio, portfolio, rates, skills, socials) is opt-in polish that
// unlocks from /profile after publishing.
//
// The full wizard still exists for freelancers who want more control —
// a secondary "Or, customise everything now" link opens it in a modal.
// But defaulting to the quick path cuts listing-abandonment dramatically
// for cold first-timers who bounce when faced with a 4-step form.

export function ListOnCommunityQuickStart({
  userId,
  onPublished,
  onOpenFullWizard,
}: {
  userId: string;
  onPublished: (payload: { postId: string; category: CommunityCategoryId }) => void;
  onOpenFullWizard: () => void;
}) {
  const { toast } = useToast();
  const [category, setCategory] = useState<CommunityCategoryId | null>(null);
  const [pitch, setPitch] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pitchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the pitch input once the user picks a category. On mobile
  // this saves an extra tap (the next thing they need to do is type); on
  // desktop it visually hands the flow forward without ambiguity about
  // "what do I do now?". Skipped on first mount so the page doesn't
  // yank focus before the user has looked at the category grid.
  useEffect(() => {
    if (!category) return;
    // Short delay so the soft-keyboard-friendly layout is stable.
    const t = window.setTimeout(() => pitchInputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [category]);

  // Phone is optional — businesses can always reach a freelancer through
  // in-app messages. Forcing a phone upfront was the #1 abandonment point;
  // dropping the requirement lets uncertain users get listed in seconds and
  // add their number later when a real client conversation is happening.
  // When they DO enter one, we at least require it to look phone-shaped
  // (digits, optionally with + / spaces / dashes / parens, 7+ chars) so
  // a typo like "1234" or "asdf" can't be saved.
  const trimmedPhone = phone.trim();
  const phoneLooksValid =
    trimmedPhone.length === 0 ||
    /^\+?[0-9][0-9\s\-()]{6,}$/.test(trimmedPhone);
  const canPublish =
    category !== null &&
    pitch.trim().length >= 6 &&
    phoneLooksValid;

  const publish = async () => {
    if (!canPublish || submitting || !category) return;
    setSubmitting(true);
    try {
      // Upsert empty defaults on student_profiles (and phone if the user
      // gave one) so the row exists before the community_posts INSERT.
      const upsertPayload: { user_id: string; phone?: string } = { user_id: userId };
      if (trimmedPhone) upsertPayload.phone = trimmedPhone;
      await supabase
        .from('student_profiles')
        .upsert(upsertPayload, { onConflict: 'user_id' });

      // Call the same publish RPC the full wizard uses. Description is
      // empty on purpose — the user can polish later. Rates default to 0
      // (interpreted as "ask for a quote") since we haven't asked yet.
      const { data: postId, error } = await supabase.rpc(
        'publish_community_listing' as never,
        {
          _category: category,
          _title: pitch.trim(),
          _description: '',
          _image_url: '',
          _rate_min: 0,
          _rate_max: 0,
          _rate_unit: 'hourly',
        } as never,
      );

      if (error) throw error;
      onPublished({ postId: (postId as unknown as string) || '', category });
    } catch (err) {
      const message = (err as { message?: string })?.message || '';
      toast({
        title: "Couldn't publish your listing",
        description: message.includes('permission')
          ? 'Please refresh the page and try again.'
          : 'Please try again in a moment.',
        variant: 'destructive',
      });
      setSubmitting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-primary/25 bg-card shadow-sm">
      <div className="border-b border-border/60 bg-gradient-to-br from-primary/10 via-card to-card px-5 py-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles size={18} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Get listed in 30 seconds
            </p>
            <h1 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">
              Show businesses what you do
            </h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              Just the basics — pick a category and write one line about yourself.
              Phone is optional. You can polish the rest later.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {/* Category */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What do you do?
          </label>
          <div className="grid grid-cols-2 gap-2">
            {COMMUNITY_CATEGORY_ORDER.map((id) => {
              const cat = COMMUNITY_CATEGORIES[id];
              const Icon = cat.icon;
              const active = category === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCategory(id)}
                  className={[
                    'flex items-center gap-2 rounded-xl border px-3.5 py-3 text-left transition',
                    active
                      ? 'border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary/30'
                      : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5',
                  ].join(' ')}
                >
                  <Icon size={16} className={active ? 'text-primary' : 'text-muted-foreground'} />
                  <span className="text-sm font-semibold">{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Pitch */}
        <div>
          <label htmlFor="qs-pitch" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            One-line pitch
          </label>
          <input
            ref={pitchInputRef}
            id="qs-pitch"
            type="text"
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            placeholder={
              category === 'videography' ? 'e.g. Event videographer — weddings & reels'
              : category === 'websites' ? 'e.g. Full-stack websites in React + Shopify'
              : category === 'digital_sales' ? 'e.g. B2B sales closer for SaaS brands'
              : category === 'social_media' ? 'e.g. UGC creator & TikTok editor'
              : 'One line — what you do and who you work with'
            }
            maxLength={120}
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {pitch.length}/120 · you can expand this later
          </p>
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="qs-phone" className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Phone number</span>
            <span className="font-normal normal-case tracking-normal text-muted-foreground/70">
              Optional
            </span>
          </label>
          <input
            id="qs-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+353 …"
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Skip if you'd rather chat in-app first. We'll text you when a business reaches out — never shared publicly.
          </p>
        </div>

        {/* Publish */}
        <button
          type="button"
          onClick={publish}
          disabled={!canPublish || submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <><Loader2 size={15} className="animate-spin" /> Publishing…</>
          ) : (
            <>Go live — I'm hireable <ArrowRight size={15} strokeWidth={2.5} /></>
          )}
        </button>

        {/* Escape hatch to the full wizard for people who want more control */}
        <button
          type="button"
          onClick={onOpenFullWizard}
          className="block w-full text-center text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Or, set up the full listing now (rate, portfolio, bio…)
        </button>
      </div>
    </div>
  );
}
