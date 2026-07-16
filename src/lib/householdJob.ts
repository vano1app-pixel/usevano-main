// Job-type helpers shared by the helper (StudentJobDetail) and customer
// (TrackBooking) screens. Mirrors supabase/functions/_shared/householdJob.ts.
//
// "Timed" = booked by the hour, gets the countdown: the legacy tiles plus
// `custom` (every search-bar booking — always priced by duration). Laundry
// and dog-walk are one-off and finish when the household marks them done.

export const TIMED_CATEGORIES = new Set([
  'cleaning', 'tutoring', 'garden', 'moving', 'custom',
]);

export function isTimedCategory(category: string): boolean {
  return TIMED_CATEGORIES.has(category);
}

// How the "finding your helper" copy escalates as a booking waits — mirrors
// what the backend actually does (re-dispatch, then team/no-helper-fallback)
// instead of pretending it's always "within minutes":
//   fresh     (< 3 min)  — just placed, helpers being notified
//   searching (3–10 min) — re-pinging more helpers nearby
//   team      (≥ 10 min) — the Galway team is now finding someone
export type PendingWaitTier = 'fresh' | 'searching' | 'team';

export function pendingWaitTier(minutesWaiting: number): PendingWaitTier {
  if (minutesWaiting >= 10) return 'team';
  if (minutesWaiting >= 3) return 'searching';
  return 'fresh';
}

// "1:23:45" or "4:09" (drops the hours segment under an hour). Clamps at zero.
export function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// ── The job playbook — what a helper actually DOES on each job ──────────────
// The job screen explains the FLOW (on my way → code → finish → get paid);
// this covers the WORK, so a first-timer never has to guess what a laundry
// job includes or whether the clock matters. Timed categories deliver the
// booked hours (the countdown is the guide); task categories are done when
// the task is done — derive which with isTimedCategory(category).

export interface HelperPlaybook {
  /** Short imperative steps, in order — the whole job in 3–4 lines. */
  steps: string[];
  /** What the after photo should show — the delivery-photo-style proof. */
  photoHint: string;
}

const PLAYBOOKS: Record<string, HelperPlaybook> = {
  cleaning: {
    steps: [
      'Check the booking note first — clean the rooms they asked for',
      "Use the customer's products and hoover (just ask where they are)",
      'Floors, surfaces, kitchen counters + hob, bathroom sink/toilet/shower',
      'Leave each room tidy as you finish it',
    ],
    photoHint: 'the finished rooms',
  },
  garden: {
    steps: [
      'Check the note — mow, weed, edge or tidy what they asked for',
      "Use the customer's mower and tools",
      'Reachable height only — no ladders or roofs, ever',
      'Bag ALL the waste and leave it neatly by their bin',
    ],
    photoHint: 'the finished garden and the bagged waste',
  },
  moving: {
    steps: [
      'The customer directs — you lift, carry, load and unload',
      'Mind floors, door frames and your back (lift with your knees)',
      'You never drive — they arrange the van or transport',
      'Stack things so nothing shifts or gets crushed',
    ],
    photoHint: 'the loaded van or the moved items in place',
  },
  'dog-walk': {
    steps: [
      'Collect the dog at the door — check the note for lead, bags and quirks',
      'On-lead the WHOLE walk, solo — just their dog, never let off',
      'Pick up after them; water break if it’s warm',
      'Hand them back at the door — never tie up or pass to anyone else',
    ],
    photoHint: 'the happy dog back home',
  },
  // Laundry — the slug stayed 'shopping' (see CategoryGrid) so existing
  // bookings and pricing keep working.
  shopping: {
    steps: [
      'Collect the laundry bag at the door — check the note for temperature or detergent asks',
      'Wash (40° unless the note says otherwise), dry FULLY, fold neatly',
      'Anything the note says to air-dry stays out of the dryer',
      'Return it the same day — folded, not stuffed',
    ],
    photoHint: 'the folded pile at handback',
  },
  custom: {
    steps: [
      "The customer's own words above ARE the job — read them twice",
      'Unsure about anything? Message them before starting, not after',
      'If it needs longer than booked, agree it with the customer first',
    ],
    photoHint: 'the finished work',
  },
};

export function helperPlaybook(category: string): HelperPlaybook {
  return PLAYBOOKS[category] ?? PLAYBOOKS.custom;
}
