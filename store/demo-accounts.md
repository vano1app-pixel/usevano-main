# Demo accounts for App Review

| Role | Phone | Code | What it is |
|---|---|---|---|
| Helper | `089 000 0000` (`+353890000000`) | `000000` | "Apple Review" — approved, ID-verified, hidden from the public. Sees and can claim ONLY demo orders |
| Customer | `089 000 0001` (`+353890000001`) | none (customers have no account) | Posting with this number creates a demo order: no Stripe hold, no dispatch, no messages |

**Arrival code** for the seeded open order: `1234`.

**Seeded data** (`supabase/seed/review-demo.sql`, re-runnable):
- One open order — cleaning, Salthill, €44, "Kitchen + bathroom", refreshed to *now* on every run.
- One completed order — dog walk three days ago, 5★ rating, paid, visible in the helper's Jobs and the customer's Orders.

**Switch:** Supabase → Edge Functions → Secrets → `REVIEW_DEMO=true`. Off after approval.

**Isolation guarantees** (all in code, walled on `booking_data.demo = true` and the two phones):
- Real helpers never see demo orders (Find, open board, claim link, dispatch, sweeps).
- The demo helper never sees real orders.
- Demo orders never trigger Stripe, Twilio, Resend, web push or the owner's WhatsApp.
- Demo orders are excluded from public stats and from every cron.
- Delete my account is a no-op for the demo helper.

**Reset between review rounds:** run the seed again.
