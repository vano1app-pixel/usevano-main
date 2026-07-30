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
      "Nothing is charged until a helper accepts — then a small booking fee confirms it.",
    category: "Payments",
    bodyHtml: `
<p><strong>Pay-after-accept</strong> is how Vano handles money: requesting a job is free, and nothing touches your card until a <a href="/glossary/vano-helper">helper</a> has actually accepted it. At that point a small <a href="/glossary/platform-fee">booking fee</a> by card confirms the booking — never the job price itself.</p>
<p>The job price is paid to your helper <strong>directly</strong> once the work is done — Revolut or cash, whatever suits — and they keep 100% of it. No upfront payment, no paying for a job that never gets picked up, and helpers confirm in the app that they've been paid.</p>
`,
    related: ["platform-fee", "net-pay", "vano-helper"],
  },
  {
    slug: "vano-pay",
    term: "Vano Pay",
    short:
      "Vano's secure payment system that holds funds safely and pays helpers out.",
    category: "Payments",
    bodyHtml: `
<p><strong>Vano Pay</strong> was the payment engine behind older Vano bookings: when a customer paid (after a helper <a href="/glossary/pay-after-accept">accepted</a>), Vano Pay held the money safely in <a href="/glossary/escrow">escrow</a>, then released the helper's <a href="/glossary/net-pay">earnings</a> through <a href="/glossary/stripe-connect-payout">Stripe</a> once the job was marked complete.</p>
<p>Today's bookings work more simply: Vano charges only its <a href="/glossary/platform-fee">booking fee</a> by card, and the customer pays the helper the job price directly when the work is done — the helper keeps 100%. Bookings made under the old system still pay out the old way.</p>
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
<p><strong>Escrow</strong> is a simple, old idea: a neutral party holds the money until the deal is complete. On older Vano bookings, when a customer paid for a job the funds sat in escrow — not in the helper's account yet, and no longer fully in the customer's — then released to the helper via <a href="/glossary/stripe-connect-payout">Stripe</a> when the job was done. This was handled by <a href="/glossary/vano-pay">Vano Pay</a>.</p>
<p>Current bookings don't need it: the customer pays the <a href="/glossary/vano-helper">helper</a> directly when the job's done and the helper keeps 100%, with Vano charging only a small <a href="/glossary/platform-fee">booking fee</a>. Older bookings still in flight complete under the escrow rules.</p>
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
<p>A <strong>Stripe Connect payout</strong> is how a <a href="/glossary/vano-helper">helper's</a> money reached them on older Vano bookings. Stripe is the same trusted payments company used by huge platforms worldwide; "Connect" is the part of it built for paying out to many individual people.</p>
<p>On current bookings helpers don't need it — the customer pays them <strong>directly</strong> when the job's done (Revolut or cash) and they keep 100%. Any older booking's <a href="/glossary/net-pay">earnings</a> still transfer automatically through Stripe once the job completes.</p>
`,
    related: ["vano-pay", "escrow", "net-pay"],
  },
  {
    slug: "platform-fee",
    term: "Booking fee (platform fee)",
    short:
      "The small fee Vano charges the customer when a helper accepts — 15% of the job price, minimum €4.",
    category: "Payments",
    bodyHtml: `
<p>The <strong>booking fee</strong> is how Vano is paid: <strong>15% of the job price, with a €4 minimum</strong>, charged to the customer's card when a helper accepts. It's the only money Vano touches — it funds the matching, ID checks, support and the money-back guarantee.</p>
<p>Nothing comes out of the helper's side any more: the job price is paid to the helper directly and they keep <strong>100%</strong> of it as their <a href="/glossary/net-pay">take-home</a>. (On older bookings Vano kept a 15% student-side cut instead — that only applies to jobs booked under the old system.) The full breakdown is in <a href="/blog/why-vano-fair-pay-same-day">why Vano pays above minimum wage</a>.</p>
`,
    related: ["net-pay", "minimum-wage-ireland", "vano-pay"],
  },
  {
    slug: "net-pay",
    term: "Net pay (take-home)",
    short:
      "What a helper actually keeps — 100% of the job price, €22/hr on time-based jobs.",
    category: "Payments",
    bodyHtml: `
<p><strong>Net pay</strong> is the number that matters: what you actually take home. On Vano it's simple — the customer pays you the full job price directly and you keep <strong>100%</strong>. On time-based jobs — cleaning, garden, moving, online tutoring — that's <strong>€22 an hour</strong>; Vano's <a href="/glossary/platform-fee">booking fee</a> is charged to the customer, not you.</p>
<p>That comfortably clears Ireland's 2026 <a href="/glossary/minimum-wage-ireland">minimum wage</a> of €14.15. You're paid straight after each job — Revolut or cash — and you confirm it in the app. See how students stack it up in the <a href="/blog/atu-students-earning-with-vano">ATU earnings guide</a>.</p>
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
<p>Vano treats that as a floor to beat, not a target to hit. Every time-based job is priced at €22/hr and the helper keeps <a href="/glossary/net-pay">100% of it</a> — Vano's <a href="/glossary/platform-fee">booking fee</a> is charged to the customer instead. There's even an automated test in our codebase that blocks any rate from shipping below the legal floor. More in <a href="/blog/why-vano-fair-pay-same-day">why Vano pays above minimum wage</a>.</p>
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
<p>On Vano, flexible doesn't mean badly paid: time-based jobs pay €22/hr and you keep <a href="/glossary/net-pay">100%</a> — well clear of the <a href="/glossary/minimum-wage-ireland">minimum wage</a>. That combination — your schedule, fair pay — is the whole pitch. Read <a href="/blog/part-time-jobs-students-galway">why flexible beats a fixed rota</a>.</p>
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
  {
    slug: "deep-clean",
    term: "Deep clean",
    short:
      "A top-to-bottom clean that gets into the corners a weekly tidy skips.",
    category: "Cleaning",
    bodyHtml: `
<p>A <strong>deep clean</strong> goes beyond the usual once-over: skirting boards, inside cupboards, behind furniture, limescale on taps and tiles, the grime a quick weekly wipe never reaches. Most homes want one every few months, before guests, or after a busy stretch when the house "got away" a bit.</p>
<p>On Vano a deep clean is priced by time at <strong>€22/hr</strong> — most homes book 3–4 hours — and your <a href="/glossary/student-cleaner">student cleaner</a> keeps 100% of that. Not sure which you need? Read <a href="/blog/deep-clean-vs-standard-clean">deep clean vs standard clean</a> or see <a href="/cleaning-galway">cleaning in Galway</a>.</p>
`,
    related: ["spring-clean", "end-of-tenancy-clean", "student-cleaner"],
  },
  {
    slug: "spring-clean",
    term: "Spring clean",
    short:
      "The once-a-year whole-home refresh — declutter, scrub, reset every room.",
    category: "Cleaning",
    bodyHtml: `
<p>A <strong>spring clean</strong> is the big seasonal reset: windows opened, every room aired, surfaces scrubbed, clutter cleared and the whole house given a fresh start. Traditionally done in spring, but honestly — any time the house needs a reset counts.</p>
<p>It's essentially a <a href="/glossary/deep-clean">deep clean</a> with some tidying and organising mixed in. On Vano it's booked by the hour (<strong>€22/hr</strong>, helper keeps 100%) so you decide how big to go — two hours for the kitchen and bathroom, or a half-day for the works. Book it on the <a href="/cleaning-galway">cleaning page</a>.</p>
`,
    related: ["deep-clean", "oven-clean", "same-day-home-help"],
  },
  {
    slug: "end-of-tenancy-clean",
    term: "End-of-tenancy clean",
    short:
      "The move-out clean that gets a rental back to handover standard — and your deposit back.",
    category: "Cleaning",
    bodyHtml: `
<p>An <strong>end-of-tenancy clean</strong> (also called a move-out clean) is the thorough clean a rental needs before you hand back the keys: oven degreased, bathroom descaled, floors, skirting, inside the fridge and cupboards — the standard a landlord or agent checks against before releasing your deposit.</p>
<p>In a student city like Galway it's one of the most-booked cleans every summer. On Vano it's priced by time at <strong>€22/hr</strong> (most one-bed flats take 3–4 hours) and you can often get it done <a href="/glossary/same-day-home-help">same-day</a>. There's a full room-by-room checklist in our <a href="/blog/end-of-tenancy-cleaning-galway">end-of-tenancy guide</a>.</p>
`,
    related: ["deep-clean", "oven-clean", "student-cleaner"],
  },
  {
    slug: "oven-clean",
    term: "Oven clean",
    short:
      "Degreasing and scrubbing the oven inside-out — the job everyone puts off.",
    category: "Cleaning",
    bodyHtml: `
<p>An <strong>oven clean</strong> is exactly what it sounds like — racks out and soaked, burnt-on grease lifted, glass door brought back to see-through. It's the single most put-off job in most kitchens, and one of the first things a landlord looks at in an <a href="/glossary/end-of-tenancy-clean">end-of-tenancy clean</a>.</p>
<p>On Vano, book "Oven &amp; kitchen clean" from the <a href="/cleaning-galway">cleaning menu</a> — priced by time at <strong>€22/hr</strong>, and an hour or two usually does it. Your helper keeps 100% of the job price.</p>
`,
    related: ["deep-clean", "end-of-tenancy-clean", "spring-clean"],
  },
  {
    slug: "ironing-service",
    term: "Ironing service",
    short:
      "Someone takes the ironing pile off your hands — by the basket or by the hour.",
    category: "Home services",
    bodyHtml: `
<p>An <strong>ironing service</strong> means a helper works through your ironing pile — shirts, uniforms, bedding — so you don't spend your Sunday evening on it. It pairs naturally with Vano's <a href="/laundry-service-galway">laundry service</a> (€30, collected, washed and returned folded) or can be booked on its own as a custom job.</p>
<p>Like all time-based Vano jobs it's <strong>€22/hr</strong>, your helper keeps 100%, and you pay them directly when it's done — <a href="/glossary/pay-after-accept">nothing is charged until a helper says yes</a>.</p>
`,
    related: ["same-day-home-help", "pay-after-accept", "vano-helper"],
  },
  {
    slug: "flat-pack-assembly",
    term: "Flat-pack assembly",
    short:
      "Getting IKEA-style furniture out of the box and standing — without the row.",
    category: "Home services",
    bodyHtml: `
<p><strong>Flat-pack assembly</strong> is building boxed furniture — bed frames, wardrobes, desks, bookshelves — from the instruction leaflet, properly and without the domestic argument that famously comes with it.</p>
<p>On Vano it's a classic "<a href="/glossary/same-day-home-help">Anything else</a>" booking: describe the job (say, "assemble an IKEA wardrobe"), book the time, and a nearby student turns up with patience and an Allen key. Priced by time at <strong>€22/hr</strong> — short jobs can book 30 minutes from €14. It also pairs well with a hand carrying a few boxes when you're setting up a new place.</p>
`,
    related: ["same-day-home-help", "vano-helper", "pay-after-accept"],
  },
  {
    slug: "on-lead-dog-walking",
    term: "On-lead dog walking",
    short:
      "The dog stays on the lead for the whole walk — the safe default for a new walker.",
    category: "Pets",
    bodyHtml: `
<p><strong>On-lead dog walking</strong> means your dog stays on the lead for the entire walk, door to door. It's the standard for professional walks — and the only kind Vano helpers do — because it's the safe default when a dog is out with someone who isn't its owner: no recall gambles, no traffic risk, no run-ins with other dogs.</p>
<p>A Vano walk is <strong>€15 for 30 minutes or €20 for a full hour</strong>, bookable <a href="/glossary/same-day-home-help">same-day</a>. You'll see who's coming (photo, name, rating) before they ring the bell — see <a href="/dog-walking-galway">dog walking in Galway</a> and our <a href="/blog/dog-walker-galway-cost">dog walker price guide</a>.</p>
`,
    related: ["vano-helper", "id-verified-helper", "same-day-home-help"],
  },
  {
    slug: "vano-cover",
    term: "Vano Cover",
    short:
      "Optional €2 damage protection — accidental damage covered up to €250 for that booking.",
    category: "Trust & safety",
    bodyHtml: `
<p><strong>Vano Cover</strong> is the optional protection you can tick on when booking: for a flat <strong>€2</strong>, accidental damage during that job is covered up to <strong>€250</strong> — we repair, replace or refund. Knock a vase while hoovering, chip a plate doing the washing-up — that's what it's for.</p>
<p>To use it, tell us within 24 hours with a photo; your helper's before-and-after job photos help too. It's entirely optional — bookings work fine without it — but for €2 most people consider it cheap peace of mind. Full details at <a href="/cover">vanojobs.com/cover</a>.</p>
`,
    related: ["pay-after-accept", "id-verified-helper", "arrival-code"],
  },
  {
    slug: "arrival-code",
    term: "Arrival code",
    short:
      "The 4-digit code on your screen that a helper must enter before starting the job.",
    category: "Trust & safety",
    bodyHtml: `
<p>The <strong>arrival code</strong> is a 4-digit code that appears only on the customer's tracking screen when a helper arrives. The helper types it into their own phone to start the job — proving they're at the right door, with the right person, before the clock starts.</p>
<p>It's one of the small checks that make letting a stranger into your home feel safe on Vano, alongside <a href="/glossary/id-verified-helper">ID verification</a>, the live map on the way, and ratings after every job. You never need to remember it — it's on your screen when it's needed.</p>
`,
    related: ["id-verified-helper", "vano-cover", "same-day-home-help"],
  },
  {
    slug: "student-cleaner",
    term: "Student cleaner",
    short:
      "A local, ID-verified student doing cleaning jobs around their lectures.",
    category: "People",
    bodyHtml: `
<p>A <strong>student cleaner</strong> is a local university student — in Galway, usually from <a href="/glossary/atu">ATU</a> or the University of Galway — earning around lectures by taking cleaning jobs. On Vano every one is <a href="/glossary/id-verified-helper">ID-verified</a> before their first job, rated after every job, and paid the full job price directly by the customer.</p>
<p>Why book a student rather than an agency? Same-day availability, straightforward hourly pricing (<strong>€22/hr</strong>, no call-out fees or contracts), and your money goes to a local student rather than an agency margin. See <a href="/cleaning-galway">cleaning in Galway</a> or the full <a href="/blog/cleaner-cost-galway">Galway cleaner price guide</a>.</p>
`,
    related: ["vano-helper", "id-verified-helper", "deep-clean"],
  },
];

/** Lookup by slug — used by the route and the prerenderer. */
export function getTermBySlug(slug: string): GlossaryTerm | undefined {
  return GLOSSARY_TERMS.find((t) => t.slug === slug);
}
