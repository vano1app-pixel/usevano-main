// Waitlist mode — the site takes requests instead of bookings (owner call
// 2026-07-31: "we can't get a helper, not enough on the site").
//
// Demand arrived before supply did. Taking a payment for a job no student can
// accept is the one thing worse than saying "not yet": the customer waits,
// nobody comes, and we've charged them for the privilege. So the flow stops
// one step short of checkout — it captures the job, tells the truth, and hands
// the owner a lead he can ring.
//
// NOTHING about the booking pipeline is deleted. The sheet still gathers the
// category, the ticked tasks, the size, the time and the address; the price is
// still computed and shown as an estimate. Only the last step changes. Flip
// WAITLIST_MODE to false the day there are enough helpers and the checkout,
// the payment choice and the tracking handoff all come straight back.

/** THE SWITCH. `true` = requests + "coming soon"; `false` = live bookings. */
export const WAITLIST_MODE = true;

/** What the docked button says instead of "Book Cleaning · €44". */
export const WAITLIST_CTA = 'Send request';

/**
 * THE CALLBACK PROMISE (owner call 2026-08-27, his exact words).
 *
 * The old ending asked for a home address and a map, then answered with
 * "Coming soon in your area" — a no, in exchange for where you live. Thirty
 * people reached it after ticking their way through the whole builder and
 * NOT ONE finished (analytics_events, 60 days). So the dead end becomes a
 * callback capture: four things, and a person rings you.
 *
 * This is a PROMISE THE OWNER KEEPS BY HAND — there is no automation behind
 * it. If the hour can't be honoured, change the words here rather than let
 * the site say something untrue; it's one constant and every surface reads
 * from it.
 */
export const WAITLIST_FORM_HEADLINE = "We'll ring you back within the hour to confirm a helper.";

/** Sits under the headline. True in waitlist mode: there is no checkout at
 *  all, so no card is asked for and nothing is charged. */
export const WAITLIST_FORM_SUB = 'No card needed — nothing is charged.';

/** The headline on the confirmation screen. It REPEATS the callback promise
 *  rather than announcing a wait — the last thing they read should be the
 *  thing that's about to happen. */
export const WAITLIST_TITLE = "We'll ring you back within the hour";

export const WAITLIST_BODY =
  "Your request is with us. We'll call you within the hour to confirm a helper — no card needed, and nothing is charged. If you'd rather not wait for the phone to ring, message us on WhatsApp and we'll pick it up there.";

/** The pre-filled WhatsApp text on the "text us" button. */
export function waitlistWhatsAppText(job: string, when: string, area: string): string {
  return [
    `Hi VANO! I'd like ${job.toLowerCase()}.`,
    when ? `When: ${when}` : '',
    area ? `Area: ${area}` : '',
    'I saw you need more helpers — can you let me know when you can cover it?',
  ].filter(Boolean).join('\n');
}
