import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import { ArrowLeft, MessageCircle, Mail, Clock } from 'lucide-react';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';
import { SEOHead } from '@/components/SEOHead';
import {
  TEAM_CONTACT_EMAIL,
  TEAM_PHONE_DISPLAY,
  teamMailtoHref,
  teamWhatsAppHref,
} from '@/lib/contact';

// The help desk — one page that answers "how do I reach a human" and the
// questions people actually ask before they book or before they join.
//
// Everything stated here must stay LITERALLY true of the product. The
// household answers are the same promises as the homepage FAQ
// (components/household/faqData.ts) — if a price, a fee or a guarantee
// changes there, change it here too. The helper answers track the real
// funnel in CLAUDE.md ("The helper funnel"): free to join, email code to go
// live, ID check before the first job, €2/month only for the blue tick.
//
// Deliberately NOT a second booking path and NOT a contact form: the two
// doors are WhatsApp and email, both of which the owner already watches.

const listStagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
};
const listItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 440, damping: 32 } },
};

interface Faq {
  q: string;
  a: ReactNode;
}

// For households — the questions asked before someone trusts us with a key.
const CUSTOMER_FAQS: Faq[] = [
  {
    q: 'How do I book, and how fast can someone come?',
    a: (
      <>
        Tap a job on the <Link to="/" className="text-primary hover:underline underline-offset-4">home page</Link>,
        tick what needs doing, add your address and phone number — no account needed. Most jobs are
        confirmed within a few hours. If you need someone today, message us on WhatsApp and we&apos;ll
        do our best to sort it same-day.
      </>
    ),
  },
  {
    q: 'What do I pay, and when?',
    a: (
      <>
        Booking is free. When a helper accepts, we charge one small booking fee to your card — that is
        the only thing VANO ever charges you. You pay for the job itself directly to your helper when
        it&apos;s done, by cash or Revolut, and they keep 100%. The price is agreed upfront, so there
        are no surprises after.
      </>
    ),
  },
  {
    q: 'Who is coming to my house?',
    a: (
      <>
        An independent local student who has passed a government photo-ID and live selfie check before
        their first job. You see their photo, name and rating before they arrive, you can follow them
        on a live map, and they can only start once they type the 4-digit code shown on your screen.
        The full list of checks is on our{' '}
        <Link to="/safety" className="text-primary hover:underline underline-offset-4">safety page</Link>.
      </>
    ),
  },
  {
    q: 'Something got damaged, or the job wasn’t right. What now?',
    a: (
      <>
        Tell us within 24 hours and we&apos;ll make it right — we&apos;ll re-do the job or refund you.
        If you added{' '}
        <Link to="/cover" className="text-primary hover:underline underline-offset-4">Vano Cover</Link>{' '}
        (€2 at booking), we can repair, replace or refund accidental damage up to €250 for that
        booking. Send a photo with your message; your helper&apos;s before-and-after job photos help too.
      </>
    ),
  },
  {
    q: 'How do I find a booking I already made?',
    a: (
      <>
        You don&apos;t need an account — go to{' '}
        <Link to="/bookings" className="text-primary hover:underline underline-offset-4">your bookings</Link>{' '}
        and look it up with the phone number you booked with. To cancel or change one, message us on
        WhatsApp and we&apos;ll sort it.
      </>
    ),
  },
];

// For students — the supply side. Mirrors the real funnel, no invented steps.
const HELPER_FAQS: Faq[] = [
  {
    q: 'What does it cost to join?',
    a: (
      <>
        Nothing. Signing up at{' '}
        <Link to="/join" className="text-primary hover:underline underline-offset-4">vanojobs.com/join</Link>{' '}
        is free, and so are both checks that let you work. The only paid thing on VANO is the optional
        €2/month Verified plan, which adds the blue tick and puts you higher in the list when jobs go
        out. You can cancel it any time.
      </>
    ),
  },
  {
    q: 'I signed up — why am I not getting job offers?',
    a: (
      <>
        Two things have to be done first. Enter the code we email you, which switches your account on,
        then pass the{' '}
        <Link to="/verify-helper" className="text-primary hover:underline underline-offset-4">
          free ID check
        </Link>{' '}
        — a photo-ID plus a selfie, a couple of minutes. Jobs only go out to ID-verified students, so
        until that&apos;s done you won&apos;t be offered any. After that, offers arrive by text and
        push for the job types and area you picked.
      </>
    ),
  },
  {
    q: 'How and when do I get paid?',
    a: (
      <>
        The customer pays you directly at the end of the job — cash or Revolut — and you keep 100% of
        the job price. VANO takes nothing from you. Add your Revolut tag on your{' '}
        <Link to="/student-account" className="text-primary hover:underline underline-offset-4">account page</Link>{' '}
        so the customer can pay you in one tap. After you finish, we ask you to confirm you were paid;
        if you weren&apos;t, tap &quot;report unpaid&quot; and we&apos;ll chase it and flag the
        customer.
      </>
    ),
  },
  {
    q: 'The job is bigger than it looked. Can I charge for the extra time?',
    a: (
      <>
        Yes — ask on the job screen for another 30 minutes or an hour, and the customer approves it on
        their tracking page. The extra is paid straight to you at the end at the same hourly rate, with
        no VANO fee on it. Never do extra hours unpaid, and never start work before the job screen says
        the booking is paid.
      </>
    ),
  },
  {
    q: 'I feel unsafe on a job, or I can’t make it any more.',
    a: (
      <>
        If you are in danger, call 999 first — VANO is not an emergency service. The job screen has a
        red SOS button that alerts our team straight away with your location, and the customer is never
        told you pressed it. If you simply can&apos;t make a job, release it on the job screen as early
        as you can so it goes back out to someone else.
      </>
    ),
  },
];

function FaqList({ items }: { items: Faq[] }) {
  return (
    <motion.ul
      className="space-y-3"
      variants={listStagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
    >
      {items.map(({ q, a }) => (
        <motion.li
          key={q}
          variants={listItem}
          className="bg-card rounded-2xl border border-border/40 shadow-tinted p-5"
        >
          <p className="text-sm font-semibold text-foreground">{q}</p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-1.5">{a}</p>
        </motion.li>
      ))}
    </motion.ul>
  );
}

interface Channel {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: ReactNode;
}

const CHANNELS: Channel[] = [
  {
    icon: MessageCircle,
    title: 'WhatsApp',
    body: (
      <>
        <a
          href={teamWhatsAppHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline underline-offset-4 font-medium"
        >
          {TEAM_PHONE_DISPLAY}
        </a>
        {' '}— for anything happening today: a helper running late, a booking to change or cancel, or
        an urgent job.
      </>
    ),
  },
  {
    icon: Mail,
    title: 'Email',
    body: (
      <>
        <a href={teamMailtoHref} className="text-primary hover:underline underline-offset-4 font-medium">
          {TEAM_CONTACT_EMAIL}
        </a>
        {' '}— best for anything with detail: a refund, a damage claim with photos, a question about
        your account, or a data request.
      </>
    ),
  },
  {
    icon: Clock,
    title: 'When you’ll hear back',
    body: (
      <>
        We&apos;re a small Galway team and we read everything. We aim to reply within one working day.
        If it&apos;s about a job happening right now, message us on WhatsApp so it reaches a phone.
      </>
    ),
  },
];

const Support = () => (
  <div className="min-h-screen bg-cream pb-16 md:pb-0">
    <SEOHead
      title="Help & Support"
      description="Get help with VANO — contact us on WhatsApp or by email, and find answers about booking same-day home help in Galway or working as a student helper."
      keywords="VANO support, VANO help, contact VANO, Galway home help support, student helper help, booking help"
    />
    <HouseholdNav />
    <div className="mx-auto max-w-2xl lg:max-w-3xl px-4 pt-24 pb-12 sm:pt-28 md:px-8">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={16} strokeWidth={2} />
        Back to home
      </Link>

      <h1 className="display-lg text-foreground mb-2">Help &amp; support</h1>
      <p className="text-base text-muted-foreground mb-10 leading-relaxed">
        Something gone wrong, or just a question before you book? Talk to a real person — there is no
        ticket system and no bot here.
      </p>

      <section className="mb-12">
        <p className="eyebrow mb-4">Talk to us</p>
        <motion.ul
          className="space-y-3"
          variants={listStagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
        >
          {CHANNELS.map(({ icon: Icon, title, body }) => (
            <motion.li
              key={title}
              variants={listItem}
              className="bg-card rounded-2xl border border-border/40 shadow-tinted p-5 flex gap-4"
            >
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
      </section>

      <section className="mb-12">
        <p className="eyebrow mb-4">Booking help</p>
        <h2 className="text-lg font-semibold text-foreground mb-4">If you&apos;re booking a job</h2>
        <FaqList items={CUSTOMER_FAQS} />
      </section>

      <section className="mb-12">
        <p className="eyebrow mb-4">Helper help</p>
        <h2 className="text-lg font-semibold text-foreground mb-4">If you&apos;re a student working with VANO</h2>
        <FaqList items={HELPER_FAQS} />
      </section>

      <section>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Still stuck? Message us on{' '}
          <a
            href={teamWhatsAppHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline underline-offset-4"
          >
            WhatsApp
          </a>{' '}
          or email{' '}
          <a href={teamMailtoHref} className="text-primary hover:underline underline-offset-4">
            {TEAM_CONTACT_EMAIL}
          </a>
          . For how we handle your data, see our{' '}
          <Link to="/privacy" className="text-primary hover:underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>
      </section>
    </div>
    <HouseholdFooter />
  </div>
);

export default Support;
