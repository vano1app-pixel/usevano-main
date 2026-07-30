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
      "The best part-time jobs for students in Galway are flexible ones you pick up around lectures — short, local tasks like dog walks, cleaning and garden help that pay above minimum wage, with no fixed rota to clash with your timetable.",
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
<li><strong>Grocery collection &amp; errands</strong> — pick up a click-and-collect order and drop it to someone's door.</li>
<li><strong>Online tutoring</strong> — one-to-one online with adult learners (18+), in a subject you already know.</li>
</ul>
<p>Most of it is local, walkable or cyclable, and finished inside an hour or two — the kind of thing you can slot between a morning lecture and an afternoon seminar.</p>
<h2>Does the pay actually stack up?</h2>
<p>This is where flexible work earns its keep. The problem with a lot of student jobs is the rate. On Vano, time-based jobs pay <strong>€22 an hour and you keep 100% of it</strong> — comfortably above the Irish <a href="/glossary/minimum-wage-ireland">minimum wage</a>. Vano's <a href="/glossary/platform-fee">booking fee</a> is charged to the customer, not carved out of your pay. We explain exactly how that maths works in <a href="/blog/why-vano-fair-pay-same-day">why Vano pays above minimum wage</a>.</p>
<p>Payment is simple too: the customer pays you <strong>directly</strong> when the job's done — Revolut or cash — and you confirm it in the app. Customers who don't pay get blocked from booking again, so the app has your back.</p>
<h2>Getting started</h2>
<p>If you're an <a href="/glossary/atu">ATU</a> or University of Galway student, you can sign up, verify your ID, and start seeing nearby jobs the same week. We walk through the whole thing — verification, getting paid, your first job — in <a href="/blog/how-to-become-a-vano-helper">how to become a Vano helper</a>.</p>
<p><a href="/join"><strong>Join as a helper →</strong></a></p>
`,
    related: ["how-to-become-a-vano-helper", "why-vano-fair-pay-same-day", "atu-students-earning-with-vano"],
    faqs: [
      { q: "What are the best part-time jobs for students in Galway?", a: "Flexible, local jobs you can do around lectures — dog walks, cleaning, garden help, errands and online tutoring — without committing to a fixed weekly rota." },
      { q: "How many hours do I have to work?", a: "None are required. There's no rota and no minimum: you accept jobs only when you're free, and pause completely during exams." },
      { q: "Do part-time student jobs in Galway pay well?", a: "On Vano, time-based jobs pay €22 an hour and you keep 100% — well above Ireland's 2026 minimum wage of €14.15. Customers pay you directly after each job." },
      { q: "Can I really work around my college timetable?", a: "Yes. You pick up same-day jobs in the gaps between classes, so the work fits your week instead of the other way around." },
    ],
  },

  {
    slug: "atu-students-earning-with-vano",
    title: "How ATU Students Are Earning €22/hr With Vano Between Lectures",
    summary:
      "ATU students earn €22 an hour — and keep 100% of it — doing short jobs near campus: dog walks, cleaning, garden help, picked up whenever they have a gap between lectures. Customers pay them directly after each job.",
    description:
      "ATU Galway students are picking up same-day jobs around campus and keeping 100% of €22/hr. Here's how the money works and why students like it.",
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
<h2>The number that matters: €22/hr, and it's all yours</h2>
<p>Most student jobs quote you a gross hourly rate and let the reality sink in later. We do it the other way around. On every <strong>time-based</strong> job — cleaning, garden work, online tutoring — the customer pays you <strong>€22 an hour and you keep 100%</strong>. Vano's <a href="/glossary/platform-fee">booking fee</a> is charged to the customer, not to you. That's well above Ireland's 2026 <a href="/glossary/minimum-wage-ireland">minimum wage</a> of €14.15, and it's a rule we built into the pricing on purpose.</p>
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
<p>Two things make this student-friendly. First, the customer has already paid Vano's <a href="/glossary/platform-fee">booking fee</a> by card before you set off — they've committed real money to the booking. Second, they pay <em>you</em> the full job price directly the moment the job's done — Revolut or cash — and you confirm it in the app. If a customer ever doesn't pay, you report it with one tap and their number is blocked from booking again. No invoices, no chasing.</p>
<blockquote>It's the only work I've found that actually bends around my timetable instead of the other way round.</blockquote>
<h2>What you'll need</h2>
<p>You'll verify your identity once (we're an <a href="/glossary/id-verified-helper">ID-verified</a> platform — it's what keeps customers trusting the students they let into their homes), add your Revolut tag so customers can pay you in one tap, and you're live. Full steps are in <a href="/blog/how-to-become-a-vano-helper">how to become a Vano helper</a>.</p>
<p>Wondering why now is a good time to start? Read <a href="/blog/why-now-galway-student-cost-of-living">Galway's student cost-of-living squeeze</a>.</p>
<p><a href="/join"><strong>Start earning around your lectures →</strong></a></p>
`,
    related: ["how-to-become-a-vano-helper", "part-time-jobs-students-galway", "why-now-galway-student-cost-of-living"],
    faqs: [
      { q: "How much can ATU students earn with Vano?", a: "€22 an hour on time-based jobs like cleaning, garden and online tutoring — and you keep 100% of it, well above the 2026 minimum wage. Job-based tasks are priced for the task." },
      { q: "Are the jobs near the ATU Galway campus?", a: "Often, yes — many jobs are a short walk or cycle from campus around the city." },
      { q: "Do I have to be an ATU student to join?", a: "No. University of Galway students and other locals join too; ATU students are simply a large share of helpers." },
      { q: "When and how do I get paid?", a: "The customer pays you directly the moment the job's done — Revolut or cash, whichever suits — and you keep 100% of the job price." },
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
<p>The catch with most "flexible" gig work is that the pay is thin once fees come out. We deliberately don't do that — on Vano there are <em>no</em> fees on your side: time-based jobs pay €22/hr and you keep 100%, well clear of Ireland's <a href="/glossary/minimum-wage-ireland">minimum wage</a>. The <a href="/blog/atu-students-earning-with-vano">ATU earnings breakdown</a> shows exactly how.</p>
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
      "Vano is built on three things: pay that clears Ireland's minimum wage by design (€22/hr, you keep 100%), same-day jobs you can do today, and no boss or rota — you choose what to accept. Every helper is ID-verified and paid directly by the customer after each job.",
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
<p>This is the one we're proudest of. A lot of gig platforms advertise a headline rate, then quietly shave it with fees until your real take-home dips below what the law guarantees. We refuse to do that. On Vano, <strong>you keep 100% of the job price</strong>: your <a href="/glossary/net-pay">take-home</a> on time-based jobs is the full <strong>€22 an hour</strong> — far above Ireland's 2026 <a href="/glossary/minimum-wage-ireland">minimum wage</a> of €14.15.</p>
<p>Here's the actual maths, no hand-waving: cleaning, garden and online tutoring are all quoted at €22/hr to the customer, and the customer pays you that directly when the job's done. Vano's <a href="/glossary/platform-fee">booking fee</a> (15% of the job price, minimum €5) is charged to the customer's card — none of it comes out of your pocket. If a rate ever dropped below the legal floor, it wouldn't ship — there's literally a test in our codebase that fails the build if it does.</p>
<h2>2. Same-day, not "sometime next week"</h2>
<p>Vano is built for <a href="/glossary/same-day-home-help">same-day</a> help. A customer books, the job is <a href="/glossary/job-dispatch">dispatched</a> to nearby helpers by SMS and push, and whoever accepts first gets it. For you that means you can earn <em>today</em> — open the app on a free afternoon and there may already be a job two streets away.</p>
<h2>3. No awkward boss, no rota</h2>
<p>You're not an employee waiting for a manager to post next week's shifts. You choose what to accept and what to skip. Slammed with coursework? Accept nothing. Free all weekend? Take five jobs. The platform never penalises you for being a student first.</p>
<h2>And it's safe on both sides</h2>
<p>Customers let helpers into their homes, so trust is everything. Every helper is <a href="/glossary/id-verified-helper">ID-verified</a>, and the money is simple: the customer confirms the booking with a card fee when you accept (<a href="/glossary/pay-after-accept">pay-after-accept</a>), then pays you the full job price directly when the job's done — Revolut or cash. You confirm you've been paid in the app, and any number that stiffs a helper is blocked from booking again.</p>
<p>Convinced? Here's <a href="/blog/how-to-become-a-vano-helper">how to become a Vano helper</a>.</p>
<p><a href="/join"><strong>Join Vano →</strong></a></p>
`,
    related: ["how-to-become-a-vano-helper", "what-vano-helpers-do", "atu-students-earning-with-vano"],
    faqs: [
      { q: "How much do Vano helpers take home?", a: "The full job price — 100%. Time-based jobs pay €22 an hour, well above Ireland's €14.15 minimum wage; Vano's booking fee is charged to the customer instead." },
      { q: "Is Vano safe to work through?", a: "Yes. Every helper is ID-verified, customers commit with a card fee before you set off, and you confirm your payment in the app — unpaid jobs get the customer's number blocked." },
      { q: "Do I get a boss or a fixed schedule?", a: "Neither. You choose which jobs to accept and when — there's no manager and no rota." },
      { q: "When does the customer pay?", a: "They pay Vano's booking fee by card when you accept — committing to the job — then pay you the full job price directly (Revolut or cash) when the job's done." },
    ],
  },

  {
    slug: "what-vano-helpers-do",
    title: "From Dog Walks to Garden Days: What You'll Do as a Vano Helper",
    summary:
      "Vano helpers do short, practical home jobs around Galway — dog walks, cleaning, garden work, errands and online tutoring — choosing only the jobs they accept, with no rota and no minimum number of jobs.",
    description:
      "Wondering what the work is actually like? Here's the full range of jobs Vano helpers do in Galway — dog walks, cleaning, garden, errands and online tutoring.",
    keywords:
      "Vano helper jobs, student helper Galway, dog walking jobs Galway, cleaning jobs Galway students, online tutoring jobs Galway",
    eyebrow: "The work",
    datePublished: "2026-06-09",
    dateModified: "2026-06-16",
    readingMins: 5,
    author: "The Vano Team",
    heroGradient: "from-gold via-express-orange to-sage-dark",
    heroAlt:
      "A collage of Vano helper tasks in Galway — dog walking, cleaning, garden work and laundry runs",
    tags: ["The work", "Galway", "Helpers"],
    bodyHtml: `
<p>"What would I actually be doing?" is the first thing most students ask. The honest answer: a varied mix of short, practical home jobs around Galway. You only ever do the ones you accept, so you can lean into the tasks you like and skip the rest.</p>
<h2>The core jobs</h2>
<ul>
<li><strong>Dog walks</strong> — collect from the door, a 30-minute on-lead walk, home safely. Easily the most popular job with students.</li>
<li><strong>Cleaning</strong> — hoovering, mopping, surfaces, kitchen and bathroom. A focused tidy-up, not a deep industrial clean.</li>
<li><strong>Garden help</strong> — mowing, weeding, edging, and bagging the waste.</li>
<li><strong>Grocery collection &amp; errands</strong> — pick up a click-and-collect order or run a quick errand and drop it to the door.</li>
<li><strong>Online tutoring</strong> — one-to-one online with adults (18+), in a subject you already know. Tutoring on Vano is online and adults-only — no in-home grinds for under-18s.</li>
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
      { q: "What kind of jobs do Vano helpers do?", a: "Dog walks, cleaning, garden work, grocery collection and errands, and online tutoring — short, practical home jobs around Galway." },
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
<p>Head to the <a href="/join">join page</a> and create your account. You'll tell us the basics: who you are, where in Galway you're based, and the kinds of jobs you're up for — <a href="/blog/what-vano-helpers-do">dog walks, cleaning, garden, errands or online tutoring</a>.</p>
<h2>Step 2 — Verify your ID</h2>
<p>Vano is an <a href="/glossary/id-verified-helper">ID-verified</a> platform. That single step is what lets customers feel safe letting a student into their home, and it's non-negotiable for that reason. You verify once; it protects you too, because everyone on the platform is a real, checked person.</p>
<h2>Step 3 — Add how you get paid</h2>
<p>Customers pay you <strong>directly</strong> after each job — Revolut or cash — and you keep <strong>100%</strong> of the job price. Add your Revolut tag in your account so paying you is one tap; that's the whole setup.</p>
<h2>Step 4 — Accept your first job</h2>
<p>Now you're live. When a nearby job is <a href="/glossary/job-dispatch">dispatched</a>, you'll get an SMS and a push notification. Open it, check the details and the pay, and accept if it suits. The moment you accept, <a href="/glossary/pay-after-accept">the customer pays Vano's booking fee</a> by card — real money committed to the booking before you set off.</p>
<h2>Step 5 — Do the job, get paid</h2>
<p>Find the address from the <a href="/glossary/eircode">Eircode</a>, do a good job, and tap "I've finished" in the app. The customer pays you the full job price on the spot — <a href="/glossary/net-pay">€22/hr on time-based work</a>, well above the <a href="/glossary/minimum-wage-ireland">minimum wage</a> — and you confirm you've been paid. If anyone ever doesn't pay, one tap reports it and their number is blocked.</p>
<h2>That's it</h2>
<p>No interview, no rota, no commitment. Do one job a month or one a day — it's entirely up to you. If you want the bigger picture first, read <a href="/blog/why-vano-fair-pay-same-day">why Vano pays above minimum wage</a> or <a href="/blog/part-time-jobs-students-galway">why flexible work beats a fixed rota</a>.</p>
<p><a href="/join"><strong>Create your helper account →</strong></a></p>
`,
    related: ["what-vano-helpers-do", "why-vano-fair-pay-same-day", "atu-students-earning-with-vano"],
    faqs: [
      { q: "How do I become a Vano helper?", a: "Sign up, verify your ID, add your Revolut tag, then accept your first nearby job. The whole thing takes minutes." },
      { q: "Do I need to verify my identity?", a: "Yes — a one-time ID check before your first job. It's what lets customers trust the helpers they let into their homes." },
      { q: "How soon can I start earning?", a: "Often the same week you sign up, once your ID check is done." },
      { q: "Do I need any experience?", a: "No. Most jobs — dog walks, cleaning, errands — need reliability, not experience." },
    ],
  },

  {
    slug: "meet-the-vano-team",
    title: "Meet the Vano Team: the ATU Students Behind It",
    summary:
      "Vano was built by three ATU students in Galway — Ayush Puri, Cormac Hennessy and Michael Okocha — who wanted fair, flexible work for students and reliable same-day help for local households.",
    description:
      "Meet the team behind Vano — Ayush Puri, Cormac Hennessy and Michael Okocha, three ATU students in Galway building same-day home help with fair pay for student helpers.",
    keywords:
      "Vano team, who founded Vano, Vano founders, ATU students startup Galway, Ayush Puri, Cormac Hennessy, Michael Okocha, student startup Ireland",
    eyebrow: "Our story",
    datePublished: "2026-06-17",
    dateModified: "2026-06-17",
    readingMins: 3,
    author: "The Vano Team",
    heroGradient: "from-navy via-sage-dark to-emerald-700",
    heroAlt: "The three ATU students who founded Vano, planning at a whiteboard in Galway",
    tags: ["Our story", "Team", "ATU"],
    bodyHtml: `
<p>Vano didn't come out of a boardroom. It started with three <a href="/glossary/atu">ATU</a> students in Galway, a whiteboard, and one simple frustration: students wanted flexible work that paid properly and fit around lectures, while households around the city needed reliable help they could book the same day. Nobody was joining those two dots — so we did.</p>
<figure><img src="/blog/team-whiteboard.jpg" alt="Ayush Puri, Cormac Hennessy and Michael Okocha — the ATU students who founded Vano — planning at a whiteboard in Galway" class="rounded-2xl" loading="lazy" /><figcaption>Mapping out Vano at ATU — customers, categories, and the all-important wage maths.</figcaption></figure>
<h2>Who we are</h2>
<p>We're <strong>Ayush Puri</strong>, <strong>Cormac Hennessy</strong> and <strong>Michael Okocha</strong> — three students at Atlantic Technological University in Galway who built Vano between lectures, late nights and a lot of coffee. Being students ourselves is the whole point: we know what good, flexible, fairly paid work should feel like, because we were looking for it too.</p>
<figure><img src="/blog/team-laptop.jpg" alt="Two of Vano's founders building the platform on a laptop beside a planning whiteboard at ATU" class="rounded-2xl" loading="lazy" /><figcaption>Heads down — building the platform that dispatches jobs to nearby helpers.</figcaption></figure>
<h2>Why we built Vano</h2>
<p>Two problems, one platform:</p>
<ul>
<li><strong>For students:</strong> proper pay. Time-based jobs pay <strong>€22/hr and helpers keep 100%</strong> — far above the Irish <a href="/glossary/minimum-wage-ireland">minimum wage</a> — with no fixed rota. The full breakdown is in <a href="/blog/why-vano-fair-pay-same-day">why Vano pays above minimum wage</a>.</li>
<li><strong>For households:</strong> <a href="/glossary/same-day-home-help">same-day help</a> from an <a href="/glossary/id-verified-helper">ID-verified</a> local student — cleaning, dog walks, garden, errands and more — without the hassle.</li>
</ul>
<figure><img src="/blog/team-podcast.jpg" alt="Vano's founders recording a podcast about building a student-run startup in Galway" class="rounded-2xl" loading="lazy" /><figcaption>Telling the story — building Vano in the open.</figcaption></figure>
<h2>Where we're going</h2>
<p>We started in Galway because it's home, and because a student city is exactly where this works best. The plan is to keep it fair, keep it local, and keep it genuinely useful — for the students who do the work and the households who rely on them.</p>
<p>Want to be part of it? Here's <a href="/blog/how-to-become-a-vano-helper">how to become a Vano helper</a>.</p>
<p><a href="/join"><strong>Join Vano →</strong></a></p>
`,
    related: ["why-vano-fair-pay-same-day", "atu-students-earning-with-vano", "how-to-become-a-vano-helper"],
    faqs: [
      { q: "Who founded Vano?", a: "Vano was founded by three Atlantic Technological University (ATU) students in Galway — Ayush Puri, Cormac Hennessy and Michael Okocha." },
      { q: "Are the people behind Vano really students?", a: "Yes. The founders are ATU students who built Vano around their own lectures — which is exactly why fair, flexible pay for student helpers is built into the platform." },
      { q: "Where is Vano based?", a: "Vano is based in Galway, Ireland, and currently serves households and student helpers across the city." },
    ],
  },

  {
    slug: "cleaner-cost-galway",
    title: "How Much Does a Cleaner Cost in Galway? (2026 Prices)",
    summary:
      "A cleaner in Galway costs €22 an hour on Vano — a typical 2-hour clean is €44 plus a small booking fee (15%, min €5). No contracts, no call-out charges, and you can usually book same-day.",
    description:
      "Real 2026 cleaner prices in Galway: €22/hr with no contracts or call-out fees. What a 2, 3 or 4-hour clean costs, what's included, and how to book same-day.",
    keywords:
      "cleaner cost Galway, house cleaning prices Galway, cleaner Galway, how much does a cleaner cost Ireland, hourly rate cleaner Galway, same day cleaner Galway",
    eyebrow: "Price guide",
    datePublished: "2026-07-17",
    dateModified: "2026-07-17",
    readingMins: 6,
    author: "The Vano Team",
    heroGradient: "from-navy via-sage-dark to-emerald-700",
    heroAlt: "A student cleaner wiping down a kitchen counter in a Galway home",
    tags: ["Cleaning", "Prices", "Galway"],
    bodyHtml: `
<p>Short answer: on Vano, a cleaner in Galway costs <strong>€22 an hour</strong>, and you book exactly the hours you want. No contracts, no minimum weekly commitment, no call-out charge. Here's what that actually comes to, what's included, and how it compares.</p>
<h2>Galway cleaning prices at a glance (2026)</h2>
<ul>
<li><strong>2-hour clean</strong> (kitchen + bathroom + floors) — €44</li>
<li><strong>3-hour clean</strong> (whole small home) — €66</li>
<li><strong>4-hour <a href="/glossary/deep-clean">deep clean</a></strong> — €88</li>
<li><strong>Oven &amp; kitchen clean</strong> — €22–€44 (1–2 hours usually does it)</li>
<li><strong><a href="/glossary/end-of-tenancy-clean">End-of-tenancy clean</a></strong> — €66–€88 for most flats (3–4 hours)</li>
</ul>
<p>On top of the job price there's one small <strong>booking fee</strong> — 15% of the job price, minimum €5 — charged to your card only <a href="/glossary/pay-after-accept">when a helper says yes</a>. So a 2-hour clean is €44 + €6.60 = <strong>€50.60 all-in</strong>. The €44 goes straight to your cleaner (Revolut or cash when the job's done — they keep 100%), and the price is agreed upfront, so there are no surprises after.</p>
<h2>What's included in a standard clean?</h2>
<p>The everyday essentials: kitchen surfaces and hob, bathroom (toilet, sink, shower or bath), floors hoovered and mopped, and general tidying and dusting. If you want the heavier stuff — inside the oven, inside cupboards, limescale, skirting boards — book more time and say so in the booking note. Our guide to <a href="/blog/deep-clean-vs-standard-clean">deep clean vs standard clean</a> helps you pick.</p>
<h2>Who does the cleaning?</h2>
<p>Local <a href="/glossary/student-cleaner">student cleaners</a> — real students at ATU and the University of Galway, every one <a href="/glossary/id-verified-helper">ID-verified before their first job</a> and rated after every job. You see their name, photo and rating before they arrive, follow them on a live map on the way, and they can only start with the <a href="/glossary/arrival-code">4-digit code</a> shown on your screen.</p>
<h2>How Galway cleaner prices compare</h2>
<p>Agency cleans in Ireland commonly run €20–€30+ an hour once fees are counted, often with minimum visits or contracts. Independent cleaners can be cheaper but are hard to find at short notice and rarely vetted. Vano sits in the honest middle: <strong>€22/hr flat</strong>, bookable <a href="/glossary/same-day-home-help">same-day</a>, with verification built in — and because your cleaner keeps 100% of the job price, the low price doesn't come out of their pocket.</p>
<h2>How to book a cleaner in Galway</h2>
<p>Tap <strong>Cleaning</strong> on <a href="/">vanojobs.com</a>, pick the kind of clean and how many hours, add your phone number and address, and that's it — most jobs are confirmed within a few hours. You can add optional <a href="/glossary/vano-cover">Vano Cover</a> (€2, accidental damage up to €250) when booking. If anything's not right, tell us within 24 hours and we'll re-do it or refund you.</p>
<p><a href="/#book"><strong>Book a cleaner in Galway →</strong></a></p>
`,
    related: ["deep-clean-vs-standard-clean", "end-of-tenancy-cleaning-galway", "laundry-service-galway-cost"],
    faqs: [
      { q: "How much does a cleaner cost per hour in Galway?", a: "€22 an hour on Vano, with no contracts or call-out fees. A typical 2-hour clean costs €44 plus a small booking fee (15%, minimum €5)." },
      { q: "Is there a minimum number of hours?", a: "Cleaning is booked by the hour — most people book 2 hours for a kitchen-bathroom-floors clean, and 3–4 hours for a whole home or deep clean." },
      { q: "Do I pay upfront?", a: "No. Booking is free — the small booking fee is only charged when a helper says yes, and you pay the cleaner the job price directly (Revolut or cash) once the work is done." },
      { q: "Are Vano cleaners vetted?", a: "Every cleaner is ID-verified before their first job, rated after every job, and can only start the job using the 4-digit code shown on your screen." },
    ],
  },

  {
    slug: "end-of-tenancy-cleaning-galway",
    title: "End-of-Tenancy Cleaning in Galway: Checklist & Cost (2026)",
    summary:
      "An end-of-tenancy clean in Galway costs €66–€88 for most flats on Vano (3–4 hours at €22/hr). Here's the room-by-room checklist landlords actually check — and how to get it done same-day before handover.",
    description:
      "Moving out in Galway? End-of-tenancy cleaning costs €66–€88 for most flats (€22/hr). The room-by-room deposit checklist plus how to book a same-day move-out clean.",
    keywords:
      "end of tenancy cleaning Galway, move out cleaning Galway, deposit cleaning checklist Ireland, end of lease clean cost, student accommodation cleaning Galway",
    eyebrow: "Moving out",
    datePublished: "2026-07-17",
    dateModified: "2026-07-17",
    readingMins: 7,
    author: "The Vano Team",
    heroGradient: "from-sage-dark via-sage to-gold",
    heroAlt: "A freshly cleaned, empty Galway rental flat ready for key handover",
    tags: ["Cleaning", "Moving out", "Galway"],
    bodyHtml: `
<p>Handing back the keys is the one clean you can't skip — it's the difference between your full deposit and a deduction. In a student city like Galway, <a href="/glossary/end-of-tenancy-clean">end-of-tenancy cleans</a> are our most-booked job every summer. Here's what landlords actually check, what it costs, and how to get it done fast.</p>
<h2>What does an end-of-tenancy clean cost in Galway?</h2>
<p>On Vano it's priced simply by time at <strong>€22/hr</strong>:</p>
<ul>
<li><strong>Studio or one-bed flat</strong> — 3 hours, €66</li>
<li><strong>Two-bed house or apartment</strong> — 4 hours, €88</li>
<li><strong>Bigger or very lived-in homes</strong> — 5–6 hours, €110–€132</li>
</ul>
<p>Plus one small booking fee (15%, min €5) charged only <a href="/glossary/pay-after-accept">when a helper says yes</a>. The job price goes straight to your <a href="/glossary/student-cleaner">student cleaner</a> when it's done — they keep 100%. Compare that with dedicated end-of-tenancy firms, which commonly quote €150–€300 for the same flat.</p>
<h2>The room-by-room deposit checklist</h2>
<h3>Kitchen (where deposits are lost)</h3>
<ul>
<li><a href="/glossary/oven-clean">Oven</a> degreased inside and out, racks soaked and scrubbed</li>
<li>Fridge and freezer emptied, defrosted, wiped inside</li>
<li>Inside every cupboard and drawer</li>
<li>Hob, extractor, sink and taps descaled</li>
</ul>
<h3>Bathroom</h3>
<ul>
<li>Limescale off the shower screen, tiles and taps</li>
<li>Toilet, sink and bath scrubbed; mirror polished</li>
<li>Extractor grille dusted; bin emptied and wiped</li>
</ul>
<h3>Everywhere else</h3>
<ul>
<li>Skirting boards, window sills and door frames wiped</li>
<li>Inside windows cleaned; cobwebs down</li>
<li>Carpets hoovered (edges too), hard floors mopped</li>
<li>All bins out, no belongings left behind</li>
</ul>
<h2>Tips from hundreds of Galway move-outs</h2>
<p><strong>Book before the final inspection, not after</strong> — a same-day re-clean is possible on Vano, but calm beats panic. <strong>Take photos when the clean is done</strong>; they're your evidence if there's any deposit debate.</p>
<h2>How to book it</h2>
<p>Tap <strong>Cleaning → End-of-tenancy clean</strong> on <a href="/">vanojobs.com</a>, pick the hours, drop your phone number and the address. An <a href="/glossary/id-verified-helper">ID-verified</a> local student takes it on — you'll see their name, photo and rating before they arrive, and if anything's missed, tell us within 24 hours and we'll make it right.</p>
<p><a href="/#book"><strong>Book an end-of-tenancy clean →</strong></a></p>
`,
    related: ["cleaner-cost-galway", "deep-clean-vs-standard-clean"],
    faqs: [
      { q: "How much is an end-of-tenancy clean in Galway?", a: "€66–€88 for most flats on Vano (3–4 hours at €22/hr), plus a small booking fee. Dedicated end-of-tenancy firms commonly charge €150–€300 for the same size of home." },
      { q: "How long does a move-out clean take?", a: "About 3 hours for a studio or one-bed, 4 hours for a two-bed — longer if the oven or bathroom needs serious work." },
      { q: "Can I get an end-of-tenancy clean same-day in Galway?", a: "Usually yes — most Vano jobs are confirmed within a few hours, so you can book the morning of your final inspection if needed." },
      { q: "Does the clean include the oven?", a: "Ask for it in your booking note and book enough time — the oven is the single most-checked item at handover and usually adds about an hour." },
    ],
    howTo: [
      { name: "Book the clean before your final inspection", text: "Book 3–4 hours of end-of-tenancy cleaning on vanojobs.com a day or two before handover — not after the landlord has already looked." },
      { name: "Clear your belongings first", text: "The clean goes much faster in an empty home. Move your boxes out before the cleaner arrives." },
      { name: "Point out the priority areas", text: "Use the booking note for what the landlord checks hardest: oven, limescale, inside cupboards." },
      { name: "Photograph every room after", text: "Take timestamped photos of the finished clean — your evidence if there's any deposit discussion." },
    ],
  },

  {
    slug: "dog-walker-galway-cost",
    title: "Dog Walker in Galway: Prices & What a Good Walk Includes",
    summary:
      "A dog walk in Galway costs €15 for 30 minutes or €24 for an hour on Vano — always on-lead, door to door, by an ID-verified local student you can see before they ring the bell.",
    description:
      "Dog walker prices in Galway for 2026: €15 for 30 minutes, €24 for an hour. What an on-lead walk includes, how vetting works, and how to book same-day.",
    keywords:
      "dog walker Galway, dog walking prices Galway, dog walker cost Ireland, on-lead dog walking, same day dog walker Galway, pet care Galway",
    eyebrow: "Pets",
    datePublished: "2026-07-17",
    dateModified: "2026-07-17",
    readingMins: 5,
    author: "The Vano Team",
    heroGradient: "from-gold via-express-orange to-sage-dark",
    heroAlt: "A student dog walker walking a dog on the lead along the Salthill prom in Galway",
    tags: ["Dog walking", "Prices", "Galway"],
    bodyHtml: `
<p>Stuck in work, away for the day, or just wrecked? A dog walker in Galway costs less than most people think: <strong>€15 for a 30-minute walk, €24 for a full hour</strong> on Vano — and you can usually book one for today.</p>
<h2>What the walk includes</h2>
<p>Every Vano walk is <a href="/glossary/on-lead-dog-walking"><strong>on-lead, door to door</strong></a>: your walker collects your dog at your front door, keeps them on the lead for the whole walk, and drops them back home. On-lead is the professional standard when a dog is out with someone who isn't its owner — no recall gambles near traffic, no surprise run-ins on the prom.</p>
<p>Add anything your dog needs in the booking note: route preferences, "no other dogs", treats allowed or not, where the lead lives.</p>
<h2>Who's walking my dog?</h2>
<p>A local student — <a href="/glossary/id-verified-helper">ID-verified before their first job</a> and rated after every job. You see their <strong>name, photo and rating before they arrive</strong>, and you can follow the pick-up on a live map. Many Galway owners end up requesting the same walker again once their dog has a favourite.</p>
<h2>Galway dog walking prices compared</h2>
<ul>
<li><strong>Vano</strong> — €15 / 30 min, €24 / hour. Your walker keeps 100%; one small booking fee (min €5) confirms the booking <a href="/glossary/pay-after-accept">when someone says yes</a>.</li>
<li><strong>Professional walkers &amp; agencies</strong> — commonly €15–€25 per walk, often needing a regular weekly slot and a meet-and-greet first.</li>
<li><strong>Group walks</strong> — cheaper per dog, but your dog shares the walk and the attention.</li>
</ul>
<h2>Great for busy weeks, not just holidays</h2>
<p>One-off walks are the point: a late meeting, a hospital appointment, a heatwave when the midday walk needs to happen while you're out. Book on the day, walk done by dinner. If you need feeding or a garden check too, book it as an "<a href="/glossary/same-day-home-help">Anything else</a>" job and describe what's needed.</p>
<p><a href="/#book"><strong>Book a dog walk in Galway →</strong></a></p>
`,
    related: ["cleaner-cost-galway", "laundry-service-galway-cost", "what-vano-helpers-do"],
    faqs: [
      { q: "How much does a dog walker cost in Galway?", a: "€15 for a 30-minute walk or €24 for a full hour on Vano, plus a small booking fee (minimum €5) charged only when a walker says yes." },
      { q: "Are the walks on-lead?", a: "Yes — every Vano walk is on-lead, door to door. It's the safe standard when a dog is out with someone who isn't its owner." },
      { q: "Can I meet the walker first?", a: "You see the walker's name, photo and rating before they arrive, and you can follow the walk pick-up on a live map. Owners often rebook the same walker once their dog has a favourite." },
      { q: "Can I book a dog walker for today?", a: "Usually yes — most Vano bookings are confirmed within a few hours, so a same-day walk is normal rather than the exception." },
    ],
  },

  {
    slug: "laundry-service-galway-cost",
    title: "Laundry Service in Galway: €30 Collected, Washed & Folded",
    summary:
      "Vano's Galway laundry service is €30 a bag: a local student collects your laundry, washes and dries it, and returns it folded. No subscriptions, no per-kilo maths — one price per bag, usually same-day or next-day.",
    description:
      "Laundry service in Galway from €30 a bag — collected from your door, washed, dried and returned folded by an ID-verified local student. How it works and who it suits.",
    keywords:
      "laundry service Galway, wash and fold Galway, laundry collection Galway, laundrette alternative Galway, student laundry service, ironing Galway",
    eyebrow: "Laundry",
    datePublished: "2026-07-17",
    dateModified: "2026-07-17",
    readingMins: 5,
    author: "The Vano Team",
    heroGradient: "from-sage via-emerald-600 to-navy",
    heroAlt: "A neatly folded basket of clean laundry being returned to a Galway doorstep",
    tags: ["Laundry", "Prices", "Galway"],
    bodyHtml: `
<p>The laundry pile always wins in the end — unless someone takes it away. Vano's laundry service is one flat price: <strong>€30, collected from your door, washed, dried and returned folded</strong>. No per-kilo weighing, no subscription, no trek to the launderette.</p>
<h2>How it works</h2>
<ul>
<li><strong>Book "Laundry" on <a href="/">vanojobs.com</a></strong> — add your phone number and address; booking takes under a minute.</li>
<li><strong>A local student collects</strong> — an <a href="/glossary/id-verified-helper">ID-verified</a> helper picks up your bag or basket at the door. You'll see their name, photo and rating first.</li>
<li><strong>Washed, dried, folded</strong> — everyday clothes, bedding and towels, handled with normal care (note anything delicate in the booking).</li>
<li><strong>Returned folded</strong> — usually same-day or next-day, back at your door.</li>
</ul>
<p>You pay the €30 directly to your helper when it's back (Revolut or cash — they keep 100%), and one small €5 booking fee confirms the job <a href="/glossary/pay-after-accept">when a helper says yes</a>. So the true all-in cost is <strong>€35</strong>.</p>
<h2>Who it suits</h2>
<p><strong>Busy working households</strong> that never catch up on the basket; <strong>older neighbours</strong> for whom the machine, the line and the carrying have become a chore; <strong>students</strong> in accommodation where the shared machines eat coins; and anyone mid-move whose machine is in a van somewhere.</p>
<h2>Compared with the alternatives</h2>
<p>A launderette service wash in Ireland typically runs €12–€20 <em>plus</em> the two trips to drop off and collect. Big laundry apps charge by the kilo with delivery fees on top and mostly serve Dublin. Vano's €30-a-bag is fully door-to-door — collection and return included, none of your time — and the money goes to a local student, not a logistics chain.</p>
<h2>Want ironing too?</h2>
<p>Ironing is its own job — see the <a href="/glossary/ironing-service">ironing service</a> explainer, or book it as an "Anything else" job at €22/hr alongside your wash.</p>
<p><a href="/#book"><strong>Book laundry collection in Galway →</strong></a></p>
`,
    related: ["cleaner-cost-galway", "dog-walker-galway-cost", "why-vano-fair-pay-same-day"],
    faqs: [
      { q: "How much is the laundry service in Galway?", a: "€30 for a standard bag — collected, washed, dried and returned folded — plus a €5 booking fee when a helper says yes: €35 all-in. Bigger loads book as 2 bags (€50) or 3 bags (€65). No per-kilo charges." },
      { q: "How fast does laundry come back?", a: "Usually same-day or next-day, depending on when you book and drying time. The helper agrees timing with you at collection." },
      { q: "Is ironing included?", a: "No — the €30 covers wash, dry and fold. Ironing can be booked as its own job at €22/hr." },
      { q: "Who collects my laundry?", a: "A local ID-verified student — you see their name, photo and rating before they call, and the same helper returns it folded." },
    ],
  },

  {
    slug: "deep-clean-vs-standard-clean",
    title: "Deep Clean vs Standard Clean: Which Do You Actually Need?",
    summary:
      "A standard clean (about 2 hours, €44) keeps a home ticking over; a deep clean (3–4 hours, €66–€88) gets into the corners a weekly tidy skips. Here's how to tell which your home needs — and when.",
    description:
      "Deep clean or standard clean? What each includes, what they cost in Galway (€44 vs €66–€88 at €22/hr), and a simple rule for choosing the right one.",
    keywords:
      "deep clean vs regular clean, what is a deep clean, deep cleaning checklist Ireland, standard clean includes, deep clean cost Galway, spring clean",
    eyebrow: "Cleaning guide",
    datePublished: "2026-07-17",
    dateModified: "2026-07-17",
    readingMins: 5,
    author: "The Vano Team",
    heroGradient: "from-navy via-navy to-sage-dark",
    heroAlt: "Cleaning caddy with gloves and spray bottles ready for a deep clean of a Galway home",
    tags: ["Cleaning", "Guides"],
    bodyHtml: `
<p>"Deep clean" gets thrown around loosely, so here's the honest difference — and a one-line rule for picking: <strong>if you'd be embarrassed opening a cupboard in front of a guest, it's a deep clean.</strong></p>
<h2>What a standard clean includes</h2>
<p>A standard clean is the regular reset — about <strong>2 hours (€44)</strong> for most homes:</p>
<ul>
<li>Kitchen surfaces, hob and sink</li>
<li>Bathroom: toilet, sink, shower/bath, mirror</li>
<li>Floors hoovered and mopped</li>
<li>General dusting and tidying</li>
</ul>
<p>It keeps a home ticking over. Weekly or fortnightly standard cleans are the "never let it slide" routine.</p>
<h2>What a deep clean adds</h2>
<p>A <a href="/glossary/deep-clean">deep clean</a> — usually <strong>3–4 hours (€66–€88)</strong> — gets everything above <em>plus</em> the places a quick clean never reaches:</p>
<ul>
<li>Inside cupboards, the fridge and the <a href="/glossary/oven-clean">oven</a></li>
<li>Limescale off taps, shower screens and tiles</li>
<li>Skirting boards, door frames, window sills and inside windows</li>
<li>Under and behind furniture that moves</li>
</ul>
<h2>When each one makes sense</h2>
<ul>
<li><strong>Standard:</strong> the weekly/fortnightly keep-up, before ordinary visitors, after a busy week.</li>
<li><strong>Deep:</strong> first clean in a long while, before or after guests staying over, seasonal <a href="/glossary/spring-clean">spring clean</a>, post-renovation dust, or when allergies flare.</li>
<li><strong>Moving out?</strong> That's its own beast — the <a href="/glossary/end-of-tenancy-clean">end-of-tenancy clean</a> — with a landlord checklist attached. See the <a href="/blog/end-of-tenancy-cleaning-galway">full guide</a>.</li>
</ul>
<h2>Pricing is the same simple maths</h2>
<p>On Vano both are the same honest rate — <strong>€22/hr</strong>, your <a href="/glossary/student-cleaner">student cleaner</a> keeps 100% — you're just booking more hours for a deep clean. One small booking fee (15%, min €5) is charged <a href="/glossary/pay-after-accept">when a helper says yes</a>, and optional <a href="/glossary/vano-cover">Vano Cover</a> (€2) covers accidental damage up to €250. Full price rundown in the <a href="/blog/cleaner-cost-galway">Galway cleaner price guide</a>.</p>
<p><a href="/#book"><strong>Book a clean that fits →</strong></a></p>
`,
    related: ["cleaner-cost-galway", "end-of-tenancy-cleaning-galway", "laundry-service-galway-cost"],
    faqs: [
      { q: "What's the difference between a deep clean and a standard clean?", a: "A standard clean covers surfaces, bathroom, floors and tidying. A deep clean adds the hidden work: inside cupboards and appliances, limescale, skirting boards, and under furniture." },
      { q: "How often should I book a deep clean?", a: "Every 2–3 months for most homes, with standard cleans keeping things ticking over in between — or whenever cupboards and corners have quietly gotten away from you." },
      { q: "How much does each cost in Galway?", a: "At €22/hr: a standard clean is about €44 (2 hours), a deep clean €66–€88 (3–4 hours), plus a small booking fee (15%, min €5)." },
    ],
  },
];

// ── PARKED (owner call 2026-07-24: moving retired from the customer offer —
// liability triage; see PARKED_SERVICE_LANDINGS in services.ts). Kept out of
// BLOG_POSTS so the index, prerender, sitemap and related-links drop it
// automatically. Don't re-add without the owner.
const PARKED_BLOG_POSTS: BlogPost[] = [
  {
    slug: "moving-help-galway",
    title: "Moving in Galway: What Help Costs & a Stress-Free Checklist",
    summary:
      "Student moving help in Galway costs €22 an hour per helper on Vano — you arrange the van, they bring the muscle. Here's what a typical move costs and the checklist that keeps moving day calm.",
    description:
      "Help moving house in Galway: €22/hr per helper for lifting, loading and carrying. What a typical flat move costs in 2026, plus a stress-free moving day checklist.",
    keywords:
      "moving help Galway, man with a van Galway alternative, help moving house Ireland cost, furniture moving Galway, student movers Galway, moving day checklist",
    eyebrow: "Moving",
    datePublished: "2026-07-17",
    dateModified: "2026-07-17",
    readingMins: 6,
    author: "The Vano Team",
    heroGradient: "from-express-orange via-gold to-sage",
    heroAlt: "Students carrying moving boxes into a house in Galway on moving day",
    tags: ["Moving", "Prices", "Galway"],
    bodyHtml: `
<p>The hardest part of moving isn't the van — it's the fourth trip up the stairs with a couch. On Vano, <strong>moving help costs €22 an hour per helper</strong>: strong, careful lifting and carrying, booked for exactly the hours you need.</p>
<h2>How it works (and what you arrange)</h2>
<p>One honest thing upfront: <strong>you arrange the van</strong> (or use your own car for a small move). Vano helpers are the labour — they load, carry, and unload, but they never drive your belongings. That split keeps it simple and cheap: van hire in Galway runs roughly €40–€80 for a half day, and the muscle is €22/hr on top.</p>
<h2>What a typical Galway move costs</h2>
<ul>
<li><strong>Student room move</strong> (boxes + a few bags, 2 hours, one helper) — €36</li>
<li><strong>One-bed flat</strong> (3 hours, one helper) — €54</li>
<li><strong>Two-bed with furniture</strong> (3 hours, two helpers booked together) — €108</li>
</ul>
<p>Each booking adds one small fee (15%, min €4), charged only <a href="/glossary/pay-after-accept">when a helper says yes</a>. Your helpers keep 100% of the job price — you pay them directly when the lifting's done.</p>
<h2>The stress-free moving day checklist</h2>
<ul>
<li><strong>Book the van first, helpers second</strong> — match the helper hours to the van window.</li>
<li><strong>Box everything before they arrive</strong> — €22/hr is for carrying, not bubble-wrapping mugs.</li>
<li><strong>Heaviest furniture measured</strong> — check the couch actually fits the new stairwell.</li>
<li><strong>Park close</strong> — five metres to the door beats fifty.</li>
<li><strong>Keep kettle, chargers and keys in one "open me first" box.</strong></li>
</ul>
<h2>Moving out? Don't forget the clean</h2>
<p>If it's a rental, the <a href="/glossary/end-of-tenancy-clean">end-of-tenancy clean</a> decides your deposit. Book it for after the furniture's out — an empty home cleans faster. Full checklist in our <a href="/blog/end-of-tenancy-cleaning-galway">end-of-tenancy guide</a>, and flat-pack going back together at the new place is a classic <a href="/glossary/flat-pack-assembly">assembly job</a>.</p>
<p><a href="/#book"><strong>Book moving help in Galway →</strong></a></p>
`,
    related: ["end-of-tenancy-cleaning-galway", "cleaner-cost-galway", "what-vano-helpers-do"],
    faqs: [
      { q: "How much does moving help cost in Galway?", a: "€22 an hour per helper on Vano. A typical student room move is about €36 (2 hours); a one-bed flat about €54 (3 hours) — plus van hire, which you arrange." },
      { q: "Do Vano helpers drive the van?", a: "No — helpers load, carry and unload, but never drive your belongings or passengers. You arrange the van or use your own car; that split is what keeps the price low." },
      { q: "Can two helpers work the same move?", a: "Yes — book two moving jobs for the same time slot and note they're for the same move. Two sets of hands roughly halves the carrying time." },
      { q: "How far in advance should I book?", a: "Same-day is often possible, but for a moving day with a hired van, booking a day or two ahead is safest so the van and the muscle line up." },
    ],
    howTo: [
      { name: "Sort the van before the muscle", text: "Book your van (or borrow a car) first, then book Vano helpers for the same window at €22/hr each." },
      { name: "Pack completely before helpers arrive", text: "Everything boxed, sealed and labelled — helper hours should go on carrying, not packing." },
      { name: "Load heavy and awkward items first", text: "Couch, mattress, wardrobe into the van first; boxes fill the gaps around them." },
      { name: "Book the end-of-tenancy clean for after", text: "Once furniture is out, a 3–4 hour move-out clean gets the deposit back — book it as a separate cleaning job." },
    ],
  },
];
void PARKED_BLOG_POSTS; // kept for history / re-mount, not rendered


/** Lookup by slug — used by the route and the prerenderer. */
export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
