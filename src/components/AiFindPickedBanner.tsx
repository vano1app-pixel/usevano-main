import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, X } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';

/**
 * Freelancer-side "you got picked" banner.
 *
 * When AI Find picks a Vano freelancer (ai_find_requests.vano_match_user_id),
 * the freelancer currently gets no notification — the hirer messages them
 * through a regular thread and the "someone paid €1 to match with me
 * specifically" moment is lost. This banner surfaces that pick on the
 * freelancer's Profile page so they know to check Messages immediately,
 * even before the hirer sends a first message.
 *
 * Pure read query on existing data — no new tables, no new RLS work.
 * Access to ai_find_requests rows where the current user is the
 * vano_match_user_id is already RLS-allowed (same policy used by the
 * requester's /ai-find/:id poll).
 *
 * Auto-hides when:
 *  - No qualifying pick in the last 14 days (or ever)
 *  - Row is 'failed' / 'refunded' (hirer didn't end up paying)
 *  - The freelancer dismisses it (per-row, sessionStorage so it comes
 *    back on a different device — not enough state to warrant a DB column)
 */
const SEEN_KEY_PREFIX = 'vano_ai_find_pick_seen_';
const LOOKBACK_DAYS = 14;

type PickedRow = { id: string; created_at: string; brief: string };

export function AiFindPickedBanner({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [row, setRow] = useState<PickedRow | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const lookbackIso = new Date(
        Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      // ai_find_requests isn't in the generated supabase types yet — same
      // cast workaround AiFindResults.tsx uses. Runtime behaviour identical.
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, v: string) => {
              in: (col: string, v: string[]) => {
                gte: (col: string, v: string) => {
                  order: (c: string, opts: { ascending: boolean }) => {
                    limit: (n: number) => {
                      maybeSingle: () => Promise<{
                        data: { id: string; created_at: string; brief: string } | null;
                        error: unknown;
                      }>;
                    };
                  };
                };
              };
            };
          };
        };
      })
        .from('ai_find_requests')
        .select('id, created_at, brief')
        .eq('vano_match_user_id', userId)
        .in('status', ['paid', 'complete'])
        .gte('created_at', lookbackIso)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled || error || !data) return;
      try {
        if (sessionStorage.getItem(SEEN_KEY_PREFIX + data.id)) {
          // User already dismissed this pick in this session — don't thrash.
          return;
        }
      } catch {
        /* storage blocked; carry on */
      }
      setRow(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!row || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(SEEN_KEY_PREFIX + row.id, '1');
    } catch {
      /* storage blocked */
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-300/50 bg-gradient-to-br from-amber-100/60 via-amber-50/40 to-card p-4 shadow-sm dark:border-amber-400/30 dark:from-amber-900/20 dark:via-amber-900/10">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-amber-700/60 transition hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-300/60 dark:hover:text-amber-200"
      >
        <X size={13} />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/25 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
          <Sparkles size={18} strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
            You got picked
          </p>
          <h3 className="mt-0.5 text-[15px] font-semibold text-foreground leading-snug">
            A business paid €1 to match with you specifically.
          </h3>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground line-clamp-2">
            They&apos;re looking for: <span className="text-foreground">{row.brief}</span>
          </p>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            Respond within 24h to keep the lead. They&apos;ll message you in your inbox any moment.
          </p>
          <button
            type="button"
            onClick={() => navigate('/messages')}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-white shadow-sm transition hover:brightness-110 active:scale-[0.97]"
          >
            Open Messages
            <ArrowRight size={12} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
