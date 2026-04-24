import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface MatchRow {
  id: string;
  brief: string;
  vano_match_user_id: string;
  created_at: string;
}

interface ProfileLite {
  name: string;
  avatar?: string;
}

interface PreviousMatchesPanelProps {
  userId: string;
}

/**
 * Renders the user's previous Vano-picked matches at the bottom of /hire
 * so a business that paid €1, got a freelancer, then navigated away can
 * still find their match. Each row routes back to /ai-find/:id which is
 * the existing results page (Message + freelancer details). Hidden if
 * the user is signed-out or has no prior matches; rendered as null on
 * any error so it never adds to the existing "something went wrong"
 * surface area at the bottom of HirePage.
 */
export function PreviousMatchesPanel({ userId }: PreviousMatchesPanelProps) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('ai_find_requests')
          .select('id, brief, vano_match_user_id, created_at')
          .eq('requester_id', userId)
          .in('status', ['paid', 'complete'])
          .not('vano_match_user_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(5);
        if (cancelled) return;
        if (error || !data) {
          setRows([]);
          return;
        }
        const matches = data.filter((r): r is MatchRow => !!r.vano_match_user_id);
        setRows(matches);

        const ids = Array.from(new Set(matches.map((m) => m.vano_match_user_id)));
        if (ids.length === 0) return;
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', ids);
        if (cancelled) return;
        const map: Record<string, ProfileLite> = {};
        (profs ?? []).forEach((p) => {
          map[p.user_id] = {
            name: p.display_name || 'A freelancer',
            avatar: p.avatar_url || undefined,
          };
        });
        setProfiles(map);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (rows === null || rows.length === 0) return null;

  return (
    <div className="mt-8 rounded-2xl border border-foreground/10 bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={15} className="text-primary" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Your previous matches
        </p>
      </div>
      <p className="mb-4 text-[13px] leading-snug text-muted-foreground">
        Pick up where you left off — Vano already found these freelancers for you.
      </p>
      <div className="space-y-2">
        {rows.map((row) => {
          const prof = profiles[row.vano_match_user_id];
          const name = prof?.name || 'Your match';
          const initial = name[0]?.toUpperCase() || '?';
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => navigate(`/ai-find/${row.id}`)}
              className="group flex w-full items-center gap-3 rounded-xl border border-foreground/10 bg-background p-3 text-left transition-all hover:-translate-y-[1px] hover:border-primary/30 hover:shadow-md active:scale-[0.99]"
            >
              {prof?.avatar ? (
                <img
                  src={prof.avatar}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                  className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-card"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary ring-2 ring-card">
                  {initial}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-foreground">{name}</p>
                {row.brief && (
                  <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                    For: {row.brief}
                  </p>
                )}
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-primary">
                Reconnect
                <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
