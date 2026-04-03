import React from 'react';
import { Navbar } from '@/components/Navbar';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Phone, MessageCircle, Users } from 'lucide-react';

const PostJob = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <SEOHead title="Hire a Freelancer – VANO" description="Find the right freelancer for your project." />
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 pt-20 sm:px-6 sm:pt-24 md:px-8">

        <header className="mb-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Hiring</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">How would you like to hire?</h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Choose how you want to find your freelancer.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

          {/* Card 1 — VANO helps */}
          <div className="flex flex-col gap-4 rounded-2xl border-2 border-primary bg-primary/5 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="font-semibold text-foreground">VANO will help you find someone</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Get in touch and we'll personally match you with the right freelancer.
              </p>
            </div>
            <span className="inline-block w-fit rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary">
              Recommended
            </span>
            <div className="mt-auto flex flex-col gap-2">
              <a
                href="tel:+353899817111"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
              >
                <Phone size={15} /> Call us
              </a>
              <a
                href="https://wa.me/353899817111"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-white px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 active:scale-[0.98]"
              >
                <MessageCircle size={15} /> WhatsApp us
              </a>
            </div>
          </div>

          {/* Card 2 — Browse talent */}
          <button
            onClick={() => navigate('/students')}
            className="group flex flex-col gap-3 rounded-2xl border border-foreground/15 bg-card p-5 text-left transition hover:bg-muted active:scale-[0.98]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <Users size={18} className="text-foreground/70" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Search the talent board yourself</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Browse freelancer profiles and message who you like directly.
              </p>
            </div>
            <span className="mt-auto inline-block rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              Self-serve
            </span>
          </button>

        </div>
      </div>
    </div>
  );
};

export default PostJob;
