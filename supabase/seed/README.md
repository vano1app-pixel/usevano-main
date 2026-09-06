# App Store review demo — seed

`review-demo.sql` creates everything an Apple reviewer needs to walk the whole
loop in the **production** binary without touching a real person or a paid
vendor. Run it in Supabase → SQL Editor. It is idempotent: run it again any
time to reset, and again before every review round (it refreshes the open
order's `created_at` so it stays inside the 48-hour open window).

## Before submitting
1. Run `supabase/migrations/20260906100000_orders_loop.sql` (once).
2. Run `supabase/seed/review-demo.sql`.
3. Supabase → Edge Functions → Secrets → `REVIEW_DEMO = true`.

## What the reviewer gets
| Side | How | What |
|---|---|---|
| Helper | Account → I'm a helper → phone `089 000 0000` → code `000000` | The "Apple Review" helper: approved, ID-verified, invisible to the public |
| Helper | Find | ONE open demo order in Salthill (cleaning, €44) — only this helper can see or claim it |
| Helper | Claim → Arrived → arrival code `1234` → Start → Done | The full job screen. No text, email or Stripe call fires |
| Helper | Jobs | A completed dog walk from three days ago with a 5★ rating |
| Buyer | Post a job with phone `089 000 0001` | A booking is created with no card step (no Stripe), and shows in Orders |
| Buyer | Orders → phone `089 000 0001` | Both demo orders, live status, rating on the completed one |
| Helper | Account → Delete my account | Succeeds on screen, changes nothing (so the next reviewer can sign in) |

The two phones are `+353890000000` (helper) and `+353890000001` (buyer),
hard-coded in `supabase/functions/_shared/reviewDemo.ts`. Demo bookings carry
`booking_data.demo = true`; every cron, sweep and notifier skips that flag, and
`find-open-orders` / `open-jobs` / `claim-order` / `accept-job` wall demo rows
off from real helpers (and real rows off from the demo helper).

## After approval
- Secrets → `REVIEW_DEMO = false` (or delete it). The demo phones then behave
  like any other number; the demo helper can no longer sign in.
- The seeded rows can stay (they never appear anywhere public) or go:
  `delete from household_bookings where booking_data->>'demo' = 'true';` and
  `delete from household_helpers where phone = '+353890000000';` then the auth
  user `apple-review@vanojobs.com` from Auth → Users.

## Columns this seed assumes
All names come from `supabase/migrations/`. The `auth.users` insert uses the
standard Supabase columns plus an `auth.identities` row — the shape Supabase's
own seed docs use. If your project's auth schema rejects it, create the user in
Auth → Users instead (email `apple-review@vanojobs.com`, phone `+353890000000`,
both confirmed) and set `household_helpers.user_id` to its id, then run the
rest of the file.
