import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import {
  ArrowLeft, ShieldCheck, Mail, Star, UserCheck, Navigation, KeyRound,
  RotateCcw, MessageCircle,
} from 'lucide-react';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';
import { SEOHead } from '@/components/SEOHead';
import { teamWhatsAppHref } from '@/lib/contact';

// The trust page — "How we check every student", written for the customer
// deciding whether to let a stranger into their home. One page, the whole
// vetting story: linked from the FAQ safety answer, the booking sheet's
// trust row, helper profiles and the accept email. Everything stated here
// must stay LITERALLY true of the product (the ID gate is enforced in
// dispatch + accept-job; the code gate lives in household-arrival) — if a
// check changes, this page changes with it.

interface CheckItem {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: ReactNode;
}

// Cards cascade in as each group scrolls into view (the profile page's
// pattern) — short 60ms stagger, spring settle; decorative only, never
// blocking. Reduced-motion users get the opacity fade without the movement
// (MotionConfig reducedMotion="user" strips transforms globally).
const listStagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
};
const listItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 440, damping: 32 } },
};

function CheckList({ items }: { items: CheckItem[] }) {
  return (
    <motion.ul
      className="space-y-3"
      variants={listStagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
    >
      {items.map(({ icon: Icon, title, body }) => (
        <motion.li key={title} variants={listItem} className="bg-card rounded-2xl border border-border/40 shadow-tinted p-5 flex gap-4">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-sage-light text-sage">
            <Icon className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-1">{body}</p>
          </div>
        </motion.li>
      ))}
    </motion.ul>
  );
}

const BEFORE_FIRST_JOB: CheckItem[] = [
  {
    icon: ShieldCheck,
    title: 'Government ID + live selfie',
    body: (
      <>
        Before their first job, every student passes Stripe&apos;s identity check — a
        government photo-ID plus a live selfie that has to match it. The name and age on
        their profile are locked to the ID, not typed in. No ID check, no job offers —
        this is enforced in our systems, not a policy on a page.
      </>
    ),
  },
  {
    icon: Mail,
    title: 'A confirmed inbox',
    body: (
      <>
        Helpers confirm their email with a one-time code before they go live — usually
        their college address. Junk signups never make it onto the platform.
      </>
    ),
  },
  {
    icon: Star,
    title: 'Rated after every job',
    body: (
      <>
        When a job&apos;s done, the customer rates the student. Reviews only ever come
        from real completed bookings — read them on any helper&apos;s profile before they
        arrive.
      </>
    ),
  },
];

const ON_THE_DAY: CheckItem[] = [
  {
    icon: UserCheck,
    title: 'You see exactly who’s coming',
    body: (
      <>
        The moment a helper accepts, their photo, first name, studies and rating are on
        your tracking page — with their full profile and reviews one tap away.
      </>
    ),
  },
  {
    icon: Navigation,
    title: 'A live map to your door',
    body: (
      <>
        Watch your helper on the way with a live map and ETA — the same way you&apos;d
        watch a taxi coming.
      </>
    ),
  },
  {
    icon: KeyRound,
    title: 'Your 4-digit start code',
    body: (
      <>
        A code shown only on your screen. The job can&apos;t start until you read it to
        the helper at your door — so the person in your home is always the person you
        tracked, checked and expected.
      </>
    ),
  },
];

const IF_SOMETHING_GOES_WRONG: CheckItem[] = [
  {
    icon: RotateCcw,
    title: 'Money-back guarantee',
    body: (
      <>
        Not happy with the job? Tell us within 24 hours — we&apos;ll re-do it or refund
        you.
      </>
    ),
  },
  {
    icon: ShieldCheck,
    title: 'Vano Cover — €2, up to €250',
    body: (
      <>
        Tick Vano Cover when you book and accidental damage is covered up to €250 —
        repair, replace or refund.{' '}
        <Link to="/cover" className="font-semibold text-sage-dark underline underline-offset-2 hover:text-foreground transition-colors">
          How Vano Cover works →
        </Link>
      </>
    ),
  },
  {
    icon: MessageCircle,
    title: 'A human in Galway, in minutes',
    body: (
      <>
        &quot;Report a problem&quot; is on every booking screen, and{' '}
        <a href={teamWhatsAppHref} className="font-semibold text-sage-dark underline underline-offset-2 hover:text-foreground transition-colors">
          our WhatsApp
        </a>{' '}
        is answered by the VANO team — not a bot.
      </>
    ),
  },
];

const Safety = () => (
  <div className="bg-cream min-h-screen flex flex-col">
    <SEOHead
      title="How we check every student — VANO safety"
      description="Every VANO helper passes a government-ID and live-selfie check before their first job. See who's coming, follow them on a live map, and start the job with a code only you hold — with a money-back guarantee behind every booking."
      keywords="VANO safety, vetted student helpers Galway, ID-verified home help, is VANO safe, background checks home help Ireland"
      url="https://vanojobs.com/safety"
    />
    <HouseholdNav />

    <main className="flex-1 pt-24 pb-20 px-4 max-w-xl mx-auto w-full">
      <Link
        to="/home"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-150 mb-8"
      >
        <ArrowLeft className="w-4 h-4" /> Back to VANO
      </Link>

      <p className="eyebrow mb-3">Safety at VANO</p>
      <h1 className="display-lg text-foreground mb-4">Who&apos;s actually coming to your home?</h1>
      <p className="text-[15px] text-muted-foreground leading-relaxed mb-10">
        You&apos;re not booking an app — you&apos;re opening your door to a person. So
        here&apos;s the whole answer: every check that person passes before they can
        work, what you see on the day, and what stands behind the booking if
        anything&apos;s not right.
      </p>

      <section className="mb-10">
        <p className="eyebrow mb-4">Before their first job</p>
        <CheckList items={BEFORE_FIRST_JOB} />
      </section>

      <section className="mb-10">
        <p className="eyebrow mb-4">While they&apos;re with you</p>
        <CheckList items={ON_THE_DAY} />
      </section>

      <section className="mb-10">
        <p className="eyebrow mb-4">If something&apos;s not right</p>
        <CheckList items={IF_SOMETHING_GOES_WRONG} />
      </section>

      {/* The honest bit — trust is built by what we DON'T claim too. */}
      <section className="rounded-2xl border border-border/60 bg-secondary/40 p-5 mb-10">
        <p className="text-sm font-semibold text-foreground mb-2">Where we draw the line</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We keep to everyday household jobs — no childminding or care work, nothing
          that needs a qualified tradesperson (electrics, gas or plumbing), no ladders
          or roofs, no driving passengers. Helpers are independent local students: VANO
          checks them, matches them to your job, and stands behind the booking with the
          guarantee above.
        </p>
      </section>

      <section className="bg-sage-light rounded-3xl border border-sage/20 p-6 text-center">
        <ShieldCheck className="w-6 h-6 text-sage mx-auto mb-2" aria-hidden="true" />
        <p className="text-sm text-foreground/80 leading-relaxed max-w-sm mx-auto">
          Every helper on your screen has already passed these checks. Book when
          you&apos;re ready — you&apos;re only charged when one says yes.
        </p>
        <Link
          to="/home#category-grid"
          className="mt-5 inline-flex items-center rounded-full bg-primary text-primary-foreground px-7 py-3 text-sm font-semibold hover:-translate-y-px hover:shadow-primary-glow active:scale-[0.97] transition-[transform,box-shadow] duration-150"
        >
          Book a task on VANO →
        </Link>
      </section>
    </main>

    <HouseholdFooter />
  </div>
);

export default Safety;
