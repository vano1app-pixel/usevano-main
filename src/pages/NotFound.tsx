import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { SEOHead } from '@/components/SEOHead';
import { teamWhatsAppHref } from '@/lib/contact';
import { ArrowLeft, MessageCircle, Sparkles } from 'lucide-react';
import logo from '@/assets/logo.png';

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (import.meta.env.DEV) console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    // Warm cream base to match the rest of the platform — a white page here
    // read like a different site. Grain + a soft sage glow give it presence.
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-cream px-5 py-16 text-center">
      <SEOHead
        title="404 – Page not found · VANO"
        description="The page you're looking for doesn't exist. Book same-day home help or head back to the VANO home page."
        noindex
      />

      <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -top-28 left-1/2 h-[440px] w-[440px] -translate-x-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, hsl(119 23% 45% / 0.16) 0%, transparent 70%)' }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md">
        {/* Wordmark */}
        <div className="mb-9 flex items-center justify-center gap-2">
          <img src={logo} alt="VANO" className="h-7 w-7 rounded-lg" />
          <span className="text-lg font-bold tracking-tight text-foreground">VANO</span>
        </div>

        {/* A lost little compass, gently drifting */}
        <span className="animate-float mb-1 inline-block text-6xl leading-none" aria-hidden="true">🧭</span>

        <p className="display-xl text-foreground">404</p>
        <h1 className="mt-3 text-xl font-bold text-foreground">This page wandered off</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
          We couldn't find that one — it may have moved. Your jobs are still a couple of taps away.
        </p>

        {/* Real ways forward, not a dead end. Primary lands straight on the
            booking card in the hero. */}
        <div className="mt-8 space-y-2.5">
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-primary-glow transition-[transform,background-color] duration-150 hover:bg-primary/90 active:scale-[0.98]"
          >
            <Sparkles size={16} strokeWidth={2.5} />
            Book home help
          </button>
          <a
            href={`${teamWhatsAppHref}?text=${encodeURIComponent("Hi VANO! I hit a 404 — can you help me find what I'm after?")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-full border border-[#25D366]/40 px-6 py-3 text-sm font-medium text-[#128a45] transition-[background-color,transform] duration-150 hover:bg-[#25D366]/[0.08] active:scale-[0.98]"
          >
            <MessageCircle size={16} />
            Message us on WhatsApp
          </a>
        </div>

        <button
          type="button"
          onClick={() => navigate('/home')}
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} strokeWidth={2.5} />
          Back to home
        </button>
      </div>
    </div>
  );
};

export default NotFound;
