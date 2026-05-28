import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';
import { SEOHead } from '@/components/SEOHead';
import { teamWhatsAppHref } from '@/lib/contact';

const STATS = [
  { value: '€12–€25', label: 'per job' },
  { value: 'Flexible', label: 'your schedule' },
  { value: 'Same day', label: 'pay by Revolut' },
];

const REQUIREMENTS = [
  'ATU student (any course)',
  'Based in Galway',
  'Clean Garda vetting',
  'Friendly and reliable',
];

const JOBS = [
  { emoji: '🛒', label: 'Shopping runs' },
  { emoji: '🐕', label: 'Dog walks' },
  { emoji: '🌿', label: 'Garden work' },
  { emoji: '📦', label: 'Moving help' },
  { emoji: '🧹', label: 'Cleaning' },
  { emoji: '✨', label: 'Errands & more' },
];

export const JoinAsHelper: React.FC = () => {
  const waUrl = `${teamWhatsAppHref}?text=${encodeURIComponent("Hi VANO, I'm an ATU student and I'd like to start doing household jobs.")}`;

  return (
    <>
      <SEOHead
        title="Earn money as a student helper — VANO"
        description="ATU students in Galway earn €12–€25 per job helping households. Flexible hours, paid same day by Revolut."
      />
      <HouseholdNav />

      <main className="-mt-14 lg:-mt-16">
        {/* Hero */}
        <section className="pt-32 pb-12 px-4 bg-gradient-to-b from-sage-light via-background to-background">
          <div className="max-w-lg mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <p className="eyebrow mb-4">For ATU students in Galway</p>
              <h1 className="display-xl text-foreground mb-4">
                Earn money between lectures
              </h1>
              <p className="text-muted-foreground text-lg leading-relaxed mb-8 max-w-sm mx-auto">
                Pick up flexible household jobs around Galway. Shopping runs, dog walks, cleaning, garden work — you choose what you take on.
              </p>

              {/* Stat chips */}
              <div className="flex justify-center gap-3 flex-wrap mb-8">
                {STATS.map(({ value, label }) => (
                  <div key={label} className="bg-background border border-border/60 rounded-2xl px-4 py-3 text-center shadow-tinted-sm">
                    <p className="font-bold text-foreground text-lg leading-tight">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

              <Button
                asChild
                size="lg"
                className="rounded-full gap-2 px-8 font-semibold text-base"
                style={{ backgroundColor: '#25D366', color: '#fff' }}
              >
                <a href={waUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="w-5 h-5" />
                  Apply on WhatsApp
                </a>
              </Button>
            </motion.div>
          </div>
        </section>

        {/* Job types */}
        <section className="px-4 py-12 max-w-lg mx-auto">
          <p className="eyebrow mb-3">What you'll do</p>
          <h2 className="text-2xl font-semibold text-foreground mb-6">Jobs available right now</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {JOBS.map(({ emoji, label }) => (
              <div
                key={label}
                className="bg-secondary/60 rounded-2xl p-4 flex items-center gap-3"
              >
                <span className="text-2xl leading-none">{emoji}</span>
                <span className="text-sm font-medium text-foreground">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Requirements */}
        <section className="px-4 py-12 bg-sage-light">
          <div className="max-w-lg mx-auto">
            <p className="eyebrow mb-3">What we need from you</p>
            <h2 className="text-2xl font-semibold text-foreground mb-6">Requirements</h2>
            <ul className="space-y-3">
              {REQUIREMENTS.map((req) => (
                <li key={req} className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-sage flex-shrink-0" />
                  <span className="text-foreground text-base">{req}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section className="px-4 py-12 max-w-lg mx-auto">
          <p className="eyebrow mb-3">How it works</p>
          <h2 className="text-2xl font-semibold text-foreground mb-6">Three steps to your first job</h2>
          <ol className="space-y-5">
            {[
              { n: '1', title: 'Text us on WhatsApp', body: 'Send us a quick message. We\'ll ask a few questions and add you to our student pool.' },
              { n: '2', title: 'Get matched to jobs', body: 'When a job near you comes in, we\'ll text you first. Accept or pass — totally your call.' },
              { n: '3', title: 'Do the job, get paid', body: 'Show up, do great work, get paid by Revolut the same day. Easy.' },
            ].map(({ n, title, body }) => (
              <li key={n} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-sage text-white font-bold text-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                  {n}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Bottom CTA */}
        <section className="bg-primary px-4 py-16 text-center">
          <div className="max-w-sm mx-auto">
            <h2 className="display-lg text-primary-foreground mb-4">Ready to start?</h2>
            <p className="text-primary-foreground/80 mb-8 leading-relaxed">
              Takes 2 minutes. We'll have you set up and ready for your first job this week.
            </p>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-full gap-2 px-8 font-semibold border-white/70 text-white bg-transparent hover:bg-white hover:text-primary transition-colors duration-200"
            >
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-5 h-5" />
                Apply on WhatsApp
              </a>
            </Button>
          </div>
        </section>
      </main>

      <HouseholdFooter />
    </>
  );
};

export default JoinAsHelper;
