import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Sparkles, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuthContext';
import { useToast } from '@/hooks/use-toast';
import { SEOHead } from '@/components/SEOHead';
import { rememberPendingClaimToken, clearPendingClaimToken } from '@/lib/authSession';
import logo from '@/assets/logo.png';

// Landing page for the one-time claim link we send to scouted freelancers.
// Preview data is fetched via a SECURITY DEFINER RPC so the visitor sees
// who they've been matched to before signing in. The actual claim (which
// writes to profiles + student_profiles) requires an authed session, so
// unauthenticated visitors are bounced through /auth with the token
// stashed in sessionStorage; resolvePostAuthDestination routes them back
// here.

type ScoutPreview = {
  name: string;
  avatar_url: string | null;
  bio: string | null;
  skills: string[] | null;
  location: string | null;
  portfolio_url: string | null;
  source_platform: string;
  brief_snapshot: string | null;
  claimed: boolean;
  expired: boolean;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'invalid_token' }
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'already_claimed_other' }
  | { kind: 'ready'; scout: ScoutPreview };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The two RPCs below aren't in the generated supabase types yet (this is
// their introducing migration). Casting through this minimal shape keeps
// the call sites typed without widening the whole client to any.
type RpcFn = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const ClaimProfile = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [claiming, setClaiming] = useState(false);

  const tokenValid = useMemo(() => !!token && UUID_RE.test(token), [token]);

  useEffect(() => {
    if (!token) return;
    if (!tokenValid) {
      setState({ kind: 'invalid_token' });
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase.rpc as unknown as RpcFn)(
        'get_scouted_freelancer_by_token',
        { p_token: token },
      );
      if (cancelled) return;
      if (error) {
        setState({ kind: 'not_found' });
        return;
      }

      // Supabase returns an array for RETURNS TABLE functions.
      const row = (Array.isArray(data) ? data[0] : data) as ScoutPreview | null | undefined;
      if (!row) {
        setState({ kind: 'not_found' });
        return;
      }
      if (row.expired) {
        setState({ kind: 'expired' });
        return;
      }
      // Surface "already claimed" only when it wasn't *this* user — the
      // claim RPC below handles the same-user idempotent case cleanly.
      if (row.claimed && !session) {
        setState({ kind: 'already_claimed_other' });
        return;
      }
      setState({ kind: 'ready', scout: row });
    })();

    return () => { cancelled = true; };
  }, [token, tokenValid, session]);

  const handleSignInToClaim = () => {
    if (!token) return;
    rememberPendingClaimToken(token);
    navigate('/auth');
  };

  const handleClaim = async () => {
    if (!token || claiming) return;
    setClaiming(true);
    try {
      const { data, error } = await (supabase.rpc as unknown as RpcFn)(
        'claim_scouted_freelancer',
        { p_token: token },
      );
      if (error) throw error;

      const result = data as { ok: boolean; error?: string; already_claimed?: boolean } | null;
      if (!result?.ok) {
        const code = result?.error ?? 'unknown';
        const msg =
          code === 'business_account'
            ? 'This link is for freelancers. Sign out of the business account and try again.'
          : code === 'expired'
            ? 'This claim link has expired.'
          : code === 'already_claimed'
            ? 'This link has already been claimed by another account.'
          : 'Something went wrong. Please try again.';
        toast({ title: "Couldn't claim profile", description: msg, variant: 'destructive' });
        return;
      }

      clearPendingClaimToken();
      toast({
        title: 'Profile claimed!',
        description: "Finish your listing, then enable Vano Pay so clients can pay you safely.",
      });
      // Send them straight into the listing wizard — student_profiles has
      // already been seeded with the scouted bio/skills/phone, so fields
      // will appear pre-filled.
      navigate('/list-on-community', { replace: true });
    } catch (err) {
      toast({
        title: "Couldn't claim profile",
        description: 'Network error. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setClaiming(false);
    }
  };

  return (
    <>
      <SEOHead title="Claim your Vano profile" description="A client wanted to hire you — claim your free Vano profile in one minute." />
      <div className="min-h-[100dvh] bg-background px-4 py-10 sm:py-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center justify-center">
            <img src={logo} alt="Vano" className="h-10 w-auto" />
          </div>

          {state.kind === 'loading' || authLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Loading your match...</p>
            </div>
          ) : state.kind === 'invalid_token' || state.kind === 'not_found' ? (
            <ErrorCard
              title="Link not found"
              body="This claim link doesn't look right. Double-check the URL in the message we sent you, or sign up directly and we'll match you with new briefs."
              actionLabel="Sign up to Vano"
              onAction={() => navigate('/auth?mode=signup')}
            />
          ) : state.kind === 'expired' ? (
            <ErrorCard
              title="Link expired"
              body="This claim link has expired. Sign up directly — we'll re-match you with new briefs and keep you in the pool."
              actionLabel="Sign up to Vano"
              onAction={() => navigate('/auth?mode=signup')}
            />
          ) : state.kind === 'already_claimed_other' ? (
            <ErrorCard
              title="Already claimed"
              body="Looks like this profile has already been claimed. If that wasn't you, sign in to the account you used — or reach support."
              actionLabel="Sign in"
              onAction={() => navigate('/auth')}
            />
          ) : (
            <ReadyCard
              scout={state.scout}
              hasSession={!!session}
              claiming={claiming}
              onSignIn={handleSignInToClaim}
              onClaim={handleClaim}
            />
          )}
        </div>
      </div>
    </>
  );
};

const ErrorCard = ({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <div className="rounded-[20px] border border-border/70 bg-card p-7 text-center shadow-[0_18px_44px_-24px_rgba(0,0,0,0.18)]">
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <AlertCircle className="h-5 w-5" />
    </div>
    <h1 className="text-[18px] font-semibold leading-tight tracking-tight text-foreground">{title}</h1>
    <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
    {actionLabel && onAction ? (
      <button
        type="button"
        onClick={onAction}
        className="mt-6 w-full rounded-2xl bg-primary px-4 py-3.5 text-[14px] font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.5)] transition-all duration-150 hover:-translate-y-[1px] hover:brightness-[1.05] active:translate-y-0 active:scale-[0.99]"
      >
        {actionLabel}
      </button>
    ) : null}
  </div>
);

const ReadyCard = ({
  scout,
  hasSession,
  claiming,
  onSignIn,
  onClaim,
}: {
  scout: ScoutPreview;
  hasSession: boolean;
  claiming: boolean;
  onSignIn: () => void;
  onClaim: () => void;
}) => (
  <div className="overflow-hidden rounded-[20px] border border-primary/30 bg-card shadow-[0_18px_44px_-22px_hsl(var(--primary)/0.45)]">
    <div className="relative overflow-hidden bg-gradient-to-b from-primary to-primary/90 px-6 py-6 text-primary-foreground">
      <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-amber-300/15 blur-3xl" />
      <div className="relative inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">
        <Sparkles className="h-3 w-3 text-amber-200" />
        You've been scouted
      </div>
      <h1 className="relative mt-3 text-[22px] font-semibold leading-[1.15] tracking-tight">
        A client wanted to hire you.
      </h1>
      <p className="relative mt-2 text-[13px] leading-relaxed text-white/80 max-w-[34ch]">
        Claim your free Vano profile to reply. Get paid safely through <span className="font-semibold text-white">Vano Pay</span> — clients tap, money lands in your bank in 1–2 days (3% fee).
      </p>
    </div>

    <div className="space-y-4 p-5">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-background px-4 py-3">
        {scout.avatar_url ? (
          <img
            src={scout.avatar_url}
            alt=""
            className="h-11 w-11 flex-shrink-0 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
            {scout.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{scout.name}</p>
          {scout.location ? (
            <p className="truncate text-xs text-muted-foreground">{scout.location}</p>
          ) : null}
          {scout.portfolio_url ? (
            <a
              href={scout.portfolio_url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View your portfolio <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </div>

      {scout.skills && scout.skills.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {scout.skills.slice(0, 6).map((s) => (
            <span
              key={s}
              className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-foreground"
            >
              {s}
            </span>
          ))}
        </div>
      ) : null}

      {scout.brief_snapshot ? (
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">The request</p>
          <p className="mt-1 text-sm text-foreground line-clamp-4">{scout.brief_snapshot}</p>
        </div>
      ) : null}

      {hasSession ? (
        <button
          type="button"
          onClick={onClaim}
          disabled={claiming}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 text-[15px] font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.5)] transition-all duration-150 hover:-translate-y-[1px] hover:brightness-[1.05] active:translate-y-0 active:scale-[0.99] disabled:translate-y-0 disabled:opacity-60"
        >
          {claiming ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Claiming…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" /> Claim my profile
            </>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={onSignIn}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 text-[15px] font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.5)] transition-all duration-150 hover:-translate-y-[1px] hover:brightness-[1.05] active:translate-y-0 active:scale-[0.99]"
        >
          Sign in to claim
        </button>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        Takes about 60 seconds. You can edit or delete your profile anytime.
      </p>
    </div>
  </div>
);

export default ClaimProfile;
