import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Navbar } from '@/components/Navbar';
import { SEOHead } from '@/components/SEOHead';
import { ListOnCommunityWizard, type ListOnCommunityInitial } from '@/components/ListOnCommunityWizard';
import { normalizeFreelancerSkills } from '@/lib/freelancerSkills';
import { resolveUniversityKey } from '@/lib/universities';
import { parseWorkLinksJson } from '@/lib/socialLinks';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';

/**
 * Dedicated full-screen onboarding page for the community listing wizard.
 *
 * Previously, the wizard only lived as a buried modal inside /profile.
 * Result: new freelancers finished sign-up, never opened the wizard, and
 * stayed invisible to hiring businesses. Now the post-auth router sends any
 * freelancer without a published listing straight here, where the wizard
 * opens on mount.
 *
 * Escape hatch: users can dismiss the wizard and hit "Skip for now" — they
 * land on /profile and see a persistent nudge banner until they publish.
 * So skipping is annoying, publishing is effortless.
 *
 * This page is NOT routed to for anyone who already has a published or
 * pending community_posts row — those users go to /profile as before. See
 * `resolvePostGoogleAuthDestination` in authSession.ts for the routing rule.
 */
export default function ListOnCommunity() {
  const navigate = useNavigate();

  const [userId, setUserId] = useState<string | null>(null);
  const [initial, setInitial] = useState<ListOnCommunityInitial | null>(null);
  const [wizardOpen, setWizardOpen] = useState(true);
  const [loadError, setLoadError] = useState(false);

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
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  const handlePublished = () => {
    // Route to Profile. A query flag lets the Profile page show a brief
    // "your listing is live" toast if we want to wire that up later.
    navigate('/profile?listed=1', { replace: true });
  };

  const skip = () => navigate('/profile', { replace: true });

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
            <p className="max-w-sm text-xs text-muted-foreground">Try reloading, or skip for now and set up later.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-1 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={skip}
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Skip for now
            </button>
          </div>
        ) : !userId || !initial ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Loader2 size={20} className="animate-spin" />
            <p className="text-xs">Loading your details…</p>
          </div>
        ) : (
          <>
            {/* Hero card — shown behind / below the wizard modal.
                This is what the user sees if they close the wizard without
                publishing. Re-open the wizard or skip. */}
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-card p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Sparkles size={18} strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                    One more step
                  </p>
                  <h1 className="mt-1 text-xl font-bold text-foreground">
                    Show businesses what you do
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Publish your talent board listing so businesses in Galway can find and hire you.
                    Takes about 2 minutes — we auto-save as you go, so you can always come back.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setWizardOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
                    >
                      {initial.skills.length > 0 ? 'Continue setup' : 'Open the wizard'}
                      <ArrowRight size={14} strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      onClick={skip}
                      className="text-[12px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                    >
                      Skip for now
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Three-point value pitch under the hero so the page isn't a
                blank void when the wizard is closed. Pure content. */}
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
              onSubmittedForReview={handlePublished}
            />
          </>
        )}
      </div>
    </div>
  );
}
