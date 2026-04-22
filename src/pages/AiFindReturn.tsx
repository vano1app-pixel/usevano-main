import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// Stripe Payment Link return handler.
//
// Payment Links can only template {CHECKOUT_SESSION_ID} into their
// success URL — they can't inject arbitrary path segments. So our
// success URL is just this page, and the request id lives in
// localStorage (written by /hire before the redirect) OR, as a
// belt-and-braces fallback, is looked up by stripe_session_id once
// the webhook has stamped it on the row.
//
// Flow:
//   1. Read pending id from localStorage → redirect to /ai-find/:id.
//   2. If missing (private-mode Safari, user switched browsers),
//      pull session_id from URL and poll ai_find_requests until
//      stripe_session_id matches (webhook landed). Then redirect.
//   3. Bail to /hire after a short grace period if neither surfaces —
//      the user can re-kick the flow from there.

const FALLBACK_POLL_INTERVAL_MS = 1500;
const FALLBACK_POLL_MAX_MS = 20_000;

export default function AiFindReturn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const go = (id: string) => {
      try { localStorage.removeItem('vano_ai_find_pending_id'); } catch { /* ignore */ }
      navigate(`/ai-find/${id}`, { replace: true });
    };

    // Path 1 — localStorage hand-off.
    try {
      const stored = localStorage.getItem('vano_ai_find_pending_id');
      if (stored) {
        go(stored);
        return;
      }
    } catch { /* private mode — fall through to path 2 */ }

    // Path 2 — poll by session_id. The webhook updates
    // stripe_session_id on the row the moment it handles the event,
    // so once it lands we can find the row even without localStorage.
    const sessionId = params.get('session_id');
    if (!sessionId) {
      navigate('/hire', { replace: true });
      return;
    }

    const start = Date.now();
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
      if (Date.now() - start > FALLBACK_POLL_MAX_MS) {
        navigate('/hire', { replace: true });
        return;
      }
      pollTimer = setTimeout(tick, FALLBACK_POLL_INTERVAL_MS);
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
