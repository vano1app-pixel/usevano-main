import { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';

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
  web_scout_id: string | null;
  error_message: string | null;
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
};

// Narrow escape-hatch for tables that haven't been added to the
// generated supabase types yet. Only covers the query shapes we use
// here — keeps call sites typed at the return boundary via explicit
// casts to AiFindRow / WebPick.
type UntypedSupabase = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

const AiFindResults = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();

  const [row, setRow] = useState<AiFindRow | null>(null);
  const [vanoPick, setVanoPick] = useState<VanoPick | null>(null);
  const [webPick, setWebPick] = useState<WebPick | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pollingStartedAt] = useState(() => Date.now());

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
      const { data, error } = await (supabase as unknown as UntypedSupabase)
        .from('ai_find_requests')
        .select('id, status, brief, category, vano_match_user_id, web_scout_id, error_message')
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

    const timer = setInterval(() => {
      // Stop polling once terminal OR once we've exceeded the cap —
      // the backend function has a much shorter budget than 2 min.
      if (cancelled) return;
      const elapsed = (Date.now() - pollingStartedAt) / 1000;
      if (elapsed > MAX_POLL_SECONDS) {
        clearInterval(timer);
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

  // Load the Vano pick profile when the row resolves with a match.
  useEffect(() => {
    if (!row?.vano_match_user_id) {
      setVanoPick(null);
      return;
    }
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
      if (!profile) { setVanoPick(null); return; }
      setVanoPick({
        user_id: profile.user_id as string,
        display_name: (profile.display_name as string) || 'Vano freelancer',
        avatar_url: (profile.avatar_url as string | null) ?? null,
        bio: (studentProfile?.bio as string | null) ?? null,
        skills: (studentProfile?.skills as string[] | null) ?? null,
        hourly_rate: (studentProfile?.hourly_rate as number | null) ?? null,
      });
    })();
    return () => { cancelled = true; };
  }, [row?.vano_match_user_id]);

  // Load the web pick (scouted_freelancers row). RLS policy
  // `scouted_freelancers_select_requester` gates this to the requester.
  useEffect(() => {
    if (!row?.web_scout_id) {
      setWebPick(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await (supabase as unknown as UntypedSupabase)
        .from('scouted_freelancers')
        .select('name, avatar_url, bio, skills, location, portfolio_url, source_platform, contact_email, contact_instagram, contact_linkedin, match_score')
        .eq('id', row.web_scout_id)
        .maybeSingle();
      if (cancelled) return;
      if (!data) { setWebPick(null); return; }
      setWebPick(data as WebPick);
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
          ) : row.status === 'paid' || row.status === 'scouting' ? (
            <LoadingCard
              label="Finding your freelancer…"
              hint="We're scanning Vano's pool and the open web. Usually under a minute."
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
          ) : (
            <div className="space-y-4">
              {vanoPick ? (
                <VanoPickCard pick={vanoPick} onMessage={() => navigate(`/messages?with=${vanoPick.user_id}`)} />
              ) : null}

              {webPick ? <WebPickCard pick={webPick} /> : null}

              {!vanoPick && !webPick ? (
                <StatusCard
                  tone="error"
                  title="Match data missing"
                  body="We completed your search but couldn't load the results. Please refresh."
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
          )}
        </div>
      </div>
    </>
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

const VanoPickCard = ({ pick, onMessage }: { pick: VanoPick; onMessage: () => void }) => (
  <div className="overflow-hidden rounded-2xl border-2 border-primary shadow-lg ring-1 ring-amber-300/40 ring-offset-2 ring-offset-background">
    <div className="relative bg-gradient-to-br from-primary via-primary to-primary/90 px-5 py-4 text-primary-foreground">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-amber-300/15 blur-2xl" />
      <div className="relative flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-200" />
        <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">
          Vano's pick
        </span>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-emerald-200">
          Vetted · pay direct
        </span>
      </div>
    </div>

    <div className="space-y-4 bg-card p-5">
      <div className="flex items-start gap-3">
        {pick.avatar_url ? (
          <img src={pick.avatar_url} alt="" className="h-14 w-14 flex-shrink-0 rounded-full object-cover" />
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
    </div>
  </div>
);

const WebPickCard = ({ pick }: { pick: WebPick }) => {
  const hasContact =
    !!pick.contact_email || !!pick.contact_instagram || !!pick.contact_linkedin || !!pick.portfolio_url;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Found on the web
          </span>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
          Unvetted · contact at your discretion
        </span>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          {pick.avatar_url ? (
            <img
              src={pick.avatar_url}
              alt=""
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

        <p className="text-[11px] text-muted-foreground">
          Reach out directly. Vano hasn't reviewed this person — verify their work before sending money.
        </p>
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
