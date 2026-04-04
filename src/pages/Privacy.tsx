import { Link } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { SEOHead } from '@/components/SEOHead';
import { ArrowLeft } from 'lucide-react';

const LAST_UPDATED = '4 April 2025';

const Privacy = () => (
  <div className="min-h-screen bg-background pb-16 md:pb-0">
    <SEOHead
      title="Privacy Policy – VANO"
      description="How VANO collects, uses, and protects your personal data."
    />
    <Navbar />
    <div className="mx-auto max-w-2xl lg:max-w-3xl px-4 pt-24 pb-12 sm:pt-28 md:px-8">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={16} strokeWidth={2} />
        Back to home
      </Link>

      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-2">
        Privacy Policy
      </h1>
      <p className="text-sm text-muted-foreground mb-10">Last updated: {LAST_UPDATED}</p>

      <div className="prose prose-sm sm:prose-base prose-neutral dark:prose-invert max-w-none space-y-8 text-foreground/85 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">1. Who we are</h2>
          <p>
            VANO (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is a platform that connects businesses
            with freelancers for local gigs in Galway, Ireland. We are the data controller for the
            personal data we process through <strong>vano.app</strong> and related services.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">2. What data we collect</h2>
          <p>We collect the following categories of personal data:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Account information</strong> — email address, display name, and profile photo when you sign up (via email/password or Google sign-in).</li>
            <li><strong>Profile data</strong> — bio, skills, hourly rate, portfolio links, and other details you add to your freelancer or business profile.</li>
            <li><strong>Messages</strong> — content you send through our in-app messaging system.</li>
            <li><strong>Uploaded content</strong> — images and files you upload for your profile, portfolio, community posts, or reviews.</li>
            <li><strong>Usage data</strong> — pages visited, features used, device type, browser type, and IP address (collected automatically).</li>
            <li><strong>Push notification tokens</strong> — if you opt in to push notifications.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">3. How we use your data</h2>
          <p>We use your personal data to:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>Provide and operate the VANO platform (account creation, profiles, messaging, gig posting).</li>
            <li>Display your profile to other users so businesses and freelancers can connect.</li>
            <li>Send transactional emails (gig notifications, message alerts, account updates).</li>
            <li>Send push notifications if you have opted in.</li>
            <li>Moderate content and enforce our <Link to="/terms" className="text-primary hover:underline underline-offset-4">Terms of Service</Link>.</li>
            <li>Improve and develop the platform based on aggregated usage patterns.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">4. Legal basis for processing (GDPR)</h2>
          <p>Under the General Data Protection Regulation (GDPR), we process your data on the following bases:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Contract</strong> — processing necessary to provide the service you signed up for.</li>
            <li><strong>Legitimate interest</strong> — platform security, fraud prevention, and service improvement.</li>
            <li><strong>Consent</strong> — push notifications, marketing emails (where applicable). You can withdraw consent at any time.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">5. How we share your data</h2>
          <p>We do not sell your personal data. We share data with:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Other VANO users</strong> — your public profile information, reviews, and community posts are visible to other users.</li>
            <li><strong>Service providers</strong> — we use trusted third-party services to operate the platform:
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>Supabase (database, authentication, file storage)</li>
                <li>Resend (transactional email delivery)</li>
                <li>Vercel (hosting and deployment)</li>
              </ul>
            </li>
            <li><strong>Legal requirements</strong> — if required by law, regulation, or legal process.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">6. Data retention</h2>
          <p>
            We retain your personal data for as long as your account is active. If you delete your
            account, we will remove your personal data within 30 days, except where we are legally
            required to retain it. Anonymised or aggregated data may be retained indefinitely for
            analytics.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">7. Your rights</h2>
          <p>Under GDPR, you have the right to:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Access</strong> — request a copy of the personal data we hold about you.</li>
            <li><strong>Rectification</strong> — correct inaccurate data (you can edit your profile directly).</li>
            <li><strong>Erasure</strong> — request deletion of your personal data (&quot;right to be forgotten&quot;).</li>
            <li><strong>Data portability</strong> — receive your data in a machine-readable format.</li>
            <li><strong>Restriction</strong> — request we limit how we process your data.</li>
            <li><strong>Object</strong> — object to processing based on legitimate interest.</li>
            <li><strong>Withdraw consent</strong> — where processing is based on consent, withdraw it at any time.</li>
          </ul>
          <p className="mt-3">
            To exercise any of these rights, contact us at the email below. We will respond within 30 days.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">8. Cookies and local storage</h2>
          <p>
            VANO uses essential cookies and browser local storage for authentication and session
            management. These are strictly necessary to operate the platform. We do not use
            third-party advertising cookies. If we introduce analytics cookies in the future, we will
            update this policy and request your consent.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">9. Data security</h2>
          <p>
            We take reasonable technical and organisational measures to protect your personal data,
            including encrypted connections (HTTPS), row-level security policies on our database,
            and access controls on file storage. However, no method of transmission or storage is
            100% secure.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">10. Children</h2>
          <p>
            VANO is not intended for users under the age of 16. We do not knowingly collect
            personal data from children. If you believe a child has provided us with personal data,
            please contact us so we can delete it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">11. Changes to this policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of significant
            changes by posting a notice on the platform. The &quot;Last updated&quot; date at the top
            reflects when this policy was last revised.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">12. Contact us</h2>
          <p>
            If you have questions about this Privacy Policy or want to exercise your data rights, contact us:
          </p>
          <p className="mt-2">
            <strong>Email:</strong>{' '}
            <a href="mailto:hello@vano.app" className="text-primary hover:underline underline-offset-4">
              hello@vano.app
            </a>
          </p>
          <p className="mt-1">
            <strong>Location:</strong> Galway, Ireland
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            You also have the right to lodge a complaint with the Irish Data Protection Commission (DPC)
            at <a href="https://www.dataprotection.ie" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline underline-offset-4">dataprotection.ie</a>.
          </p>
        </section>
      </div>
    </div>
  </div>
);

export default Privacy;
