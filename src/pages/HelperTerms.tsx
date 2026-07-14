import { Link } from 'react-router-dom';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { SEOHead } from '@/components/SEOHead';
import { ArrowLeft } from 'lucide-react';
import {
  TEAM_CONTACT_EMAIL,
  TEAM_PHONE_DISPLAY,
  teamMailtoHref,
  teamWhatsAppHref,
} from '@/lib/contact';

const LAST_UPDATED = '14 July 2026';

// The Helper Agreement & Code of Conduct — the document the join form's
// consent checkbox has always referenced ("…and agree to VANO's terms and
// helper code of conduct"). It sets out, in plain English, the independent-
// contractor relationship (Karshan-aware: free decline, no exclusivity, no
// rota), tax + DAC7 reporting, and the P2B ranking disclosure (the €2/month
// verified plan affects offer ordering — that has to be stated somewhere
// helpers can read).

const HelperTerms = () => (
  <div className="min-h-screen bg-background pb-16 md:pb-0">
    <SEOHead
      title="Helper Agreement & Code of Conduct"
      description="The agreement for VANO helpers: independent-contractor status, how you're paid, tax and Revenue reporting, how job offers are ranked, and the code of conduct on every job."
      keywords="VANO helper agreement, helper code of conduct, student helper terms Ireland, independent contractor VANO, helper rules Galway"
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

      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-2">
        Helper Agreement &amp; Code of Conduct
      </h1>
      <p className="text-sm text-muted-foreground mb-10">Last updated: {LAST_UPDATED}</p>

      <div className="prose prose-sm sm:prose-base prose-neutral dark:prose-invert max-w-none space-y-8 text-foreground/85 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">1. Who you are to VANO</h2>
          <p>
            When you help someone through VANO, <strong>you are an independent provider — not an
            employee, worker or agent of VANO</strong>. The agreement to do each job is between you
            and the customer; VANO provides the platform that connects you — it charges the
            customer a booking fee for that, and supports you both. This agreement sits alongside VANO&apos;s{' '}
            <Link to="/terms" className="text-primary hover:underline underline-offset-4">
              Terms of Service
            </Link>
            , which also apply to you.
          </p>
          <p className="mt-3">What independence means in practice:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>
              <strong>Every offer is yours to accept or decline.</strong> There is no rota, no
              minimum hours, and no penalty for passing on a job or turning off your availability.
            </li>
            <li>
              <strong>No exclusivity.</strong> You are free to work elsewhere, including on other
              platforms, whenever you like.
            </li>
            <li>
              <strong>You decide how to do the work</strong> within what the customer booked, and
              you bring your own everyday equipment unless the booking says otherwise.
            </li>
            <li>
              <strong>The customer pays you directly, and you keep 100%.</strong> When the job is
              done the customer settles the full job price with you — Revolut or cash, your
              choice (add your Revolut tag in your account so it&apos;s one tap for them). VANO
              takes nothing from your earnings; the platform is paid by the customer&apos;s
              booking fee. Bookings made before this change are still paid out the old way
              (through the platform, minus the old platform cut).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">2. Tax and Revenue reporting</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              Because you are self-employed for this income, <strong>you are responsible for your
              own tax</strong> (income tax, PRSI and USC where applicable) and for declaring your
              VANO earnings to Revenue.
            </li>
            <li>
              <strong>VANO reports helper earnings to Revenue</strong> each year, as EU platform
              rules (DAC7) require of every platform. Keep your details accurate so that report is
              right.
            </li>
            <li>
              Nothing here is tax advice — Revenue&apos;s website covers self-assessed income, and
              Ireland&apos;s rules for casual/additional income are student-friendly. When in
              doubt, ask Revenue or an advisor.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">3. Verification, and how offers are ranked</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>ID check before your first job:</strong> customers are told every VANO helper
              is ID-verified, so job offers only go to helpers who have passed the free identity
              check on{' '}
              <Link to="/verify-helper" className="text-primary hover:underline underline-offset-4">
                /verify-helper
              </Link>
              .
            </li>
            <li>
              <strong>How offers are ordered (ranking transparency):</strong> when a job is
              dispatched, eligible helpers (right city, right job type, available, ID-verified) are
              offered it in this order: <strong>✓ Verified helpers first</strong> — those with the
              paid &euro;2/month Verified plan on top of the free checks — <strong>then by fewest
              accepted jobs</strong>, so new helpers get a fair rotation. Being first matters
              because jobs are first-come-first-served. This is the paid plan&apos;s ranking
              benefit, stated plainly.
            </li>
            <li>
              Occasionally we&apos;ll text available helpers in a city about a job type they
              haven&apos;t added (at most one such nudge a week) — adding it is always your choice.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">4. Your responsibility on jobs</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              You are responsible for how you carry out each job, for your own conduct, and for
              taking reasonable care of the customer&apos;s property.
            </li>
            <li>
              If you accidentally damage something, tell us straight away. Customers who added{' '}
              <Link to="/cover" className="text-primary hover:underline underline-offset-4">
                Vano Cover
              </Link>{' '}
              to their booking can claim up to &euro;250; where VANO pays out for damage you
              caused, we may recover that cost from you. Honesty always beats a cover-up —
              accidents reported immediately are handled as accidents.
            </li>
            <li>
              For higher-risk job types (for example moving or garden machinery work), we may in
              future ask for proof of your own liability cover before you can take those jobs.
            </li>
            <li>
              Only take jobs you can genuinely do safely. Some work is never on VANO: anything
              needing Garda vetting (children, vulnerable adults), qualified trades (electrics,
              gas, plumbing), work at height, or driving passengers.
            </li>
            <li>
              <strong>You&apos;re the labour, not the transport:</strong> never carry passengers,
              pets or a customer&apos;s waste in your own vehicle for a job — lifts need PSV
              licensing and carrying waste for payment needs a waste-collection permit. On dump
              runs and clear-outs you load, sort and carry; the customer drives or arranges the
              skip/collection.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">5. Code of conduct</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Show up on time</strong> — and if you're running late or can't make it, release the job in the app as early as you can so it can be re-dispatched.</li>
            <li><strong>Use the arrival code flow</strong>: ask the customer for their 4-digit code at the door. Never ask for it by text or start work without it unless the app's fallback tells you to.</li>
            <li><strong>Every job goes through a VANO booking</strong>: no side-arrangements with VANO customers and no swapping the job to a friend — the person who accepted is the person who shows up. How the customer pays <em>you</em> is direct (Revolut or cash, on the booking), but the booking itself must be on VANO — off-platform work has no record, no reviews, and no cover for anyone.</li>
            <li><strong>Confirm your payment in the app</strong> once the customer settles up — and if they don&apos;t pay, report it there too. That record protects you: numbers with unpaid reports are blocked from booking again.</li>
            <li><strong>Be sound.</strong> Treat customers, their homes and their pets with respect. No smoking or vaping in homes, no bringing other people along, and keep customer keys, alarm codes and personal details private.</li>
            <li><strong>Take the job photos</strong> where the app asks (arrival and finish) — they protect you as much as the customer if anything is questioned.</li>
            <li><strong>Communicate in the app</strong> so there's a record — it protects both sides in a dispute.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">6. Removal from the platform</h2>
          <p>
            We may pause or remove your access — permanently for serious matters — for safety
            concerns, dishonesty (including fake profiles or reviews), repeated no-shows, taking
            VANO customers off-platform, or breaching this agreement or the{' '}
            <Link to="/terms" className="text-primary hover:underline underline-offset-4">Terms</Link>.
            Anything already owed to you for completed work is still settled in the normal way. You
            can leave at any time — set yourself unavailable or ask us to delete your profile.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">7. Contact</h2>
          <p>Questions about this agreement?</p>
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

export default HelperTerms;
