import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles, Phone, MessageCircle, Search, Compass, Trophy, Check, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { loadHireBrief } from '@/lib/hireFlow';

// Stripe Payment Link return handler.
//
// The goal here is simple: the user paid €1, so no matter what else
// happened (webhook didn't fire, session didn't survive the Stripe
// round-trip, localStorage got wiped, user came back in a new browser),
// show them a freelancer. Three routing paths, in order of preference:
//
//   1. localStorage hand-off — /hire wrote the row id before the Stripe
//      redirect, same origin same browser, almost always present.
//      Route to /ai-find/:id, full self-heal flow kicks in.
//
//   2. Signed-in fallback — if the user is signed in (poll getSession
//      for 5s), look up their most recent ai_find_requests row and
//      route to it. Doesn't depend on the Stripe webhook.
//
//   3. Public match fallback — if paths 1 and 2 both fail (genuinely
//      signed-out browser context), render a freelancer card DIRECTLY
//      on this page using publicly-readable community_posts +
//      student_profiles data. No auth required, no database writes,
//      no row lookup. The user sees a freelancer's name, phone, and
//      message-on-Vano CTA — exactly what they paid €1 for. We don't
//      persist which freelancer they got in this case, but the €1
//      still translates to a shown match.

const AUTH_WAIT_MS = 5_000;
const AUTH_POLL_INTERVAL_MS = 300;
// Hold the staged progress bar on screen for this long before revealing
// the inline public-match card, so the €1 moment feels intentional
// instead of a jump-cut.
const REVEAL_DELAY_MS = 5_000;

type Resolved = { userId: string } | null;

type PublicPick = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  skills: string[];
  hourly_rate: number | null;
  phone: string | null;
  reason: string;
};

async function readSession(): Promise<Resolved> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ? { userId: session.user.id } : null;
}

// Ignored-everywhere stopwords so skill-tag scoring doesn't get
// swamped by "need", "want", "the", etc.
const STOPWORDS = new Set([
  'the','a','an','and','or','for','to','of','in','on','at','with','from','by','i','my','me','we','our','us',
  'you','your','it','is','are','be','need','want','looking','someone','help','please','can','could',
  'about','that','this','these','those','some','any','will','would','should','have','has','had','do','does','did',
  'just','really','very','also','more','than','then','so','such','as','if','but','because','here','there',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s+/-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  );
}

// Pull approved freelancers + their student profiles straight from
// Supabase via RLS SELECT policies (both tables allow anon for
// approved rows), score by skill overlap with the hirer's brief,
// pick the top scorer. Mirrors the matcher logic in AiFindResults
// but runs with no auth and no writes.
async function pickPublicMatch(brief: string | null, category: string | null): Promise<PublicPick | null> {
  const briefTokens = tokenize(brief ?? '');

  // Can't count on a Supabase FK between community_posts and
  // student_profiles being detected for embedded selects here, so
  // fetch in two steps and join in memory. Both tables allow anon
  // SELECT for approved rows.
  const fetchPosts = async (cat: string | null) => {
    let q = supabase
      .from('community_posts')
      .select('user_id, title, category')
      .eq('moderation_status', 'approved')
      .limit(50);
    if (cat) q = q.eq('category', cat);
    const { data, error } = await q;
    if (error) {
      console.warn('[ai-find-return] community_posts query failed', error.message);
      return null;
    }
    return (data ?? []) as Array<{ user_id: string; title: string | null; category: string | null }>;
  };

  let posts = category ? await fetchPosts(category) : null;
  if (!posts || posts.length === 0) posts = await fetchPosts(null);
  if (!posts || posts.length === 0) return null;

  const userIds = Array.from(new Set(posts.map((p) => p.user_id).filter(Boolean)));
  if (userIds.length === 0) return null;

  const [{ data: students }, { data: profs }] = await Promise.all([
    supabase
      .from('student_profiles')
      .select('user_id, bio, skills, hourly_rate, phone, community_board_status')
      .in('user_id', userIds)
      .eq('community_board_status', 'approved'),
    supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', userIds),
  ]);

  const studentMap = new Map<string, { bio: string | null; skills: string[] | null; hourly_rate: number | null; phone: string | null }>();
  for (const s of (students ?? []) as Array<Record<string, unknown>>) {
    studentMap.set(s.user_id as string, {
      bio: (s.bio as string | null) ?? null,
      skills: (s.skills as string[] | null) ?? null,
      hourly_rate: (s.hourly_rate as number | null) ?? null,
      phone: (s.phone as string | null) ?? null,
    });
  }
  const profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
  for (const p of (profs ?? []) as Array<Record<string, unknown>>) {
    profileMap.set(p.user_id as string, {
      display_name: (p.display_name as string | null) ?? null,
      avatar_url: (p.avatar_url as string | null) ?? null,
    });
  }

  // Score by skill-tag + title-word overlap, random tiebreak.
  const scored = posts
    .filter((p) => studentMap.has(p.user_id))
    .map((post) => {
      const sp = studentMap.get(post.user_id)!;
      let score = 0;
      const matchedTags: string[] = [];
      for (const skill of sp.skills ?? []) {
        const skillTokens = tokenize(skill);
        for (const t of skillTokens) {
          if (briefTokens.has(t)) {
            score += 1;
            matchedTags.push(skill);
            break;
          }
        }
      }
      for (const t of tokenize(post.title ?? '')) {
        if (briefTokens.has(t)) score += 0.5;
      }
      return { post, sp, score, matchedTags, jitter: Math.random() };
    });
  if (scored.length === 0) return null;

  scored.sort((a, b) => (b.score - a.score) || (a.jitter - b.jitter));
  const w = scored[0];
  const prof = profileMap.get(w.post.user_id);

  const buildReason = (): string => {
    if (w.score > 0 && w.matchedTags.length > 0) {
      const tagList = w.matchedTags.slice(0, 3).join(', ');
      return `Matched on ${tagList} — fits your brief.`;
    }
    if (category) return `Top freelancer in our ${category.replace(/_/g, ' ')} pool — close fit for your brief.`;
    return 'Top freelancer from our pool — close fit for your brief.';
  };

  return {
    user_id: w.post.user_id,
    display_name: prof?.display_name?.trim() || 'Your Vano match',
    avatar_url: prof?.avatar_url ?? null,
    bio: w.sp.bio,
    skills: w.sp.skills ?? [],
    hourly_rate: w.sp.hourly_rate,
    phone: w.sp.phone,
    reason: buildReason(),
  };
}

export default function AiFindReturn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [publicPick, setPublicPick] = useState<PublicPick | null>(null);
  const [publicPickFetching, setPublicPickFetching] = useState(false);
  const [noMatchesFound, setNoMatchesFound] = useState(false);
  const [revealReady, setRevealReady] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [showMatchReveal, setShowMatchReveal] = useState(false);
  const mountedAtRef = useRef<number>(Date.now());
  const celebratedRef = useRef(false);

  // Reveal curtain — lift after REVEAL_DELAY_MS so the progress bar
  // always plays out in full even if the DB match arrives instantly.
  useEffect(() => {
    const t = setTimeout(() => setRevealReady(true), REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Elapsed ticker drives both the stage swap and the progress bar.
  // 250ms resolution is enough: the bar has a CSS ease-out transition
  // that smooths the gaps, and the "Xs" counter only shows whole seconds.
  useEffect(() => {
    const tick = setInterval(() => {
      setElapsedSec((Date.now() - mountedAtRef.current) / 1000);
    }, 250);
    return () => clearInterval(tick);
  }, []);

  // Confetti + "match is ready" badge, fires once when both the pick
  // and the curtain are ready. Mirrors the reveal on AiFindResults so
  // Path 3 (signed-out public pick) feels the same as the signed-in flow.
  useEffect(() => {
    if (celebratedRef.current) return;
    if (!publicPick) return;
    if (!revealReady) return;
    celebratedRef.current = true;
    setShowMatchReveal(true);
    const reducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;
    void (async () => {
      try {
        const confetti = (await import('canvas-confetti')).default;
        const end = Date.now() + 500;
        const burst = () => {
          confetti({ particleCount: 18, spread: 55, startVelocity: 35, angle: 60,
            origin: { x: 0.08, y: 0.35 }, colors: ['#10b981', '#fcd34d', '#ffffff'] });
          confetti({ particleCount: 18, spread: 55, startVelocity: 35, angle: 120,
            origin: { x: 0.92, y: 0.35 }, colors: ['#10b981', '#fcd34d', '#ffffff'] });
          if (Date.now() < end) window.setTimeout(burst, 140);
        };
        burst();
      } catch { /* confetti is a nicety */ }
    })();
  }, [publicPick, revealReady]);

  useEffect(() => {
    let cancelled = false;

    const go = (id: string) => {
      try { localStorage.removeItem('vano_ai_find_pending_id'); } catch { /* ignore */ }
      const sessionId = params.get('session_id');
      if (sessionId) {
        try { sessionStorage.setItem(`vano_ai_find_paid_${id}`, sessionId); } catch { /* ignore */ }
      }
      navigate(`/ai-find/${id}`, { replace: true });
    };

    // Path 1 — localStorage hand-off, the happy path.
    try {
      const stored = localStorage.getItem('vano_ai_find_pending_id');
      if (stored) {
        go(stored);
        return;
      }
    } catch { /* private mode — fall through */ }

    // Path 2 — poll for session, then look up latest row.
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const start = Date.now();

    const routeFromUserId = async (userId: string) => {
      const { data } = await supabase
        .from('ai_find_requests')
        .select('id')
        .eq('requester_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data?.id) {
        go(data.id);
        return;
      }
      // Signed-in user with no row at all — shouldn't happen after
      // paying, but fall through to public match so they still see
      // something.
      void loadPublicMatch();
    };

    const loadPublicMatch = async () => {
      if (cancelled || publicPickFetching) return;
      setPublicPickFetching(true);
      const brief = loadHireBrief();
      const pick = await pickPublicMatch(
        brief?.description ?? null,
        brief?.category ?? null,
      );
      if (cancelled) return;
      if (pick) setPublicPick(pick);
      else setNoMatchesFound(true);
      setPublicPickFetching(false);
    };

    const tick = async () => {
      if (cancelled) return;
      const resolved = await readSession();
      if (cancelled) return;
      if (resolved) {
        void routeFromUserId(resolved.userId);
        return;
      }
      if (Date.now() - start > AUTH_WAIT_MS) {
        // Path 3 — signed-out, render freelancer card inline from
        // public tables.
        void loadPublicMatch();
        return;
      }
      pollTimer = setTimeout(tick, AUTH_POLL_INTERVAL_MS);
    };
    void tick();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user?.id) return;
      if (cancelled) return;
      void routeFromUserId(session.user.id);
    });

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, params]);

  if (publicPick && revealReady) {
    const phoneDigits = publicPick.phone ? publicPick.phone.replace(/[^+\d]/g, '') : null;
    return (
      <div className="min-h-[100dvh] bg-background px-4 py-10 sm:py-14">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <Sparkles className="h-3.5 w-3.5" /> AI Find
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your perfect freelancer</h1>
          </div>

          {showMatchReveal && (
            <div
              className="mx-auto mb-4 flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-[12px] font-semibold text-emerald-700 shadow-[0_8px_24px_-10px_rgba(16,185,129,0.35)] animate-in fade-in slide-in-from-top-2 duration-500 dark:text-emerald-300"
              onAnimationEnd={() => {
                window.setTimeout(() => setShowMatchReveal(false), 3800);
              }}
            >
              <CheckCircle2 size={13} strokeWidth={3} />
              Your match is ready
            </div>
          )}

          <div className="overflow-hidden rounded-[20px] border border-primary/30 bg-card shadow-[0_18px_44px_-22px_hsl(var(--primary)/0.45)]">
            <div className="relative overflow-hidden bg-gradient-to-b from-primary to-primary/90 px-5 py-4 text-primary-foreground">
              <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-amber-300/15 blur-3xl" />
              <div className="relative flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
                  <Sparkles className="h-3 w-3 text-amber-200" /> Your perfect match
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-100/90">
                  Vetted · on platform
                </span>
              </div>
            </div>

            <div className="space-y-4 bg-card p-5">
              <div className="flex items-start gap-3">
                {publicPick.avatar_url ? (
                  <img src={publicPick.avatar_url} alt={publicPick.display_name} className="h-14 w-14 flex-shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-muted text-base font-semibold text-muted-foreground">
                    {publicPick.display_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-foreground">{publicPick.display_name}</p>
                  {publicPick.hourly_rate ? (
                    <p className="text-xs text-muted-foreground">From €{publicPick.hourly_rate}/hr</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-amber-300/40 bg-amber-50/50 px-3.5 py-2.5 dark:border-amber-800/30 dark:bg-amber-900/10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
                  Why Vano picked them
                </p>
                <p className="mt-1 text-sm italic text-foreground leading-relaxed">
                  "{publicPick.reason}"
                </p>
              </div>

              {publicPick.bio ? (
                <p className="text-sm text-foreground leading-relaxed line-clamp-4">{publicPick.bio}</p>
              ) : null}

              {publicPick.skills.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {publicPick.skills.slice(0, 8).map((s) => (
                    <span key={s} className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-foreground">
                      {s}
                    </span>
                  ))}
                </div>
              ) : null}

              {phoneDigits ? (
                <div className="space-y-2">
                  <a
                    href={`tel:${phoneDigits}`}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:brightness-110 active:scale-[0.98]"
                  >
                    <Phone className="h-4 w-4" /> Call {publicPick.phone}
                  </a>
                  <a
                    href={`sms:${phoneDigits}`}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10 active:scale-[0.98]"
                  >
                    <MessageCircle className="h-4 w-4" /> Text {publicPick.phone}
                  </a>
                  <button
                    type="button"
                    onClick={() => navigate(`/messages?with=${publicPick.user_id}`)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    Or message them on Vano
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(`/messages?with=${publicPick.user_id}`)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:brightness-110 active:scale-[0.98]"
                >
                  <MessageCircle className="h-4 w-4" /> Text on Vano
                </button>
              )}

              <p className="text-center text-[11px] text-muted-foreground">
                Agree the work and rate, then pay safely on Vano.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/hire')}
            className="mt-4 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            Start another search
          </button>
        </div>
      </div>
    );
  }

  if (noMatchesFound && revealReady) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">We couldn't find a freelancer right now</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Our pool is running low. Your €1 will be refunded within 24 hours.
          </p>
          <button
            type="button"
            onClick={() => navigate('/hire')}
            className="mt-5 w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110 active:scale-[0.98]"
          >
            Back to /hire
          </button>
        </div>
      </div>
    );
  }

  // Quiet the lint while we silently consume the fetch flag — it's only
  // used inside the effect above to prevent a double-fire.
  void publicPickFetching;

  return <AiFindProgressStages elapsedSec={elapsedSec} />;
}

// Three-stage progress bar with an ease-out curve: bar sprints through
// the first two stages, then crawls on "Picking your perfect match" so
// the last beat before the reveal feels like real work. Visual language
// matches AiFindResults so the two post-payment paths feel identical.
function AiFindProgressStages({ elapsedSec }: { elapsedSec: number }) {
  const TOTAL_SEC = 5;
  const stages = [
    { id: 'scan', label: 'Reading your brief',           icon: Search,  endAt: 1.5 },
    { id: 'pool', label: 'Scanning our freelancer pool', icon: Compass, endAt: 3 },
    { id: 'rank', label: 'Picking your perfect match',   icon: Trophy,  endAt: 5 },
  ] as const;
  const activeIdx = stages.findIndex((s) => elapsedSec < s.endAt);
  const pastAll = activeIdx === -1;

  const t = Math.min(1, elapsedSec / TOTAL_SEC);
  const eased = 1 - Math.pow(1 - t, 2);
  const percent = pastAll ? 96 : Math.max(4, Math.min(96, eased * 100));
  const wholeSec = Math.floor(elapsedSec);

  return (
    <div className="min-h-[100dvh] bg-background px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
            <Sparkles className="h-3.5 w-3.5" /> AI Find
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your perfect freelancer</h1>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Finding your perfect freelancer
              </p>
              <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">
                {pastAll ? 'Almost there — polishing your pick' : stages[activeIdx].label + '…'}
              </h2>
            </div>
            <span
              className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {wholeSec}s
            </span>
          </div>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>

          <ul className="mt-5 space-y-3">
            {stages.map((s, i) => {
              const Icon = s.icon;
              const isDone = pastAll || i < activeIdx;
              const isActive = !pastAll && i === activeIdx;
              return (
                <li key={s.id} className="flex items-center gap-3">
                  <span
                    className={
                      isDone
                        ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : isActive
                        ? 'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary'
                        : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground/50'
                    }
                  >
                    {isDone ? (
                      <Check size={14} strokeWidth={3} />
                    ) : (
                      <>
                        <Icon size={13} strokeWidth={2.25} />
                        {isActive && (
                          <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                        )}
                      </>
                    )}
                  </span>
                  <p
                    className={
                      isActive
                        ? 'text-sm font-semibold text-foreground'
                        : isDone
                        ? 'text-sm font-medium text-foreground/70'
                        : 'text-sm font-medium text-muted-foreground/60'
                    }
                  >
                    {s.label}
                  </p>
                </li>
              );
            })}
          </ul>

          <p className="mt-5 border-t border-border/60 pt-3 text-center text-[11px] text-muted-foreground">
            Hand-picked from our freelancer pool. €1 refunded if we can't find one.
          </p>
        </div>
      </div>
    </div>
  );
}
