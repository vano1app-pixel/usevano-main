# Vano Pay Escrow — Deployment Runbook

This feature switches Vano Pay from instant destination charges to
Separate Charges and Transfers (SCT). Money is held on the Vano
platform Stripe account until the hirer releases it, or a 14-day
auto-release cron releases it on their behalf.

**Touching money — follow the deploy order exactly.** Out-of-order
deploys can leave payments in inconsistent state (e.g. row columns
written before the columns exist, or new charges created while the
webhook still expects the old destination-charge shape).

## State machine

Reuses the existing `vano_payments.status` enum — no values added.
The meaning of `paid` shifts from "Stripe confirmed + freelancer
funded" to "Stripe confirmed + held on platform". `transferred`
still means "freelancer has the money", but now fires on release
instead of on checkout complete.

```
awaiting_payment
  │
  └── Stripe Checkout succeeds
        │
        ▼
       paid (HELD on platform)
        │
        ├── hirer clicks Release
        │     → release-vano-payment
        │     → Stripe transfer to freelancer Connect
        │     → transferred (released_by='hirer')
        │
        ├── auto_release_at elapsed, no dispute
        │     → auto-release-held-payments cron
        │     → Stripe transfer to freelancer Connect
        │     → transferred (released_by='auto')
        │
        ├── hirer clicks Flag a problem
        │     → refund-vano-payment
        │     → Stripe refund to hirer card
        │     → refunded (dispute_reason set)
        │
        └── [future] admin resolves dispute
              → transferred OR refunded
```

## Deploy order

1. **Apply migration `20260420120000_vano_pay_escrow.sql`.**
   Adds `auto_release_at`, `released_at`, `refunded_at`, `released_by`,
   `dispute_reason`, `disputed_at`, `stripe_refund_id` columns + a
   partial index for the auto-release cron.

   ```bash
   supabase db push
   ```

2. **Deploy `create-vano-payment-checkout`.**
   Stops creating destination-charge sessions; new charges land on
   the platform.

   ```bash
   supabase functions deploy create-vano-payment-checkout
   ```

3. **Deploy `stripe-webhook`.**
   Vano Pay handler now writes `status='paid'` (held) and stamps
   `auto_release_at = now + 14 days`.

   ```bash
   supabase functions deploy stripe-webhook
   ```

4. **Deploy the three new edge functions.**

   ```bash
   supabase functions deploy release-vano-payment
   supabase functions deploy refund-vano-payment
   supabase functions deploy auto-release-held-payments
   ```

5. **Wire the Supabase cron to invoke `auto-release-held-payments`.**
   Daily is fine for v1. Hourly gives tighter auto-release timing if
   a hirer's 14-day window ends in the middle of the day. **Skipping
   this step breaks the ghost-hirer protection — auto-release never
   fires and freelancers' funds sit forever.**

   Example pg_cron statement (run in Supabase SQL editor):

   ```sql
   SELECT cron.schedule(
     'vano-pay-auto-release',
     '0 * * * *',                -- every hour on the hour
     $$
     SELECT net.http_post(
       url := 'https://<PROJECT_REF>.supabase.co/functions/v1/auto-release-held-payments',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
         'Content-Type', 'application/json'
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```

6. **Frontend is already shipped with the same commit** — the held-
   payment receipt card, Release button, Flag-a-problem dialog,
   and updated copy on `VanoPayModal` + `VanoPaySetupCard` all land
   with this branch.

7. **Smoke test in Stripe test mode before announcing.** See below.

## Smoke test (Stripe test mode)

1. Log in as a test hirer (business user_type) and a test freelancer
   (student user_type) in separate browsers.
2. Freelancer: onboard Stripe Connect with Stripe's test-mode data
   so `stripe_payouts_enabled = true`.
3. Hirer: start a conversation with the freelancer → open the Vano
   Pay modal → enter €10 → pay with test card `4242 4242 4242 4242`.
4. **Verify row:** `SELECT status, auto_release_at, stripe_payment_intent_id, stripe_transfer_id FROM vano_payments ORDER BY created_at DESC LIMIT 1;`
   Expect `status = 'paid'`, `auto_release_at` ≈ 14 days out,
   `stripe_payment_intent_id` populated, `stripe_transfer_id` null.
5. **Both sides see the receipt card** in the thread. Hirer sees the
   Release button. Freelancer sees "auto-releases DATE".
6. **Hirer clicks Release.** Expect `status = 'transferred'`,
   `released_by = 'hirer'`, `stripe_transfer_id` populated, receipt
   flips to the emerald "€10 paid" chip for both sides via
   realtime.
7. **Repeat** with a second payment, but instead of releasing,
   **Flag a problem** with a test reason. Expect `status = 'refunded'`,
   `stripe_refund_id` populated, `dispute_reason` set, card flips to
   the muted "€10 refunded" chip.
8. **Auto-release test:** pay a third payment. In the DB, manually
   set `auto_release_at` to an instant in the past:
   `UPDATE vano_payments SET auto_release_at = now() - interval '1 hour' WHERE id = '<paymentid>';`
   Then invoke the cron function once:
   ```bash
   curl -X POST -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        https://<PROJECT_REF>.supabase.co/functions/v1/auto-release-held-payments
   ```
   Expect `status = 'transferred'`, `released_by = 'auto'`.

## Rollback

If something is wrong after deploy, the safest rollback is to revert
`create-vano-payment-checkout` to the pre-escrow version first (stops
new funds landing on the platform) while leaving the webhook + new
functions in place. Existing held rows can still be released or
refunded manually via direct DB writes + Stripe dashboard actions.

Do **not** revert the migration while held payments exist — that
would drop their `auto_release_at` and the columns the release /
refund paths read. Clear all held rows (release or refund them
through the dashboard) before dropping any column.

## Operational notes

- **EU compliance.** Holding customer funds can trigger payment-
  services regulation. Stripe Connect's marketplace license covers
  most marketplace use cases in Ireland, but confirm with Stripe
  before high-volume launch. 14 days is well inside Stripe's typical
  90-day maximum hold.
- **Dispute resolution is manual for v1.** A disputed row (with
  `dispute_reason` set) freezes auto-release. Ops resolves by doing
  one of:
  - Release manually: `UPDATE vano_payments SET dispute_reason = NULL WHERE id = '<id>';` then let the cron pick it up, or invoke `release-vano-payment` as the hirer (requires their session).
  - Refund manually: `refund-vano-payment` as the hirer, or directly via Stripe dashboard then `UPDATE vano_payments SET status = 'refunded', stripe_refund_id = '<rfnd_...>', refunded_at = now() WHERE id = '<id>';`
- **Stuck `pending` sentinels.** If a Stripe transfer / refund call
  succeeds but the follow-up DB write fails, the row can be left
  with `stripe_transfer_id = 'pending'` or `stripe_refund_id = 'pending'`.
  Check Stripe for the real id (use the idempotency key
  `vano_release_<payment_id>` or `vano_refund_<payment_id>`) and
  update the row by hand.
- **Idempotency.** Both release and refund use Stripe idempotency
  keys keyed to the payment id — a retry with the same payment
  always returns the same result. Safe to double-click, safe to
  retry after a network hiccup.
