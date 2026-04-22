import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// Stripe Payment Link return handler.
//
// Payment Links can only template {CHECKOUT_SESSION_ID} into their
// success URL — they can't inject arbitrary path segments. So our
// success URL is just this page, and the request id lives in
// localStorage (written by /hire before the redirect) OR we look it
// up by stripe_session_id once the webhook lands OR — as a final
// belt-and-braces fallback — we grab the user's most recent
// in-flight ai_find_request and use that.
//
// The third path matters because the previous version dumped users
// back on /hire when localStorage was missing AND the webhook hadn't
// landed within 20s. They'd then re-click AI Find, insert a new row,
// and pay again. Double-charges and a "looped" experience. We never
// want to bounce a user who just paid back to the start screen.

const POLL_INTERVAL_MS = 1500;
// Was 8s — too tight: Stripe webhooks routinely land in 10–30s, and
// when they lag we were dropping paid users onto /auth. Now we poll
// by session_id for 25s before falling through to the latest-row
// lookup, which covers the typical webhook window without stranding
// anyone.
const POLL_MAX_MS = 25_000;
// How long to wait for Supabase to hydrate the session from
// localStorage before treating the user as signed-out. The client
// reads storage async on init, and on cold page-load it can resolve a
// few hundred ms after our first check. Without this wait, signed-in
// users who return from Stripe on a fresh tab would get misread as
// anonymous and punted to /auth.
const AUTH_HYDRATION_TIMEOUT_MS = 3_000;

type ResolvedSession = { userId: string } | null;

async function resolveSession(): Promise<ResolvedSession> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ? { userId: session.user.id } : null;
}

// Wait up to AUTH_HYDRATION_TIMEOUT_MS for Supabase to finish loading
// the persisted session. Resolves immediately if it's already there.
// Uses onAuthStateChange so we pick up INITIAL_SESSION / SIGNED_IN as
// soon as they fire instead of busy-polling.
function waitForSessionHydration(): Promise<ResolvedSession> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: ResolvedSession) => {
      if (settled) return;
      settled = true;
      sub?.unsubscribe();
      clearTimeout(to);
      resolve(v);
    };
    const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user?.id) finish({ userId: session.user.id });
    });
    const to = setTimeout(() => {
      void resolveSession().then(finish);
    }, AUTH_HYDRATION_TIMEOUT_MS);
    void resolveSession().then((r) => { if (r) finish(r); });
  });
}

export default function AiFindReturn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [signedOutPaid, setSignedOutPaid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const go = (id: string) => {
      try { localStorage.removeItem('vano_ai_find_pending_id'); } catch { /* ignore */ }
      // Stamp a trust token so /ai-find/:id can self-heal an
      // awaiting_payment row even when the Stripe webhook hasn't
      // landed yet. Only set when we got here via Stripe's redirect
      // (presence of session_id is the signal). Stops a casual
      // bypass where someone creates a row, skips paying, and
      // navigates directly to /ai-find/:id.
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

    // Path 2 — poll by session_id. The webhook stamps stripe_session_id
    // on the row when it handles the event, so once it lands we can
    // find the row even without localStorage. We give it a short
    // window then fall through to path 3 instead of stranding the
    // user.
    const sessionId = params.get('session_id');
    const start = Date.now();

    const fallbackToLatest = async () => {
      if (cancelled) return;
      // Use getSession (local, reads from localStorage) rather than
      // getUser (server round-trip to the Supabase auth API). The
      // latter has been flaky on this project's Supabase gateway —
      // signed-in users were getting misread as anonymous and punted
      // to /auth. Also wait briefly for hydration in case the client
      // hasn't finished loading the stored session on cold-load.
      const resolved = await waitForSessionHydration();
      if (cancelled) return;
      if (!resolved) {
        // Genuinely signed out (different browser between pay and
        // return, in-app browser hand-off, cleared storage). The user
        // just paid €1 — don't dump them on a bare /auth page. Preserve
        // the session_id so they can sign in and land back here, and
        // show an inline CTA explaining what to do. The Stripe webhook
        // will still correlate the payment to their row by email on
        // the next poll once they sign in.
        if (sessionId) {
          try { localStorage.setItem('vano_ai_find_return_session_id', sessionId); } catch { /* ignore */ }
        }
        setSignedOutPaid(true);
        return;
      }
      const { data } = await supabase
        .from('ai_find_requests')
        .select('id')
        .eq('requester_id', resolved.userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data?.id) {
        go(data.id);
        return;
      }
      // User has no ai_find_requests row at all — they shouldn't be on
      // this URL. Send them home.
      navigate('/hire', { replace: true });
    };

    if (!sessionId) {
      void fallbackToLatest();
      return;
    }

    const tick = async () => {
      if (cancelled) return;
      const { data } = await supabase
        .from('ai_find_requests')
        .select('id')
        .eq('stripe_session_id', sessionId)
        .maybeSingle();
      if (cancelled) return;
      if (data?.id) {
        go(data.id);
        return;
      }
      if (Date.now() - start > POLL_MAX_MS) {
        void fallbackToLatest();
        return;
      }
      pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    // Recover if the user signs in while we're on this page (rare,
    // but happens when they open /auth in another tab and come back).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user?.id) return;
      // Just re-run the lookup — there's no race with the polling
      // loop because we short-circuit on cancelled.
      void (async () => {
        const { data } = await supabase
          .from('ai_find_requests')
          .select('id')
          .eq('requester_id', session.user!.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (data?.id) go(data.id);
      })();
    });

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      subscription.unsubscribe();
    };
  }, [navigate, params]);

  if (signedOutPaid) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mail className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Payment received — sign in to see your match</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We got your €1. Sign in with the same email you used at checkout and
            we'll show you your freelancer straight away.
          </p>
          <button
            type="button"
            onClick={() => navigate('/auth')}
            className="mt-5 w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110 active:scale-[0.98]"
          >
            Sign in to see your match
          </button>
          <p className="mt-3 text-[11px] text-muted-foreground">
            We'll also email you the freelancer's details as soon as the match lands.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Finishing up your payment…</p>
      </div>
    </div>
  );
}
