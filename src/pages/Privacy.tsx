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

const LAST_UPDATED = '4 September 2026';

const Privacy = () => (
  <div className="min-h-screen bg-cream pb-16 md:pb-0">
    <SEOHead
      title="Privacy Policy"
      description="How VANO collects, uses and protects your personal data when you book same-day home help or work as a student helper in Galway, Ireland — your GDPR rights, data sharing and security."
      keywords="VANO privacy policy, data protection Ireland, GDPR home help, student helper data privacy, Galway, personal data rights, same-day home help"
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

      <h1 className="display-lg text-foreground mb-2">
        Privacy Policy
      </h1>
      <p className="text-sm text-muted-foreground mb-10">Last updated: {LAST_UPDATED}</p>

      <div className="prose prose-sm sm:prose-base prose-neutral dark:prose-invert max-w-none space-y-8 text-foreground/85 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">1. Who we are</h2>
          <p>
            VANO (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is a platform that connects
            households in supported areas of Ireland with local, ID-verified student Helpers for
            same-day home tasks — for example cleaning, garden and lawn care, dog walking, laundry
            and odd jobs — booked as one-off jobs. We are the data controller for the personal data we
            process through the VANO platform. VANO is operated from Galway, Ireland.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">2. What data we collect</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Account information</strong> — your name, email address, phone number, profile photo, and how you sign in (email/password or Google).</li>
            <li><strong>Booking &amp; location data</strong> — the address or <em>Eircode</em> where help is needed, the task details you provide, and approximate location used to match and dispatch nearby Helpers and to support live tracking of a job in progress.</li>
            <li><strong>Helper verification</strong> — if you join as a Helper, identity verification (an ID check before your first job) and confirmation that you are a third-level student.</li>
            <li><strong>Payment &amp; payout data</strong> — the VANO booking fee is paid by card and processed by our payment provider, <strong>Stripe</strong>; you pay your Helper directly for the job itself (for example Revolut or cash). Some older bookings were paid in full by card, with Helper payouts made through Stripe Connect. We do not store your full card details.</li>
            <li><strong>Communications</strong> — messages you send through the platform, and the SMS, email and push notifications we send about your bookings (including your push token, if you opt in).</li>
            <li><strong>Ratings &amp; reviews</strong> — feedback you leave after a job.</li>
            <li><strong>Job photos</strong> — a &quot;before&quot; and &quot;after&quot; photo of the work area which the Helper may take during a booking (never of people). They are kept with the booking record and used as evidence for our guarantees and any dispute; the Customer can also choose to share them.</li>
            <li><strong>Usage &amp; device data</strong> — pages visited, features used, device and browser type, and IP address, collected automatically for analytics and security.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">3. How we use your data</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Operate the platform and your account.</li>
            <li>Match Customers with Helpers and dispatch jobs to suitable Helpers nearby.</li>
            <li>Show each side only the details a booking needs — for example, a Helper&apos;s first name, photo and rating to the Customer, and the job address and task details to the assigned Helper.</li>
            <li>Take payment of the booking fee (and, for older bookings, job payments and Helper payouts).</li>
            <li>Verify Helpers and keep the platform safe for everyone.</li>
            <li>Send transactional SMS, email and push notifications about your bookings.</li>
            <li>Provide support and honour our satisfaction guarantee.</li>
            <li>Prevent fraud and abuse, and understand and improve the service.</li>
            <li>Comply with our legal and regulatory obligations.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">4. Legal basis for processing (GDPR)</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Contract</strong> — processing necessary to provide the bookings and service you sign up for.</li>
            <li><strong>Legitimate interests</strong> — platform security, fraud prevention, basic analytics and improving the service.</li>
            <li><strong>Consent</strong> — push notifications, any marketing messages, and optional analytics. You can withdraw consent at any time.</li>
            <li><strong>Legal obligation</strong> — keeping records we are required by law to retain, such as payment records.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">5. How we share your data</h2>
          <p>We do not sell your personal data. We share it only as needed to run the service:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Between Customers and Helpers</strong> — to the limited extent a booking requires (as described in section 3).</li>
            <li><strong>Service providers</strong> — trusted processors that help us operate:
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>Stripe — card payments, Helper payouts and ID verification</li>
                <li>Twilio — the SMS and WhatsApp messages we send about your booking</li>
                <li>Supabase — database, authentication and file storage</li>
                <li>Vercel — hosting and delivery</li>
                <li>PostHog — product analytics (masked session replay); Sentry — error monitoring</li>
                <li>Map providers (Google Maps and OpenStreetMap) — addresses and live tracking</li>
                <li>Our email and SMS providers — booking notifications</li>
              </ul>
            </li>
            <li><strong>Legal requirements</strong> — where required by law, regulation or legal process.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">6. International transfers</h2>
          <p>
            Some of our service providers (for example Stripe, Vercel, PostHog and Sentry) may process
            data outside the European Economic Area, including in the United States. Where they do, the
            transfer is protected by appropriate safeguards, such as the European Commission&apos;s
            Standard Contractual Clauses.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">7. Cookies, analytics and local storage</h2>
          <p>
            VANO uses essential cookies and browser local storage for sign-in and session management —
            these are strictly necessary to operate the platform. We also use product analytics
            (PostHog) and error monitoring (Sentry), which we configure to respect &quot;Do Not
            Track&quot;, to mask the contents of form fields in any session recording, and to avoid
            collecting unnecessary personal data. You can manage non-essential choices through our
            cookie banner.
          </p>
          <p className="mt-3">
            <strong>We do not track you.</strong> VANO does not use advertising identifiers, does not
            show ads, and does not track you across other apps or websites. The iOS app does not ask
            for App Tracking Transparency permission because we do no tracking that would require it.
          </p>
          <p className="mt-3">
            <strong>Voice input.</strong> If you use the &quot;Speak&quot; option to say your job instead of
            typing, your device or browser turns your speech into text on the device — VANO only ever
            receives the text, never an audio recording. On the iOS app, if speech-to-text isn&apos;t
            available you simply type instead.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">8. Data retention</h2>
          <p>
            We keep your personal data for as long as your account is active. If you delete your
            account, we remove your personal data within 30 days, except where we are legally required
            to retain certain records (for example, transaction and tax records). Anonymised or
            aggregated data may be retained for analytics.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">9. Your rights</h2>
          <p>Under GDPR, you have the right to:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Access</strong> — request a copy of the personal data we hold about you.</li>
            <li><strong>Rectification</strong> — correct inaccurate data (you can edit much of it in your profile directly).</li>
            <li><strong>Erasure</strong> — request deletion of your personal data (&quot;right to be forgotten&quot;).</li>
            <li><strong>Data portability</strong> — receive your data in a machine-readable format.</li>
            <li><strong>Restriction</strong> — ask us to limit how we process your data.</li>
            <li><strong>Object</strong> — object to processing based on legitimate interests.</li>
            <li><strong>Withdraw consent</strong> — where processing is based on consent, withdraw it at any time.</li>
          </ul>
          <p className="mt-3">
            <strong>Deleting your account or data.</strong> Helpers can delete their account and personal
            details at any time from the helper account screen in the app (Account → Delete my account).
            Customers have no account — to delete the phone number, address or booking history tied to
            you, email us at <a href="mailto:vano1app@gmail.com" className="text-primary underline underline-offset-2">vano1app@gmail.com</a>{' '}
            (or use the <a href="/support" className="text-primary underline underline-offset-2">Support</a> page) and we will erase it. We do not sell your personal
            data to anyone. To exercise any other right above, contact us at the email below — we respond
            within 30 days.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">10. Data security</h2>
          <p>
            We take reasonable technical and organisational measures to protect your personal data,
            including encrypted connections (HTTPS), row-level security policies on our database, and
            access controls on file storage. However, no method of transmission or storage is 100%
            secure.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">11. Children</h2>
          <p>
            You must be at least 18 to book a job, make a payment, or work as a Helper. VANO is not
            intended for under-18s, and we do not knowingly collect personal data from children. If you
            believe a child has provided us with personal data, please contact us so we can delete it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">12. Changes to this policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of significant
            changes by posting a notice on the platform. The &quot;Last updated&quot; date at the top
            reflects when this policy was last revised.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">13. Contact us</h2>
          <p>
            If you have questions about this Privacy Policy or want to exercise your data rights, contact us:
          </p>
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
          <p className="mt-3 text-sm text-muted-foreground">
            You also have the right to lodge a complaint with the Irish Data Protection Commission (DPC)
            at{' '}
            <a
              href="https://www.dataprotection.ie"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline underline-offset-4"
            >
              dataprotection.ie
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  </div>
);

export default Privacy;
