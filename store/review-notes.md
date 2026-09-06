# App Review Information — paste-ready

Bundle id `com.vanojobs.app` · Version 1.0 (1) · Contact during review: WhatsApp +353 89 981 7111 · vano1app@gmail.com (same-day reply)

## Sign-in (App Review Information → Sign-in required: YES)
- **User name:** `0890000000`
- **Password:** `000000`
(It is a phone number and a one-time code. Where to type them is in the notes below.)

## Notes (paste everything between the lines)
---
VANO is a marketplace for same-day home help in Galway, Ireland. A household posts a paid job (cleaning, garden, dog walk, laundry, odd jobs); nearby ID-verified student helpers see it on a map and one of them claims it; the helper marks arrived, started and done; the customer rates them.

PAYMENTS — no in-app purchase. Payment is for a real-world, in-person service performed by a third-party helper (Guideline 3.1.3(e)). When a customer posts a job, VANO's small booking fee (15%, minimum €5) is HELD on their card through Stripe Checkout and only charged when a helper claims the job. The job price itself is paid by the customer directly to the helper when the work is done; VANO never charges it. Nothing in the app sells digital content or features. No StoreKit, no subscriptions in this binary.

DEMO ACCOUNTS — nothing you do reaches a real person, no card is charged and no message is sent. Two demo phone numbers unlock this:
• Customer (no account needed): use the phone number 0890000001 when posting.
• Helper: 0890000000, code 000000.

HOW TO TEST — CUSTOMER (post a job)
1. Open the app. On the home screen type "clean the kitchen and bathroom in Salthill in an hour" (or use the mic key on the keyboard to dictate it). The app reads it back as chips — job, hours, when.
2. Tap Send. The job sheet opens with the fields filled. Tap "Use my location" or type an address (e.g. 12 Seapoint Promenade, Salthill).
3. Enter the phone number 0890000001. Tap "Post job". With this demo number the card step is skipped and the job is posted straight away; a real customer would see Stripe's card sheet here.
4. You land on the tracking screen: "Looking for a helper". The Orders tab (enter 0890000001) lists this job and a completed one.

HOW TO TEST — HELPER (claim and work a job)
1. Tap Account → the "I'm a helper" switch → "Already a helper? Sign in".
2. Enter 0890000000 → "Text me a code" → enter 000000. (No text is sent.)
3. Tap "Find jobs near you". Allow location, or decline — both work. You'll see the open demo order(s), including the one you just posted, on a map and in a list. Try searching "cleaning" or "salthill".
4. Tap "Claim this job". You're on the job screen with the address, the customer's note and their photo.
5. Tap "On my way", then "I've arrived". The arrival code is 1234 (a real customer sees it on their own screen). Enter it to start. Tap "I've finished" — you can add a photo. Chat has quick-reply chips.
6. Back in the customer's Orders tab the job shows "In progress" → "Done"; the customer can rate the helper.
7. Account → Delete my account: type DELETE and confirm. It succeeds (for this demo account it is a safe no-op so the next reviewer can still sign in; for a real helper it deletes the account and its sign-in immediately, Guideline 5.1.1(v)).

SIGN IN WITH APPLE: not applicable — no third-party sign-in is offered in this binary. Helpers sign in with a first-party one-time code to their phone (Guideline 4.8). Customers have no account.

PERMISSIONS — all requested on tap, never on launch:
• Location (When In Use): customer "Use my location" to fill the address; helper "Find jobs" to sort by distance, and while on the way so the customer sees progress. Never in the background.
• Camera / Photos: only when a customer adds a photo of the job or a helper adds a profile / job photo.
• No microphone or speech permission is requested; dictation uses the iOS keyboard.
• No App Tracking Transparency prompt — VANO does no tracking.

Legal: Privacy https://vanojobs.com/privacy · Terms https://vanojobs.com/terms · Support https://vanojobs.com/support — also under Account.
---

## Before you press Submit (see store/CHECKLIST.md)
Migration applied · `supabase/seed/review-demo.sql` run · `REVIEW_DEMO=true` · native redirect URL added.
