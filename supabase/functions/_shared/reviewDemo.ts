// App Store / Play review demo — TWO phone numbers, server-side, behind a
// kill switch.
//
// Apple reviews the exact binary that ships, so a demo can't live in a build
// flag: whatever the reviewer's build does, every real customer's build does
// too. Instead the demo is keyed on two phone numbers and switched on by the
// REVIEW_DEMO secret in Supabase → Edge Functions → Secrets:
//
//   REVIEW_DEMO=true            turns the demo on (anything else = off)
//   REVIEW_DEMO_PHONE=+3538…    optional override of the HELPER number only
//
// With REVIEW_DEMO unset (the default) every helper below returns false and
// nothing in any function changes. Turn it on the day you submit, off the day
// the review is approved.
//
// The two numbers:
//   HELPER +353890000000 (089 000 0000) — the reviewer signs in as a helper
//     with this number and OTP 000000. It belongs to the seeded "Apple Review"
//     helper row (supabase/seed/review-demo.sql) and to nobody real.
//   BUYER  +353890000001 (089 000 0001) — the reviewer posts orders as this
//     customer. It is the customer_phone on every seeded demo booking and the
//     number the reviewer types into "Find my order" / the Orders tab.
//
// Demo BOOKINGS carry booking_data.demo = true. create-household-payment-
// checkout (owned by the orders agent) inserts a booking with that flag when
// the customer phone is the demo buyer phone, born `pending` with no Stripe
// session. Everything downstream keys on that flag, not on the phone:
//
//   open-jobs            — the demo helper sees ONLY demo bookings; every real
//                          helper never sees them.
//   household-arrival, complete-household-job, capture-household-payment,
//   rate-household-booking
//                        — write the status rows so the screens move, but skip
//                          Stripe, Twilio, Resend, web push and the owner's
//                          WhatsApp entirely.
//   every cron / sweep / notifier
//                        — skips demo rows (`.not('booking_data->demo','eq','true')`
//                          or a code filter right after the fetch).
//   public-stats         — excludes the demo helper and demo bookings.
//   delete-helper-account— demo helper returns { deleted: true, demo: true }
//                          and mutates nothing, so the next reviewer can still
//                          sign in.
//   student-account-otp  — "send" texts nothing; "verify" accepts 000000.
//
// Rule of thumb: real helpers never see demo bookings; the demo helper sees
// only demo bookings; nothing demo ever reaches a paid vendor or a real person.

export const REVIEW_DEMO_PHONE_DEFAULT = '+353890000000'; // 089 000 0000
export const REVIEW_DEMO_HELPER_PHONE = REVIEW_DEMO_PHONE_DEFAULT;
export const REVIEW_DEMO_BUYER_PHONE = '+353890000001'; // 089 000 0001
export const REVIEW_DEMO_OTP = '000000';

export function reviewDemoEnabled(): boolean {
  return (Deno.env.get('REVIEW_DEMO') ?? '').trim().toLowerCase() === 'true';
}

/** The helper's demo number (env override kept for the older callers). */
export function reviewDemoPhone(): string {
  return Deno.env.get('REVIEW_DEMO_PHONE')?.trim() || REVIEW_DEMO_HELPER_PHONE;
}

const last9 = (s: string) => s.replace(/\D/g, '').slice(-9);

function samePhone(phone: string | null | undefined, want: string): boolean {
  if (!reviewDemoEnabled() || !phone) return false;
  const w = last9(want);
  return w.length === 9 && last9(phone) === w;
}

/** True only when the switch is on AND this is the demo HELPER number.
 *  Compares the last 9 digits so 089…, 89…, +35389… and 0035389… all match. */
export function isReviewDemoHelperPhone(phone: string | null | undefined): boolean {
  return samePhone(phone, reviewDemoPhone());
}

/** True only when the switch is on AND this is the demo BUYER number. */
export function isReviewDemoBuyerPhone(phone: string | null | undefined): boolean {
  return samePhone(phone, REVIEW_DEMO_BUYER_PHONE);
}

/** Either demo number. Kept for the older callers (OTP, waitlist). */
export function isReviewDemoPhone(phone: string | null | undefined): boolean {
  return isReviewDemoHelperPhone(phone) || isReviewDemoBuyerPhone(phone);
}

/** True when a booking row's booking_data says demo:true. Independent of the
 *  switch on purpose: a demo row must stay invisible to real helpers and to
 *  every vendor even after REVIEW_DEMO is flipped off. */
export function isReviewDemoBooking(booking_data: unknown): boolean {
  if (!booking_data || typeof booking_data !== 'object') return false;
  return (booking_data as { demo?: unknown }).demo === true;
}
