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
 * THE PROMISE (owner call 2026-09-04, reframed from the old "we'll ring you
 * back within the hour" to what actually happens on the customer's side: they
 * hear a NAME once a student says yes, and no card is taken meanwhile).
 *
 * Kept deliberately honest to the mechanism: submitting pages the OWNER
 * (waitlist-request → notify-admin), who lines a student up — there is no
 * auto-dispatch to students yet, so the copy must NOT claim "we're texting
 * students". It promises the outcome (a name, no card), not a fake pipeline.
 * One place, every surface reads from it. Change the words here if the promise
 * ever changes, rather than let a surface say something untrue.
 */
export const WAITLIST_FORM_HEADLINE = "You'll get a name the moment a student says yes.";

/** Sits under the headline. True in waitlist mode: there is no checkout at
 *  all, so no card is asked for and nothing is charged. */
export const WAITLIST_FORM_SUB = 'No card yet — nothing’s charged.';

/** The headline on the confirmation screen — the thing that's about to happen,
 *  not a wait. */
export const WAITLIST_TITLE = "We're on it";

export const WAITLIST_BODY =
  "We're lining up a student for you now. You'll get a name the moment someone says yes — no card, nothing charged. Nobody free right this second? Message us on WhatsApp and we'll sort it there.";

/** The pre-filled WhatsApp text on the "text us" button. */
export function waitlistWhatsAppText(job: string, when: string, area: string): string {
  return [
    `Hi VANO! I'd like ${job.toLowerCase()}.`,
    when ? `When: ${when}` : '',
    area ? `Area: ${area}` : '',
    'I saw you need more helpers — can you let me know when you can cover it?',
  ].filter(Boolean).join('\n');
}
