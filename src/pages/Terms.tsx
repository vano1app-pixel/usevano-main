import { Link } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { SEOHead } from '@/components/SEOHead';
import { ArrowLeft } from 'lucide-react';

const LAST_UPDATED = '4 April 2025';

const Terms = () => (
  <div className="min-h-screen bg-background pb-16 md:pb-0">
    <SEOHead
      title="Terms of Service – VANO"
      description="Terms and conditions for using the VANO platform."
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
        Terms of Service
      </h1>
      <p className="text-sm text-muted-foreground mb-10">Last updated: {LAST_UPDATED}</p>

      <div className="prose prose-sm sm:prose-base prose-neutral dark:prose-invert max-w-none space-y-8 text-foreground/85 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">1. Agreement to terms</h2>
          <p>
            By accessing or using VANO (&quot;the Platform&quot;), you agree to be bound by these
            Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not use the
            Platform. VANO is operated from Galway, Ireland.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">2. Eligibility</h2>
          <p>
            You must be at least 16 years old to create an account and use VANO. By registering, you
            confirm that you meet this age requirement and that the information you provide is
            accurate.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">3. What VANO provides</h2>
          <p>
            VANO is a marketplace platform that connects businesses with freelancers for local gigs.
            We provide:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>Freelancer profiles with portfolios and reviews.</li>
            <li>Gig posting for businesses seeking talent.</li>
            <li>In-app messaging between users.</li>
            <li>A community board for visibility and discovery.</li>
          </ul>
          <p className="mt-3">
            <strong>VANO is a connection platform, not a party to any agreement between users.</strong>{' '}
            We facilitate introductions — all work scope, deliverables, timelines, and payments are
            agreed directly between the hiring party and the freelancer.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">4. Your account</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>You are responsible for maintaining the security of your account credentials.</li>
            <li>You must provide accurate and complete information on your profile.</li>
            <li>You may not create multiple accounts or impersonate another person.</li>
            <li>You must notify us immediately if you suspect unauthorised access to your account.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">5. Acceptable use</h2>
          <p>When using VANO, you agree not to:</p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>Post false, misleading, or fraudulent content.</li>
            <li>Harass, abuse, or threaten other users.</li>
            <li>Send spam or unsolicited promotional messages.</li>
            <li>Upload content that is illegal, harmful, or infringes on intellectual property rights.</li>
            <li>Attempt to access other users&apos; accounts or private data.</li>
            <li>Use the platform for any unlawful purpose.</li>
            <li>Scrape, crawl, or use automated tools to extract data from the platform without permission.</li>
            <li>Circumvent or interfere with platform security features.</li>
          </ul>
          <p className="mt-3">
            We reserve the right to suspend or terminate accounts that violate these rules, without
            prior notice.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">6. Content you post</h2>
          <p>
            You retain ownership of content you create and upload to VANO (profile information,
            portfolio items, messages, reviews, community posts). By posting content, you grant VANO
            a non-exclusive, worldwide, royalty-free licence to display, distribute, and promote your
            content within the platform for the purpose of operating the service.
          </p>
          <p className="mt-3">
            We may remove content that violates these Terms or that we determine is inappropriate,
            harmful, or misleading. Community posts and freelancer profiles may be subject to
            moderation before appearing publicly.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">7. Payments and fees</h2>
          <p>
            VANO is currently <strong>free to use</strong> for both freelancers and businesses. We do
            not process payments between users — all financial arrangements are made directly between
            the parties involved.
          </p>
          <p className="mt-3">
            If we introduce paid features or transaction fees in the future, we will notify you in
            advance and update these Terms accordingly.
          </p>
          <p className="mt-3">
            <strong>VANO is not responsible for payment disputes between users.</strong> We recommend
            agreeing on scope, deliverables, and payment terms clearly in your messages before
            starting work.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">8. Reviews and ratings</h2>
          <p>
            Users may leave reviews for freelancers they have worked with. Reviews must be honest,
            accurate, and based on genuine experience. We reserve the right to remove reviews that
            are fake, abusive, or violate these Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">9. Disclaimer of warranties</h2>
          <p>
            VANO is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any
            kind, either express or implied. We do not guarantee:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 mt-2">
            <li>The quality, reliability, or accuracy of any freelancer&apos;s work.</li>
            <li>That gigs posted will be completed as described.</li>
            <li>That the platform will be uninterrupted, secure, or error-free.</li>
            <li>The accuracy of information provided by other users.</li>
          </ul>
          <p className="mt-3">
            You use the platform at your own risk. We encourage you to review portfolios, read
            reviews, and communicate clearly before hiring or accepting work.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">10. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by Irish and EU law, VANO shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages, including but not
            limited to loss of profits, data, or business opportunities, arising from your use of
            the platform.
          </p>
          <p className="mt-3">
            Our total liability for any claim related to the platform shall not exceed the amount you
            have paid us (if any) in the 12 months prior to the claim.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">11. Disputes between users</h2>
          <p>
            VANO is not a party to agreements between users. If a dispute arises between a freelancer
            and a business, the parties are responsible for resolving it directly. While we may
            provide guidance or mediate informally where possible, we are under no obligation to do
            so.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">12. Account termination</h2>
          <p>
            You may delete your account at any time. We may suspend or terminate your account if you
            violate these Terms or if we reasonably believe your conduct harms the platform or other
            users. Upon termination, your right to use the platform ceases immediately.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">13. Changes to these terms</h2>
          <p>
            We may update these Terms from time to time. We will notify you of material changes by
            posting a notice on the platform. Continued use of VANO after changes take effect
            constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">14. Governing law</h2>
          <p>
            These Terms are governed by the laws of Ireland. Any disputes arising from or relating to
            these Terms or the platform shall be subject to the exclusive jurisdiction of the courts
            of Ireland.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">15. Privacy</h2>
          <p>
            Your use of VANO is also governed by our{' '}
            <Link to="/privacy" className="text-primary hover:underline underline-offset-4">
              Privacy Policy
            </Link>
            , which explains how we collect, use, and protect your personal data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">16. Contact</h2>
          <p>
            If you have questions about these Terms, contact us:
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
        </section>
      </div>
    </div>
  </div>
);

export default Terms;
