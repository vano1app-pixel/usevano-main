import { Link } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { SEOHead } from '@/components/SEOHead';
import { APP_VERSION_LABEL } from '@/lib/appVersion';
import { ArrowLeft, Sparkles } from 'lucide-react';

const ITEMS = [
  {
    title: 'Smoother UI across the app',
    body: 'Cleaner layouts, tighter spacing, and more consistent screens so browsing gigs, profiles, and messages feels easier on phone and desktop.',
  },
  {
    title: 'Google sign-in',
    body: 'Sign up or log in with Google alongside email and password — faster onboarding for freelancers and businesses.',
  },
  {
    title: 'Community & verified student profiles',
    body: 'The talent boards highlight freelancers with verified college email; listings go through review before they appear publicly.',
  },
  {
    title: 'Better performance & faster loading',
    body: 'Leaner client updates, lazy-loaded images on key views, and a clearer update path so you stay on the latest version.',
  },
];

const WhatsNew = () => (
  <div className="min-h-[100dvh] bg-background pb-16 md:pb-0">
    <SEOHead
      title={`What's new – VANO ${APP_VERSION_LABEL}`}
      description="Smoother UI, Google sign-in, verified Community listings, and faster loading."
    />
    <Navbar />
    <div className="mx-auto max-w-2xl px-4 pt-24 pb-12 sm:pt-28 md:px-8">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={16} strokeWidth={2} />
        Back to home
      </Link>
      <div className="mb-8 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles size={22} strokeWidth={2} />
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Release notes</p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">What&apos;s new in {APP_VERSION_LABEL}</h1>
        </div>
      </div>
      <ul className="space-y-0 divide-y divide-foreground/6 rounded-2xl border border-foreground/6 bg-card px-5 py-1 shadow-sm">
        {ITEMS.map((item) => (
          <li key={item.title} className="py-5 first:pt-4 last:pb-4">
            <h2 className="text-base font-semibold text-foreground">{item.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Install VANO as an app from the banner for the best experience on phone and desktop.
      </p>
    </div>
  </div>
);

export default WhatsNew;
