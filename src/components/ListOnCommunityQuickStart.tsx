import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_ORDER,
  type CommunityCategoryId,
} from '@/lib/communityCategories';
// Subtype labels live in a shared lib so the wizard can use the same
// list to detect a QuickStart-auto-filled title and surface a "we filled
// this from your category" hint. Keep both in lockstep here.
import { SUBTYPES_BY_CATEGORY } from '@/lib/communitySubtypes';
import { Loader2, Sparkles, ArrowRight, Eye } from 'lucide-react';
import { microCelebrate } from '@/lib/celebrate';
import { normalizeIrishPhone } from '@/lib/phoneNormalize';

// One default skill per category. The talent board (BrowseStudents +
// StudentsByCategory) excludes any student_profile with `skills = '{}'`,
// so a freelancer who publishes via QuickStart needs at least one skill
// on file to actually show up. We seed a sensible category-aligned
// default and the user refines it from /profile after publish — beats
// adding a "pick your skills" step on the QuickStart and re-introducing
// the abandonment we just removed.
const DEFAULT_SKILL_BY_CATEGORY: Record<CommunityCategoryId, string> = {
  videography: 'Video editing',
  digital_sales: 'Sales',
  websites: 'Web development',
  social_media: 'Social media',
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
  // Subtype replaces the old freeform "one-line pitch" input. Picked from
  // a category-specific chip grid (mirrors HirePage Step 1). Reset to
  // null whenever the category changes so a stale pick from a previous
  // category can't be carried over (e.g. user picks "Reel / short-form"
  // under Video, then switches to Websites — that subtype isn't valid
  // there).
  const [subtype, setSubtype] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Phone is required (founder's call, 2026-04-23). Reasoning: when a
  // hirer matches with a freelancer who has no phone on file, the only
  // contact path is in-app messages — which the freelancer must
  // actively check. Real conversion happens when the hirer can text /
  // call directly the moment they're matched. The required marker (red
  // asterisk on the label) is paired with copy that explains it's
  // never shown publicly so users don't get spooked into bouncing.
  const trimmedPhone = phone.trim();
  const phoneLooksValid =
    trimmedPhone.length > 0 &&
    /^\+?[0-9][0-9\s\-()]{6,}$/.test(trimmedPhone);
  const canPublish =
    category !== null &&
    subtype !== null &&
    phoneLooksValid;

  const publish = async () => {
    if (!canPublish || submitting || !category || !subtype) return;
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

      // Step 3: the publish RPC. Runs BEFORE the student_profiles
      // upsert so that if the RPC fails, we never leave the user in the
      // "approved on the talent board but no community_posts row" state
      // that renders a listing with no edit UI (the original bug report:
      // "his listing got published but he can't edit it"). If the RPC
      // fails here, student_profiles is untouched — retry is a clean
      // re-run. The RPC itself is DELETE + INSERT so re-publishing on
      // top of a prior community_posts row is safe.
      //
      // Title is the chosen subtype directly — matches HirePage's brief
      // vocabulary verbatim so the AI Find matcher gets a clean
      // token-overlap score. Description empty + rates 0 are "ask for a
      // quote" defaults; the user polishes from /profile later.
      const { data: postId, error: rpcErr } = await supabase.rpc(
        'publish_community_listing' as never,
        {
          _category: category,
          _title: subtype,
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

      // Step 4: write the student_profiles row with the THREE flags
      // BrowseStudents.tsx and StudentsByCategory.tsx both require to
      // show a freelancer on the talent board:
      //   .eq('is_available', true)
      //   .eq('community_board_status', 'approved')
      //   .not('skills', 'eq', '{}')
      //
      // Without this, the RPC above created a community_posts row but
      // the freelancer is invisible on /students and the category pages
      // — which the founder reported as "they should be on the talent
      // board". Skills aren't asked in QuickStart, so we seed one
      // category-derived default; the user can refine from /profile.
      // Capture .error explicitly so an RLS / NOT NULL failure surfaces
      // in the toast description instead of a generic failure.
      const defaultSkill = DEFAULT_SKILL_BY_CATEGORY[category];
      const upsertPayload: {
        user_id: string;
        phone?: string;
        community_board_status: string;
        is_available: boolean;
        skills: string[];
      } = {
        user_id: userId,
        community_board_status: 'approved',
        is_available: true,
        skills: [defaultSkill],
      };
      if (trimmedPhone) upsertPayload.phone = trimmedPhone;
      const { error: spErr } = await supabase
        .from('student_profiles')
        .upsert(upsertPayload as never, { onConflict: 'user_id' });
      if (spErr) {
        throw new Error(`Couldn't save your details — ${spErr.message}`);
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
              Just the basics — three quick fields to go live. Bio, rates, portfolio and more unlock from your profile after publishing.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {/* Category */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What do you do? <span className="text-destructive" aria-label="required">*</span>
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
                    // Reset subtype when category changes — a "Reel /
                    // short-form" pick under Video isn't valid under
                    // Websites and would orphan if we kept it around.
                    if (firstPick) {
                      setSubtype(null);
                      microCelebrate();
                    }
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
        </div>

        {/* Subtype — appears the moment a category is picked. Mirrors
             HirePage Step 1 chip pattern so the freelancer's work and
             a hirer's brief use the exact same vocabulary; the AI Find
             matcher gets a clean token-overlap score. Single-select to
             keep the flow short — they can polish nuance from /profile
             later. Required (red asterisk) like the other two fields. */}
        {category && (
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              What kind of {COMMUNITY_CATEGORIES[category].label.toLowerCase()}? <span className="text-destructive" aria-label="required">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {SUBTYPES_BY_CATEGORY[category].map((option) => {
                const active = subtype === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSubtype(active ? null : option)}
                    className={[
                      'rounded-full border px-3.5 py-2 text-sm font-semibold transition cursor-pointer select-none active:scale-[0.97]',
                      active
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5',
                    ].join(' ')}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Phone */}
        <div>
          <label htmlFor="qs-phone" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Phone number <span className="text-destructive" aria-label="required">*</span>
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
            We'll text you the second a business wants to hire you. Never shown publicly — only used to send you hire notifications.
          </p>
        </div>

        {/* Preview — appears once category + subtype + phone are filled
             so the freelancer sees EXACTLY what businesses will see on
             the talent board before they commit. Without this, a cold
             first-timer hits Publish without knowing what the output
             looks like ("did I just post something ugly?"), which is
             the single biggest source of "I want to delete my listing"
             support pings. Subtle styling so it doesn't dominate the
             form. */}
        {canPublish && category && subtype && (() => {
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
                      {subtype}
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
