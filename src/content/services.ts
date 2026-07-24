// Per-service landing pages (/cleaning-galway, /dog-walking-galway, …) —
// the indexable pages for high-intent local searches ("cleaner galway") that
// the single homepage can't rank for. One source of truth consumed by:
//   • src/pages/ServiceLanding.tsx      (the React page)
//   • scripts/prerender-content.ts      (static HTML for no-JS crawlers)
//   • api/sitemap.xml.ts                (sitemap entries)
//
// `category` must be a real CategoryGrid booking slug — the page's CTA
// dispatches vano:select-category with it, so every landing page books
// through the ONE quick-book flow (never a second booking path).
//
// Prices quoted here are display copy; keep them in step with
// src/lib/householdPricing.ts (the canonical frontend prices).

export interface ServiceFaq {
  q: string;
  a: string;
}

export interface ServiceLandingContent {
  /** Top-level URL segment, e.g. 'cleaning-galway' → vanojobs.com/cleaning-galway */
  slug: string;
  /** CategoryGrid booking slug the CTA opens ('cleaning', 'dog-walk', …). */
  category: string;
  /** Human name of the service ("House cleaning"). */
  name: string;
  /** Short label for footer / internal links ("Cleaning"). */
  shortLabel: string;
  /** SEO title, without the " | VANO" suffix. */
  title: string;
  /** Meta description (~155 chars). */
  description: string;
  h1: string;
  /** Lead paragraph under the H1. */
  intro: string;
  /** Longer body sections — unique copy is what earns the ranking. */
  body: { heading: string; text: string }[];
  /** Headline price, e.g. "€18/hour" or "€15 flat". */
  priceLabel: string;
  /** One-line context under the price. */
  priceDetail: string;
  /** Numeric "from" price in euro for the Offer JSON-LD. */
  fromPriceEuro: number;
  /** What's included — rendered as ticks. */
  included: string[];
  faqs: ServiceFaq[];
}

// Platform answers shared across pages, phrased once so they never drift.
const PAY_AFTER_ACCEPT: ServiceFaq = {
  q: 'Do I pay upfront?',
  a: 'No. Booking is free — when a named helper accepts, a small VANO booking fee by card confirms it, and you pay your helper the job price directly (Revolut or cash) once the work is done. You’ll see who they are (name, photo, rating) before any money moves, and the fee has a money-back guarantee.',
};
const WHO_ARE_HELPERS: ServiceFaq = {
  q: 'Who are the helpers?',
  a: 'Local students, ID-verified before they can take a single job. Every helper has a public profile with their photo, rating and completed-job count, and you can track them live on a map on the day.',
};
const HOW_FAST: ServiceFaq = {
  q: 'How fast can someone come?',
  a: 'Most Galway bookings are same-day — a nearby helper usually replies within minutes. You can also book ahead for tomorrow at the same price.',
};

export const SERVICE_LANDINGS: ServiceLandingContent[] = [
  {
    slug: 'cleaning-galway',
    category: 'cleaning',
    name: 'House cleaning',
    shortLabel: 'Cleaning',
    title: 'House Cleaning in Galway — Same-Day, from €18/hr',
    description:
      'Book an ID-verified student cleaner in Galway today. Kitchen, bathroom, floors & surfaces from €18/hr — free to book, pay when it’s done. Money-back guarantee.',
    h1: 'House cleaning in Galway, booked in 30 seconds',
    intro:
      'Hoovering, mopping, kitchen, bathroom and surfaces — done same-day by an ID-verified local student. You see exactly who’s coming before you pay a cent, and you can watch them arrive on a live map.',
    body: [
      {
        heading: 'What a Vano clean covers',
        text: 'A standard visit works through the rooms you point at: floors hoovered and mopped, surfaces wiped, kitchen counters and hob degreased, bathroom sink, toilet and shower scrubbed. Most homes in Galway book two hours (€36) for a solid refresh of a one- or two-bed; add a third hour for a bigger house or a deeper going-over. You choose the length when you book — no quotes, no callbacks.',
      },
      {
        heading: 'Why students, and why it works',
        text: 'Galway is a university city full of reliable students who want flexible work that pays properly — your cleaner keeps 100% of the hourly rate, paid directly by you, well above the Irish minimum wage. Each one is ID-verified before their first job, rated after every visit, and you see their name, photo and rating the moment they accept. From Salthill to Renmore, Knocknacarra to the city centre, there’s usually someone nearby today.',
      },
    ],
    priceLabel: '€18/hour',
    priceDetail: 'Most homes book 2 hours (€36). Same-day or book ahead for tomorrow.',
    fromPriceEuro: 18,
    included: [
      'Floors — hoovered & mopped',
      'Kitchen counters, hob & sink',
      'Bathroom — toilet, sink & shower',
      'Surfaces & dusting throughout',
    ],
    faqs: [
      {
        q: 'Do I need to provide cleaning supplies?',
        a: 'Yes — your cleaner uses your own products and hoover, which most people prefer for their home anyway. Leave out what you’d like used and mention anything specific in the booking note.',
      },
      {
        q: 'How much does a cleaner cost in Galway?',
        a: 'Vano cleaning is a flat €18/hour with no hidden fees — a typical two-hour clean is €36. Agencies in Galway commonly charge €25–35/hour with minimum contracts; Vano is pay-per-visit with no commitment.',
      },
      PAY_AFTER_ACCEPT,
      WHO_ARE_HELPERS,
      HOW_FAST,
    ],
  },
  {
    slug: 'dog-walking-galway',
    category: 'dog-walk',
    name: 'Dog walking',
    shortLabel: 'Dog walks',
    title: 'Dog Walking in Galway — Same-Day Walker from €15',
    description:
      'Book a local, ID-verified student dog walker in Galway today. 30-minute walk €15, full hour €20 — collected from your door, walked on-lead, returned safely.',
    h1: 'A trusted dog walker in Galway, today',
    intro:
      'Stuck in work, away for the day, or the weather finally cleared? An ID-verified local student collects your dog from your door, walks them on-lead, and returns them home safely — with live tracking so you can see the walk happen.',
    body: [
      {
        heading: 'How a Vano walk works',
        text: 'Pick 30 minutes (€15) or a full hour (€20), tell us your address, and a nearby walker accepts — usually within minutes. You’ll see their name, photo and rating before you pay, and you can follow the walk on a live map. Your dog is walked on-lead the whole time and handed back at your door, never left tied up or loose.',
      },
      {
        heading: 'Regular walks without the subscription trap',
        text: 'There’s no contract and no weekly minimum — book a walk whenever you need one, from the Prom in Salthill to the woods in Terryland. If you find a walker your dog loves, book again in two taps; on every third booking VANO waives its booking fee as a loyalty thank-you.',
      },
    ],
    priceLabel: '€15 / 30 min · €20 / hour',
    priceDetail: 'Collected, walked on-lead and returned safely. Same-day or book ahead.',
    fromPriceEuro: 15,
    included: [
      'Collected & returned at your door',
      'On-lead the whole walk',
      'Live map — watch the walk',
      'Water & treat stop on request',
    ],
    faqs: [
      {
        q: 'Will my dog be walked with other dogs?',
        a: 'No — every Vano walk is solo, just your dog and the walker. If you have two dogs from the same home, mention it in the booking note.',
      },
      {
        q: 'What if my dog is nervous or strong on the lead?',
        a: 'Put it in the booking note — walkers see your note before accepting, so the one who takes the job knows exactly what they’re taking on. You can also chat with your walker in the app once they accept.',
      },
      PAY_AFTER_ACCEPT,
      WHO_ARE_HELPERS,
      HOW_FAST,
    ],
  },
  {
    slug: 'garden-help-galway',
    category: 'garden',
    name: 'Garden help',
    shortLabel: 'Garden',
    title: 'Garden Help in Galway — Mowing & Tidy-Ups from €18/hr',
    description:
      'Same-day garden help in Galway: mowing, weeding, edging and tidy-ups by ID-verified students from €18/hr, waste bagged. Free to book, pay when it’s done.',
    h1: 'Garden help in Galway, without the wait',
    intro:
      'Grass gone wild, beds full of weeds, or a patio that needs clearing before the weekend? Book an ID-verified local student for mowing, weeding, edging and general tidy-ups — same-day, with all waste bagged.',
    body: [
      {
        heading: 'What garden jobs can I book?',
        text: 'The bread and butter: mowing and strimming, weeding beds and paths, edging, hedge tidying at reachable height, leaf clearing, and hauling everything into bags. You book by the hour (€18/hr) — one hour handles a small lawn and edges, two to three covers most Galway gardens that have gotten away from you. Your own mower and tools are used, so the job is done the way you’d do it.',
      },
      {
        heading: 'A fair deal on both sides',
        text: 'Garden contractors in Galway often won’t travel for a small job, and when they do it’s €50 before anyone lifts a rake. Vano fills exactly that gap: a strong, reliable student nearby who’s happy with an hour or two of honest outdoor work — and who keeps 100% of the hourly rate, well above minimum wage.',
      },
    ],
    priceLabel: '€18/hour',
    priceDetail: 'One hour suits a small lawn; most gardens book 2–3 hours. Waste bagged.',
    fromPriceEuro: 18,
    included: [
      'Mowing & strimming',
      'Weeding & edging',
      'Hedge & leaf tidy-ups',
      'All waste bagged',
    ],
    faqs: [
      {
        q: 'Do I need to provide tools?',
        a: 'Yes — your helper uses your mower, shears and bags. If something’s missing, say so in the booking note and they’ll tell you before accepting whether they can bring it.',
      },
      {
        q: 'Can they take the garden waste away?',
        a: 'Everything is bagged and left neatly for your green bin or a tip run. Helpers are on foot or bikes, so they can’t haul waste — if you need a tip run, add it to the note and arrange it directly.',
      },
      PAY_AFTER_ACCEPT,
      WHO_ARE_HELPERS,
      HOW_FAST,
    ],
  },
  {
    slug: 'laundry-service-galway',
    category: 'shopping',
    name: 'Laundry collection',
    shortLabel: 'Laundry',
    title: 'Laundry Service in Galway — Collected & Returned, from €30',
    description:
      'Laundry collected from your door in Galway, washed, dried, folded and returned — from €30 a bag by an ID-verified student. Book in 30 seconds, pay when it’s back.',
    h1: 'Laundry collected, washed & returned — from €30',
    intro:
      'The basket’s overflowing and the week got away from you. An ID-verified local student collects your laundry from your door, washes, dries and folds it, and brings it back fresh — €30 a bag, no weighing, no meters.',
    body: [
      {
        heading: 'How it works',
        text: 'Book in 30 seconds with your address and phone number. A nearby helper accepts — you see their name, photo and rating — then collects your bags at the door. It comes back washed, dried and folded, usually the same day. One standard bag is €30; got a mountain? Pick 2 bags (€50) or 3 bags (€65) when you book.',
      },
      {
        heading: 'Honest pricing, honest work',
        text: 'A launderette service wash in Galway runs €12–18 — before the two trips to drop off and collect. Vano is €30 a bag fully door-to-door: collected, washed, dried, folded and returned while you do none of it, and the student doing it keeps 100% — the task is priced so it’s genuinely worth their trip, not squeezed to the minute.',
      },
    ],
    priceLabel: 'from €30',
    priceDetail: 'Per bag — collected, washed, dried, folded & returned. 2 bags €50 · 3 bags €65.',
    fromPriceEuro: 30,
    included: [
      'Collected at your door',
      'Washed & dried',
      'Folded, not stuffed',
      'Returned same-day where possible',
    ],
    faqs: [
      {
        q: 'What counts as one load?',
        a: 'A standard washing-machine load — roughly one full laundry bag or basket. Duvets and very large items don’t fit a standard machine; mention them in the note first.',
      },
      {
        q: 'Any special instructions — delicates, detergent?',
        a: 'Put it in the booking note: wash temperature, detergent preferences, anything that shouldn’t go in the dryer. Your helper sees the note before accepting and can chat with you in the app.',
      },
      PAY_AFTER_ACCEPT,
      WHO_ARE_HELPERS,
      HOW_FAST,
    ],
  },
  {
    slug: 'moving-help-galway',
    category: 'moving',
    name: 'Moving help',
    shortLabel: 'Moving',
    title: 'Moving Help in Galway — Strong Pair of Hands from €18/hr',
    description:
      'Book same-day moving help in Galway: loading, carrying and unloading by ID-verified students from €18/hr. You arrange the van — we do the heavy lifting.',
    h1: 'An extra pair of hands for moving day',
    intro:
      'Flat swap, student move-out, a sofa that won’t move itself? Book an ID-verified local student for loading, carrying and unloading from €18/hour. You arrange the van — Vano supplies the muscle.',
    body: [
      {
        heading: 'What moving help covers',
        text: 'Carrying boxes and furniture up and down stairs, loading and unloading a van or trailer, shifting heavy items between rooms, and clearing a flat at the end of a lease. One hour handles a sofa or a few big items; a typical one-bed move books two to three hours. Need two people? Make two bookings for the same time slot and say so in the note.',
      },
      {
        heading: 'Perfect for Galway’s moving days',
        text: 'End-of-month lease changeovers, September student move-ins, last-minute Daft viewings that turned into a deposit — Galway moves on short notice, and man-with-van outfits book out days ahead. A student helper can usually be at your door the same day, booking is free, and you pay your helper directly once the job’s done.',
      },
    ],
    priceLabel: '€18/hour',
    priceDetail: 'You arrange the van or transport — your helper does the lifting.',
    fromPriceEuro: 18,
    included: [
      'Loading & unloading',
      'Stairs, awkward corners & heavy items',
      'End-of-lease clear-outs',
      'Same-day where possible',
    ],
    faqs: [
      {
        q: 'Does the helper bring a van?',
        a: 'No — helpers are students on foot or bikes, so you arrange the van, trailer or car. What you’re booking is the strong, reliable pair of hands that makes the van worth having.',
      },
      {
        q: 'Can I book two helpers at once?',
        a: 'Yes — place two bookings for the same time slot and note in each that it’s a two-person job. Each helper accepts independently, so you’ll see both names before you pay.',
      },
      PAY_AFTER_ACCEPT,
      WHO_ARE_HELPERS,
      HOW_FAST,
    ],
  },
];

/** Quick lookup used by the ServiceLanding page. */
export function getServiceLanding(slug: string): ServiceLandingContent | undefined {
  return SERVICE_LANDINGS.find((s) => s.slug === slug);
}
