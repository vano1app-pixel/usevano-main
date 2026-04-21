import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  MessageCircle,
  Globe,
  Mail,
  Instagram,
  Linkedin,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
} from 'lucide-react';

import { useToast } from '@/hooks/use-toast';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuthContext';
import { SEOHead } from '@/components/SEOHead';

// Results page for the €1 AI Find flow. Polls ai_find_requests until
// status='complete' (or 'failed'), then loads the Vano + web picks and
// renders the two-card UI. Access is RLS-gated to the requester, so an
// unrelated user hitting a random /ai-find/:id URL sees nothing.

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_SECONDS = 120;

type AiFindStatus = 'awaiting_payment' | 'paid' | 'scouting' | 'complete' | 'failed' | 'refunded';

type AiFindRow = {
  id: string;
  status: AiFindStatus;
  brief: string;
  category: string | null;
  vano_match_user_id: string | null;
  vano_match_reason: string | null;
  vano_match_score: number | null;
  web_scout_id: string | null;
  error_message: string | null;
  vano_match_feedback: 'up' | 'down' | null;
  web_match_feedback: 'up' | 'down' | null;
  vano_retry_count: number;
  web_retry_count: number;
};

type VanoPick = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  skills: string[] | null;
  hourly_rate: number | null;
};

type WebPick = {
  name: string;
  avatar_url: string | null;
  bio: string | null;
  skills: string[] | null;
  location: string | null;
  portfolio_url: string | null;
  source_platform: string;
  contact_email: string | null;
  contact_instagram: string | null;
  contact_linkedin: string | null;
  match_score: number | null;
  /** How the outreach landed — 'email' sent, 'manual' means no email
   *  was on file so the hirer should DM them via IG/LinkedIn, 'none'
   *  means no reachable contact at all. Null while outreach is still
   *  pending on the edge function side. Drives the status line on the
   *  WebPickCard so the UI never claims an invite was sent when it
   *  wasn't. */
  outreach_channel: string | null;
  outreach_sent_at: string | null;
};

const AiFindResults = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { toast } = useToast();

  const [row, setRow] = useState<AiFindRow | null>(null);
  const [vanoPick, setVanoPick] = useState<VanoPick | null>(null);
  const [webPick, setWebPick] = useState<WebPick | null>(null);
  // Track whether each pick's secondary fetch has settled. Without
  // these, the "both picks null" branch triggers on a fresh 'complete'
  // row before the profile/scout queries have landed — showing a
  // "Match data missing" error for what is actually a loading state.
  const [vanoFetchDone, setVanoFetchDone] = useState(false);
  const [webFetchDone, setWebFetchDone] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // pollingStartedAt is stateful (not a const initializer) so the
  // "Check again" button can reset the window after a timeout.
  const [pollingStartedAt, setPollingStartedAt] = useState(() => Date.now());
  const [timedOut, setTimedOut] = useState(false);
  // UI state for retry-in-flight so the button spinner is per-side,
  // not global (both cards could hypothetically retry at once).
  const [retryingSide, setRetryingSide] = useState<'vano' | 'web' | null>(null);
  // Celebratory reveal — fires once the row flips from scouting →
  // complete and at least one pick has loaded. The chip fades in
  // above the pick cards + a subtle confetti burst makes the moment
  // feel earned instead of "the page silently filled in".
  const [showMatchReveal, setShowMatchReveal] = useState(false);
  const celebratedRef = useRef(false);

  // Save the thumbs verdict via the SECURITY DEFINER RPC. Optimistic
  // UI: flip the local row immediately so the thumb fills, revert on
  // RPC error.
  const submitFeedback = async (side: 'vano' | 'web', verdict: 'up' | 'down') => {
    if (!row) return;
    setRow((prev) => prev && ({
      ...prev,
      [side === 'vano' ? 'vano_match_feedback' : 'web_match_feedback']: verdict,
    }));
    const { error } = await supabase.rpc('submit_ai_find_feedback' as never, {
      p_request_id: row.id, p_side: side, p_verdict: verdict,
    } as never);
    if (error) {
      toast({ title: "Couldn't save feedback", description: 'Try again in a moment.', variant: 'destructive' });
      setRow((prev) => prev && ({
        ...prev,
        [side === 'vano' ? 'vano_match_feedback' : 'web_match_feedback']: null,
      }));
    }
  };

  // Retry: calls the ai-find-retry edge function which mutates the
  // same row in place with a new pick. We wait for success then force
  // a re-poll so the new vano/web pick hydrates into state.
  const retry = async (side: 'vano' | 'web') => {
    if (!row || retryingSide) return;
    setRetryingSide(side);
    try {
      const { data, error } = await supabase.functions.invoke('ai-find-retry', {
        body: { request_id: row.id, side },
      });
      if (error) throw error;
      const result = data as { ok?: boolean } | null;
      if (!result?.ok) throw new Error('Retry did not return ok');
      // Bust the stale row by re-selecting. The useEffect poller will
      // also refresh on its next tick, but this makes the UI snap
      // faster.
      const { data: refreshed } = await supabase
        .from('ai_find_requests')
        .select('id, status, brief, category, vano_match_user_id, vano_match_reason, vano_match_score, web_scout_id, error_message, vano_match_feedback, web_match_feedback, vano_retry_count, web_retry_count')
        .eq('id', row.id)
        .maybeSingle();
      if (refreshed) setRow(refreshed as AiFindRow);
    } catch (err) {
      const ctxErr = (err as { context?: { error?: string } })?.context?.error;
      const msg = (err as { message?: string })?.message || '';
      toast({
        title: "Couldn't get a different match",
        description:
          ctxErr === 'Retry limit reached for this side' || msg.includes('Retry limit')
            ? "You've already tried once on this side — that's the cap for this brief."
          : ctxErr === 'No alternative Vano match found' || ctxErr === 'No alternative web match found'
            ? "We couldn't find a different one that fits — try another brief."
          : 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setRetryingSide(null);
    }
  };
  // Tracks how long the caller has been on the scouting screen so the
  // loading copy can progress through "scanning Vano → searching web →
  // picking best match". Updated every second only while we're in a
  // non-terminal status so we don't thrash React after completion.
  const [elapsedSec, setElapsedSec] = useState(0);

  const isTerminal = useMemo(
    () => row?.status === 'complete' || row?.status === 'failed' || row?.status === 'refunded',
    [row?.status],
  );

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    const pollOnce = async () => {
      // ai_find_requests isn't in the generated supabase types yet
      // (its introducing migration ships in this change), so the
      // typed client errors out at compile time. Cast through the
      // untyped supabase client just for this one table — the runtime
      // is identical.
      const { data, error } = await supabase
        .from('ai_find_requests')
        .select('id, status, brief, category, vano_match_user_id, vano_match_reason, vano_match_score, web_scout_id, error_message, vano_match_feedback, web_match_feedback, vano_retry_count, web_retry_count')
        .eq('id', id)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setLoadError('not_found');
        return;
      }
      setRow(data as AiFindRow);
    };

    void pollOnce();
    setTimedOut(false);

    const timer = setInterval(() => {
      // Stop polling once terminal OR once we've exceeded the cap —
      // the backend function has a much shorter budget than 2 min.
      // The scouting status handler below flips to the timed-out
      // card so the user isn't stranded on "Just a moment more…".
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

  // Stop polling once we've hit a terminal status.
  useEffect(() => {
    if (!isTerminal) return;
    // No-op: the interval self-terminates via MAX_POLL_SECONDS or the
    // next-tick `isTerminal` check below. We keep this effect for
    // future-facing signals (e.g. posthog terminal event).
  }, [isTerminal]);

  // Celebratory reveal — fires once per page load the first time the
  // row reaches 'complete' AND at least one pick has hydrated. Runs a
  // small confetti burst and flips the "Matched!" chip visible. The
  // ref-gate means the chip doesn't refire on subsequent re-renders
  // (realtime refresh, retries, etc).
  useEffect(() => {
    if (celebratedRef.current) return;
    if (row?.status !== 'complete') return;
    if (!vanoPick && !webPick) return;
    celebratedRef.current = true;
    setShowMatchReveal(true);
    // Fire confetti off the main thread — async import so the module
    // only loads on this moment, not on every AiFindResults mount.
    const reducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;
    void (async () => {
      try {
        const confetti = (await import('canvas-confetti')).default;
        const end = Date.now() + 500;
        const burst = () => {
          confetti({
            particleCount: 18,
            spread: 55,
            startVelocity: 35,
            angle: 60,
            origin: { x: 0.08, y: 0.35 },
            colors: ['#10b981', '#fcd34d', '#ffffff'],
          });
          confetti({
            particleCount: 18,
            spread: 55,
            startVelocity: 35,
            angle: 120,
            origin: { x: 0.92, y: 0.35 },
            colors: ['#10b981', '#fcd34d', '#ffffff'],
          });
          if (Date.now() < end) window.setTimeout(burst, 140);
        };
        burst();
      } catch {
        // Confetti is a nicety, not critical — if the dynamic import
        // fails for any reason, the chip still appears.
      }
    })();
  }, [row?.status, vanoPick, webPick]);

  // 1-second tick to drive the staged loading copy. Only runs during
  // non-terminal polling so a completed request doesn't thrash React.
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
          .select('bio, skills, hourly_rate')
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
      });
      setVanoFetchDone(true);
    })();
    return () => { cancelled = true; };
  }, [row?.vano_match_user_id]);

  // Load the web pick (scouted_freelancers row). RLS policy
  // `scouted_freelancers_select_requester` gates this to the requester.
  useEffect(() => {
    if (!row?.web_scout_id) {
      setWebPick(null);
      setWebFetchDone(true);
      return;
    }
    setWebFetchDone(false);
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('scouted_freelancers')
        .select('name, avatar_url, bio, skills, location, portfolio_url, source_platform, contact_email, contact_instagram, contact_linkedin, match_score, outreach_channel, outreach_sent_at')
        .eq('id', row.web_scout_id)
        .maybeSingle();
      if (cancelled) return;
      if (!data) { setWebPick(null); setWebFetchDone(true); return; }
      setWebPick(data as WebPick);
      setWebFetchDone(true);
    })();
    return () => { cancelled = true; };
  }, [row?.web_scout_id]);

  // Auth guard: if we're on a public browser session somehow, bounce to
  // /auth. RLS already prevents leaks but we don't want a confusing
  // empty screen.
  useEffect(() => {
    if (session === null) {
      // session hook hasn't resolved yet vs. actually signed out —
      // only redirect once useAuth() finishes initial load. Auth
      // context sets session=null both while loading and when signed
      // out; MAX_POLL_SECONDS cap + SEOHead ensures a clean UX.
    }
  }, [session]);

  return (
    <>
      <SEOHead title="Your AI Find results" description="Your AI-matched freelancer." />
      <div className="min-h-[100dvh] bg-background px-4 py-10 sm:py-14">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <Sparkles className="h-3.5 w-3.5" /> AI Find
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your matches</h1>
          </div>

          {loadError === 'not_found' ? (
            <StatusCard
              tone="error"
              title="Request not found"
              body="This AI Find request doesn't belong to your account, or it doesn't exist. If you just paid, give it 10 seconds and refresh."
              action={{ label: 'Back to /hire', onClick: () => navigate('/hire') }}
            />
          ) : !row ? (
            <LoadingCard label="Loading your request…" />
          ) : row.status === 'awaiting_payment' ? (
            <LoadingCard
              label="Finalising your payment…"
              hint="If this takes more than a minute, check back later — your request is safe."
            />
          ) : (row.status === 'paid' || row.status === 'scouting') && timedOut ? (
            <StatusCard
              tone="neutral"
              title="Still working on it"
              body="The search is taking longer than usual. Your €1 is safe — check again in a minute, or come back later. If it can't find a match, we'll refund you automatically."
              action={{
                label: 'Check again',
                onClick: () => {
                  setTimedOut(false);
                  setElapsedSec(0);
                  setPollingStartedAt(Date.now());
                },
              }}
            />
          ) : row.status === 'paid' || row.status === 'scouting' ? (
            // Staged loading copy tied to elapsed seconds so the wait
            // reads as deliberate work (3 named passes) rather than a
            // generic spinner. Matches what the ai-find-freelancer
            // edge function is actually doing behind the scenes:
            // 0–15s : pool + brief parsing
            // 15–30s: Serper scout + web result parsing
            // 30–60s: Gemini re-rank to pick the single best
            // 60+s  : gracefully degrades to "almost there".
            <LoadingCard
              label={
                elapsedSec < 15
                  ? "Scanning your Vano pool…"
                  : elapsedSec < 30
                    ? "Scouting the open web…"
                    : elapsedSec < 60
                      ? "Ranking the best fit…"
                      : "Almost there — polishing your matches…"
              }
              hint={elapsedSec < 60 ? "Usually under a minute. €1 refunded if we can't find one." : "Taking a little longer than usual — your €1 is safe, we'll email you if anything's off."}
            />
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
          ) : (() => {
            // Secondary fetches (profile + scout row) can lag the 'complete'
            // flip by a tick. Without the fetch-done guards below, that
            // race briefly showed a "Match data missing" error card for
            // what was actually a loading state.
            const picksHydrating = !vanoFetchDone || !webFetchDone;
            const hadVanoMatchId = !!row.vano_match_user_id;
            const hadWebScoutId = !!row.web_scout_id;
            const noMatchesAtAll = !hadVanoMatchId && !hadWebScoutId;
            const matchGoneStale = !noMatchesAtAll && !vanoPick && !webPick;

            if (picksHydrating) {
              return <LoadingCard label="Loading your matches…" />;
            }

            return (
              <div className="space-y-4">
                {/* Celebratory chip — fades in the first time the row
                     reaches 'complete' with at least one pick. Makes
                     the moment feel earned; paired with a confetti
                     burst from the reveal effect above. Fades out
                     after 4 seconds on its own via CSS; the ref-gate
                     ensures it doesn't refire. */}
                {showMatchReveal && (
                  <div
                    className="mx-auto flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-[12px] font-semibold text-emerald-700 shadow-[0_8px_24px_-10px_rgba(16,185,129,0.35)] animate-in fade-in slide-in-from-top-2 duration-500 dark:text-emerald-300"
                    onAnimationEnd={() => {
                      // Auto-hide after a breath so the chip doesn't
                      // linger all session. Use rAF so the fade-out
                      // runs on the next paint.
                      window.setTimeout(() => setShowMatchReveal(false), 3800);
                    }}
                  >
                    <CheckCircle2 size={13} strokeWidth={3} />
                    Your match is ready
                  </div>
                )}

                {vanoPick ? (
                  <VanoPickCard
                    pick={vanoPick}
                    reason={row.vano_match_reason ?? null}
                    score={row.vano_match_score ?? null}
                    feedback={row.vano_match_feedback}
                    retryCount={row.vano_retry_count}
                    retrying={retryingSide === 'vano'}
                    onMessage={() => navigate(`/messages?with=${vanoPick.user_id}`)}
                    onFeedback={(verdict) => submitFeedback('vano', verdict)}
                    onRetry={() => retry('vano')}
                  />
                ) : null}

                {webPick ? (
                  <WebPickCard
                    pick={webPick}
                    feedback={row.web_match_feedback}
                    retryCount={row.web_retry_count}
                    retrying={retryingSide === 'web'}
                    onFeedback={(verdict) => submitFeedback('web', verdict)}
                    onRetry={() => retry('web')}
                  />
                ) : null}

                {noMatchesAtAll ? (
                  <StatusCard
                    tone="neutral"
                    title="No match this time"
                    body="We couldn't find a good fit for this brief. Your €1 refund is on the way — give it a few minutes."
                  />
                ) : matchGoneStale ? (
                  <StatusCard
                    tone="neutral"
                    title="Match is no longer available"
                    body="Your picks existed a moment ago but aren't reachable now (the freelancer may have removed their profile). Start another search and we'll find you a fresh one."
                  />
                ) : null}

                <button
                  type="button"
                  onClick={() => navigate('/hire')}
                  className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
                >
                  Start another search
                </button>
              </div>
            );
          })()}
        </div>
      </div>
    </>
  );
};

// Shared thumbs row + retry button that sits at the bottom of both
// the Vano pick and the web pick cards. Clicking thumbs down reveals
// the retry button (once per side per brief) so clients don't feel
// trapped with one pick.
const FeedbackRow = ({
  feedback, retryCount, retrying, onFeedback, onRetry,
}: {
  feedback: 'up' | 'down' | null;
  retryCount: number;
  retrying: boolean;
  onFeedback: (verdict: 'up' | 'down') => void;
  onRetry: () => void;
}) => {
  // Retry used to gate on `feedback === 'down'` — you had to
  // actively thumbs-down before the "Show another" button appeared.
  // Problem: a hirer who's lukewarm on the pick but doesn't click
  // the thumb never sees that retry is even an option. Silent
  // abandonment, one of the biggest Vano Match drop-offs.
  //
  // Now: show the retry link as soon as you have a match and still
  // have a retry left in the budget (retry_count < 1). Muted by
  // default so it reads as "option, not ask"; promoted to a filled
  // primary chip once you thumbs-down so the recovery path is
  // obvious. Thumbs-up users see a thank-you hint instead of the
  // retry link, to signal their feedback was registered.
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
  pick, reason, score, feedback, retryCount, retrying, onMessage, onFeedback, onRetry,
}: {
  pick: VanoPick;
  reason: string | null;
  score: number | null;
  feedback: 'up' | 'down' | null;
  retryCount: number;
  retrying: boolean;
  onMessage: () => void;
  onFeedback: (verdict: 'up' | 'down') => void;
  onRetry: () => void;
}) => {
  // Bucket the raw Gemini score into honest confidence tiers —
  // surfacing "Strong fit" / "Good fit" reads better than "94% match"
  // which implies a precision Gemini doesn't actually have. Below 40
  // is the deterministic-fallback path: the ranker couldn't find a
  // tailored match but still returned the best-ranked freelancer from
  // the requested category, so the label reads "From your category"
  // rather than claiming a fit we don't have.
  const scoreBucket: { label: string; tone: string } | null = (() => {
    if (score == null) return null;
    if (score >= 75) return { label: 'Strong fit', tone: 'bg-emerald-400/20 text-emerald-50 ring-1 ring-emerald-300/30' };
    if (score >= 55) return { label: 'Good fit',   tone: 'bg-white/15 text-white/90 ring-1 ring-white/20' };
    if (score >= 40) return { label: 'Plausible fit', tone: 'bg-white/10 text-white/80 ring-1 ring-white/15' };
    return { label: 'From your category', tone: 'bg-white/10 text-white/70 ring-1 ring-white/15' };
  })();
  return (
  <div className="overflow-hidden rounded-[20px] border border-primary/30 bg-card shadow-[0_18px_44px_-22px_hsl(var(--primary)/0.45)]">
    <div className="relative overflow-hidden bg-gradient-to-b from-primary to-primary/90 px-5 py-4 text-primary-foreground">
      <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-amber-300/15 blur-3xl" />
      <div className="relative flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
          <Sparkles className="h-3 w-3 text-amber-200" /> Vano's pick
        </div>
        <div className="inline-flex items-center gap-2">
          {scoreBucket && (
            <span
              title={`Gemini-assigned match confidence: ${score}/100`}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${scoreBucket.tone}`}
            >
              {scoreBucket.label}
            </span>
          )}
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-100/90">
            Vetted · on platform
          </span>
        </div>
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

      <button
        type="button"
        onClick={onMessage}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:brightness-110 active:scale-[0.98]"
      >
        <MessageCircle className="h-4 w-4" /> Message now
      </button>
      <p className="text-center text-[11px] text-muted-foreground">
        Agree a rate in chat, then pay via <span className="font-semibold text-foreground">Vano Pay</span> — safer for both of you.
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
};

const WebPickCard = ({
  pick, feedback, retryCount, retrying, onFeedback, onRetry,
}: {
  pick: WebPick;
  feedback: 'up' | 'down' | null;
  retryCount: number;
  retrying: boolean;
  onFeedback: (verdict: 'up' | 'down') => void;
  onRetry: () => void;
}) => {
  const hasContact =
    !!pick.contact_email || !!pick.contact_instagram || !!pick.contact_linkedin || !!pick.portfolio_url;

  return (
    <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between bg-muted/60 px-5 py-3">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Globe className="h-3 w-3" /> Found on the web
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-400">
          Unvetted
        </span>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          {pick.avatar_url ? (
            <img
              src={pick.avatar_url}
              alt={pick.name}
              className="h-14 w-14 flex-shrink-0 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-muted text-base font-semibold text-muted-foreground">
              {pick.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-foreground">{pick.name}</p>
            {pick.location ? (
              <p className="truncate text-xs text-muted-foreground">{pick.location}</p>
            ) : null}
            {pick.source_platform ? (
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                via {pick.source_platform}
              </p>
            ) : null}
          </div>
        </div>

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

        {hasContact ? (
          <div className="space-y-1.5">
            {pick.portfolio_url ? (
              <ContactRow
                icon={<ExternalLink className="h-3.5 w-3.5" />}
                label="Portfolio"
                href={pick.portfolio_url}
                value={pick.portfolio_url}
              />
            ) : null}
            {pick.contact_email ? (
              <ContactRow
                icon={<Mail className="h-3.5 w-3.5" />}
                label="Email"
                href={`mailto:${pick.contact_email}`}
                value={pick.contact_email}
              />
            ) : null}
            {pick.contact_instagram ? (
              <ContactRow
                icon={<Instagram className="h-3.5 w-3.5" />}
                label="Instagram"
                href={
                  pick.contact_instagram.startsWith('http')
                    ? pick.contact_instagram
                    : `https://instagram.com/${pick.contact_instagram.replace(/^@/, '')}`
                }
                value={pick.contact_instagram}
              />
            ) : null}
            {pick.contact_linkedin ? (
              <ContactRow
                icon={<Linkedin className="h-3.5 w-3.5" />}
                label="LinkedIn"
                href={pick.contact_linkedin}
                value={pick.contact_linkedin}
              />
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Open their portfolio to find contact details.
          </p>
        )}

        {/* Truthful invite status — reads the outreach_channel the
             notify function actually wrote on the row, so the hirer
             sees what we really did (email sent, no email on file so
             they need to DM manually, or no reachable contact). The
             previous copy hard-coded "We've invited them" regardless
             of whether any outreach actually went out. */}
        {pick.outreach_channel === 'email' ? (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3.5 py-2.5 text-[12px] leading-relaxed text-emerald-900 dark:text-emerald-200">
            <p className="font-semibold">We've emailed them to join Vano.</p>
            <p className="mt-0.5 text-emerald-900/90 dark:text-emerald-200/85">
              If they claim their profile, you can pay them via <span className="font-semibold">Vano Pay</span> — protected, in-app, money in their bank in 1–2 days.
            </p>
          </div>
        ) : pick.outreach_channel === 'manual' ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-50/40 px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/15 dark:text-amber-100">
            <p className="font-semibold">We couldn't email them directly.</p>
            <p className="mt-0.5 text-amber-900/90 dark:text-amber-100/85">
              DM them via the links below — their Vano invite page is at <span className="font-mono text-[11px]">/claim</span> (we'll send it when they reply). Once they join, you can pay via <span className="font-semibold">Vano Pay</span>.
            </p>
          </div>
        ) : pick.outreach_channel === 'none' ? (
          <div className="rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">No contact details on file.</p>
            <p className="mt-0.5">
              Open their portfolio to find a way to reach them — if they join Vano from there, you can pay safely via Vano Pay.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">Reaching out to them now…</p>
            <p className="mt-0.5">
              Once they're contacted, we'll update this card. You can also reach out directly in the meantime.
            </p>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Vano hasn't reviewed this person — verify their work before sending money off-platform.
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
};

const ContactRow = ({
  icon,
  label,
  href,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  value: string;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer noopener"
    className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
  >
    <span className="text-muted-foreground">{icon}</span>
    <span className="text-muted-foreground">{label}:</span>
    <span className="min-w-0 flex-1 truncate">{value}</span>
    <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
  </a>
);

export default AiFindResults;
