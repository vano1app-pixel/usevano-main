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
  ],
  garden: [
    { key: 'mowing',   emoji: '🌱', label: 'Lawn mowing',              minutes: 45 },
    { key: 'weeding',  emoji: '🌿', label: 'Weeding & beds',           minutes: 45 },
    { key: 'hedges',   emoji: '✂️', label: 'Hedge trimming',           minutes: 30 },
    { key: 'planting', emoji: '🪴', label: 'Planting',                 minutes: 30 },
    { key: 'power',    emoji: '💦', label: 'Power washing',            minutes: 60 },
    { key: 'leaves',   emoji: '🍂', label: 'Leaves & tidy-up',         minutes: 30 },
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

const taskByKey = (slug: string, key: string): BuilderTask | undefined =>
  BUILDER_TASKS[slug]?.find((t) => t.key === key);

/** Sum of ticked minutes (unknown keys are ignored — fail-soft). */
export function builderMinutes(slug: string, keys: string[]): number {
  return keys.reduce((sum, k) => sum + (taskByKey(slug, k)?.minutes ?? 0), 0);
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

/** "~45 min" / "~1 hr" chip text for a task row. */
export function minutesLabel(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  return minutes % 60 === 0 ? `~${minutes / 60} hr` : `~${Math.round((minutes / 60) * 10) / 10} hr`;
}
