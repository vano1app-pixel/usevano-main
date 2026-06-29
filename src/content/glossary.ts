/**
 * Glossary content — single source of truth.
 *
 * Like blog.ts, this is pure data (no imports, no JSX) so both the React
 * pages and scripts/prerender-content.ts can consume it. Each term gets its
 * own crawlable page at /glossary/<slug> with DefinedTerm structured data,
 * and is cross-linked from the blog posts. `bodyHtml` is trusted, authored
 * HTML rendered inside a Tailwind `.prose` container.
 */

export interface GlossaryTerm {
  /** URL slug — /glossary/<slug>. */
  slug: string;
  /** The term itself, e.g. "Pay-after-accept". */
  term: string;
  /** One-sentence definition. Shown on the index + used as DefinedTerm text. */
  short: string;
  /** Grouping label shown as a pill. */
  category: string;
  /** Trusted, authored HTML body. */
  bodyHtml: string;
  /** Related term slugs. */
  related: string[];
}

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    slug: "same-day-home-help",
    term: "Same-day home help",
    short:
      "Booking a trusted local helper for a household task today — not next week.",
    category: "Service",
    bodyHtml: `
<p><strong>Same-day home help</strong> is the heart of what Vano does: you book a household task — cleaning, a dog walk, garden work, moving help, a grocery run — and a nearby <a href="/glossary/vano-helper">helper</a> can be on it the same day, often within the hour.</p>
<p>It works because jobs are <a href="/glossary/job-dispatch">dispatched</a> instantly to verified students near you, who accept on the spot. For students, that's the appeal too: you can open the app on a free afternoon and earn <em>today</em>. See <a href="/blog/what-vano-helpers-do">what helpers actually do</a>.</p>
`,
    related: ["job-dispatch", "vano-helper", "autopilot"],
  },
  {
    slug: "vano-helper",
    term: "Vano helper",
    short:
      "A verified local student who accepts and completes home jobs through Vano.",
    category: "People",
    bodyHtml: `
<p>A <strong>Vano helper</strong> is a local, <a href="/glossary/id-verified-helper">ID-verified</a> student who picks up home jobs through the app — dog walks, cleaning, garden work, moving help, errands and online tutoring. Most are students at <a href="/glossary/atu">ATU</a> or the University of Galway earning around their lectures.</p>
<p>Helpers aren't employees on a rota. They choose what to accept and what to skip, and they're paid <a href="/glossary/net-pay">above minimum wage</a> on time-based jobs. Want to be one? Read <a href="/blog/how-to-become-a-vano-helper">how to become a Vano helper</a>.</p>
`,
    related: ["id-verified-helper", "flexible-work", "net-pay"],
  },
  {
    slug: "id-verified-helper",
    term: "ID-verified helper",
    short:
      "A helper whose identity Vano has checked before they can accept jobs.",
    category: "Trust & safety",
    bodyHtml: `
<p>Every <a href="/glossary/vano-helper">Vano helper</a> is <strong>ID-verified</strong> — they confirm their real identity before they can accept a single job. Because customers are letting someone into their home, this isn't optional; it's the foundation of trust on the platform.</p>
<p>Verification protects helpers too: everyone you're working alongside is a real, checked person, not an anonymous account. It's a one-time step during <a href="/blog/how-to-become-a-vano-helper">sign-up</a>.</p>
`,
    related: ["vano-helper", "vano-pay", "escrow"],
  },
  {
    slug: "pay-after-accept",
    term: "Pay-after-accept",
    short:
      "The customer pays only once a helper has accepted the job — never upfront.",
    category: "Payments",
    bodyHtml: `
<p><strong>Pay-after-accept</strong> is how Vano handles money: the customer isn't charged when they request a job — only once a <a href="/glossary/vano-helper">helper</a> has accepted it. No upfront payment, no paying for a job that never gets picked up.</p>
<p>For helpers, this is the reassuring part: by the time you set off, the customer has already paid and the funds are secured by <a href="/glossary/vano-pay">Vano Pay</a>. You're never chasing anyone for cash. It's one of the reasons students <a href="/blog/why-vano-fair-pay-same-day">choose Vano</a>.</p>
`,
    related: ["vano-pay", "escrow", "stripe-connect-payout"],
  },
  {
    slug: "vano-pay",
    term: "Vano Pay",
    short:
      "Vano's secure payment system that holds funds safely and pays helpers out.",
    category: "Payments",
    bodyHtml: `
<p><strong>Vano Pay</strong> is the payment engine behind every job. When a customer pays (after a helper <a href="/glossary/pay-after-accept">accepts</a>), Vano Pay holds the money safely in <a href="/glossary/escrow">escrow</a>, then releases the helper's <a href="/glossary/net-pay">earnings</a> through <a href="/glossary/stripe-connect-payout">Stripe</a> once the job is marked complete.</p>
<p>It means customers know their money is protected until the work is done, and helpers know they'll be paid the moment they finish. Nobody handles cash.</p>
`,
    related: ["escrow", "pay-after-accept", "stripe-connect-payout"],
  },
  {
    slug: "escrow",
    term: "Escrow",
    short:
      "Money held safely by a third party until both sides have done their part.",
    category: "Payments",
    bodyHtml: `
<p><strong>Escrow</strong> is a simple, old idea: a neutral party holds the money until the deal is complete. On Vano, when a customer pays for a job, the funds sit in escrow — not in the helper's account yet, and no longer fully in the customer's.</p>
<p>Once the <a href="/glossary/vano-helper">helper</a> marks the job done, escrow releases their <a href="/glossary/net-pay">earnings</a> via <a href="/glossary/stripe-connect-payout">Stripe</a>. It protects both sides: the customer's money isn't gone until the work happens, and the helper knows the cash is already there. This is all handled by <a href="/glossary/vano-pay">Vano Pay</a>.</p>
`,
    related: ["vano-pay", "stripe-connect-payout", "pay-after-accept"],
  },
  {
    slug: "stripe-connect-payout",
    term: "Stripe Connect payout",
    short:
      "The secure transfer that lands a helper's earnings in their own account.",
    category: "Payments",
    bodyHtml: `
<p>A <strong>Stripe Connect payout</strong> is how a <a href="/glossary/vano-helper">helper's</a> money actually reaches them. Stripe is the same trusted payments company used by huge platforms worldwide; "Connect" is the part of it built for paying out to many individual people.</p>
<p>During <a href="/blog/how-to-become-a-vano-helper">sign-up</a> you complete a short Stripe onboarding once. After that, each completed job's <a href="/glossary/net-pay">net earnings</a> are transferred to you automatically. If onboarding isn't finished yet, earnings wait safely and sweep through the moment it is.</p>
`,
    related: ["vano-pay", "escrow", "net-pay"],
  },
  {
    slug: "platform-fee",
    term: "Platform fee (student-side cut)",
    short:
      "The 15% Vano keeps from a time-based job — the rest is the helper's net pay.",
    category: "Payments",
    bodyHtml: `
<p>The <strong>platform fee</strong>, or student-side cut, is the slice Vano keeps to run the service: <strong>15%</strong> of a time-based job. The remaining 85% is the helper's <a href="/glossary/net-pay">net pay</a>.</p>
<p>We set prices around this fee on purpose, so that what's left always clears the <a href="/glossary/minimum-wage-ireland">minimum wage</a>. On a €18/hr job, the 15% cut leaves the helper €15.30/hr. (Customers also pay a small separate booking fee, so Vano's total take is around 22.5% of the quoted price.) The full breakdown is in <a href="/blog/why-vano-fair-pay-same-day">why Vano pays above minimum wage</a>.</p>
`,
    related: ["net-pay", "minimum-wage-ireland", "vano-pay"],
  },
  {
    slug: "net-pay",
    term: "Net pay (take-home)",
    short:
      "What a helper actually keeps after Vano's cut — €15.30/hr on time-based jobs.",
    category: "Payments",
    bodyHtml: `
<p><strong>Net pay</strong> is the number that matters: what you actually take home after the <a href="/glossary/platform-fee">platform fee</a> comes out. On Vano's time-based jobs — cleaning, garden, moving, online tutoring — that's <strong>€15.30 an hour</strong>.</p>
<p>That figure isn't random. It's set so your take-home always lands above Ireland's 2026 <a href="/glossary/minimum-wage-ireland">minimum wage</a> of €14.15. Earnings are paid to you via <a href="/glossary/stripe-connect-payout">Stripe</a> after each job. See how students stack it up in the <a href="/blog/atu-students-earning-with-vano">ATU earnings guide</a>.</p>
`,
    related: ["platform-fee", "minimum-wage-ireland", "stripe-connect-payout"],
  },
  {
    slug: "minimum-wage-ireland",
    term: "Minimum wage (Ireland, 2026)",
    short:
      "Ireland's legal pay floor — €14.15/hr in 2026. Vano's net pay sits above it.",
    category: "Money",
    bodyHtml: `
<p>The <strong>national minimum wage</strong> in Ireland is the lowest hourly rate an employer can legally pay. For 2026 it's <strong>€14.15 an hour</strong>.</p>
<p>Vano treats that as a floor to beat, not a target to hit. Every time-based job is priced so a helper's <a href="/glossary/net-pay">net pay</a> — after the <a href="/glossary/platform-fee">15% cut</a> — comes to €15.30/hr, comfortably above the minimum. There's even an automated test in our codebase that blocks any rate from shipping below the legal floor. More in <a href="/blog/why-vano-fair-pay-same-day">why Vano pays above minimum wage</a>.</p>
`,
    related: ["net-pay", "platform-fee", "flexible-work"],
  },
  {
    slug: "autopilot",
    term: "Autopilot",
    short:
      "Vano's weekly or monthly plan that keeps a home looked after on a schedule.",
    category: "Service",
    bodyHtml: `
<p><strong>Autopilot</strong> is Vano's subscription: instead of booking one task at a time, a customer puts their home on a weekly or monthly plan — a recurring cleaning refresh, regular dog walks, ongoing garden upkeep.</p>
<p>For <a href="/glossary/vano-helper">helpers</a>, Autopilot visits are scheduled work, so if you'd like something more regular alongside one-off <a href="/glossary/same-day-home-help">same-day</a> jobs, it's there. It's how busy households keep things ticking over without rebooking each week.</p>
`,
    related: ["same-day-home-help", "vano-helper", "job-dispatch"],
  },
  {
    slug: "flexible-work",
    term: "Flexible work",
    short:
      "Work with no fixed rota — you pick up jobs that fit around your week.",
    category: "Work",
    bodyHtml: `
<p><strong>Flexible work</strong> means there's no set rota and no boss assigning you shifts. You decide when you're available and accept jobs that fit — perfect for a student whose timetable changes every semester.</p>
<p>On Vano, flexible doesn't mean badly paid: time-based jobs still clear the <a href="/glossary/minimum-wage-ireland">minimum wage</a> at €15.30/hr <a href="/glossary/net-pay">net</a>. That combination — your schedule, fair pay — is the whole pitch. Read <a href="/blog/part-time-jobs-students-galway">why flexible beats a fixed rota</a>.</p>
`,
    related: ["net-pay", "vano-helper", "same-day-home-help"],
  },
  {
    slug: "job-dispatch",
    term: "Job dispatch",
    short:
      "How a new job is sent out to nearby helpers by SMS and push to accept.",
    category: "How it works",
    bodyHtml: `
<p><strong>Dispatch</strong> is the moment a booked job goes out to <a href="/glossary/vano-helper">helpers</a>. When a customer requests <a href="/glossary/same-day-home-help">same-day help</a>, Vano notifies suitable helpers nearby by SMS and push notification. Whoever accepts first gets the job.</p>
<p>For helpers it means jobs come to you — you don't have to refresh and hunt. Open the notification, check the details and pay, and accept if it suits. On accepting, <a href="/glossary/pay-after-accept">the customer pays</a> and you're set to go.</p>
`,
    related: ["pay-after-accept", "same-day-home-help", "vano-helper"],
  },
  {
    slug: "atu",
    term: "ATU (Atlantic Technological University)",
    short:
      "A major university with a Galway campus — home to many Vano helpers.",
    category: "Galway",
    bodyHtml: `
<p><strong>ATU</strong> — Atlantic Technological University — is one of Ireland's largest universities, with a major campus in Galway. Together with the University of Galway, it's why the city has thousands of students looking for work that fits around lectures.</p>
<p>ATU students make up a big share of <a href="/glossary/vano-helper">Vano helpers</a>: jobs are often a short walk or cycle from campus, and the <a href="/glossary/flexible-work">flexible</a> model suits a student timetable. See <a href="/blog/atu-students-earning-with-vano">how ATU students earn with Vano</a>.</p>
`,
    related: ["vano-helper", "flexible-work", "eircode"],
  },
  {
    slug: "eircode",
    term: "Eircode",
    short:
      "Ireland's seven-character postcode that pinpoints an exact address.",
    category: "Galway",
    bodyHtml: `
<p>An <strong>Eircode</strong> is Ireland's postcode — a unique seven-character code (like H91 ABC1) that identifies an individual address. Unlike postcodes in some countries, each Eircode points to a single property.</p>
<p>On Vano, the customer's Eircode helps a <a href="/glossary/vano-helper">helper</a> find the exact door quickly when they head to a job — handy in areas where house names and numbers can be vague. It's part of what keeps <a href="/glossary/same-day-home-help">same-day</a> jobs running smoothly.</p>
`,
    related: ["same-day-home-help", "atu", "job-dispatch"],
  },
];

/** Lookup by slug — used by the route and the prerenderer. */
export function getTermBySlug(slug: string): GlossaryTerm | undefined {
  return GLOSSARY_TERMS.find((t) => t.slug === slug);
}
