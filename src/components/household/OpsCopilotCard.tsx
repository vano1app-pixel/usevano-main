import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Loader2, Phone, RefreshCw, Sparkles } from 'lucide-react';

// The ops copilot panel (2026-07-30) — the admin dashboard's "what needs a
// human right now" list. Read-only mirror of the ops-copilot edge function:
// deterministic triage rules (_shared/opsTriage.ts) optionally ranked +
// phrased by Gemini, most urgent first. Every row carries the two actions an
// owner actually takes — open the booking, ring the person — so the distance
// from "saw it" to "fixed it" is one tap.

interface CopilotItem {
  booking_id: string;
  kind: string;
  severity: 'critical' | 'warn' | 'info';
  age_min: number;
  summary: string;
  action: string;
  category: string | null;
  city: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  helper_name: string | null;
  helper_phone: string | null;
}

interface CopilotResponse {
  items: CopilotItem[];
  brain: 'gemini' | 'rules';
  board: { live: number; recent_completed: number };
  generated_at: string;
}

const SEV_STYLES: Record<CopilotItem['severity'], string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  warn:     'bg-amber-100 text-amber-800 border-amber-200',
  info:     'bg-sky-100 text-sky-800 border-sky-200',
};

const waHref = (phone: string) => `https://wa.me/${phone.replace(/[^\d+]/g, '').replace(/^\+/, '')}`;

export function OpsCopilotCard() {
  const [items, setItems] = useState<CopilotItem[] | null>(null);
  const [brain, setBrain] = useState<'gemini' | 'rules'>('rules');
  const [board, setBoard] = useState<{ live: number; recent_completed: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('ops-copilot', { body: {} });
      if (fnErr || !data || (data as { error?: string }).error) {
        throw new Error((data as { error?: string } | null)?.error ?? 'Copilot unavailable');
      }
      const resp = data as CopilotResponse;
      setItems(resp.items ?? []);
      setBrain(resp.brain ?? 'rules');
      setBoard(resp.board ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Copilot unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
          <h2 className="text-sm font-bold text-foreground">Ops copilot — needs you now</h2>
          {/* Honest brain badge: which brain ranked this list. */}
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border border-border rounded-full px-2 py-0.5">
            {brain === 'gemini' ? 'AI ranked' : 'rules'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh copilot"
          className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>
      {board && (
        <p className="text-xs text-muted-foreground mb-3">
          Watching {board.live} live booking{board.live === 1 ? '' : 's'} + {board.recent_completed} recent completion{board.recent_completed === 1 ? '' : 's'}
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {!error && !loading && items && items.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          All clear — nothing on the board needs you.
        </div>
      )}

      {!error && items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li
              key={`${it.booking_id}-${it.kind}-${i}`}
              className={cn('rounded-xl border p-3', SEV_STYLES[it.severity] ?? SEV_STYLES.info)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-snug">{it.summary}</p>
                <span className="text-[10px] font-bold uppercase tracking-wide flex-shrink-0 opacity-70">
                  {it.severity}{it.age_min > 0 ? ` · ${it.age_min >= 90 ? `${Math.round(it.age_min / 60)}h` : `${it.age_min}m`}` : ''}
                </span>
              </div>
              <p className="text-xs mt-1 leading-relaxed opacity-90">→ {it.action}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <a
                  href={`/track/${it.booking_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-semibold underline underline-offset-2"
                >
                  Open booking
                </a>
                {it.customer_phone && (
                  <a href={waHref(it.customer_phone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold underline underline-offset-2">
                    <Phone className="w-3 h-3" /> Customer
                  </a>
                )}
                {it.helper_phone && (
                  <a href={waHref(it.helper_phone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold underline underline-offset-2">
                    <Phone className="w-3 h-3" /> Helper{it.helper_name ? ` (${it.helper_name.split(' ')[0]})` : ''}
                  </a>
                )}
                <span className="text-[10px] opacity-60 ml-auto">{it.kind}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default OpsCopilotCard;
