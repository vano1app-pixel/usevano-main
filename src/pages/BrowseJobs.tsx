import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, PenLine } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';

const BrowseJobs = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const loadUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) setUser(session.user);
    };
    loadUser();
  }, []);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead title="Browse Hiring – VANO" description="Find freelance work in Galway." />
      <Navbar />
      <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-8 pt-20 sm:pt-24 pb-12 sm:pb-16">
        <div className="mb-6">
          <header className="mb-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Hiring</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">How would you like to hire?</h1>
            <p className="mt-1 text-sm text-muted-foreground">Choose how you want to find your freelancer.</p>
          </header>

          {user ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* VANO matches */}
              <Link
                to="/post-job?mode=vano"
                className="group flex flex-col gap-3 rounded-2xl border-2 border-primary bg-primary/5 p-5 text-left transition hover:bg-primary/10 active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
                  <Sparkles size={18} />
                </div>
                <div>
                  <p className="font-semibold text-foreground">VANO matches for you</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    We personally find and vet the right freelancer for your project.
                  </p>
                </div>
                <span className="mt-auto inline-block rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                  Recommended
                </span>
              </Link>

              {/* Post it yourself */}
              <Link
                to="/post-job?mode=self"
                className="group flex flex-col gap-3 rounded-2xl border border-foreground/15 bg-card p-5 text-left transition hover:bg-muted active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <PenLine size={18} className="text-foreground/70" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Post it yourself</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Write your brief and receive applications from freelancers directly.
                  </p>
                </div>
                <span className="mt-auto inline-block rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Self-serve
                </span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="group flex flex-col gap-3 rounded-2xl border-2 border-primary bg-primary/5 p-5 text-left transition hover:bg-primary/10 active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
                  <Sparkles size={18} />
                </div>
                <div>
                  <p className="font-semibold text-foreground">VANO matches for you</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    We personally find and vet the right freelancer for your project.
                  </p>
                </div>
                <span className="mt-auto inline-block rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                  Recommended
                </span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="group flex flex-col gap-3 rounded-2xl border border-foreground/15 bg-card p-5 text-left transition hover:bg-muted active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <PenLine size={18} className="text-foreground/70" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Post it yourself</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Write your brief and receive applications from freelancers directly.
                  </p>
                </div>
                <span className="mt-auto inline-block rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Self-serve
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BrowseJobs;
