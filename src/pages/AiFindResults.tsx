import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Search,
  Compass,
  Trophy,
  Check,
  Phone,
} from 'lucide-react';

import { useToast } from '@/hooks/use-toast';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuthContext';
import { SEOHead } from '@/components/SEOHead';

// Results page for the €1 AI Find flow.
//
// New simplified flow (post web-scout removal): client picks a single
// matching Vano freelancer from community_posts by category, with a
// 5-second "we're working on it" curtain so the moment lands. No web
// pick, no Gemini, no Serper. The webhook still flips status when it
// fires, but if it doesn't (Supabase gateway outage etc.), the page
// completes the match itself via the RLS policy added in
// 20260422130000_ai_find_client_complete.sql.

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_SECONDS = 90;
// Minimum dwell on the "matching you" stages before revealing the
// pick. Even when the row is already complete on first load, the
// reveal feels too abrupt without a beat — five seconds is the sweet
// spot the founder asked for: long enough to feel intentional, short
// enough that nobody bounces.
const REVEAL_DELAY_MS = 5000;

type AiFindStatus = 'awaiting_payment' | 'paid' | 'scouting' | 'complete' | 'failed' | 'refunded';

type AiFindRow = {
  id: string;
  status: AiFindStatus;
  brief: string;
  category: string | null;
  vano_match_user_id: string | null;
  vano_match_reason: string | null;
  vano_match_score: number | null;
  error_message: string | null;
  vano_match_feedback: 'up' | 'down' | null;
  vano_retry_count: number;
  rejected_vano_user_ids: string[] | null;
};

type VanoPick = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  skills: string[] | null;
  hourly_rate: number | null;
  // Phone is the primary contact CTA when present — the founder
  // wanted hirers to be able to call/text the freelancer directly,
  // with on-platform messaging as the fallback.
  phone: string | null;
};

const AiFindResults = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { toast } = useToast();

  // Stripe's success_url on the new Checkout Session lands the user
  // here with ?session_id={CHECKOUT_SESSION_ID}. Stash it as the
  // trust token and strip the param so a refresh doesn't leave it in
  // the address bar forever. Without this the self-heal check inside
  // the poll effect can't prove the user paid when the webhook lags.
  useEffect(() => {
    if (!id) return;
    const sid = searchParams.get('session_id');
    if (!sid) return;
    try { sessionStorage.setItem(`vano_ai_find_paid_${id}`, sid); } catch { /* ignore */ }
    const next = new URLSearchParams(searchParams);
    next.delete('session_id');
    setSearchParams(next, { replace: true });
  }, [id, searchParams, setSearchParams]);

  const [row, setRow] = useState<AiFindRow | null>(null);
  const [vanoPick, setVanoPick] = useState<VanoPick | null>(null);
  const [vanoFetchDone, setVanoFetchDone] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pollingStartedAt, setPollingStartedAt] = useState(() => Date.now());
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [showMatchReveal, setShowMatchReveal] = useState(false);
  const celebratedRef = useRef(false);
  // Guard so the client-side match runner only fires once per page
  // load even though it sits inside a polling effect.
  const clientMatchRanRef = useRef(false);
  // Mounted-at timestamp drives the 5s reveal curtain. Even when the
  // row is already complete on first poll, we keep the loader on
  // screen until this elapses so the moment doesn't collapse.
  const mountedAtRef = useRef<number>(Date.now());
  const [revealReady, setRevealReady] = useState(false);

  const submitFeedback = async (verdict: 'up' | 'down') => {
    if (!row) return;
    setRow((prev) => prev && ({ ...prev, vano_match_feedback: verdict }));
    const { error } = await supabase.rpc('submit_ai_find_feedback' as never, {
      p_request_id: row.id, p_side: 'vano', p_verdict: verdict,
    } as never);
    if (error) {
      toast({ title: "Couldn't save feedback", description: 'Try again in a moment.', variant: 'destructive' });
      setRow((prev) => prev && ({ ...prev, vano_match_feedback: null }));
    }
  };

  // Re-roll: pick a different freelancer client-side, excluding the
  // current pick. Same logic as the initial match below, just with an
  // extra rejected_vano_user_ids list to avoid repeats.
  const retry = async () => {
    if (!row || retrying) return;
    if (row.vano_retry_count >= 1) {
      toast({
        title: 'No more retries on this brief',
        description: "You've already tried once — that's the cap. Start a new brief if you want a fresh search.",
        variant: 'destructive',
      });
      return;
    }
    setRetrying(true);
    try {
      const exclude = new Set<string>(row.rejected_vano_user_ids ?? []);
      if (row.vano_match_user_id) exclude.add(row.vano_match_user_id);
      const next = await pickVanoMatchClientSide(row.category, row.brief, Array.from(exclude));
      if (!next) {
        toast({
          title: "Couldn't find another match",
          description: "We don't have a different freelancer that fits this brief yet.",
          variant: 'destructive',
        });
        return;
      }
      const { data: refreshed, error } = await supabase
        .from('ai_find_requests')
        .update({
          vano_match_user_id: next.user_id,
          vano_match_reason: next.reason,
          vano_match_score: null,
          vano_match_feedback: null,
          vano_retry_count: row.vano_retry_count + 1,
          rejected_vano_user_ids: Array.from(exclude),
          status: 'complete',
          completed_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .select('id, status, brief, category, vano_match_user_id, vano_match_reason, vano_match_score, error_message, vano_match_feedback, vano_retry_count, rejected_vano_user_ids')
        .maybeSingle();
      if (error) throw error;
      if (refreshed) setRow(refreshed as unknown as AiFindRow);
    } catch (err) {
      console.error('[ai-find] retry failed', err);
      toast({ title: "Couldn't get a different match", description: 'Please try again.', variant: 'destructive' });
    } finally {
      setRetrying(false);
    }
  };

  const [elapsedSec, setElapsedSec] = useState(0);

  const isTerminal = useMemo(
    () => row?.status === 'complete' || row?.status === 'failed' || row?.status === 'refunded',
    [row?.status],
  );

  // Five-second reveal curtain — even if the row arrives complete on
  // the first poll, we keep the staged loader visible until this
  // elapses so the user feels the work being done.
  useEffect(() => {
    const remaining = REVEAL_DELAY_MS - (Date.now() - mountedAtRef.current);
    if (remaining <= 0) {
      setRevealReady(true);
      return;
    }
    const t = setTimeout(() => setRevealReady(true), remaining);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    const pollOnce = async () => {
      const { data, error } = await supabase
        .from('ai_find_requests')
        .select('id, status, brief, category, vano_match_user_id, vano_match_reason, vano_match_score, error_message, vano_match_feedback, vano_retry_count, rejected_vano_user_ids')
        .eq('id', id)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setLoadError('not_found');
        return;
      }
      setRow(data as unknown as AiFindRow);

      // Self-heal: if the row needs a match and we have evidence the
      // user paid, do the match ourselves. Evidence is either:
      //   (a) status is paid/scouting — only the webhook can set
      //       these, so payment is server-confirmed, OR
      //   (b) status is awaiting_payment but /ai-find-return dropped
      //       a sessionStorage trust token proving Stripe redirected
      //       them here with a valid session_id (covers the case
      //       where the webhook never lands but the user did pay).
      // Without (b) we'd block every user whose webhook is delayed;
      // without the gate, an attacker could insert a row, skip
      // paying, and navigate directly here for a free match.
      const r = data as unknown as AiFindRow;
      const needsMatch = !r.vano_match_user_id
        && (r.status === 'awaiting_payment' || r.status === 'paid' || r.status === 'scouting');
      const hasTrustToken = (() => {
        try { return !!sessionStorage.getItem(`vano_ai_find_paid_${r.id}`); }
        catch { return false; }
      })();
      const paymentEvidence = r.status === 'paid' || r.status === 'scouting' || hasTrustToken;
      if (needsMatch && paymentEvidence && !clientMatchRanRef.current) {
        clientMatchRanRef.current = true;
        const pick = await pickVanoMatchClientSide(r.category, r.brief, r.rejected_vano_user_ids ?? []);
        if (cancelled) return;
        if (!pick) {
          // Genuinely empty pool. Surface the no-match state; the
          // hirer's €1 will be auto-refunded by the cron / on next
          // webhook cycle.
          setRow((prev) => prev && ({ ...prev, status: 'failed', error_message: 'no_matches_found' }));
          return;
        }
        const { data: updated, error: updErr } = await supabase
          .from('ai_find_requests')
          .update({
            vano_match_user_id: pick.user_id,
            vano_match_reason: pick.reason,
            status: 'complete',
            completed_at: new Date().toISOString(),
          })
          .eq('id', r.id)
          .select('id, status, brief, category, vano_match_user_id, vano_match_reason, vano_match_score, error_message, vano_match_feedback, vano_retry_count, rejected_vano_user_ids')
          .maybeSingle();
        if (cancelled) return;
        if (updErr) {
          console.error('[ai-find] client-side completion failed', updErr);
          // Don't block the UI — keep polling, the webhook may still
          // land and rescue us.
          clientMatchRanRef.current = false;
          return;
        }
        if (updated) setRow(updated as unknown as AiFindRow);
      }
    };

    void pollOnce();
    setTimedOut(false);

    const timer = setInterval(() => {
      if (cancelled) return;
      const elapsed = (Date.now() - pollingStartedAt) / 1000;
      if (elapsed > MAX_POLL_SECONDS) {
        clearInterval(timer);
        setTimedOut(true);
        return;
      }
      void pollOnce();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, pollingStartedAt]);

  // Email-the-match: fire-and-forget POST to /api/send-ai-find-match
  // the first time we have a complete row + hydrated pick. Sends the
  // freelancer's name, phone, bio and a "call them" link to the
  // hirer's signed-in email so they have it forever — no panic if
  // they close the tab or lose the phone number. sessionStorage gate
  // prevents a refresh in the same session from double-sending.
  useEffect(() => {
    if (!row || row.status !== 'complete' || !row.vano_match_user_id) return;
    if (!vanoPick) return;
    const flagKey = `vano_ai_find_emailed_${row.id}`;
    try {
      if (sessionStorage.getItem(flagKey)) return;
      sessionStorage.setItem(flagKey, '1');
    } catch { /* ignore */ }
    void (async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        const token = s?.access_token;
        if (!token) return;
        await fetch('/api/send-ai-find-match', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ request_id: row.id }),
        });
      } catch (err) {
        // Email is a backup channel — never block the UI on a
        // delivery failure. The match is already on screen.
        console.warn('[ai-find] email send failed', err);
      }
    })();
  }, [row?.id, row?.status, row?.vano_match_user_id, vanoPick]);

  // Celebratory reveal — fires once per page load the first time we
  // have a complete row, a hydrated pick, and the 5-second curtain
  // has lifted.
  useEffect(() => {
    if (celebratedRef.current) return;
    if (row?.status !== 'complete') return;
    if (!vanoPick) return;
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
  }, [row?.status, vanoPick, revealReady]);

  useEffect(() => {
    if (isTerminal) return;
    const tick = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - pollingStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [isTerminal, pollingStartedAt]);

  // Load the Vano pick profile when the row resolves with a match.
  useEffect(() => {
    if (!row?.vano_match_user_id) {
      setVanoPick(null);
      setVanoFetchDone(true);
      return;
    }
    setVanoFetchDone(false);
    let cancelled = false;
    void (async () => {
      const [{ data: profile }, { data: studentProfile }] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url')
          .eq('user_id', row.vano_match_user_id)
          .maybeSingle(),
        supabase
          .from('student_profiles')
          .select('bio, skills, hourly_rate, phone')
          .eq('user_id', row.vano_match_user_id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (!profile) { setVanoPick(null); setVanoFetchDone(true); return; }
      setVanoPick({
        user_id: profile.user_id as string,
        display_name: (profile.display_name as string) || 'Vano freelancer',
        avatar_url: (profile.avatar_url as string | null) ?? null,
        bio: (studentProfile?.bio as string | null) ?? null,
        skills: (studentProfile?.skills as string[] | null) ?? null,
        hourly_rate: (studentProfile?.hourly_rate as number | null) ?? null,
        phone: (studentProfile?.phone as string | null) ?? null,
      });
      setVanoFetchDone(true);
    })();
    return () => { cancelled = true; };
  }, [row?.vano_match_user_id]);

  useEffect(() => {
    if (session === null) {
      // Auth context still resolving vs. signed out — don't redirect
      // here; RLS already gates and the not_found card handles it.
    }
  }, [session]);

  // While the 5-second reveal curtain is up we always render the
  // staged progress, regardless of underlying status. After it
  // lifts the normal status branches take over.
  const showCurtain = !revealReady;

  return (
    <>
      <SEOHead title="Your AI Find result" description="Your AI-matched freelancer." />
      <div className="min-h-[100dvh] bg-background px-4 py-10 sm:py-14">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <Sparkles className="h-3.5 w-3.5" /> AI Find
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your perfect freelancer</h1>
          </div>

          {loadError === 'not_found' ? (
            <StatusCard
              tone="error"
              title="Request not found"
              body="This AI Find request doesn't belong to your account, or it doesn't exist. If you just paid, give it 10 seconds and refresh."
              action={{ label: 'Back to /hire', onClick: () => navigate('/hire') }}
            />
          ) : !row || showCurtain ? (
            <AiFindProgressStages elapsedSec={elapsedSec} />
          ) : (row.status === 'paid' || row.status === 'scouting' || row.status === 'awaiting_payment') && timedOut ? (
            <StatusCard
              tone="neutral"
              title="Still working on it"
              body="The match is taking longer than usual. Your €1 is safe — refresh in a minute. If we can't find a fit, you'll be refunded automatically."
              action={{
                label: 'Check again',
                onClick: () => {
                  setTimedOut(false);
                  setElapsedSec(0);
                  clientMatchRanRef.current = false;
                  setPollingStartedAt(Date.now());
                },
              }}
            />
          ) : row.status === 'paid' || row.status === 'scouting' || row.status === 'awaiting_payment' ? (
            <AiFindProgressStages elapsedSec={elapsedSec} />
          ) : row.status === 'failed' ? (
            <StatusCard
              tone="error"
              title="We couldn't find a match"
              body={
                row.error_message === 'no_matches_found'
                  ? "Sorry — we didn't find a great fit this time. We'll refund your €1 within 24 hours, no action needed."
                  : 'Something went wrong on our side. We\'ll refund your €1 within 24 hours, no action needed.'
              }
              action={{ label: 'Back to /hire', onClick: () => navigate('/hire') }}
            />
          ) : row.status === 'refunded' ? (
            <StatusCard
              tone="neutral"
              title="Refunded"
              body="Your €1 has been refunded."
              action={{ label: 'Back to /hire', onClick: () => navigate('/hire') }}
            />
          ) : !vanoFetchDone ? (
            <LoadingCard label="Loading your match…" />
          ) : !vanoPick ? (
            <StatusCard
              tone="neutral"
              title="Match is no longer available"
              body="The freelancer we picked just removed their profile. Start another search and we'll find you a fresh one."
              action={{ label: 'Back to /hire', onClick: () => navigate('/hire') }}
            />
          ) : (
            <div className="space-y-4">
              {showMatchReveal && (
                <div
                  className="mx-auto flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-[12px] font-semibold text-emerald-700 shadow-[0_8px_24px_-10px_rgba(16,185,129,0.35)] animate-in fade-in slide-in-from-top-2 duration-500 dark:text-emerald-300"
                  onAnimationEnd={() => {
                    window.setTimeout(() => setShowMatchReveal(false), 3800);
                  }}
                >
                  <CheckCircle2 size={13} strokeWidth={3} />
                  Your match is ready
                </div>
              )}

              <VanoPickCard
                pick={vanoPick}
                reason={row.vano_match_reason ?? null}
                feedback={row.vano_match_feedback}
                retryCount={row.vano_retry_count}
                retrying={retrying}
                onMessage={() => navigate(`/messages?with=${vanoPick.user_id}`)}
                onFeedback={(verdict) => submitFeedback(verdict)}
                onRetry={() => retry()}
              />

              <button
                type="button"
                onClick={() => navigate('/hire')}
                className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                Start another search
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// Client-side matcher.
//
// Strategy: pull approved community_posts in the brief's category,
// score each candidate by how many skill tags overlap with words in
// the brief, pick the top scorer (random tiebreak). Falls back to
// the full approved pool if the category bucket is empty so a thin
// category never strands a hirer. Excludes any user_ids the hirer
// already rejected on this brief.
//
// No Gemini, no external services — runs entirely on data the client
// can already read via RLS, so it works even when the Supabase edge
// gateway is down.
type Candidate = { user_id: string; skills: string[]; title: string };

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

async function pickVanoMatchClientSide(
  category: string | null,
  brief: string | null,
  excludeUserIds: string[],
): Promise<{ user_id: string; reason: string } | null> {
  const exclude = new Set(excludeUserIds.filter(Boolean));
  const briefTokens = tokenize(brief ?? '');

  const queryByCategory = async (cat: string | null) => {
    let q = supabase
      .from('community_posts')
      .select('user_id, title, student_profiles:student_profiles!inner(skills)')
      .eq('moderation_status', 'approved')
      .limit(50);
    if (cat) q = q.eq('category', cat);
    const { data, error } = await q;
    if (error) {
      console.warn('[ai-find] candidate query failed', error.message);
      return null;
    }
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
      const sp = r.student_profiles as { skills?: string[] | null } | null;
      return {
        user_id: r.user_id as string,
        title: (r.title as string) ?? '',
        skills: (sp?.skills ?? []) as string[],
      } satisfies Candidate;
    });
  };

  let candidates: Candidate[] | null = null;
  if (category) candidates = await queryByCategory(category);
  if (!candidates || candidates.length === 0) candidates = await queryByCategory(null);
  if (!candidates) return null;

  candidates = candidates.filter((c) => c.user_id && !exclude.has(c.user_id));
  if (candidates.length === 0) return null;

  // Score by skill-tag overlap with the brief. Each matched tag is
  // worth 1 point; same goes for any title word that appears in the
  // brief (catches "video editor for my reel" against a "Reels editor"
  // listing without a skills tag for "reel"). Random shuffle inside a
  // stable score bucket so repeat searches don't always surface the
  // same person.
  const scored = candidates.map((c) => {
    let score = 0;
    const matchedTags: string[] = [];
    for (const skill of c.skills ?? []) {
      const skillTokens = tokenize(skill);
      let hit = false;
      for (const t of skillTokens) {
        if (briefTokens.has(t)) { hit = true; break; }
      }
      if (hit) {
        score += 1;
        matchedTags.push(skill);
      }
    }
    for (const t of tokenize(c.title)) {
      if (briefTokens.has(t)) score += 0.5;
    }
    return { ...c, score, matchedTags, jitter: Math.random() };
  });

  scored.sort((a, b) => (b.score - a.score) || (a.jitter - b.jitter));

  const winner = scored[0];
  const buildReason = (): string => {
    if (winner.score > 0 && winner.matchedTags.length > 0) {
      const tagList = winner.matchedTags.slice(0, 3).join(', ');
      return `Matched on ${tagList} — fits your brief.`;
    }
    if (category) return `Top freelancer in our ${category.replace(/_/g, ' ')} pool — close fit for your brief.`;
    return 'Top freelancer from our pool — close fit for your brief.';
  };

  return { user_id: winner.user_id, reason: buildReason() };
}

const FeedbackRow = ({
  feedback, retryCount, retrying, onFeedback, onRetry,
}: {
  feedback: 'up' | 'down' | null;
  retryCount: number;
  retrying: boolean;
  onFeedback: (verdict: 'up' | 'down') => void;
  onRetry: () => void;
}) => {
  const retryLeft = retryCount < 1;
  const downVoted = feedback === 'down';
  const upVoted = feedback === 'up';

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-medium text-muted-foreground">How's this match?</p>
        <button
          type="button"
          onClick={() => onFeedback('up')}
          aria-label="Good match"
          className={[
            'ml-auto flex h-7 w-7 items-center justify-center rounded-full border transition',
            upVoted
              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700'
              : 'border-border bg-card text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-700',
          ].join(' ')}
        >
          <ThumbsUp size={13} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          onClick={() => onFeedback('down')}
          aria-label="Not a great match"
          className={[
            'flex h-7 w-7 items-center justify-center rounded-full border transition',
            downVoted
              ? 'border-amber-500 bg-amber-500/10 text-amber-700'
              : 'border-border bg-card text-muted-foreground hover:border-amber-500/40 hover:text-amber-700',
          ].join(' ')}
        >
          <ThumbsDown size={13} strokeWidth={2.2} />
        </button>
      </div>
      {retryLeft && !upVoted && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] leading-snug text-muted-foreground">
            {downVoted
              ? "Sorry — let's try again."
              : 'Not the right fit? Try again, free (once per brief).'}
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className={[
              'flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold shadow-sm transition disabled:opacity-60',
              downVoted
                ? 'bg-primary text-primary-foreground hover:brightness-110'
                : 'border border-border bg-card text-foreground hover:bg-muted',
            ].join(' ')}
          >
            {retrying ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} strokeWidth={2.5} />}
            {retrying ? 'Finding…' : 'Show another'}
          </button>
        </div>
      )}
      {upVoted && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Thanks — your feedback helps rank future matches.
        </p>
      )}
      {!retryLeft && downVoted && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          You've used your retry. Message them anyway to see where it leads, or start a fresh brief.
        </p>
      )}
    </div>
  );
};

const LoadingCard = ({ label, hint }: { label: string; hint?: string }) => (
  <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
    <Loader2 className="mx-auto mb-4 h-6 w-6 animate-spin text-muted-foreground" />
    <p className="text-sm font-medium text-foreground">{label}</p>
    {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);

// Three-stage progress while we line up the match. Same UI as the
// previous version but the stages now describe Vano-only matching
// (no web scout). The stages auto-advance on a timer; the actual
// match completion is gated on the row + the 5-second reveal curtain.
function AiFindProgressStages({ elapsedSec }: { elapsedSec: number }) {
  const stages = [
    { id: 'scan',  label: 'Reading your brief',         icon: Search,  endAt: 2 },
    { id: 'pool',  label: 'Scanning our freelancer pool', icon: Compass, endAt: 4 },
    { id: 'rank',  label: 'Picking your perfect match',  icon: Trophy,  endAt: 5 },
  ] as const;
  const activeIdx = stages.findIndex((s) => elapsedSec < s.endAt);
  const pastAll = activeIdx === -1;

  const percent = (() => {
    if (pastAll) return 96;
    const stage = stages[activeIdx];
    const startAt = activeIdx === 0 ? 0 : stages[activeIdx - 1].endAt;
    const within = (elapsedSec - startAt) / (stage.endAt - startAt);
    const slice = 100 / stages.length;
    return Math.max(4, Math.min(100, activeIdx * slice + within * slice));
  })();

  return (
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
          {elapsedSec}s
        </span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
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
  );
}

const StatusCard = ({
  tone,
  title,
  body,
  action,
}: {
  tone: 'error' | 'neutral';
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) => (
  <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
    <div className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full ${tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
      <AlertCircle className="h-5 w-5" />
    </div>
    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    {action ? (
      <button
        type="button"
        onClick={action.onClick}
        className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 active:scale-[0.98]"
      >
        {action.label}
      </button>
    ) : null}
  </div>
);

const VanoPickCard = ({
  pick, reason, feedback, retryCount, retrying, onMessage, onFeedback, onRetry,
}: {
  pick: VanoPick;
  reason: string | null;
  feedback: 'up' | 'down' | null;
  retryCount: number;
  retrying: boolean;
  onMessage: () => void;
  onFeedback: (verdict: 'up' | 'down') => void;
  onRetry: () => void;
}) => (
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
        {pick.avatar_url ? (
          <img src={pick.avatar_url} alt={pick.display_name} className="h-14 w-14 flex-shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-muted text-base font-semibold text-muted-foreground">
            {pick.display_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-foreground">{pick.display_name}</p>
          {pick.hourly_rate ? (
            <p className="text-xs text-muted-foreground">From €{pick.hourly_rate}/hr</p>
          ) : null}
        </div>
      </div>

      {reason ? (
        <div className="rounded-xl border border-amber-300/40 bg-amber-50/50 px-3.5 py-2.5 dark:border-amber-800/30 dark:bg-amber-900/10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
            Why Vano picked them
          </p>
          <p className="mt-1 text-sm italic text-foreground leading-relaxed">
            "{reason}"
          </p>
        </div>
      ) : null}

      {pick.bio ? (
        <p className="text-sm text-foreground leading-relaxed line-clamp-4">{pick.bio}</p>
      ) : null}

      {pick.skills && pick.skills.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {pick.skills.slice(0, 8).map((s) => (
            <span key={s} className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-foreground">
              {s}
            </span>
          ))}
        </div>
      ) : null}

      {pick.phone ? (
        <div className="space-y-2">
          {/* Phone is the primary CTA when the freelancer left one —
               founder's call: hirers convert faster when they can call
               or text directly. On-platform message stays as the
               secondary so risk-averse hirers still have it. */}
          <a
            href={`tel:${pick.phone.replace(/[^+\d]/g, '')}`}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:brightness-110 active:scale-[0.98]"
          >
            <Phone className="h-4 w-4" /> Call {pick.phone}
          </a>
          <a
            href={`sms:${pick.phone.replace(/[^+\d]/g, '')}`}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10 active:scale-[0.98]"
          >
            <MessageCircle className="h-4 w-4" /> Text {pick.phone}
          </a>
          <button
            type="button"
            onClick={onMessage}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Or message them on Vano
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onMessage}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:brightness-110 active:scale-[0.98]"
        >
          <MessageCircle className="h-4 w-4" /> Text on Vano
        </button>
      )}
      <p className="text-center text-[11px] text-muted-foreground">
        Agree the work and rate, then pay safely on Vano.
      </p>
      <p className="text-center text-[11px] text-muted-foreground/80">
        Lost the details? We've also emailed them to you — check your inbox.
      </p>
      <FeedbackRow
        feedback={feedback}
        retryCount={retryCount}
        retrying={retrying}
        onFeedback={onFeedback}
        onRetry={onRetry}
      />
    </div>
  </div>
);

export default AiFindResults;
