import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Clock, LogIn, Loader2 } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { microCelebrate } from '@/lib/celebrate';
import { getSupabaseUrl } from '@/lib/supabaseEnv';
import logo from '@/assets/logo.png';

// Public landing page for the one-tap accept link (see supabase/functions/accept-job).
// That edge function used to return its own inline HTML page, but some in-app
// browsers / webviews ignore the text/html content-type and render the markup as
// raw source. accept-job now 302-redirects here instead — a redirect into the SPA
// renders reliably everywhere, and this route is public so a helper who tapped
// from WhatsApp/SMS still gets a proper confirmation without logging in first.
//
// 'confirm' is the bot-gate hop (see accept-job's header): a bare GET on the
// accept link no longer claims — it lands here, and THIS page immediately
// re-navigates to the function with &go=1, which does the real claim. Link
// previewers and mail scanners don't execute JS, so they stop at this page
// and can never claim a job out from under the helper. Full navigation (not
// fetch) on purpose: the function answers with redirects + a magic-link
// sign-in chain the browser must follow.

type Status = 'claimed' | 'mine' | 'taken' | 'expired' | 'notfound' | 'login' | 'confirm';

interface View {
  title: string;
  body: (cat: string, city: string) => string;
  cta: { label: string; to: (job: string) => string };
  tone: 'success' | 'neutral' | 'warning';
  icon: typeof CheckCircle2;
  /** Shown as a numbered "what happens next" list — first-time helpers land
   *  here straight from an SMS with zero context, so spell the flow out. */
  steps?: string[];
}

// 'confirm' renders its own dedicated block (spinner + manual fallback), not
// a VIEWS entry — it's a hop, not a result.
const VIEWS: Record<Exclude<Status, 'confirm'>, View> = {
  claimed: {
    title: "You've got the job! 🎉",
    body: (cat, city) => `The ${cat}${city ? ` in ${city}` : ''} is yours — we've told the customer.`,
    cta: { label: 'Open the job', to: (job) => `/student-job/${job}` },
    tone: 'success',
    icon: CheckCircle2,
    steps: [
      'Open the job — the address and details are inside',
      'Tap “On my way” when you head out, so the customer can see you coming',
      'At the door, the customer gives you a 4-digit code to start',
    ],
  },
  mine: {
    title: "This one's already yours ✅",
    body: (cat, city) => `The ${cat}${city ? ` in ${city}` : ''} is assigned to you.`,
    cta: { label: 'Open the job', to: (job) => `/student-job/${job}` },
    tone: 'success',
    icon: CheckCircle2,
  },
  taken: {
    title: 'Already taken',
    body: (cat) => `Sorry — another helper grabbed this ${cat} first. There are usually more jobs waiting.`,
    cta: { label: 'See open jobs', to: () => '/student-dashboard' },
    tone: 'neutral',
    icon: AlertTriangle,
  },
  expired: {
    title: 'Link expired',
    body: () => 'This accept link has expired or is invalid. Open the app to see jobs that are still available.',
    cta: { label: 'See open jobs', to: () => '/student-dashboard' },
    tone: 'neutral',
    icon: Clock,
  },
  notfound: {
    title: 'Job not found',
    body: () => "We couldn't find this job — it may have been removed.",
    cta: { label: 'See open jobs', to: () => '/student-dashboard' },
    tone: 'neutral',
    icon: AlertTriangle,
  },
  login: {
    title: 'Almost there',
    body: (cat) => `Log in to grab this ${cat} — it's still open.`,
    cta: { label: 'Open & accept', to: (job) => `/student-job/${job}` },
    tone: 'warning',
    icon: LogIn,
  },
};

const TONE = {
  success: { ring: 'border-sage/30 bg-sage-light', badge: 'bg-sage text-white', btn: 'bg-sage text-white hover:bg-sage-dark' },
  neutral: { ring: 'border-border/60 bg-secondary/30', badge: 'bg-muted text-muted-foreground', btn: 'bg-primary text-primary-foreground hover:bg-primary/90' },
  warning: { ring: 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20', badge: 'bg-amber-500 text-white', btn: 'bg-primary text-primary-foreground hover:bg-primary/90' },
} as const;

const JobAccepted = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // A missing/unknown status must NEVER fall back to 'claimed' — an SMS client
  // that truncates the query string (or a future status the SPA doesn't know)
  // would otherwise show "You've got the job! 🎉" + confetti for a job the
  // helper never claimed, and route to /student-job/ (empty → 404). Default to
  // the neutral 'expired' view, which points at the dashboard. 'confirm'
  // without its token is equally dead — same fallback.
  const rawStatus = params.get('status');
  const token = params.get('t') ?? '';
  let status: Status = rawStatus && (rawStatus in VIEWS || rawStatus === 'confirm') ? (rawStatus as Status) : 'expired';
  if (status === 'confirm' && !token) status = 'expired';
  const job = params.get('job') ?? '';
  const cat = params.get('cat') || 'job';
  const city = params.get('city') || '';
  const claimUrl = status === 'confirm'
    ? `${getSupabaseUrl()}/functions/v1/accept-job?t=${encodeURIComponent(token)}&go=1`
    : null;

  useEffect(() => {
    if (status === 'claimed') microCelebrate();
  }, [status]);

  // The bot-gate hop: continue to the real claim the instant we're mounted.
  // replace() keeps this interstitial out of history, so Back never re-lands
  // on a page whose only job is to navigate away.
  useEffect(() => {
    if (claimUrl) window.location.replace(claimUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'confirm' && claimUrl) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4">
        <SEOHead title="Claiming job · VANO" description="Claiming your VANO job." noindex />
        <div className="flex items-center gap-2">
          <img src={logo} alt="VANO" className="h-9 w-9 rounded-xl" />
          <span className="text-2xl font-bold tracking-tight text-primary">VANO</span>
        </div>
        <div className="surface-float w-full max-w-sm rounded-2xl border border-sage/30 bg-sage-light p-6 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sage text-white">
            <Loader2 size={24} strokeWidth={2} className="animate-spin" />
          </span>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Claiming this {cat} for you…</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            One second — first tap wins the job.
          </p>
          {/* Belt-and-braces: if the auto-continue is ever blocked, the same
              claim is one manual tap away. */}
          <a
            href={claimUrl}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-sage px-6 py-3 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-sage-dark active:scale-[0.97]"
          >
            Accept this job →
          </a>
        </div>
      </div>
    );
  }

  const view = VIEWS[status as Exclude<Status, 'confirm'>];
  const tone = TONE[view.tone];
  const Icon = view.icon;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4">
      <SEOHead title="Job accepted · VANO" description="Your VANO job claim." noindex />

      <div className="flex items-center gap-2">
        <img src={logo} alt="VANO" className="h-9 w-9 rounded-xl" />
        <span className="text-2xl font-bold tracking-tight text-primary">VANO</span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={`surface-float w-full max-w-sm rounded-2xl border bg-white p-6 text-center ${tone.ring}`}
      >
        <span className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${tone.badge}`}>
          <Icon size={24} strokeWidth={2} />
        </span>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{view.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{view.body(cat, city)}</p>

        {view.steps && (
          <ol className="mt-5 space-y-2.5 rounded-xl bg-white/60 border border-sage/20 p-4 text-left">
            {view.steps.map((s, i) => (
              <li key={s} className="flex items-start gap-2.5">
                <span className="mt-px flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-sage text-[11px] font-bold text-white tabular-nums">
                  {i + 1}
                </span>
                <span className="text-[13px] leading-relaxed text-foreground/80">{s}</span>
              </li>
            ))}
          </ol>
        )}

        <button
          type="button"
          onClick={() => navigate(view.cta.to(job))}
          className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-[background-color,transform] duration-150 active:scale-[0.97] ${tone.btn}`}
        >
          {view.cta.label} →
        </button>
      </motion.div>
    </div>
  );
};

export default JobAccepted;
