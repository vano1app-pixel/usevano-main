import { Link } from 'react-router-dom';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { SEOHead } from '@/components/SEOHead';
import { ArrowLeft } from 'lucide-react';
import {
  TEAM_CONTACT_EMAIL,
  TEAM_PHONE_DISPLAY,
  teamMailtoHref,
  teamWhatsAppHref,
  TEAM_INSTAGRAM_URL,
  TEAM_INSTAGRAM_HANDLE,
} from '@/lib/contact';

const LAST_UPDATED = '14 July 2026';

const Terms = () => (
  <div className="min-h-screen bg-background pb-16 md:pb-0">
    <SEOHead
      title="Terms of Service"
      description="VANO's terms of service for booking same-day home help and working as a student helper in Galway, Ireland — bookings, payments, helper membership, cancellations and our satisfaction guarantee."
      keywords="VANO terms of service, home help terms Galway, student helper agreement Ireland, booking terms, cancellation policy, satisfaction guarantee, pay after accept"
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
        Terms of Service
      </h1>
      <p className="text-sm text-muted-foreground mb-10">Last updated: {LAST_UPDATED}</p>

      <div className="prose prose-sm sm:prose-base prose-neutral dark:prose-invert max-w-none space-y-8 text-foreground/85 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">1. Agreement to these terms</h2>
          <p>
            By accessing or using VANO (&quot;the Platform&quot;, &quot;we&quot;, &quot;us&quot;), you
            agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to
            these Terms, do not use the Platform. VANO is operated from Galway, Ireland. These Terms
            apply both to people booking help (&quot;Customers&quot;) and to people providing help
            through the Platform (&quot;Helpers&quot;).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">2. What VANO is</h2>
          <p>
            VANO is a platform that connects households in supported areas of Ireland with local
            student Helpers for everyday home and errand tasks — for example cleaning, garden and
            lawn care, dog walking, shopping and errands, moving help and online tutoring. Tasks can be
            booked as a one-off job or as a recurring &quot;House Autopilot&quot; plan.
          </p>
          <p className="mt-3">
            We provide the technology to request help, match with a Helper, pay securely, and get
            support. <strong>Helpers are independent providers, not employees or agents of VANO.</strong>{' '}
            VANO is not the provider of the household services themselves; the service is carried out
            by the Helper. We facilitate the booking, payment and support around it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">3. Eligibility</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>You must be at least 18 years old to book a job, make a payment, or work as a Helper.</li>
            <li>
              To be listed as a Helper you must be a third-level student, based in a supported city,
              and complete our verification steps.
            </li>
            <li>
              By registering, you confirm that you meet these requirements and that the information
              you provide is accurate and kept up to date.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">4. Your account</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>You are responsible for maintaining the security of your account and login details.</li>
            <li>You must provide accurate, complete and current information.</li>
            <li>You may not create multiple accounts or impersonate another person.</li>
            <li>You must notify us immediately if you suspect unauthorised access to your account.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">5. Booking help (Customers)</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              You request a job and, for one-off bookings, you are charged by card{' '}
              <strong>after a Helper accepts</strong> — not before. The price is agreed and shown
              upfront before you pay.
            </li>
            <li>
              House Autopilot plans are subscriptions billed on a recurring basis (weekly or monthly,
              as you choose). They continue until you cancel, and you can cancel at any time.
            </li>
            <li>
              You agree to provide safe and reasonable access to your home or location, accurate task
              details, and to treat Helpers respectfully.
            </li>
            <li>
              VANO may decline, cancel or reassign a booking — for example if no Helper is available,
              or for safety, fraud or policy reasons.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">6. Prices, fees and payments</h2>
          <p>
            Payments are processed securely by our payment provider, <strong>Stripe</strong>. VANO
            does not store your full card details.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>
              <strong>The total you pay — including any VANO service fee — is shown to you before you
              confirm payment.</strong> There are no hidden charges added after a price is confirmed.
            </li>
            <li>
              VANO earns a service fee on bookings. This is how we keep the Platform running, vet and
              support Helpers, and provide our guarantee.
            </li>
            <li>
              From time to time we may offer discounts (for example for scheduling ahead, loyalty, or
              referrals). Discounts are optional, may change, and may be withdrawn at any time.
            </li>
            <li>
              Subscriptions renew automatically at the stated interval until cancelled. Cancelling
              stops future charges; it does not refund a billing period already started, except where
              required by law or our guarantee below.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">7. Working as a Helper</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              Joining as a Helper is <strong>free</strong>. Before their first job every Helper must
              pass a free identity check — bookings are only offered to ID-verified Helpers. An
              optional <strong>&euro;2 per month</strong> &quot;Verified&quot; plan adds the blue
              tick to a Helper&apos;s profile once the free checks pass; it can be cancelled at any
              time, which stops future charges.
            </li>
            <li>
              Helpers are independent and responsible for the way they carry out each job, for their
              own conduct, and for their own tax and any other obligations arising from the income
              they earn. Helpers also agree to the{' '}
              <Link to="/helper-terms" className="text-primary hover:underline underline-offset-4">
                Helper Agreement &amp; Code of Conduct
              </Link>.
            </li>
            <li>
              Where VANO holds a Customer&apos;s payment until a job is complete, the payment is
              released to the Helper after the Customer confirms completion, or automatically after a
              holding period (by default around 14 days) if no issue is raised. Helper payouts are
              made through Stripe.
            </li>
            <li>
              Helpers must provide accurate profile information, complete verification, and may be
              removed from the Platform for poor conduct, safety concerns, or breaching these Terms.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">8. Cancellations, refunds and our guarantee</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Satisfaction guarantee:</strong> if you are not happy with a completed job, tell
              us within 24 hours. We will make it right — either by arranging for the job to be
              re-done or by giving you a refund.
            </li>
            <li>
              <strong>Vano Cover:</strong> if a Helper accidentally damages your property during a
              booking paid through VANO, we may cover the damage up to &euro;250 under our
              discretionary{' '}
              <Link to="/cover" className="text-primary hover:underline underline-offset-4">
                Vano Cover guarantee
              </Link>
              . Vano Cover is a goodwill guarantee provided by VANO, not an insurance product, and
              the conditions on the Vano Cover page apply. It sits on top of — and never limits —
              your statutory rights.
            </li>
            <li>House Autopilot subscriptions can be cancelled at any time to stop future billing.</li>
            <li>
              Where we hold a payment in escrow, you can release it to your Helper once the job is
              done, or raise a problem before it auto-releases.
            </li>
            <li>
              Nothing in these Terms removes or limits your statutory rights as a consumer under Irish
              and EU law.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">9. Acceptable use</h2>
          <p>When using VANO, you agree not to:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>Post false, misleading, or fraudulent content.</li>
            <li>Harass, abuse, threaten, or discriminate against other users.</li>
            <li>Send spam or unsolicited promotional messages.</li>
            <li>Upload content that is illegal, harmful, or infringes intellectual property rights.</li>
            <li>Attempt to access other users&apos; accounts or private data.</li>
            <li>Use the Platform for any unlawful purpose.</li>
            <li>Scrape, crawl, or use automated tools to extract data without permission.</li>
            <li>Circumvent or interfere with the Platform&apos;s security or payment features.</li>
          </ul>
          <p className="mt-3">
            We reserve the right to suspend or terminate accounts that violate these rules, where
            appropriate without prior notice.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">10. Verification and safety</h2>
          <p>
            We take reasonable steps to verify Helpers, including ID checks before a Helper&apos;s
            first job, and we show you a Helper&apos;s name, photo and rating. However, verification
            and ratings are not a guarantee of any person&apos;s conduct or the quality of their work.
            Use your own judgement, and contact us straight away if you ever feel unsafe or something
            is not right.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">11. Content you post</h2>
          <p>
            You retain ownership of content you create and upload to VANO (profile information,
            photos, messages, ratings and reviews). By posting content, you grant VANO a
            non-exclusive, worldwide, royalty-free licence to use, display and distribute that content
            within the Platform for the purpose of operating the service.
          </p>
          <p className="mt-3">
            Reviews must be honest, accurate and based on genuine experience. We may remove content
            that breaches these Terms or that we reasonably consider inappropriate, harmful, fake or
            misleading.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">12. Disclaimer of warranties</h2>
          <p>
            Except for our guarantee in section 8 and your statutory rights, the Platform is provided
            &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, whether
            express or implied. In particular, we do not warrant that:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>Any individual Helper&apos;s work will meet your expectations.</li>
            <li>A Helper will always be available for a given request or time.</li>
            <li>The Platform will be uninterrupted, secure, or error-free.</li>
            <li>Information provided by other users is accurate.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">13. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by Irish and EU law, VANO shall not be liable for any
            indirect, incidental, special, consequential or punitive damages, including loss of
            profits, data or opportunities, arising from your use of the Platform. Our total liability
            for any claim relating to the Platform shall not exceed the greater of the amount you paid
            us in the 12 months before the claim, or &euro;100. Nothing in these Terms limits
            liability that cannot be limited by law, including for death or personal injury caused by
            negligence.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">14. Disputes between users</h2>
          <p>
            The household service is provided by the Helper, not by VANO. If a dispute arises between
            a Customer and a Helper, the parties are responsible for resolving it. We will help where
            we reasonably can — including through our guarantee and, where we hold a payment, by
            releasing or refunding it — but beyond that we are under no obligation to mediate.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">15. Account termination</h2>
          <p>
            You may delete your account at any time. We may suspend or terminate your account if you
            breach these Terms, or if we reasonably believe your conduct harms the Platform, our
            Helpers, or other users. On termination, your right to use the Platform ends immediately;
            payments and payouts already due are settled in the normal way.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">16. Changes to these terms</h2>
          <p>
            We may update these Terms from time to time. We will notify you of material changes by
            posting a notice on the Platform. Continued use of VANO after changes take effect
            constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">17. Governing law</h2>
          <p>
            These Terms are governed by the laws of Ireland, and the courts of Ireland have
            jurisdiction over any dispute relating to these Terms or the Platform. This does not
            deprive you of any protection you have under the mandatory consumer laws of the country
            where you live.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">18. Privacy</h2>
          <p>
            Your use of VANO is also governed by our{' '}
            <Link to="/privacy" className="text-primary hover:underline underline-offset-4">
              Privacy Policy
            </Link>
            , which explains how we collect, use and protect your personal data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">19. Contact</h2>
          <p>If you have any questions about these Terms, contact us:</p>
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
          <p className="mt-1">
            <strong>Instagram:</strong>{' '}
            <a
              href={TEAM_INSTAGRAM_URL}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline underline-offset-4"
            >
              @{TEAM_INSTAGRAM_HANDLE}
            </a>
          </p>
          <p className="mt-1">
            <strong>Location:</strong> Galway, Ireland
          </p>
        </section>
      </div>
    </div>
  </div>
);

export default Terms;
