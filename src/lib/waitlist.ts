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
export const WAITLIST_CTA = 'Request this job';

/** The headline on the confirmation screen. Honest, not apologetic — a
 *  waiting list reads as demand, and "we're picky about who we send" is a
 *  better reason to wait than "we're not ready". */
export const WAITLIST_TITLE = 'Coming soon in your area';

export const WAITLIST_BODY =
  "We're signing up more helpers in Galway right now — we won't take your booking until we're sure someone brilliant can actually turn up. You're on the list, and we'll text you the moment we can cover it.";

/** The pre-filled WhatsApp text on the "text us" button. */
export function waitlistWhatsAppText(job: string, when: string, area: string): string {
  return [
    `Hi VANO! I'd like ${job.toLowerCase()}.`,
    when ? `When: ${when}` : '',
    area ? `Area: ${area}` : '',
    'I saw you need more helpers — can you let me know when you can cover it?',
  ].filter(Boolean).join('\n');
}
