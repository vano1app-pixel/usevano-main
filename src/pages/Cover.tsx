import { Link } from 'react-router-dom';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { SEOHead } from '@/components/SEOHead';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import {
  TEAM_CONTACT_EMAIL,
  TEAM_PHONE_DISPLAY,
  teamMailtoHref,
  teamWhatsAppHref,
} from '@/lib/contact';

const LAST_UPDATED = '14 July 2026';

// Vano Cover — the discretionary property-damage guarantee (up to €250 per
// booking), TaskRabbit-Happiness-Pledge style: self-funded from the platform
// take, so it is deliberately NEVER called "insurance" (a regulated term —
// VANO is not an insurance distributor). Copy anywhere else that mentions
// damage cover must link here; this page is the single source of the
// conditions.

const Cover = () => (
  <div className="min-h-screen bg-background pb-16 md:pb-0">
    <SEOHead
      title="Vano Cover — accidental damage guarantee"
      description="If a helper accidentally damages your property during a booking paid through VANO, Vano Cover can repair, replace or refund up to €250. How it works, what's covered, and how to claim."
      keywords="Vano Cover, VANO damage guarantee, home help damage policy Galway, accidental damage cover cleaning, VANO guarantee"
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

      <div className="flex items-center gap-3 mb-2">
        <ShieldCheck className="w-8 h-8 text-sage flex-shrink-0" aria-hidden="true" />
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          Vano Cover
        </h1>
      </div>
      <p className="text-sm text-muted-foreground mb-10">
        Accidental damage covered up to &euro;250 · Last updated: {LAST_UPDATED}
      </p>

      <div className="prose prose-sm sm:prose-base prose-neutral dark:prose-invert max-w-none space-y-8 text-foreground/85 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">1. What Vano Cover is</h2>
          <p>
            Accidents are rare, but they happen. <strong>Vano Cover</strong> means that if your
            helper accidentally damages your property during a booking paid through VANO, we can
            repair, replace or refund the damage — up to <strong>&euro;250 per booking</strong>.
          </p>
          <p className="mt-3">
            Vano Cover is a <strong>discretionary goodwill guarantee provided by VANO</strong>. It
            is <strong>not an insurance product</strong>, not an insurance policy, and VANO is not
            an insurer or insurance intermediary. It sits on top of our{' '}
            <Link to="/terms" className="text-primary hover:underline underline-offset-4">
              satisfaction guarantee
            </Link>{' '}
            and never removes or limits your statutory rights under Irish and EU consumer law, or
            your right to pursue the person who caused the damage.
          </p>
          <p className="mt-3">
            Helpers on VANO are independent providers, so responsibility for how a job is carried
            out — including any damage caused — ultimately rests with the helper. Vano Cover exists
            so that you are not left chasing anyone: report it to us, and we sort it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">2. What&apos;s covered</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Accidental damage to your property</strong> caused by your helper while
              carrying out the booked task — for example a knocked-over lamp, a scratched floor
              while moving furniture, or a broken ornament while cleaning.
            </li>
            <li>The booking must have been <strong>booked and paid through VANO</strong>.</li>
            <li>
              The damage must have happened <strong>during the booking</strong> (between the
              helper&apos;s arrival and the end of the job) and within the scope of the booked task.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">3. What&apos;s not covered</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Anything arranged or paid <strong>off-platform</strong> (cash jobs, private arrangements).</li>
            <li>Pre-existing damage, general wear and tear, or damage from normal careful use.</li>
            <li>
              Jewellery, cash, antiques, artwork, collectibles, and items of sentimental or
              irreplaceable value — please put these safely away before a booking.
            </li>
            <li>Damage outside the scope of the booked task, or caused by anyone other than the helper.</li>
            <li>Loss of use, indirect losses, or costs beyond the damaged item itself.</li>
            <li>Claims reported more than <strong>24 hours</strong> after the booking ended.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">4. How to claim</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Tell us within 24 hours</strong> of the booking ending — use{' '}
              <em>&quot;Report a problem&quot;</em> on your booking&apos;s tracking page, or WhatsApp
              us on{' '}
              <a href={teamWhatsAppHref} className="text-primary hover:underline underline-offset-4">
                {TEAM_PHONE_DISPLAY}
              </a>
              .
            </li>
            <li>
              <strong>Include photos</strong> of the damage, and where possible what the item looked
              like before (your helper&apos;s before/after job photos help here too).
            </li>
            <li>Tell us roughly what the item cost or what a repair would cost.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">5. How decisions are made</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>We aim to make a decision within <strong>3 working days</strong> of receiving the details.</li>
            <li>
              We choose the remedy that puts it right — arranging a repair, replacing the item, or a
              payment — up to <strong>&euro;250 per booking</strong> in total.
            </li>
            <li>
              Vano Cover is discretionary: we assess each report on its facts and evidence, and we
              may decline a claim that falls under section 3 or that we reasonably believe is not
              genuine. Saying no to a Vano Cover claim never affects your statutory rights.
            </li>
            <li>
              Where we pay out, we may recover the cost from the helper responsible, and anything
              you receive for the damage from another source (for example home insurance) reduces
              what we pay for the same damage.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">6. Contact</h2>
          <p>Questions about Vano Cover, or a damage report to make?</p>
          <p className="mt-2">
            <strong>WhatsApp:</strong>{' '}
            <a href={teamWhatsAppHref} className="text-primary hover:underline underline-offset-4">
              {TEAM_PHONE_DISPLAY}
            </a>
          </p>
          <p className="mt-1">
            <strong>Email:</strong>{' '}
            <a href={teamMailtoHref} className="text-primary hover:underline underline-offset-4">
              {TEAM_CONTACT_EMAIL}
            </a>
          </p>
        </section>
      </div>
    </div>
  </div>
);

export default Cover;
