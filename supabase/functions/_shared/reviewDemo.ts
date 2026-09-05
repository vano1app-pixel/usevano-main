// App Store / Play review demo — ONE phone number, server-side, behind a
// kill switch.
//
// Apple reviews the exact binary that ships, so a demo can't live in a build
// flag: whatever the reviewer's build does, every real customer's build does
// too. Instead the demo is keyed on ONE phone number and switched on by the
// REVIEW_DEMO secret in Supabase → Edge Functions → Secrets:
//
//   REVIEW_DEMO=true            turns the demo on (anything else = off)
//   REVIEW_DEMO_PHONE=+3538…    optional override of the hard-coded number
//
// With REVIEW_DEMO unset (the default) every helper below returns false and
// nothing in any function changes. Turn it on the day you submit, off the day
// the review is approved.
//
// What the number unlocks (see the callers):
//   student-account-otp  — "send" texts nothing; "verify" accepts 000000.
//   waitlist-request     — the customer's "Send request" returns the confirmed
//                          screen without paging the owner or storing a lead.
//
// The number must belong to the dummy helper row you create for the review
// (docs/NATIVE-TODO.md) and to nobody real.

export const REVIEW_DEMO_PHONE_DEFAULT = '+353890000000'; // 089 000 0000
export const REVIEW_DEMO_OTP = '000000';

export function reviewDemoEnabled(): boolean {
  return (Deno.env.get('REVIEW_DEMO') ?? '').trim().toLowerCase() === 'true';
}

export function reviewDemoPhone(): string {
  return Deno.env.get('REVIEW_DEMO_PHONE')?.trim() || REVIEW_DEMO_PHONE_DEFAULT;
}

/** True only when the switch is on AND this number is the demo number.
 *  Compares the last 9 digits so 089…, 89…, +35389… and 0035389… all match. */
export function isReviewDemoPhone(phone: string | null | undefined): boolean {
  if (!reviewDemoEnabled() || !phone) return false;
  const last9 = (s: string) => s.replace(/\D/g, '').slice(-9);
  const want = last9(reviewDemoPhone());
  return want.length === 9 && last9(phone) === want;
}
