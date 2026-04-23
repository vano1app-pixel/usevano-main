import { useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_ORDER,
  type CommunityCategoryId,
} from '@/lib/communityCategories';
import { Loader2, Sparkles, ArrowRight, Eye, Wand2 } from 'lucide-react';
import { microCelebrate } from '@/lib/celebrate';
import { normalizeIrishPhone } from '@/lib/phoneNormalize';

// Keyword → category inference. Runs when someone starts typing a pitch
// before picking a category, so we can surface a "Looks like Video?"
// nudge that saves the tap. Order matters: first match wins. Digital
// sales is checked first because its keywords ("sales", "closer") are
// more specific than the looser "website"/"video" stems.
const CATEGORY_INFERENCE_KEYWORDS: Array<[CommunityCategoryId, readonly string[]]> = [
  ['digital_sales', ['sales', 'sdr', 'bdr', 'closer', 'outbound', 'cold call', 'cold email', 'lead gen', 'prospect', 'b2b', 'saas']],
  ['videography',   ['video', 'film', 'reel', 'wedding', 'drone', 'cinematic', 'editor', 'filming', 'videographer', 'premiere', 'davinci']],
  ['websites',      ['web', 'website', 'react', 'next', 'shopify', 'landing', 'wordpress', 'developer', 'frontend', 'ecommerce', 'html', 'css']],
  ['social_media',  ['tiktok', 'instagram', 'reels', 'ugc', 'content creator', 'social', 'creator', 'influencer', 'marketing']],
];

function inferCategoryFromPitch(pitch: string): CommunityCategoryId | null {
  const lowered = pitch.toLowerCase();
  if (lowered.length < 6) return null;
  for (const [id, keywords] of CATEGORY_INFERENCE_KEYWORDS) {
    if (keywords.some((k) => lowered.includes(k))) return id;
  }
  return null;
}

// Three fill-in-the-blank pitch starters per category. Beats staring at
// an empty input; first-timers who don't know what "good" looks like
// get a concrete, editable scaffold. Templates use em-dashes so freshly
// tapped ones read well even before the user edits them.
const PITCH_STARTERS: Record<CommunityCategoryId, readonly string[]> = {
  videography: [
    'Wedding & event videographer — reels + full films',
    'Brand videographer — reels, ads & promo',
    'Short-form editor — TikToks, Reels & YouTube Shorts',
  ],
  digital_sales: [
    'B2B sales closer for SaaS brands — outbound & demos',
    'Cold-email SDR for startups — booked meetings, not spam',
    'Lead gen & appointment setter — pipeline built fast',
  ],
  websites: [
    'Full-stack websites in React & Next.js — fast and clean',
    'Shopify stores built to sell — speed + conversion',
    'Landing pages & web apps — design to deploy',
  ],
  social_media: [
    'UGC creator & TikTok editor for lifestyle brands',
    'Social media manager — content, posting, engagement',
    'Short-form content creator — Reels & TikToks that land',
  ],
};

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
}: {
  userId: string;
  onPublished: (payload: { postId: string; category: CommunityCategoryId }) => void;
  // Previously required `onOpenFullWizard` for the "set up the full
  // listing now" escape hatch. That button was removed (see body); the
  // prop is dropped to stop callers passing a handler that can never
  // fire. Post-publish polish happens on /profile.
}) {
  const { toast } = useToast();
  const [category, setCategory] = useState<CommunityCategoryId | null>(null);
  const [pitch, setPitch] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pitchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on category pick was removed (2026-04-23): on mobile it
  // popped the soft keyboard the moment a category was tapped, the
  // viewport shrank, and the page scrolled the input into view — felt
  // like the page was bouncing. Users said "the wizard keeps bouncing
  // up". The pitch input is visually next on the page; if they want it
  // they'll tap it themselves. The input ref is kept for the
  // starter-template buttons that still need to restore focus.

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

  // Suggest a category based on what they've already typed, but only
  // when they haven't picked one yet. Memoised so we don't re-scan the
  // keyword list on every keystroke of a long pitch.
  const suggestedCategory = useMemo(
    () => (category === null ? inferCategoryFromPitch(pitch) : null),
    [category, pitch],
  );

  const publish = async () => {
    if (!canPublish || submitting || !category) return;
    setSubmitting(true);
    let succeeded = false;
    try {
      // Step 0: refresh the JWT. Long sign-up sessions plus the email-
      // verify round-trip plus reading the form for a minute can push
      // the access token past expiry by the time we hit Publish. RPC
      // call would then 401 with no useful message. Cheap to refresh.
      await supabase.auth.refreshSession().catch(() => {
        /* fall through — getSession below will surface the real issue */
      });

      // Step 1: confirm we still have a session. If the refresh failed
      // and there's no token, every subsequent write would fail with
      // RLS errors that look like data corruption to the user. Bail
      // with a clear message instead.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('Your sign-in expired. Refresh the page and try again.');
      }
      if (session.user.id !== userId) {
        // Mismatched user — defensive guard; the wizard was loaded for
        // someone else. Don't write to the wrong profile.
        throw new Error('Account mismatch — please refresh and try again.');
      }

      // Step 2: ensure `profiles.user_type = 'student'`. The publish RPC
      // (migration 20260416130000) hard-requires this; without it the
      // RPC raises 42501. Most freelancers reach here via ChooseAccountType
      // which already sets it, but the scout-claim flow, OAuth edge cases,
      // and direct URLs skip that step. Read-then-write so we don't blow
      // away other profile fields with an empty INSERT.
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('user_id, user_type')
        .eq('user_id', userId)
        .maybeSingle();
      if (profErr) {
        throw new Error(`Profile lookup failed — ${profErr.message}`);
      }

      if (!prof) {
        // Profile row missing entirely. Insert with the minimum the
        // schema requires; the user can fill in display_name + bio
        // later from /profile.
        const { error: insErr } = await supabase
          .from('profiles')
          .insert({
            user_id: userId,
            user_type: 'student',
            display_name: session.user.user_metadata?.full_name
              || session.user.email?.split('@')[0]
              || '',
          } as never);
        if (insErr) {
          throw new Error(`Couldn't set up your profile — ${insErr.message}`);
        }
      } else if (prof.user_type !== 'student') {
        const { error: updErr } = await supabase
          .from('profiles')
          .update({ user_type: 'student' } as never)
          .eq('user_id', userId);
        if (updErr) {
          throw new Error(`Couldn't set account type — ${updErr.message}`);
        }
      }

      // Step 3: ensure the student_profiles row exists (and write the
      // phone if they gave one). Capture .error explicitly — supabase-js
      // returns errors in the result, it doesn't throw, and silently
      // ignoring them was making downstream RPC failures look mysterious.
      const upsertPayload: { user_id: string; phone?: string } = { user_id: userId };
      if (trimmedPhone) upsertPayload.phone = trimmedPhone;
      const { error: spErr } = await supabase
        .from('student_profiles')
        .upsert(upsertPayload, { onConflict: 'user_id' });
      if (spErr) {
        throw new Error(`Couldn't save your details — ${spErr.message}`);
      }

      // Step 4: the publish RPC. Description empty + rates 0 are "ask
      // for a quote" defaults; the user polishes from /profile later.
      const { data: postId, error: rpcErr } = await supabase.rpc(
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
      if (rpcErr) {
        throw new Error(`Publish failed — ${rpcErr.message}`);
      }

      // Step 5: fire the welcome email (best-effort). Session-storage
      // guard prevents dup sends in the same tab. Wrapped so a failed
      // edge function never blocks the celebration.
      try {
        const sentKey = 'vano_welcome_email_sent';
        if (!sessionStorage.getItem(sentKey)) {
          sessionStorage.setItem(sentKey, '1');
          supabase.functions
            .invoke('welcome-freelancer-published', { body: {} })
            .catch(() => { /* best-effort only */ });
        }
      } catch {
        /* sessionStorage unavailable in private mode etc; safe to skip */
      }

      // Mark success so `finally` doesn't reset submitting back to false
      // before the parent unmounts us via navigate. Without this flag,
      // the button briefly flicks back to "Go live" before the Profile
      // page mounts, which reads as "did it actually publish?".
      succeeded = true;
      onPublished({ postId: (postId as unknown as string) || '', category });
    } catch (err) {
      // Surface the REAL message in the toast description so the founder
      // can grep / screenshot exactly what broke. The previous heuristic
      // ("Please try again in a moment") was useless — it hid a wide
      // variety of root causes behind one generic line.
      const raw = (err as { message?: string })?.message || 'Unknown error.';
      const description = raw.length > 180 ? raw.slice(0, 180) + '…' : raw;
      console.error('[ListOnCommunityQuickStart] publish failed', err);
      toast({
        title: "Couldn't publish your listing",
        description,
        variant: 'destructive',
      });
    } finally {
      // Always reset the button state. On success the parent navigates
      // away and we unmount, so resetting is harmless. On failure the
      // user needs the button live again to retry. The previous version
      // only reset in catch, which meant a thrown-but-still-on-page case
      // could leave the button stuck on "Publishing…" indefinitely.
      if (!succeeded) setSubmitting(false);
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
                  onClick={() => {
                    const firstPick = category !== id;
                    setCategory(id);
                    if (firstPick) microCelebrate();
                  }}
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
          {/* Category inference nudge — only shows if they started
               typing the pitch before picking. Single-tap accept.
               Disappears once they pick anything manually. */}
          {suggestedCategory && (
            <button
              type="button"
              onClick={() => {
                setCategory(suggestedCategory);
                microCelebrate();
              }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-[12px] font-medium text-primary transition hover:bg-primary/10 active:scale-[0.98]"
            >
              <Wand2 size={12} />
              Looks like {COMMUNITY_CATEGORIES[suggestedCategory].label}? Tap to pick
            </button>
          )}
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
          {/* Starter templates — surfaces once a category is picked and
               the pitch is still short/empty. Tapping fills the input so
               users edit from a concrete scaffold instead of staring at
               a blank field. Hidden the moment they've started writing
               something longer than a template's length so it doesn't
               offer to overwrite real work. */}
          {category && pitch.trim().length < 8 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Start from:
              </span>
              {PITCH_STARTERS[category].map((template) => (
                <button
                  key={template}
                  type="button"
                  onClick={() => {
                    setPitch(template);
                    // Hand focus back so they can tweak immediately,
                    // placing the cursor at the end of the filled text.
                    window.setTimeout(() => {
                      const el = pitchInputRef.current;
                      if (!el) return;
                      el.focus();
                      el.setSelectionRange(template.length, template.length);
                    }, 0);
                  }}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                >
                  {template}
                </button>
              ))}
            </div>
          )}
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
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => {
              // Canonicalize on blur (not keystroke) so the cursor
              // doesn't jump mid-typing. Irish users typically paste
              // "0871234567" — this turns it into "+353 87 1234567"
              // which matches the validator downstream.
              const normalised = normalizeIrishPhone(phone);
              if (normalised !== phone) setPhone(normalised);
            }}
            placeholder="+353 87 123 4567"
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            We'll text you the second a business wants to hire you. Never shown publicly. Leave blank and they can only message you here on Vano.
          </p>
        </div>

        {/* Preview — appears once category + pitch are filled so the
             freelancer sees EXACTLY what businesses will see on the
             talent board before they commit. Without this, a cold
             first-timer hits Publish without knowing what the output
             looks like ("did I just post something ugly?"), which is
             the single biggest source of "I want to delete my listing"
             support pings. Subtle styling so it doesn't dominate the
             form. */}
        {canPublish && category && (() => {
          const cat = COMMUNITY_CATEGORIES[category];
          const Icon = cat.icon;
          return (
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="mb-2.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <Eye size={11} /> Preview
              </div>
              <div className="rounded-lg bg-card p-3 shadow-sm ring-1 ring-border/60">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon size={16} strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-primary">
                      {cat.label}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] font-semibold text-foreground">
                      {pitch.trim()}
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                You can add a cover photo, skills, portfolio &amp; more from your profile after going live.
              </p>
            </div>
          );
        })()}

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

        {/* The old "Or, set up the full listing now" escape hatch used
             to live here. Removed on 2026-04-23: it was tempting
             uncertain first-timers into the 4-step wizard where
             abandonment spikes, against the whole point of QuickStart.
             Freelancers polish from /profile after going live. */}
        <p className="text-center text-[11px] text-muted-foreground">
          Cover photo, skills, portfolio & rate unlock from your profile after going live.
        </p>
      </div>
    </div>
  );
}
