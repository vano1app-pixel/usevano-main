// Waitlist mode — OFF since 2026-09-06 (owner call: live buy orders, the
// buyer's card is HELD for VANO's fee at post time and captured when a helper
// claims — see create-household-payment-checkout's AUTH-AT-BOOKING path).
// The switch and the copy stay so the site can go back to requests in one
// line if supply dries up again.
//
// History: turned ON 2026-07-31 ("we can't get a helper, not enough on the
// site") — the site took requests instead of bookings.
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
export const WAITLIST_MODE = false;

/** What the docked button says instead of "Book Cleaning · €44". */
export const WAITLIST_CTA = 'Send request';

/**
 * THE PROMISE (owner call 2026-09-05: "keep we'll ring you"). On 2026-09-04
 * this was reframed to "you'll get a name the moment a student says yes",
 * which left two promises on one screen — the headline said a name would
 * arrive, the card underneath said a person would ring. One promise now,
 * and it's the one the owner actually keeps by hand: he rings.
 *
 * This is a PROMISE THE OWNER KEEPS BY HAND — there is no automation behind
 * it. If the hour can't be honoured (travel, exams), change the words here
 * rather than let the site say something untrue; every surface reads from it.
 */
export const WAITLIST_FORM_HEADLINE = "We'll ring you back within the hour to confirm a helper.";

/** Sits under the headline. True in waitlist mode: there is no checkout at
 *  all, so no card is asked for and nothing is charged. */
export const WAITLIST_FORM_SUB = 'No card yet — nothing’s charged.';

/** The headline on the confirmation screen. It REPEATS the callback promise
 *  rather than announcing a wait — the last thing they read should be the
 *  thing that's about to happen. */
export const WAITLIST_TITLE = "We'll ring you back within the hour";

export const WAITLIST_BODY =
  "Your request is with us. We'll ring you within the hour to confirm a helper — no card, nothing charged. Rather not wait for the phone? Message us on WhatsApp and we'll sort it there.";

/** The pre-filled WhatsApp text on the "text us" button. */
export function waitlistWhatsAppText(job: string, when: string, area: string): string {
  return [
    `Hi VANO! I'd like ${job.toLowerCase()}.`,
    when ? `When: ${when}` : '',
    area ? `Area: ${area}` : '',
    'I saw you need more helpers — can you let me know when you can cover it?',
  ].filter(Boolean).join('\n');
}
