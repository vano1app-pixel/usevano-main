// General help — the "you don't have to pick a job" front door.
//
// This is NOT a new category, a new price table, or a second booking pipeline.
// It is the existing `custom` ("name any job") booking with a recognisable
// marker so both sides can give it a human face:
//
//   • Households: the hero "Send someone" field opens the SAME booking sheet
//     (CategoryGrid) on category `custom`, size `2 hours`, with the typed
//     sentence + a default room checklist riding the job note. €22/hr custom
//     × 2h = €44, priced by the server exactly like any other custom job
//     (extra_label is display-only for custom — see _shared/householdPricing).
//
//   • Students: an offer whose extra_label is GENERAL_HELP_LABEL renders as
//     "General help — they didn't pick a job" with the customer's words and
//     the default list up top, so the student isn't guessing on arrival.
//
// One module so the marker, the checklist and the note format can never drift
// between the hero, the student offer card and the job-detail screen.

/** The booking category general help maps onto (the existing custom pool). */
export const GENERAL_HELP_CATEGORY = 'custom' as const;

/** Default duration — "a few hours". Must be a real `custom` size label the
 *  server prices (see the hourMap in _shared/householdPricing.ts). */
export const GENERAL_HELP_SIZE = '2 hours' as const;

/** The marker that distinguishes general help from every OTHER custom booking
 *  (deep cleans, oven cleans, etc. also book as `custom`). Rides `extra_label`
 *  — which is stored top-level AND in booking_data, and is display-only for
 *  custom pricing, so tagging with it changes nothing about the charge. */
export const GENERAL_HELP_LABEL = 'General help' as const;

/** The rooms a student starts with when the household didn't say. Editable in
 *  the hero field; the picked items ride the job note to the helper. */
export const GENERAL_HELP_CHECKLIST = ['Kitchen', 'Bathroom', 'Floors', 'Bins'] as const;

/**
 * Compose the job note the helper reads. Kept in ONE place so the hero writes
 * it and the student screens can rely on the shape. Example:
 *   "Start with: Kitchen · Bathroom · Floors — “kitchen + dog, out by 5”"
 */
export function composeGeneralHelpNote(opts: {
  rooms: readonly string[];
  said?: string;
  timing?: string;
}): string {
  const parts: string[] = [];
  if (opts.rooms.length) parts.push(`Start with: ${opts.rooms.join(' · ')}`);
  const said = opts.said?.trim();
  if (said) parts.push(`“${said}”`);
  if (opts.timing) parts.push(opts.timing);
  return parts.join(' — ');
}

/** A booking (offer / job) shaped enough to test. Both the student dashboard
 *  and the job-detail screen carry category + a booking_data JSON blob. */
interface GeneralHelpProbe {
  category?: string | null;
  extra_label?: string | null;
  booking_data?: { extra_label?: string | null } | null;
}

/** True when a booking is a general-help job (custom + our marker), so the
 *  student screens can show the friendly title instead of "Custom job". The
 *  marker is read from either the top-level column or booking_data, since
 *  different reads select different shapes. */
export function isGeneralHelp(b: GeneralHelpProbe | null | undefined): boolean {
  if (!b || b.category !== GENERAL_HELP_CATEGORY) return false;
  const label = b.extra_label ?? b.booking_data?.extra_label ?? '';
  return label === GENERAL_HELP_LABEL;
}
