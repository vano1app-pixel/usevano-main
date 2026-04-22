import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
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
const POLL_MAX_MS = 8_000;

export default function AiFindReturn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Genuinely signed out — bounce to /auth so they can sign back
        // in; their row exists and will be findable on next visit.
        navigate('/auth', { replace: true });
        return;
      }
      const { data } = await supabase
        .from('ai_find_requests')
        .select('id')
        .eq('requester_id', user.id)
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

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [navigate, params]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Finishing up your payment…</p>
      </div>
    </div>
  );
}
