import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { HELPER_CATEGORY_LABELS } from '@/lib/helperCategories';
import { Loader2, RefreshCw, Zap } from 'lucide-react';

// "Jobs open right now" (2026-07-30) — the missed-the-ping recovery board.
// Dispatch texts a job once per round; a helper who missed the ping used to
// have no way back to it. This board (mounted on /student-account behind the
// phone gate) lists what's open this minute, and the Claim button is the
// SAME signed one-tap accept link dispatch sends — so the claim rides the
// whole hardened accept-job path (bot gate, claim-time re-checks, atomic
// race, silent sign-in, notify + back-to-back nudge) with zero new claim
// logic. Helpers who aren't ID-verified yet see the jobs but get the verify
// CTA instead of Claim — "€36 open right now" is the best verify nudge
// there is.

interface OpenJob {
  id: string;
  category: string | null;
  /** Neighbourhood label from the server — never the exact address. */
  area: string | null;
  size_label: string | null;
  extra_label: string | null;
  earn_cents: number | null;
  created_at: string;
  scheduled_at: string | null;
  customer_rep: { paid_jobs?: number; unpaid_reports?: number; stars?: number } | null;
  accept_url?: string;
}

interface Props {
  helperId: string;
  /** The live phone-gate token (account or device) — claim links need it. */
  accountToken: string;
  idVerified: boolean;
  onVerify: () => void;
}

function agoLabel(iso: string): string {
  const min = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 60) return `${min || 1} min ago`;
  return `${Math.round(min / 60)} h ago`;
}

function whenLabel(j: OpenJob): string {
  if (!j.scheduled_at) return 'ASAP';
  const t = Date.parse(j.scheduled_at);
  if (!Number.isFinite(t)) return 'ASAP';
  return new Date(t).toLocaleTimeString('en-IE', { hour: 'numeric', minute: '2-digit' });
}

export function OpenJobsBoard({ helperId, accountToken, idVerified, onVerify }: Props) {
  const [jobs, setJobs] = useState<OpenJob[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const { data, error } = await supabase.functions.invoke('open-jobs', {
        body: { helper_id: helperId, account_token: accountToken },
      });
      if (error || !data) throw new Error('open-jobs failed');
      setJobs(((data as { jobs?: OpenJob[] }).jobs ?? []));
    } catch {
      // Quietly degraded — the board is a bonus surface, never a blocker.
      setFailed(true);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [helperId, accountToken]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
          <Zap size={15} className="text-gold" aria-hidden="true" />
          Jobs open right now
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh open jobs"
          className="p-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </div>

      {loading && jobs === null && (
        <div className="rounded-2xl border border-border bg-white px-4 py-5 text-center text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin inline-block mr-2 align-[-3px]" />
          Checking the board…
        </div>
      )}

      {!loading && jobs !== null && jobs.length === 0 && (
        <div className="rounded-2xl border border-border bg-white px-4 py-4 text-center">
          <p className="text-sm text-foreground/80">
            {failed ? 'Couldn’t load the board — pull to refresh in a minute.' : 'Nothing open this minute.'}
          </p>
          {!failed && (
            <p className="text-xs text-muted-foreground mt-1">
              New jobs land here the second they come in — you’ll still get the text too.
            </p>
          )}
        </div>
      )}

      {jobs !== null && jobs.length > 0 && (
        <ul className="space-y-2">
          {jobs.map((j) => {
            const label = (j.category && HELPER_CATEGORY_LABELS[j.category]) ?? j.extra_label ?? 'Job';
            const rep = j.customer_rep;
            const repLine = rep && (rep.paid_jobs ?? 0) > 0
              ? `Pays promptly · ${rep.paid_jobs} job${rep.paid_jobs === 1 ? '' : 's'}${rep.stars ? ` · ★${rep.stars}` : ''}`
              : null;
            return (
              <li key={j.id} className="rounded-2xl border border-border bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {label}{j.size_label ? ` · ${j.size_label}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {j.area ?? 'Galway area'} · {whenLabel(j)} · posted {agoLabel(j.created_at)}
                      {repLine ? <> · <span className="text-sage-dark font-medium">{repLine}</span></> : null}
                    </p>
                  </div>
                  {typeof j.earn_cents === 'number' && j.earn_cents > 0 && (
                    <span className="text-base font-extrabold text-foreground flex-shrink-0 tabular-nums">
                      €{(j.earn_cents / 100).toFixed(0)}
                    </span>
                  )}
                </div>
                {idVerified && j.accept_url ? (
                  <a
                    href={j.accept_url}
                    className="mt-2.5 flex h-10 items-center justify-center rounded-full bg-sage text-white text-sm font-semibold hover:bg-sage-dark active:scale-[0.98] transition-[background-color,transform]"
                  >
                    Claim it — first tap gets it
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={onVerify}
                    className={cn(
                      'mt-2.5 flex w-full h-10 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                      'border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100',
                    )}
                  >
                    Verify your ID (free, 2 min) to claim jobs like this
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default OpenJobsBoard;
