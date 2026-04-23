import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Navbar } from '@/components/Navbar';
import { SEOHead } from '@/components/SEOHead';
import { ListOnCommunityWizard, type ListOnCommunityInitial } from '@/components/ListOnCommunityWizard';
import { ListOnCommunityQuickStart } from '@/components/ListOnCommunityQuickStart';
import { normalizeFreelancerSkills } from '@/lib/freelancerSkills';
import { resolveUniversityKey } from '@/lib/universities';
import { parseWorkLinksJson } from '@/lib/socialLinks';
import { useAuth } from '@/hooks/useAuthContext';
import { Sparkles, ArrowRight, Loader2, Check, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cardElevated } from '@/lib/cardStyles';

/**
 * Dedicated full-screen onboarding page for the community listing wizard.
 *
 * Previously, the wizard only lived as a buried modal inside /profile.
 * Result: new freelancers finished sign-up, never opened the wizard, and
 * stayed invisible to hiring businesses. Now the post-auth router sends any
 * freelancer without a published listing straight here, where the wizard
 * opens on mount.
 *
 * This page is NOT routed to for anyone who already has a published or
 * pending community_posts row — those users go to /profile as before. See
 * `resolvePostGoogleAuthDestination` in authSession.ts for the routing rule.
 *
 * No "Skip for now" button: the guard in RedirectUnlistedFreelancerToWizard
 * would bounce the user right back, so the skip was always a UX lie.
 * Publishing is the only way forward; load-error retry is the only escape.
 */
export default function ListOnCommunity() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [searchParams] = useSearchParams();

  const [userId, setUserId] = useState<string | null>(null);
  const [initial, setInitial] = useState<ListOnCommunityInitial | null>(null);
  // Default the modal wizard to closed now that the Quick-start flow is
  // the primary path. The wizard still opens (a) from the Quick-start's
  // "customise everything" link and (b) for users who already have
  // partial data to preserve the old editing flow.
  const [wizardOpen, setWizardOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Scouted-freelancer flag: the claim flow redirects here with
  // ?claimed=1 so we know to surface the brief they were matched
  // against. Without this signal the page reads as a generic "list
  // yourself" flow and the scouted user loses the thread of why
  // they're here.
  const justClaimed = searchParams.get('claimed') === '1';
  const [scoutBrief, setScoutBrief] = useState<string | null>(null);
  // Gate for "show the 30-second Quick-start vs. drop into the full
  // wizard." Skills is the one signal that reliably means "this user
  // has committed enough that a Quick-start would feel like a
  // demotion" — phone auto-fills from Google sign-in, bio can be empty
  // by design, and work-link entry has been retired. Using skills
  // alone keeps freelancers who bounced mid-sign-up (phone only, no
  // picks made) on the fast path instead of dumping them back into a
  // 4-step wizard that'll just make them bounce again.
  const isFirstTimer = useMemo(() => {
    if (!initial) return true;
    return initial.skills.length === 0;
  }, [initial]);

  // Progress breakdown for the returning-user card. Six buckets so the
  // count reads as attainable — every completed one becomes a tick chip
  // and the bar fills by fraction. Rates groups hourly + typical project
  // because either alone signals "I've thought about pricing."
  const progress = useMemo(() => {
    if (!initial) return { done: 0, total: 6, sections: [] as Array<{ label: string; done: boolean }> };
    const sections = [
      { label: 'Bio', done: initial.bio.trim().length > 0 },
      { label: 'Skills', done: initial.skills.length > 0 },
      { label: 'Rates', done: !!initial.hourlyRate.trim() || !!initial.typicalBudgetMin.trim() || !!initial.typicalBudgetMax.trim() },
      { label: 'Contact', done: initial.phone.trim().length > 0 },
      { label: 'Work links', done: initial.workLinks.some((w) => !!w.url?.trim()) || !!initial.websiteUrl.trim() || !!initial.tiktokUrl.trim() || !!initial.instagramUrl.trim() || !!initial.linkedinUrl.trim() },
      { label: 'Location', done: !!initial.serviceArea.trim() || !!initial.university.trim() },
    ];
    return {
      done: sections.filter((s) => s.done).length,
      total: sections.length,
      sections,
    };
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate('/auth', { replace: true });
        return;
      }
      // Businesses have no business (ha) being here — route them out.
      const { data: prof } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (prof?.user_type === 'business') {
        navigate('/business-dashboard', { replace: true });
        return;
      }

      // Load the student_profile row to pre-fill the wizard. A user arriving
      // here for the first time may have zero data, in which case the wizard
      // starts from blanks — it's designed to handle that.
      const { data: sp, error: spErr } = await supabase
        .from('student_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (spErr) {
        if (!cancelled) { setLoadError(true); }
        return;
      }

      if (cancelled) return;

      const sanitisedInitial: ListOnCommunityInitial = {
        bannerUrl: (sp as any)?.banner_url || '',
        tiktokUrl: sp?.tiktok_url || '',
        instagramUrl: (sp as any)?.instagram_url || '',
        linkedinUrl: (sp as any)?.linkedin_url || '',
        websiteUrl: (sp as any)?.website_url || '',
        workLinks: (() => {
          const parsed = parseWorkLinksJson(sp?.work_links);
          return parsed.length > 0
            ? parsed.map((p) => ({ url: p.url, label: p.label }))
            : [{ url: '', label: '' }];
        })(),
        skills: normalizeFreelancerSkills(sp?.skills),
        // Category-specific specialty + click-based tag arrays —
        // migration 20260421120000 added these columns. Cast to `any`
        // because the Supabase type-gen hasn't re-run yet; anything
        // that isn't the expected shape defaults to empty so the
        // wizard starts clean.
        specialty:
          typeof (sp as any)?.specialty === 'string' ? (sp as any).specialty : '',
        clientTypes: Array.isArray((sp as any)?.client_types)
          ? ((sp as any).client_types as unknown[]).filter(
              (s): s is string => typeof s === 'string',
            )
          : [],
        strengths: Array.isArray((sp as any)?.strengths)
          ? ((sp as any).strengths as unknown[]).filter(
              (s): s is string => typeof s === 'string',
            )
          : [],
        serviceArea: (sp as any)?.service_area || '',
        typicalBudgetMin:
          (sp as any)?.typical_budget_min != null && (sp as any).typical_budget_min > 0
            ? String((sp as any).typical_budget_min)
            : '',
        typicalBudgetMax:
          (sp as any)?.typical_budget_max != null && (sp as any).typical_budget_max > 0
            ? String((sp as any).typical_budget_max)
            : '',
        hourlyRate: sp?.hourly_rate ? String(sp.hourly_rate) : '',
        bio: sp?.bio || '',
        university: resolveUniversityKey((sp as any)?.university) || '',
        phone: sp?.phone || '',
        expectedBonusAmount:
          (sp as any)?.expected_bonus_amount != null && (sp as any).expected_bonus_amount > 0
            ? String((sp as any).expected_bonus_amount)
            : '',
        expectedBonusUnit:
          (sp as any)?.expected_bonus_unit === 'flat' ? 'flat' : 'percentage',
      };

      setUserId(session.user.id);
      setInitial(sanitisedInitial);

      // Fetch the scouted-freelancer row if this user arrived via the
      // claim flow (?claimed=1). We show their brief snapshot so the
      // connection between "a client wanted to hire you" and "finish
      // your listing" stays visible. A silent-failure is fine — the
      // page still works as the generic listing flow.
      if (justClaimed) {
        // Select the most-recently-claimed scout row for this user.
        // The supabase type-builder for scouted_freelancers hits TS's
        // instantiation-depth limit on this chain; the `as never` cast on
        // the filter short-circuits the inference so the call stays
        // strongly-typed on the response side.
        type ScoutBriefRow = { brief_snapshot: string | null; claimed_at: string | null };
        const { data: scoutRows } = await supabase
          .from('scouted_freelancers')
          .select('brief_snapshot, claimed_at')
          .eq('claimed_user_id' as never, session.user.id as never) as { data: ScoutBriefRow[] | null };
        if (!cancelled && scoutRows && scoutRows.length > 0) {
          const latest = [...scoutRows]
            .sort((a, b) => (b.claimed_at ?? '').localeCompare(a.claimed_at ?? ''))[0];
          if (latest?.brief_snapshot) setScoutBrief(latest.brief_snapshot);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [navigate, justClaimed]);

  // Accepts either no args (legacy full-wizard onSubmittedForReview call)
  // or a payload from the Quick-start path with the new post id. The
  // Profile page reads the ?listed=1 flag; we also pass ?welcome=1 on the
  // Quick-start path so the celebratory "you're live" moment (confetti +
  // share-link copy) renders there on landing.
  //
  // refreshProfile() used to be awaited here — it re-fetches profiles +
  // community_posts to update the AuthContext's `hasListing` cache. That
  // await was blocking the navigate, so a hung Supabase round-trip left
  // the user staring at a "Publishing…" button until the request timed
  // out. The cache update isn't load-bearing for the next page (Profile
  // does its own fetch); fire it async so the navigate happens
  // immediately and the user gets the "you're live" celebration without
  // delay.
  const handlePublished = (_payload?: { postId?: string; category?: string }) => {
    void refreshProfile();
    const quickFlag = _payload ? '&welcome=1' : '';
    navigate(`/profile?listed=1${quickFlag}`, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <SEOHead
        title="List yourself on VANO — Publish your talent profile"
        description="Publish your VANO listing so businesses in Galway can find and hire you. Takes 2 minutes."
      />
      <Navbar />

      <div className="mx-auto max-w-xl px-4 pt-20 sm:pt-24 md:px-8">
        {loadError ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">Couldn&apos;t load your profile</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Reload usually fixes it. If it keeps happening, sign out and back in, or email us — we&apos;ll sort it in minutes.
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
              >
                Reload
              </button>
              <button
                type="button"
                onClick={async () => { await supabase.auth.signOut(); navigate('/auth', { replace: true }); }}
                className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
              >
                Sign out and retry
              </button>
              <a
                href="mailto:vano1app@gmail.com?subject=Can%27t%20load%20my%20freelancer%20profile"
                className="rounded-xl px-3 py-2 text-[11.5px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Get help
              </a>
            </div>
          </div>
        ) : !userId || !initial ? (
          // Warmer loading state — the previous "Loading your details…"
          // read like a neutral spinner, leaving a freshly-signed-up
          // freelancer wondering whether the page was broken. Now the
          // copy names the moment ("setting up your freelancer profile")
          // so the two seconds of network wait feel like setup, not
          // latency.
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Loader2 size={18} className="animate-spin" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Setting up your freelancer profile</p>
              <p className="text-xs text-muted-foreground">One moment — loading your workspace.</p>
            </div>
          </div>
        ) : isFirstTimer ? (
          <>
            {/* Scouted-freelancer context banner. Only renders if the
                page was reached via the claim flow AND we have the
                original brief the user was matched to. Without this,
                the page reads as a generic "list yourself" form and
                the scouted user loses the thread between "a client
                wanted to hire me" and what they're doing right now. */}
            {justClaimed && scoutBrief && (
              <div className="mb-4 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
                <div className="flex items-start gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Target size={16} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                      Match pending
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-foreground">
                      Finish your listing below so the client can reach you. Here&apos;s what they asked for:
                    </p>
                    <p className="mt-2 line-clamp-3 rounded-lg border border-border bg-card/80 px-3 py-2 text-[12.5px] leading-relaxed text-muted-foreground">
                      &ldquo;{scoutBrief}&rdquo;
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* First-time Quick-start. No multi-step wizard, no side
                preview, no social fields. Category chip + pitch +
                phone → live. The old "set up the full listing now"
                escape to the wizard was removed — polish happens from
                /profile after going live, to keep first-time
                abandonment off the 4-step form. */}
            <ListOnCommunityQuickStart
              userId={userId}
              onPublished={handlePublished}
            />

            {/* Three-point value pitch sits below so the page still has
                reassurance copy while the user is thinking. */}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { title: 'Get hired directly', body: 'Businesses message you without any commission.' },
                { title: 'Show your work', body: 'Link your TikTok, Instagram, past clients — whatever proves it.' },
                { title: 'You set the rate', body: 'Hourly or per-project. Negotiable is fine too.' },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-border/60 bg-card p-4">
                  <p className="text-[13px] font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>

            <ListOnCommunityWizard
              open={wizardOpen}
              onOpenChange={setWizardOpen}
              userId={userId}
              initial={initial}
              onSubmittedForReview={(category) => { void handlePublished({ category }); }}
            />
          </>
        ) : (
          <>
            {/* Scouted-freelancer context banner (same as first-timer
                path). Returning users who arrived via the claim flow
                see the brief here too. */}
            {justClaimed && scoutBrief && (
              <div className="mb-4 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
                <div className="flex items-start gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Target size={16} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                      Match pending
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-foreground">
                      Finish your listing below so the client can reach you. Here&apos;s what they asked for:
                    </p>
                    <p className="mt-2 line-clamp-3 rounded-lg border border-border bg-card/80 px-3 py-2 text-[12.5px] leading-relaxed text-muted-foreground">
                      &ldquo;{scoutBrief}&rdquo;
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Returning user with partial data — skip the Quick-start
                and take them straight back into the full wizard so
                their in-progress fields aren't thrown away. The
                progress bar + completed-section chips make "we saved
                your progress" concrete: the user sees exactly what
                they won't need to redo. */}
            <div className={cn(cardElevated, 'p-6')}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Sparkles size={18} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                    Pick up where you left off
                  </p>
                  <h1 className="mt-1 text-xl font-bold text-foreground">
                    Continue your listing
                  </h1>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    Your progress is saved. Finish the remaining sections to go live.
                  </p>

                  {/* Progress bar + completed-section chips */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-baseline justify-between text-[11.5px]">
                      <span className="font-semibold text-foreground">
                        {progress.done} of {progress.total} sections complete
                      </span>
                      <span className="text-muted-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round((progress.done / progress.total) * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                        style={{ width: `${(progress.done / progress.total) * 100}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {progress.sections.map((s) => (
                        <span
                          key={s.label}
                          className={
                            s.done
                              ? 'inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400'
                              : 'inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground'
                          }
                        >
                          {s.done && <Check size={10} strokeWidth={3} />}
                          {s.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setWizardOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
                    >
                      Continue setup
                      <ArrowRight size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <ListOnCommunityWizard
              open={wizardOpen}
              onOpenChange={setWizardOpen}
              userId={userId}
              initial={initial}
              onSubmittedForReview={(category) => { void handlePublished({ category }); }}
            />
          </>
        )}
      </div>
    </div>
  );
}
