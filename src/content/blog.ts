/**
 * Blog content — single source of truth.
 *
 * Consumed in TWO places, so keep it pure data (no imports, no JSX):
 *   1. The React pages (BlogIndex / BlogPost) render it client-side.
 *   2. scripts/prerender-content.ts reads it at build time and bakes the
 *      `bodyHtml` into static HTML so AI crawlers (GPTBot, PerplexityBot,
 *      ClaudeBot) — which don't run JavaScript — can read every word.
 *
 * `bodyHtml` is hand-authored, trusted HTML (no user input) rendered via
 * dangerouslySetInnerHTML inside a Tailwind `.prose` container. Internal
 * links are plain <a href> so they're crawlable and work in the prerendered
 * HTML; in the SPA they trigger a normal navigation to another prerendered
 * page, which is fine (and fast).
 */

export interface BlogPost {
  /** URL slug — /blog/<slug>. Lowercase, hyphenated, never change once live. */
  slug: string;
  /** <h1> + <title>. Keep under ~60 chars where possible for SERP display. */
  title: string;
  /** Meta description + card text. ~150–160 chars, one clear sentence. */
  description: string;
  /** Punchy 1–2 sentence "quick answer" — shown as a callout and ideal for GEO. */
  summary: string;
  /** Comma-separated keywords for the meta tag (minor signal, still worth it). */
  keywords: string;
  /** Short label above the title on the page. */
  eyebrow: string;
  /** ISO date. Drives og:article:published_time + BlogPosting.datePublished. */
  datePublished: string;
  /** ISO date of last meaningful edit. */
  dateModified: string;
  /** Rough read time in minutes, shown in the UI. */
  readingMins: number;
  /** Author name — edit freely. Used for BlogPosting.author. */
  author: string;
  /** Tailwind gradient classes for the branded hero block. */
  heroGradient: string;
  /** Keyword-rich alt text for the hero image once a real photo is dropped in. */
  heroAlt: string;
  /**
   * Real hero photo path (e.g. '/blog/atu-students.jpg'). When set, the page
   * shows the photo instead of the branded gradient. Leave undefined to use
   * the gradient placeholder.
   */
  heroImage?: string;
  /** Topic tags shown as pills. */
  tags: string[];
  /** Trusted, hand-authored HTML body. */
  bodyHtml: string;
  /** Slugs of related posts shown at the bottom. */
  related: string[];
  /** Collapsible FAQ at the foot of the post — rendered as <details> and FAQPage JSON-LD. */
  faqs: { q: string; a: string }[];
  /** Optional step-by-step list — emitted as HowTo JSON-LD on genuine how-to posts. */
  howTo?: { name: string; text: string }[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "part-time-jobs-students-galway",
    title: "Part-Time Jobs for Students in Galway: Why Flexible Work Wins",
    summary:
      "The best part-time jobs for students in Galway are flexible ones you pick up around lectures — short, local tasks like dog walks, cleaning and moving help that pay above minimum wage, with no fixed rota to clash with your timetable.",
    description:
      "Looking for part-time jobs in Galway as a student? Here's why flexible, same-day work that fits around lectures beats a fixed rota — and how to start.",
    keywords:
      "part-time jobs Galway, student jobs Galway, flexible work Galway, part time jobs for students Ireland, student side hustle Galway, ATU student jobs",
    eyebrow: "For students",
    datePublished: "2026-04-22",
    dateModified: "2026-06-10",
    readingMins: 5,
    author: "The Vano Team",
    heroGradient: "from-navy via-navy to-sage-dark",
    heroAlt:
      "A student in Galway checking part-time job offers on their phone between lectures",
    tags: ["Student jobs", "Galway", "Flexible work"],
    bodyHtml: `
<p>Finding <strong>part-time jobs in Galway</strong> as a student usually means one of two things: a fixed rota in a café or shop that collides with your lectures, or nothing at all. Neither works when your timetable changes every semester and exam season swallows whole weeks.</p>
<p>There's a third option that's grown fast around the city's two big campuses — <a href="/glossary/flexible-work">flexible, on-demand work</a> you pick up between classes. No set shifts, no manager building a rota around someone else's availability. You see a nearby job, you decide if it fits, you do it, you get paid.</p>
<h2>Why a fixed rota fights your timetable</h2>
<p>A traditional part-time job assumes your week looks the same every week. Student weeks don't. You've got a 9am lab on Monday, nothing on Wednesday, a group project that moves, and a reading week that wipes the calendar. Committing to "Tuesdays and Thursdays, 5–10pm" in September is a guess you'll regret by November.</p>
<p>Flexible work flips that. You open the app when you actually have a free afternoon and take a <a href="/glossary/same-day-home-help">same-day</a> job near you — a dog walk, an hour of cleaning, helping someone move a couch. When you're slammed with deadlines, you simply don't accept anything. The work waits for you instead of the other way around.</p>
<h2>What flexible student work in Galway actually looks like</h2>
<ul>
<li><strong>Dog walks</strong> — 30 minutes, often a five-minute cycle from campus.</li>
<li><strong>Cleaning &amp; tidy-ups</strong> — a quick refresh of a flat or house.</li>
<li><strong>Garden help</strong> — mowing, weeding, bagging waste.</li>
<li><strong>Moving help</strong> — loading, carrying, the heavy stuff.</li>
<li><strong>Grocery collection &amp; errands</strong> — pick up a click-and-collect order and drop it to someone's door.</li>
<li><strong>Tutoring</strong> — one-to-one in a subject you already know.</li>
</ul>
<p>Most of it is local, walkable or cyclable, and finished inside an hour or two — the kind of thing you can slot between a morning lecture and an afternoon seminar.</p>
<h2>Does the pay actually stack up?</h2>
<p>This is where flexible work earns its keep. The problem with a lot of student jobs is the rate. On Vano, every time-based job is priced so that after our cut you take home <strong>more than the Irish <a href="/glossary/minimum-wage-ireland">minimum wage</a></strong> — currently €15.30 an hour net on cleaning, garden, moving and tutoring. That's a deliberate floor, not a happy accident. We explain exactly how that maths works in <a href="/blog/why-vano-fair-pay-same-day">why Vano pays above minimum wage</a>.</p>
<p>And because of <a href="/glossary/pay-after-accept">pay-after-accept</a>, there's no chasing anyone for cash — the customer pays once you accept, and your earnings land via <a href="/glossary/stripe-connect-payout">Stripe</a> after the job's done.</p>
<h2>Getting started</h2>
<p>If you're an <a href="/glossary/atu">ATU</a> or University of Galway student, you can sign up, verify your ID, and start seeing nearby jobs the same week. We walk through the whole thing — verification, getting paid, your first job — in <a href="/blog/how-to-become-a-vano-helper">how to become a Vano helper</a>.</p>
<p><a href="/join"><strong>Join as a helper →</strong></a></p>
`,
    related: ["how-to-become-a-vano-helper", "why-vano-fair-pay-same-day", "atu-students-earning-with-vano"],
    faqs: [
      { q: "What are the best part-time jobs for students in Galway?", a: "Flexible, local jobs you can do around lectures — dog walks, cleaning, garden help, moving help, errands and tutoring — without committing to a fixed weekly rota." },
      { q: "How many hours do I have to work?", a: "None are required. There's no rota and no minimum: you accept jobs only when you're free, and pause completely during exams." },
      { q: "Do part-time student jobs in Galway pay well?", a: "On Vano, time-based jobs are priced so you take home €15.30 an hour net — above Ireland's 2026 minimum wage of €14.15." },
      { q: "Can I really work around my college timetable?", a: "Yes. You pick up same-day jobs in the gaps between classes, so the work fits your week instead of the other way around." },
    ],
  },

  {
    slug: "atu-students-earning-with-vano",
    title: "How ATU Students Are Earning €15+/hr With Vano Between Lectures",
    summary:
      "ATU students earn €15.30 an hour (net, above Ireland's minimum wage) doing short jobs near campus — dog walks, cleaning, moving help — picked up whenever they have a gap between lectures, with payment secured before they start.",
    description:
      "ATU Galway students are picking up same-day jobs around campus and taking home €15.30/hr net. Here's how the money works and why students like it.",
    keywords:
      "ATU student jobs, ATU Galway jobs, student income Galway, earn money between lectures, student jobs near ATU, part-time work ATU students",
    eyebrow: "For students",
    datePublished: "2026-05-06",
    dateModified: "2026-06-12",
    readingMins: 6,
    author: "The Vano Team",
    heroGradient: "from-sage-dark via-sage to-gold",
    heroAlt:
      "An ATU Galway student walking a dog near campus while earning money with Vano",
    tags: ["ATU", "Student income", "Galway"],
    bodyHtml: `
<p><a href="/glossary/atu">ATU</a> — Atlantic Technological University — sits right in the middle of Vano's home turf in Galway, which makes its students some of our most active <a href="/glossary/vano-helper">helpers</a>. The pitch is simple: real money, earned around your timetable, on jobs a short walk or cycle from campus.</p>
<h2>The number that matters: €15.30/hr net</h2>
<p>Most student jobs quote you a gross hourly rate and let the reality sink in later. We do it the other way around. On every <strong>time-based</strong> job — cleaning, garden work, moving help, tutoring — the price is set so that <em>after</em> our <a href="/glossary/platform-fee">platform cut</a>, you take home <strong>€15.30 an hour</strong>. That's above Ireland's 2026 <a href="/glossary/minimum-wage-ireland">minimum wage</a> of €14.15, and it's a rule we built into the pricing on purpose.</p>
<p>Job-based tasks (a bag of laundry, a bin run, a quick errand) are priced for the task rather than the hour, but the same principle holds: the rate has to be worth your time or students simply won't accept it.</p>
<h2>How a typical week looks</h2>
<p>There's no rota. You open the app when you've got a gap, see what's nearby, and take what fits:</p>
<ul>
<li>A 30-minute dog walk before your 11am lecture.</li>
<li>An hour of cleaning in Salthill on a free Wednesday afternoon.</li>
<li>Helping someone shift furniture on Saturday morning for an hour or two.</li>
</ul>
<p>String a few of those together across a week and it adds up — without committing to fixed shifts you'll resent during exams.</p>
<h2>You're never out of pocket</h2>
<p>Two things make this student-friendly. First, <a href="/glossary/pay-after-accept">pay-after-accept</a>: the customer only pays once you've accepted the job, so the money's secured before you show up. Second, <a href="/glossary/vano-pay">Vano Pay</a> holds that payment safely and releases your earnings through <a href="/glossary/stripe-connect-payout">Stripe</a> once the job's marked done. No invoices, no awkward "can you transfer me later?" conversations.</p>
<blockquote>It's the only work I've found that actually bends around my timetable instead of the other way round.</blockquote>
<h2>What you'll need</h2>
<p>You'll verify your identity once (we're an <a href="/glossary/id-verified-helper">ID-verified</a> platform — it's what keeps customers trusting the students they let into their homes), connect a payout account, and you're live. Full steps are in <a href="/blog/how-to-become-a-vano-helper">how to become a Vano helper</a>.</p>
<p>Wondering why now is a good time to start? Read <a href="/blog/why-now-galway-student-cost-of-living">Galway's student cost-of-living squeeze</a>.</p>
<p><a href="/join"><strong>Start earning around your lectures →</strong></a></p>
`,
    related: ["how-to-become-a-vano-helper", "part-time-jobs-students-galway", "why-now-galway-student-cost-of-living"],
    faqs: [
      { q: "How much can ATU students earn with Vano?", a: "€15.30 an hour net on time-based jobs like cleaning, garden, moving and tutoring — above the 2026 minimum wage. Job-based tasks are priced for the task." },
      { q: "Are the jobs near the ATU Galway campus?", a: "Often, yes — many jobs are a short walk or cycle from campus around the city." },
      { q: "Do I have to be an ATU student to join?", a: "No. University of Galway students and other locals join too; ATU students are simply a large share of helpers." },
      { q: "When and how do I get paid?", a: "After you mark a job complete, your earnings are released to your own account through Stripe." },
    ],
  },

  {
    slug: "why-now-galway-student-cost-of-living",
    title: "Why Now: Galway's Student Cost-of-Living Squeeze",
    summary:
      "Rent and everyday costs in Galway have outpaced student budgets. The realistic fix isn't more hours in the day — it's turning the free gaps you already have into income with flexible, fairly paid work that bends around study.",
    description:
      "Rent, food and going out keep climbing in Galway. Here's an honest look at the student cost-of-living squeeze — and a flexible way to earn that fits study.",
    keywords:
      "Galway cost of living students, student rent Galway, student budget Ireland, ways to earn money student Galway, student cost of living Ireland 2026",
    eyebrow: "Why now",
    datePublished: "2026-05-20",
    dateModified: "2026-06-14",
    readingMins: 5,
    author: "The Vano Team",
    heroGradient: "from-express-orange via-gold to-sage",
    heroAlt:
      "A Galway student reviewing their monthly budget on a laptop in a shared flat",
    tags: ["Cost of living", "Galway", "Why now"],
    bodyHtml: `
<p>No one needs convincing that Galway has got more expensive. Rent in a shared house, the weekly shop, a coffee between lectures, a night out — every line on a student budget has crept up, and student loans and grants haven't kept pace. That's the honest backdrop to <em>why now</em> is the moment flexible earning makes sense.</p>
<h2>The squeeze, in plain terms</h2>
<p>Three things are happening at once for Galway students:</p>
<ul>
<li><strong>Rent eats most of the budget.</strong> A room in a shared house near the campuses takes a large bite before anything else.</li>
<li><strong>Everyday costs are up.</strong> Groceries, transport and going out all cost more than they did a couple of years ago.</li>
<li><strong>Traditional part-time work is rigid.</strong> Fixed rotas clash with lectures, labs and exams — so the obvious fix (get a job) often doesn't fit.</li>
</ul>
<h2>Why flexible work is the realistic answer</h2>
<p>You can't add hours to the day, but you <em>can</em> turn the gaps you already have into income. A free Wednesday afternoon, an hour before a late lecture, a quiet Sunday — these are dead time on a fixed rota but live earning time on a <a href="/glossary/flexible-work">flexible</a> platform. You accept a <a href="/glossary/same-day-home-help">same-day</a> job only when it suits you, and skip everything during deadline week.</p>
<p>The catch with most "flexible" gig work is that the pay is thin once fees come out. We deliberately don't do that — every time-based job clears Ireland's <a href="/glossary/minimum-wage-ireland">minimum wage</a> after our cut, landing you €15.30/hr net. The <a href="/blog/atu-students-earning-with-vano">ATU earnings breakdown</a> shows exactly how.</p>
<h2>Earning without wrecking your degree</h2>
<p>The whole point is that the work bends around study, not the reverse. Short, local jobs — a dog walk, an hour of cleaning, a hand with a move — finish quickly and leave your evenings for the library. Because there's no rota, there's nothing to "call in sick" for during exams; you just stop accepting until you've got time again.</p>
<p>If that sounds like the kind of work you've been looking for, here's <a href="/blog/part-time-jobs-students-galway">why flexible beats a fixed rota</a>, and <a href="/blog/how-to-become-a-vano-helper">how to get started</a>.</p>
<p><a href="/join"><strong>Turn your free hours into income →</strong></a></p>
`,
    related: ["part-time-jobs-students-galway", "atu-students-earning-with-vano", "why-vano-fair-pay-same-day"],
    faqs: [
      { q: "Why is the cost of living so high for students in Galway?", a: "Rent, groceries, transport and going out have all risen faster than student grants and budgets, squeezing the typical week." },
      { q: "How can students make extra money in Galway?", a: "Turn the free gaps in your week into income with flexible, fairly paid jobs that fit around study — no fixed rota to clash with lectures." },
      { q: "Will working affect my studies?", a: "It doesn't have to. Jobs are short and local, and because there's no rota you simply stop accepting during deadline and exam weeks." },
    ],
  },

  {
    slug: "why-vano-fair-pay-same-day",
    title: "Why Vano: Fair Pay Above Minimum Wage, Same-Day, No Awkward Boss",
    summary:
      "Vano is built on three things: pay that clears Ireland's minimum wage by design (€15.30/hr net), same-day jobs you can do today, and no boss or rota — you choose what to accept. Every helper is ID-verified and paid securely through Stripe.",
    description:
      "Why choose Vano over other student work? Pay that clears minimum wage by design, same-day jobs, and no fixed boss or rota. Here's exactly how it works.",
    keywords:
      "why Vano, fair pay student jobs Ireland, gig work above minimum wage, same-day student work Galway, no boss student job, Vano helper pay",
    eyebrow: "Why Vano",
    datePublished: "2026-06-02",
    dateModified: "2026-06-15",
    readingMins: 6,
    author: "The Vano Team",
    heroGradient: "from-navy via-sage-dark to-emerald-700",
    heroAlt:
      "A Vano helper getting paid through the app after finishing a same-day job in Galway",
    tags: ["Why Vano", "Fair pay", "Trust"],
    bodyHtml: `
<p>There's no shortage of ways for a student to earn a bit of money. So <em>why Vano</em>? It comes down to three things we've built in on purpose: pay that actually clears minimum wage, work you can do today, and no boss standing over a rota.</p>
<h2>1. Pay that clears minimum wage — by design</h2>
<p>This is the one we're proudest of. A lot of gig platforms advertise a headline rate, then quietly shave it with fees until your real take-home dips below what the law guarantees. We refuse to do that. Every <strong>time-based</strong> job on Vano is priced so that after our <a href="/glossary/platform-fee">platform cut</a>, your <a href="/glossary/net-pay">net pay</a> is <strong>€15.30 an hour</strong> — above Ireland's 2026 <a href="/glossary/minimum-wage-ireland">minimum wage</a> of €14.15.</p>
<p>Here's the actual maths, no hand-waving: cleaning, garden, moving and tutoring are all quoted at €18/hr to the customer. We take a 15% student-side cut, which leaves €15.30 in your pocket per hour. If a rate ever dropped below the legal floor, it wouldn't ship — there's literally a test in our codebase that fails the build if it does.</p>
<h2>2. Same-day, not "sometime next week"</h2>
<p>Vano is built for <a href="/glossary/same-day-home-help">same-day</a> help. A customer books, the job is <a href="/glossary/job-dispatch">dispatched</a> to nearby helpers by SMS and push, and whoever accepts first gets it. For you that means you can earn <em>today</em> — open the app on a free afternoon and there may already be a job two streets away.</p>
<h2>3. No awkward boss, no rota</h2>
<p>You're not an employee waiting for a manager to post next week's shifts. You choose what to accept and what to skip. Slammed with coursework? Accept nothing. Free all weekend? Take five jobs. The platform never penalises you for being a student first.</p>
<h2>And it's safe on both sides</h2>
<p>Customers let helpers into their homes, so trust is everything. Every helper is <a href="/glossary/id-verified-helper">ID-verified</a>, and money is handled by <a href="/glossary/vano-pay">Vano Pay</a> — the customer pays after you accept (<a href="/glossary/pay-after-accept">pay-after-accept</a>), the funds are held safely in <a href="/glossary/escrow">escrow</a>, and your earnings are released via <a href="/glossary/stripe-connect-payout">Stripe</a> when the job's done. Nobody's chasing anybody for cash.</p>
<p>Convinced? Here's <a href="/blog/how-to-become-a-vano-helper">how to become a Vano helper</a>.</p>
<p><a href="/join"><strong>Join Vano →</strong></a></p>
`,
    related: ["how-to-become-a-vano-helper", "what-vano-helpers-do", "atu-students-earning-with-vano"],
    faqs: [
      { q: "How much do Vano helpers take home?", a: "€15.30 an hour net on time-based jobs, after the 15% platform cut — above Ireland's €14.15 minimum wage." },
      { q: "Is Vano safe to work through?", a: "Yes. Every helper is ID-verified, and payments are held securely by Vano Pay and released through Stripe once the job is done." },
      { q: "Do I get a boss or a fixed schedule?", a: "Neither. You choose which jobs to accept and when — there's no manager and no rota." },
      { q: "When does the customer pay?", a: "After you accept the job (pay-after-accept), so the money is secured before you set off." },
    ],
  },

  {
    slug: "what-vano-helpers-do",
    title: "From Dog Walks to Moving Help: What You'll Do as a Vano Helper",
    summary:
      "Vano helpers do short, practical home jobs around Galway — dog walks, cleaning, garden work, moving help, errands and tutoring — choosing only the jobs they accept, with no rota and no minimum number of jobs.",
    description:
      "Wondering what the work is actually like? Here's the full range of jobs Vano helpers do in Galway — dog walks, cleaning, garden, moving, errands and tutoring.",
    keywords:
      "Vano helper jobs, student helper Galway, dog walking jobs Galway, cleaning jobs Galway students, moving help Galway, tutoring jobs Galway",
    eyebrow: "The work",
    datePublished: "2026-06-09",
    dateModified: "2026-06-16",
    readingMins: 5,
    author: "The Vano Team",
    heroGradient: "from-gold via-express-orange to-sage-dark",
    heroAlt:
      "A collage of Vano helper tasks in Galway — dog walking, cleaning, garden work and moving help",
    tags: ["The work", "Galway", "Helpers"],
    bodyHtml: `
<p>"What would I actually be doing?" is the first thing most students ask. The honest answer: a varied mix of short, practical home jobs around Galway. You only ever do the ones you accept, so you can lean into the tasks you like and skip the rest.</p>
<h2>The core jobs</h2>
<ul>
<li><strong>Dog walks</strong> — collect from the door, a 30-minute on-lead walk, home safely. Easily the most popular job with students.</li>
<li><strong>Cleaning</strong> — hoovering, mopping, surfaces, kitchen and bathroom. A focused tidy-up, not a deep industrial clean.</li>
<li><strong>Garden help</strong> — mowing, weeding, edging, and bagging the waste.</li>
<li><strong>Moving help</strong> — loading, carrying and unloading. The heavy-lifting hand people need on the day.</li>
<li><strong>Grocery collection &amp; errands</strong> — pick up a click-and-collect order or run a quick errand and drop it to the door.</li>
<li><strong>Tutoring</strong> — one-to-one at the customer's home, in a subject you already know.</li>
</ul>
<h2>How a job runs, start to finish</h2>
<p>The flow is the same every time, which makes it easy once you've done one:</p>
<ul>
<li>A nearby job is <a href="/glossary/job-dispatch">dispatched</a> to you by SMS and push.</li>
<li>You accept (or ignore it). On <a href="/glossary/pay-after-accept">accepting</a>, the customer pays and the money is secured.</li>
<li>You head to the address — found easily from the <a href="/glossary/eircode">Eircode</a> — and do the job.</li>
<li>You mark it complete, and your <a href="/glossary/net-pay">earnings</a> are released via <a href="/glossary/stripe-connect-payout">Stripe</a>.</li>
</ul>
<h2>What you don't have to do</h2>
<p>You're never assigned work. There's no minimum number of jobs, no rota, and no penalty for going quiet during exams. Some students stick to dog walks; others love the variety. Both are fine.</p>
<h2>There's also steady, repeat work</h2>
<p>Some customers put their home on <a href="/glossary/autopilot">Autopilot</a> — a weekly or monthly plan. Those visits get scheduled to a helper, so if you want something more regular alongside the one-off jobs, it's there.</p>
<p>Ready? See <a href="/blog/how-to-become-a-vano-helper">how to become a Vano helper</a> or read <a href="/blog/why-vano-fair-pay-same-day">why the pay works</a>.</p>
<p><a href="/join"><strong>Pick the jobs that suit you →</strong></a></p>
`,
    related: ["how-to-become-a-vano-helper", "why-vano-fair-pay-same-day", "part-time-jobs-students-galway"],
    faqs: [
      { q: "What kind of jobs do Vano helpers do?", a: "Dog walks, cleaning, garden work, moving help, grocery collection and errands, and tutoring — short, practical home jobs around Galway." },
      { q: "Do I have to do every type of job?", a: "No. You only do the jobs you accept, so you can stick to the tasks you like and skip the rest." },
      { q: "How long does a typical job take?", a: "Most are short — often an hour or two — and done the same day." },
      { q: "Is there regular work or only one-offs?", a: "Both. Some customers use Autopilot (weekly or monthly plans), which is scheduled work if you'd like something steadier." },
    ],
  },

  {
    slug: "how-to-become-a-vano-helper",
    howTo: [
      { name: "Sign up", text: "Create your account on the Vano join page — tell us who you are, where in Galway you're based, and the jobs you're up for." },
      { name: "Verify your ID", text: "Complete a one-time identity check before your first job. It's what lets customers trust the helpers they let into their homes." },
      { name: "Connect how you get paid", text: "Set up a Stripe payout account so your earnings land automatically after each completed job." },
      { name: "Accept your first job", text: "When a nearby job is dispatched you'll get an SMS and a push notification. Check the details and pay, then accept if it suits." },
      { name: "Do the job and get paid", text: "Find the address from the Eircode, do a great job, mark it complete, and your net earnings are released through Stripe." },
    ],
    title: "How to Become a Vano Helper: ID Check, Getting Paid, First Job",
    summary:
      "To become a Vano helper: sign up, verify your ID, connect a Stripe payout account, then accept your first nearby job. It takes minutes and you can be earning the same week — no interview, no rota.",
    description:
      "A step-by-step guide to becoming a Vano helper in Galway: sign up, verify your ID, connect payouts, and accept your first same-day job. Takes minutes.",
    keywords:
      "how to become a Vano helper, sign up Vano, student job sign up Galway, become a helper Galway, ID verification student job, get paid Vano",
    eyebrow: "Get started",
    datePublished: "2026-06-13",
    dateModified: "2026-06-16",
    readingMins: 6,
    author: "The Vano Team",
    heroGradient: "from-sage via-emerald-600 to-navy",
    heroAlt:
      "A student completing Vano helper sign-up and ID verification on their phone",
    tags: ["Get started", "Onboarding", "Galway"],
    bodyHtml: `
<p>Becoming a <a href="/glossary/vano-helper">Vano helper</a> takes minutes, and you can be accepting jobs the same week. Here's exactly what happens, step by step, so there are no surprises.</p>
<h2>Step 1 — Sign up</h2>
<p>Head to the <a href="/join">join page</a> and create your account. You'll tell us the basics: who you are, where in Galway you're based, and the kinds of jobs you're up for — <a href="/blog/what-vano-helpers-do">dog walks, cleaning, garden, moving, errands or tutoring</a>.</p>
<h2>Step 2 — Verify your ID</h2>
<p>Vano is an <a href="/glossary/id-verified-helper">ID-verified</a> platform. That single step is what lets customers feel safe letting a student into their home, and it's non-negotiable for that reason. You verify once; it protects you too, because everyone on the platform is a real, checked person.</p>
<h2>Step 3 — Connect how you get paid</h2>
<p>You'll set up a payout account through <a href="/glossary/stripe-connect-payout">Stripe Connect</a>. This is what your earnings land in after each job. It's the same secure system used by countless platforms to pay people — you complete a short onboarding once, and you're set. Until it's finished, any earnings simply wait safely and sweep through the moment you're done.</p>
<h2>Step 4 — Accept your first job</h2>
<p>Now you're live. When a nearby job is <a href="/glossary/job-dispatch">dispatched</a>, you'll get an SMS and a push notification. Open it, check the details and the pay, and accept if it suits. The moment you accept, <a href="/glossary/pay-after-accept">the customer pays</a> and the money is secured by <a href="/glossary/vano-pay">Vano Pay</a> — so you know you'll be paid before you set off.</p>
<h2>Step 5 — Do the job, get paid</h2>
<p>Find the address from the <a href="/glossary/eircode">Eircode</a>, do a good job, and mark it complete in the app. Your <a href="/glossary/net-pay">net earnings</a> — €15.30/hr on time-based work, above the <a href="/glossary/minimum-wage-ireland">minimum wage</a> — are released to your Stripe account.</p>
<h2>That's it</h2>
<p>No interview, no rota, no commitment. Do one job a month or one a day — it's entirely up to you. If you want the bigger picture first, read <a href="/blog/why-vano-fair-pay-same-day">why Vano pays above minimum wage</a> or <a href="/blog/part-time-jobs-students-galway">why flexible work beats a fixed rota</a>.</p>
<p><a href="/join"><strong>Create your helper account →</strong></a></p>
`,
    related: ["what-vano-helpers-do", "why-vano-fair-pay-same-day", "atu-students-earning-with-vano"],
    faqs: [
      { q: "How do I become a Vano helper?", a: "Sign up, verify your ID, connect a Stripe payout account, then accept your first nearby job. The whole thing takes minutes." },
      { q: "Do I need to verify my identity?", a: "Yes — a one-time ID check before your first job. It's what lets customers trust the helpers they let into their homes." },
      { q: "How soon can I start earning?", a: "Often the same week you sign up, once your ID check and payout account are set up." },
      { q: "Do I need any experience?", a: "No. Most jobs — dog walks, cleaning, errands — need reliability, not experience." },
    ],
  },
];

/** Lookup by slug — used by the route and the prerenderer. */
export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
