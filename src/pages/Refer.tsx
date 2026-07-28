import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Eye, Users, Coins } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';
import { PartnerProgramCard } from '@/components/household/PartnerProgramCard';

/**
 * /refer — the focused referral hub you tap into from an account page. The
 * PartnerProgramCard does the work (code up top, then live earnings + funnel
 * stats); this page frames it with the promise and a tiny funnel legend so the
 * numbers read clearly. A phone-verified helper arrives with their email in
 * navigation state, so their code + earnings load with zero typing.
 */
const FUNNEL = [
  { icon: Eye, label: 'Opens', body: 'people who tapped your link' },
  { icon: Users, label: 'Joined', body: 'signed up as a helper' },
  { icon: Coins, label: 'Jobs', body: 'you earned 3% on' },
];

const Refer: React.FC = () => {
  const location = useLocation();
  const prefillEmail = (location.state as { email?: string } | null)?.email;

  return (
    <div className="bg-cream min-h-screen">
      <SEOHead
        title="Your VANO referral link — earn 3% of every job for a year"
        description="Share your VANO invite link. When a student you bring in completes jobs, you earn 3% of each for their whole first year — tracked live: opens, signups, jobs and euros earned."
        url="https://vanojobs.com/refer"
      />
      <HouseholdNav />

      <main className="mx-auto w-full max-w-md px-4 pt-24 pb-20">
        <Link
          to="/account"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-5"
        >
          <ArrowLeft className="w-4 h-4" /> Account
        </Link>

        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="mb-5"
        >
          <p className="eyebrow mb-3">Refer &amp; earn</p>
          <h1 className="display-lg text-foreground">Your link. Your earnings.</h1>
          <p className="text-sm text-foreground/70 mt-2 leading-relaxed">
            Share your code once. Every job a student you brought in completes earns you
            3% — automatically, for their whole first year. Here it is, live.
          </p>
        </motion.header>

        <PartnerProgramCard initialEmail={prefillEmail} />

        {/* Funnel legend — makes the three stats on the card read as a journey. */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          {FUNNEL.map((f) => (
            <div key={f.label} className="surface-float rounded-xl bg-white p-3 text-center">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-sage/15 mb-1.5">
                <f.icon className="w-4 h-4 text-sage-dark" aria-hidden="true" />
              </span>
              <p className="text-xs font-bold text-foreground">{f.label}</p>
              <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{f.body}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground/80 mt-6 leading-relaxed">
          Your cut comes out of VANO's booking fee — never the student's pay.{' '}
          <Link to="/partners" className="font-semibold text-sage-dark underline underline-offset-2">
            How the partner programme works
          </Link>
        </p>
      </main>

      <HouseholdFooter />
    </div>
  );
};

export default Refer;
