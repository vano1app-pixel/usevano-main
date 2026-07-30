// The tick-box job builder — wizard page 1 for the hourly categories
// (owner call 2026-07-24: "tap the boxes and watch the price build").
//
// THE INVARIANT THAT MAKES THIS SAFE: the builder never invents a price.
// Each ticked task maps to MINUTES; the summed minutes round UP to one of
// the category's existing size labels ('1 hour', '2 hours', …) and that
// label is all checkout ever sees — the server re-prices it from its own
// table exactly like any other booking. The ticked tasks ride the existing
// note/extra_label contract (the SubService `carry` pattern) so dispatch
// offers and the helper job screen name the real tasks.
//
// The market-rate figures are DISPLAY-ONLY anchors (same rule as the old
// CustomJobBuilder comparisons): deliberately conservative Galway going
// rates, never charged, never sent to the server.
// jobBuilder.test.ts locks all of this: every possible tick combination
// must round to a size label the category actually offers, and every
// anchor rate must sit above €18/hr so "you save" can never read negative.

export interface BuilderTask {
  key: string;
  emoji: string;
  label: string;
  /** Rough honest estimate — sums then rounds UP to a bookable duration. */
  minutes: number;
}

/** Categories that use the tick-box page instead of the sub-service picker.
 *  Laundry (flat price) and Pets (walk-length picker) keep the old page. */
export const BUILDER_TASKS: Record<string, BuilderTask[]> = {
  cleaning: [
    { key: 'kitchen',  emoji: '🍳', label: 'Kitchen deep-clean',       minutes: 45 },
    { key: 'bathroom', emoji: '🛁', label: 'Bathroom scrub',           minutes: 30 },
    { key: 'bedrooms', emoji: '🛏️', label: 'Bedrooms & living areas',  minutes: 45 },
    { key: 'floors',   emoji: '🧽', label: 'Floors throughout',        minutes: 30 },
    { key: 'oven',     emoji: '🔥', label: 'Inside the oven & fridge', minutes: 30 },
    { key: 'windows',  emoji: '🪟', label: 'Windows (inside)',         minutes: 30 },
    // Condition tick (2026-07-27): size is only half the fairness question —
    // the other half is how the place is RIGHT NOW. Self-confessed, priced
    // like any tick, and it rides the note so the helper knows what they're
    // walking into. Last on purpose: it reads as the honest footnote.
    { key: 'messy',    emoji: '🌪️', label: 'Extra messy right now',    minutes: 30 },
  ],
  garden: [
    { key: 'mowing',   emoji: '🌱', label: 'Lawn mowing',              minutes: 45 },
    { key: 'weeding',  emoji: '🌿', label: 'Weeding & beds',           minutes: 45 },
    { key: 'hedges',   emoji: '✂️', label: 'Hedge trimming',           minutes: 30 },
    { key: 'planting', emoji: '🪴', label: 'Planting',                 minutes: 30 },
    { key: 'power',    emoji: '💦', label: 'Power washing',            minutes: 60 },
    { key: 'leaves',   emoji: '🍂', label: 'Leaves & tidy-up',         minutes: 30 },
    // Condition tick — a jungle takes honestly longer than a kept lawn.
    { key: 'overgrown', emoji: '🌾', label: 'Quite overgrown',         minutes: 45 },
  ],
  moving: [
    { key: 'furniture', emoji: '🛋️', label: 'Furniture & heavy lifting', minutes: 60 },
    { key: 'boxes',     emoji: '📦', label: 'Boxes — pack & carry',      minutes: 45 },
    { key: 'single',    emoji: '🚪', label: 'One big item, moved',       minutes: 30 },
    { key: 'tiprun',    emoji: '🚛', label: 'Tip run / clear-out',       minutes: 45 },
    { key: 'rearrange', emoji: '🔄', label: 'Rearranging a room',        minutes: 30 },
  ],
};

/** Display-only "typical Galway rate" anchors, cents per hour. Conservative
 *  on purpose — an anchor that overclaims reads as a lie the first time a
 *  customer price-checks it. Never charged, never sent to the server. */
export const BUILDER_MARKET_RATE_CENTS: Record<string, number> = {
  cleaning: 2800,
  garden:   3000,
  moving:   3500,
};

// ── The one-tap sizing question (2026-07-27, owner ask: "after they choose
// the category it asks a small question — roughly how big is the garden, how
// big is the room, what type of dog — so the price is fairest for the
// students AND the households"). ONE question per category, one tap to
// answer, and it obeys the same invariant as the tick boxes: an answer can
// NEVER invent a price. Three honest mechanisms, one per option kind:
//   factor — builder categories: scales the ticked MINUTES (the task
//            estimates are calibrated to the middle answer), so the total
//            still rounds onto the category's existing half-hour labels and
//            the server prices the label exactly as before;
//   size   — jumps straight to an EXISTING size label (laundry's bag
//            ladder, priced up front instead of defaulting to 1 bag);
//   carry   — the answer rides note + extra_label so dispatch offers and
//            the helper's job screen name the real ask (a lab is not a
//            chihuahua) before accepting. For dog walks the carry is ALSO
//            priced — by the SERVER, which reads extra_label exactly like
//            tutoring's level (owner call 2026-07-27: a bigger/stronger dog
//            or a second lead is more work, so the walk price says so).
//            The client only ever displays the mirrored numbers
//            (DOG_UPCHARGE_CENTS in householdPricing.ts).
// jobBuilder.test.ts locks all three shapes, and locks the dog ladder to
// the server table.

export interface SizingOption {
  key: string;
  emoji: string;
  label: string;
  /** One-line example under the label ("Terrier, pug…"). */
  hint?: string;
  /** Builder categories: multiplies the summed task minutes. */
  factor?: number;
  /** Non-builder categories: picks an existing size label outright. */
  size?: string;
  /** Rides into note/extra_label so the helper reads the real ask. */
  carry?: string;
}

export interface SizingQuestion {
  title: string;
  /** The honest why-we-ask line, shown under the title. */
  why: string;
  options: SizingOption[];
}

export const SIZING_QUESTIONS: Record<string, SizingQuestion> = {
  cleaning: {
    title: 'Roughly how big is your place?',
    why: 'One tap — it sizes the clean fairly for you and your helper',
    options: [
      { key: 'small',   emoji: '🏢', label: '1–2 bedrooms', hint: 'Apartment or small house',        factor: 0.75, carry: '1–2 bed home' },
      { key: 'typical', emoji: '🏠', label: '3 bedrooms',   hint: 'A typical semi-D',                factor: 1,    carry: '3-bed home' },
      { key: 'large',   emoji: '🏡', label: '4+ bedrooms',  hint: 'More rooms, more ground to cover', factor: 1.35, carry: '4+ bed home' },
    ],
  },
  // Square-metre bands (owner call 2026-07-28): m² is the metric people
  // know from property listings, and the carry gives the helper a real
  // number instead of one person's "average". The plain-words hints do the
  // translating for anyone who doesn't know their m². Keys + factors are
  // UNCHANGED — same calibration, same priceable half-hour labels.
  garden: {
    title: 'Roughly how big is the garden?',
    why: 'One tap — it sizes the job fairly for you and your helper',
    options: [
      { key: 'small',   emoji: '🌱', label: 'Under 50 m²', hint: 'Patio or courtyard',       factor: 0.7, carry: 'Garden under 50 m²' },
      { key: 'typical', emoji: '🌿', label: '50–150 m²',   hint: 'A typical back garden',    factor: 1,   carry: '50–150 m² garden' },
      { key: 'large',   emoji: '🌳', label: 'Over 150 m²', hint: 'Big lawn, front and back', factor: 1.5, carry: '150 m²+ garden' },
    ],
  },
  // Priced carries (owner call 2026-07-27): the answer rides extra_label and
  // the SERVER adds the dog surcharge — Small/Medium at base, Big +€3, Two
  // +€5. The `why` line carries the honest reason (bigger dogs + second
  // leads are more work — strength is what the premium buys), but there is
  // deliberately NO "aggressive dog" tier: selling students a
  // known-aggressive dog at a premium is the moving-tile class of
  // liability. The rows show the real resulting walk price before the tap.
  'dog-walk': {
    title: 'What kind of dog?',
    why: 'Bigger dogs and second leads are more work — the price stays fair to your helper',
    options: [
      { key: 'small',  emoji: '🐕', label: 'Small dog',  hint: 'Terrier, pug, dachshund…',      carry: 'Small dog' },
      { key: 'medium', emoji: '🦮', label: 'Medium dog', hint: 'Spaniel, collie, beagle…',      carry: 'Medium dog' },
      { key: 'big',    emoji: '🐕‍🦺', label: 'Big dog',    hint: 'Labrador, boxer, husky…',       carry: 'Big dog' },
      { key: 'two',    emoji: '🐾', label: 'Two dogs',   hint: 'Walked together by one helper', carry: 'Two dogs' },
    ],
  },
  // Laundry already had the bag ladder — this just asks it UP FRONT with the
  // real prices on the rows, instead of quietly defaulting to 1 bag behind
  // the form's "Change" fold. The sizes MUST stay the LAUNDRY_BAG_CENTS keys.
  shopping: {
    title: 'How much laundry?',
    why: 'A bag is about one full washing-machine load',
    options: [
      { key: '1bag',  emoji: '🧺', label: '1 bag',  hint: 'About one machine load', size: '1 bag' },
      { key: '2bags', emoji: '🧺', label: '2 bags', hint: 'Two loads',              size: '2 bags' },
      { key: '3bags', emoji: '🧺', label: '3 bags', hint: 'The big catch-up',       size: '3 bags' },
    ],
  },
};

// ── The one-tap equipment question (2026-07-30, owner ask: "if the job
// needs a tool, ask the customer if they have it — like cleaning, do you
// have the products"). The #1 silent job failure is a helper cycling across
// town to a garden with no mower or a clean with no hoover: the job dies on
// the doorstep. One extra tap after the sizing question catches it at
// booking time. Same invariants as everything else on page 1:
//   carry  — ALWAYS rides the note so dispatch offers and the helper's job
//            screen say the real setup ("Has hoover + products") BEFORE a
//            helper accepts — that's the whole point;
//   suppliesAddon — cleaning only: "no products" books the helper to BRING
//            the basics for a flat add-on priced by the SERVER
//            (SUPPLIES_ADDON_CENTS — the checkout reads an explicit
//            bring_supplies boolean, never parses the note). The client
//            only displays the mirrored number. No hoover is NOT an addon —
//            a student can't carry a hoover on a bike, so that option
//            honestly re-scopes to sweep + mop instead of failing the job.
// No answer (WhatsApp door, memory rebooks, old links) = no carry, no addon
// — fail-soft, exactly like the sizing question. Laundry deliberately has
// no equipment question: the bag ladder already asked the only thing that
// matters, and a detergent question would add friction for nothing.

export interface EquipmentOption {
  key: string;
  emoji: string;
  label: string;
  hint?: string;
  /** Rides into the booking note so the helper reads the setup up front. */
  carry: string;
  /** Cleaning only: helper brings the basics — server prices the flat add-on. */
  suppliesAddon?: boolean;
}

export interface EquipmentQuestion {
  title: string;
  /** The honest why-we-ask line, shown under the title. */
  why: string;
  options: EquipmentOption[];
}

export const EQUIPMENT_QUESTIONS: Record<string, EquipmentQuestion> = {
  cleaning: {
    title: 'Do you have cleaning things at home?',
    why: 'So your helper arrives ready — no doorstep surprises',
    options: [
      { key: 'all',        emoji: '✅', label: 'Hoover & products', hint: 'All set — helper just brings energy', carry: 'Has hoover + products' },
      { key: 'no-products', emoji: '🧴', label: 'Hoover, no products', hint: 'Helper brings sprays & cloths', carry: 'Helper brings cleaning products', suppliesAddon: true },
      { key: 'no-hoover',  emoji: '🧹', label: 'No hoover', hint: 'Helper will sweep & mop floors instead', carry: 'No hoover — sweep & mop floors' },
    ],
  },
  garden: {
    title: "What's in the shed?",
    why: 'So your helper arrives ready — no doorstep surprises',
    options: [
      { key: 'mower',    emoji: '🚜', label: 'Mower & tools', hint: 'All set for any garden job',            carry: 'Has mower + tools' },
      { key: 'basic',    emoji: '🧤', label: 'Some tools, no mower', hint: 'Weeding, hedges & tidy-ups work great', carry: 'Tools but no mower — no mowing' },
      { key: 'none',     emoji: '🤷', label: 'No tools', hint: 'Helper brings gloves & hand tools for light work', carry: 'No tools — helper brings gloves & hand tools' },
    ],
  },
  'dog-walk': {
    title: 'Lead & bits ready to go?',
    why: 'So the walk starts the minute your helper arrives',
    options: [
      { key: 'ready',  emoji: '🦴', label: 'Lead, harness & bags by the door', hint: 'Grab-and-go', carry: 'Lead, harness & bags by the door' },
      { key: 'lead',   emoji: '🐕', label: 'Lead only', hint: 'Helper brings poop bags',            carry: 'Lead only — helper brings bags' },
    ],
  },
};

const taskByKey = (slug: string, key: string): BuilderTask | undefined =>
  BUILDER_TASKS[slug]?.find((t) => t.key === key);

/** Sum of ticked minutes × the sizing answer's factor (unknown keys are
 *  ignored — fail-soft; no answer = factor 1, exactly the old behaviour). */
export function builderMinutes(slug: string, keys: string[], factor = 1): number {
  const base = keys.reduce((sum, k) => sum + (taskByKey(slug, k)?.minutes ?? 0), 0);
  return Math.round(base * factor);
}

/** Leading hour count from a size label ("2 hours", "1.5 hours", "4+ hours")
 *  — decimal-aware, mirrors householdPricing's parser so the two can never
 *  disagree on a label. */
export function hoursFromSizeLabel(size: string): number | null {
  const n = Number(size.match(/^\d+(\.\d+)?/)?.[0]);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * Round summed minutes UP to the next HALF-HOUR billing step (owner call
 * 2026-07-27: with whole-hour rounding, two ticks and three ticks kept
 * landing on the same price — every tick must move the number). Floor is
 * 1 hour (the booking minimum), cap is the category's biggest bookable
 * duration (the note still lists everything ticked, so the helper knows
 * the full ask). 0 minutes → null (nothing ticked yet).
 *
 * The label is computed ("1.5 hours", "2 hours"), not picked from the
 * chips array — both price tables carry the half-hour entries, and the
 * lock-step tests fail if a computable label ever isn't priceable.
 */
export function builderSizeLabel(minutes: number, sizes: string[]): string | null {
  if (minutes <= 0) return null;
  const maxHours = sizes.reduce((m, s) => Math.max(m, hoursFromSizeLabel(s) ?? 0), 0);
  if (!maxHours) return null;
  const halfSteps = Math.max(2, Math.ceil(minutes / 30)); // in half-hours, min 1h
  const hours = Math.min(maxHours, halfSteps / 2);
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

/** Display-only market comparison for the chosen duration, or null. */
export function builderMarketCents(slug: string, sizeLabel: string): number | null {
  const rate = BUILDER_MARKET_RATE_CENTS[slug];
  const hours = hoursFromSizeLabel(sizeLabel);
  return rate && hours ? rate * hours : null;
}

/** The full ticked list, in task-list order — becomes the booking note the
 *  helper reads ("Lawn mowing + Weeding & beds"). */
export function builderNote(slug: string, keys: string[]): string {
  return (BUILDER_TASKS[slug] ?? [])
    .filter((t) => keys.includes(t.key))
    .map((t) => t.label)
    .join(' + ');
}

/** Short label for dispatch offers / job screens ("Lawn mowing +2"). */
export function builderShortLabel(slug: string, keys: string[]): string | null {
  const picked = (BUILDER_TASKS[slug] ?? []).filter((t) => keys.includes(t.key));
  if (!picked.length) return null;
  return picked.length === 1 ? picked[0].label : `${picked[0].label} +${picked.length - 1}`;
}

/** A task row's minutes under the sizing answer, tidied to 5-min steps so
 *  the "~" chips stay readable ("~25 min", never "~22.5 min"). Display-only —
 *  the billed total comes from builderMinutes, not a sum of these. */
export function scaledTaskMinutes(minutes: number, factor: number): number {
  return Math.max(5, Math.round((minutes * factor) / 5) * 5);
}

/** "~45 min" / "~1 hr" chip text for a task row. */
export function minutesLabel(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  return minutes % 60 === 0 ? `~${minutes / 60} hr` : `~${Math.round((minutes / 60) * 10) / 10} hr`;
}
