import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Clock, LogIn } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { microCelebrate } from '@/lib/celebrate';
import logo from '@/assets/logo.png';

// Public landing page for the one-tap accept link (see supabase/functions/accept-job).
// That edge function used to return its own inline HTML page, but some in-app
// browsers / webviews ignore the text/html content-type and render the markup as
// raw source. accept-job now 302-redirects here instead — a redirect into the SPA
// renders reliably everywhere, and this route is public so a helper who tapped
// from WhatsApp/SMS still gets a proper confirmation without logging in first.

type Status = 'claimed' | 'mine' | 'taken' | 'expired' | 'notfound' | 'login';

interface View {
  title: string;
  body: (cat: string, city: string) => string;
  cta: { label: string; to: (job: string) => string };
  tone: 'success' | 'neutral' | 'warning';
  icon: typeof CheckCircle2;
}

const VIEWS: Record<Status, View> = {
  claimed: {
    title: "You've got the job! 🎉",
    body: (cat, city) => `You've claimed the ${cat}${city ? ` in ${city}` : ''}. We've let the customer know — open the app for the address and details.`,
    cta: { label: 'Open the job', to: (job) => `/student-job/${job}` },
    tone: 'success',
    icon: CheckCircle2,
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

  const status = (params.get('status') as Status) ?? 'claimed';
  const view = VIEWS[status] ?? VIEWS.claimed;
  const job = params.get('job') ?? '';
  const cat = params.get('cat') || 'job';
  const city = params.get('city') || '';
  const tone = TONE[view.tone];
  const Icon = view.icon;

  useEffect(() => {
    if (status === 'claimed') microCelebrate();
  }, [status]);

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
        className={`w-full max-w-sm rounded-2xl border p-6 text-center ${tone.ring}`}
      >
        <span className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${tone.badge}`}>
          <Icon size={24} strokeWidth={2} />
        </span>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{view.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{view.body(cat, city)}</p>

        <button
          type="button"
          onClick={() => navigate(view.cta.to(job))}
          className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors ${tone.btn}`}
        >
          {view.cta.label} →
        </button>
      </motion.div>
    </div>
  );
};

export default JobAccepted;
