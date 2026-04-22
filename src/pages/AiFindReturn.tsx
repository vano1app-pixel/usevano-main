import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// Stripe Payment Link return handler.
//
// Design decision: we do NOT depend on the stripe-webhook having fired
// or having stamped stripe_session_id on the row. In production the
// webhook sometimes returns 200 without actually mutating the row
// (root cause still being investigated), leaving paid users stranded
// on this page with no row ever flipping to paid. So this page now
// routes off of two signals that we control end-to-end:
//
//   1. localStorage.vano_ai_find_pending_id — set by /hire before the
//      Stripe redirect. Same origin same browser → present 99% of the
//      time. When it's there we route instantly.
//   2. The user's most recent ai_find_request row (requester_id =
//      auth.uid(), any status). RLS gates this correctly. Once the
//      session hydrates we always have a row to route to, because
//      /hire inserted one before the redirect.
//
// /ai-find/:id then handles the rest: the sessionStorage trust token
// we stamp below tells it the user genuinely came via Stripe, so the
// client-side match self-heal can run and flip the row to complete
// with a freelancer pick — no webhook required in the hot path.

// Poll getSession locally for up to this many ms before concluding
// the user is signed out. Supabase v2 hydrates the persisted session
// async on cold load; 3s wasn't always enough on slower devices and
// the "signed out" card was firing prematurely. 10s covers the long
// tail without feeling like a stall since we show a loading spinner
// throughout.
const AUTH_WAIT_MS = 10_000;
const AUTH_POLL_INTERVAL_MS = 300;

type Resolved = { userId: string } | null;

async function readSession(): Promise<Resolved> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ? { userId: session.user.id } : null;
}

export default function AiFindReturn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [signedOutPaid, setSignedOutPaid] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const go = (id: string) => {
      try { localStorage.removeItem('vano_ai_find_pending_id'); } catch { /* ignore */ }
      // Trust token so /ai-find/:id can run its self-heal match even
      // while the row is still in awaiting_payment. Only set when we
      // arrived via Stripe's redirect (session_id in URL) — prevents a
      // casual bypass where a hirer creates a row, skips payment, and
      // navigates straight to /ai-find/:id for a free match.
      const sessionId = params.get('session_id');
      if (sessionId) {
        try { sessionStorage.setItem(`vano_ai_find_paid_${id}`, sessionId); } catch { /* ignore */ }
      }
      navigate(`/ai-find/${id}`, { replace: true });
    };

    // Path 1 — localStorage hand-off, the happy path. Same browser,
    // same origin, localStorage persists across the Stripe round-trip.
    try {
      const stored = localStorage.getItem('vano_ai_find_pending_id');
      if (stored) {
        go(stored);
        return;
      }
    } catch { /* private mode — fall through */ }

    // Path 2 — wait for the Supabase session to hydrate, then look up
    // the user's most recent ai_find_request and route to it. This
    // does NOT depend on the webhook having fired. We poll getSession
    // (local read from localStorage) and also subscribe to
    // onAuthStateChange so we pick up sign-in events as they happen.
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
      // Edge case: signed-in user with no row at all — shouldn't
      // normally be on this URL. Send them to /hire so they can start.
      navigate('/hire', { replace: true });
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
        // Genuinely signed out after 10s — different browser, in-app
        // browser hand-off, cleared storage, etc. Stash the session_id
        // so resolvePostAuthDestination can bring them back here once
        // they sign in, and show an inline recovery card.
        const sessionId = params.get('session_id');
        if (sessionId) {
          try { localStorage.setItem('vano_ai_find_return_session_id', sessionId); } catch { /* ignore */ }
        }
        setSignedOutPaid(true);
        return;
      }
      pollTimer = setTimeout(tick, AUTH_POLL_INTERVAL_MS);
    };
    void tick();

    // Also catch sign-in events in real time — faster than polling if
    // the user had just signed in in another tab while this page
    // loaded. Supabase broadcasts sessions across tabs.
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
