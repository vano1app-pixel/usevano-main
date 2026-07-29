# VANO Security Audit — 2026-07-29

**Scope:** Full current codebase — the 66 Supabase edge functions (all
`verify_jwt=false`, auth enforced in-code), the shared auth/token/webhook
modules, all `supabase/migrations` (RLS, grants, SECURITY DEFINER functions),
and the React/Vite frontend + deployment config.

**Method:** Eight parallel finder passes (one per attack surface), then every
raw finding was **verified by hand against the actual code** — traced end to
end, with the exploit reproduced on paper and existing mitigations checked —
before being trusted. 11 raw findings → the triage below. This supersedes the
stale April-2026 audit (which was mostly about the since-deleted freelancer
marketplace).

## What was checked and found solid (no action)
- **HMAC tokens** (`_shared/acceptToken.ts`, `accountToken.ts`) — SHA-256,
  constant-time compare, expiry enforced, purpose-marker (`p:'acct'`) prevents
  cross-family replay, `hasAccountAccess` binds the token to the exact helper
  row. Good.
- **Stripe webhook** (`stripe-webhook`) — real HMAC-SHA256 over
  `timestamp.rawBody`, replay-window check, constant-time compare. Correct.
- **Twilio/WhatsApp** (`whatsapp-inbound`) — HMAC-SHA1 signature verified with
  timing-safe compare; not forgeable without the auth token.
- **Payments / money** (`create-household-payment-checkout`, `vanoFees.ts`,
  `capture-household-payment`, fee auth/capture) — prices/fees are always
  recomputed server-side; no client-controlled amounts; idempotency keys and
  the unpaid-strike block hold. No findings.
- Rate-limit infra (`_shared/rateLimit.ts`) uses non-spoofable IP keys and
  fails open correctly.

---

## Findings & status

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | **Critical** | `accept-job` mints a login session from an unverified, helper-settable email → account takeover | **FIXED** |
| 8 | **High** | `send-student-sms-otp` / `-email-otp` have no IP rate-limit → SMS-bomb / cost-amplification / harassment | **FIXED** |
| 5/6 | **Medium** | HTML/email injection via `payment_handle`, helper name, `customer_name/phone` into transactional emails | **FIXED** |
| 10 | Low | Partner-commission program has no self-referral guard → helper skims 3% of own jobs | **FIXED** |
| 4 | Low | `household_chat` INSERT policy lets any authenticated user post into any booking thread | **FIXED** |
| 2 | Medium | Assigned helper can read `arrival_code` / `rating_token` directly via PostgREST/Realtime | **FIXED** (secrets moved to a service-role-only table; needs Playwright on arrival+rating before merge) |
| 3 | Medium | Helper can set their own `status='approved'` → suspended helper self-unsuspends | **FIXED** (trigger blocks non-admin self-status-change) |
| 9 | Medium | `find-booking-by-phone` hands out the booking-UUID capability from a bare phone → home-address disclosure | **Reported — product decision** |
| 11 | Info | `dispatch-household-job` has no caller auth (bounded by unguessable UUID) | **Reported** |
| 7 | Info | CSP is `Report-Only` + allows `unsafe-inline` (no reachable XSS today) | **Reported** |

---

## Fixed in this branch

### 1 — CRITICAL: `accept-job` account takeover
**Was:** On a one-tap job claim, `accept-job` resolved the helper's auth user
from `household_helpers.email` — a field the helper can freely set to *any*
address via `update-helper-profile` (only a format check; it drops
`student_email_verified` but leaves the row dispatchable). On the expected
email collision it called `findUserIdByEmail(victimEmail)`, linked the helper
row to the victim's user id, and `signedInRedirect()` minted a **magic-link
session for the victim** and 303-redirected the attacker's browser through it.
A helper could point their row at the owner's login email (publicly known —
it's in `adminOwner.ts`) and take over the admin account on one tap.

**Fix:** `accept-job/index.ts` now only provisions/links an auth user **by
email when `student_email_verified === true`** (proven ownership). Legitimate
dispatchable helpers always have it true; the email-swap attack clears it, so
the silent sign-in can never land on an unproven identity. Happy path (a real
helper's first one-tap accept) is unchanged.

### 8 — HIGH: OTP SMS-bomb / cost-amplification
**Was:** `send-student-sms-otp` (and `send-student-email-otp`) took only a
`helper_id` (public — it's in every `/helpers/:id` URL), had **no IP rate-limit
and no origin gate**, and sent a real Twilio SMS. The only throttle was a
raceable 30s-per-helper gap. One IP could cycle every helper id to drain
Vano's Twilio balance, harass every helper's phone, and trip Twilio limits
(breaking legit OTP delivery). Its sibling `student-account-otp` already had
the IP limiter — this was a regression.

**Fix:** both senders now call `allowRequest(..., 20, 600)` (IP-keyed, 20 per
10 min, fail-open) before any send — matching `student-account-otp`.

### 5/6 — MEDIUM: HTML injection into transactional emails
**Was:** The customer/owner emails in `notify-household-accepted` and
`capture-household-payment` were built with raw template interpolation. A
helper's Revolut `payment_handle` and display name (both helper-controlled),
and the anonymous booking's `customer_name`/`customer_phone`, were rendered
**unescaped** into VANO-branded emails — a payment-redirect phish in a trusted
email (helper→customer) and markup injection into the owner's admin inbox.

**Fix:** added an `escapeHtml` helper to both functions and escaped every
user-controlled field in the HTML bodies (plain-text/SMS bodies keep raw
values, as they must). Plus a source-side constraint: `update-helper-profile`
now strips HTML metacharacters from `payment_handle` at write time, so it's
safe everywhere it renders (incl. the TrackBooking pay card).

### 10 — LOW: partner self-referral fraud
**Was:** `resolve_referral_attribution()` never checked that a referral code's
owner ≠ the helper signing up under it, so a helper could mint their own
partner code (throwaway contact details) and skim 3% of every own job from
Vano's margin for a year — the abuse the customer give-5 program already blocks.

**Fix:** migration `20260729000000_referral_self_referral_guard.sql` adds an
owner≠helper guard (email or last-9-digit phone match) inside the trigger — the
single choke point for both attribution paths.

### 4 — LOW: chat message injection
**Was:** `household_chat` INSERT policy was `WITH CHECK (auth.uid() =
sender_id)` only — any authenticated helper who knows a booking UUID (e.g. from
an offer they never accepted) could inject a message that renders on the
customer's `/track` page (impersonation / payment-redirect).

**Fix:** migration `20260729000001_chat_insert_booking_party.sql` restores the
booking-party requirement (sender must be the assigned helper / customer).

---

## Reported — need an owner decision (not auto-fixed)

These are real, but the fix either touches a **"flow that must NEVER break"**
(and per the repo rule must be Playwright-driven before merge — which I can't
run against live Supabase from here), or is a product/UX trade-off that's the
owner's call.

### 2 — MEDIUM: helper can read `arrival_code` / `rating_token` directly
`household_bookings`'s SELECT policy is row-level only; `20260717010000`
column-scoped *UPDATE* but never SELECT. So the assigned helper (`student_id =
auth.uid()`) can `GET …/household_bookings?id=eq.X&select=arrival_code,
rating_token` and read both secrets — bypassing the RPC that hides them —
letting them mark a job `in_progress` without arriving, and post a fake 5★
customer rating of themselves.

**Recommended fix (complete):** move `arrival_code` + `rating_token` **off the
row** into a service-role-only sibling table (no `authenticated` policy), read
by the `get_household_booking` SECURITY DEFINER RPC for the customer.
*Note:* a column-scoped SELECT grant alone is **insufficient** — Supabase
Realtime enforces row RLS but **not** column grants, so a subscribed helper
would still receive `arrival_code` over the realtime channel. This touches the
helper job-day flow (arrival-code entry) and the rating flow — **drive both
end-to-end in Playwright before merge.**

### 3 — MEDIUM: helper self-unsuspend
`20260717010000` grants `UPDATE(status)` to `authenticated`, and the migration
comment explicitly accepts "a helper flipping their own status is the accepted
residual" (column grants are role-wide; admins are `authenticated` too). Real
consequence: a suspended helper can `PATCH status='approved'` and re-enter
dispatch (`id_verified` is untouched). **Recommended:** route admin
approve/suspend through a `has_role`-gated SECURITY DEFINER RPC (or the admin
edge function) and drop `status` from the client grant — but this changes the
`HouseholdAdmin` write path, so it needs the owner's go-ahead + a test pass.

### 9 — MEDIUM: home-address disclosure from a phone number
`find-booking-by-phone` returns booking UUIDs for a bare phone (no OTP), and
`get_household_booking` (anon) then returns the full address/GPS for that UUID.
Anyone who knows a victim's mobile can retrieve their home address and when a
helper will be there. This is the documented `/bookings` "find my bookings by
phone" gate — a **must-never-break flow** — so the fix (SMS-OTP-gate the
lookup, or send the track link out-of-band instead of returning UUIDs) is a UX
change for the owner to approve. IP rate-limiting (10/600s) already blunts mass
enumeration; targeted lookup of a known number is the residual risk.

### 11 — INFO: `dispatch-household-job` unauthenticated
Unlike its peers it does no origin/service-role/HMAC check — it only checks the
HTTP method, then fans out push/SMS (incl. gap-recruit SMS = real Twilio
spend). Bounded: it needs a booking UUID that is currently `pending` and not
yet dispatched (checkout dispatches immediately), and a 20s lock + offer-exists
guard throttle re-fires. **Recommended:** reject when the bearer isn't the
service-role key (audit internal callers first).

### 7 — INFO: CSP is Report-Only + `unsafe-inline`
No enforcing `Content-Security-Policy` header (only `-Report-Only`), and it
permits `script-src 'unsafe-inline'`. No reachable XSS today (the two
`dangerouslySetInnerHTML` sinks render static content). **Recommended:** promote
to enforcing and move inline bootstrap scripts to nonces so it can actually
block injected inline scripts — test carefully, as an enforcing CSP can break a
live site.

---

## Correctness bug hunt (second pass, adversarially verified)

A separate pass hunted for non-security correctness bugs across money math,
the booking lifecycle, edge-function robustness, and the critical frontend
flows. 6 candidates, all confirmed by an independent verifier and **all fixed**:

| Severity | Bug | Fix |
|----------|-----|-----|
| **Critical** | `release-household-payouts` reconciliation backfill never filtered `direct_pay`, so **every completed direct-pay job** got a phantom 85%-of-job-price payout row → false "you earned €X" nudges, false "payout stuck" owner alerts, and (for onboarded helpers) a **real Stripe transfer paying the helper a second time** out of VANO's balance (the customer already paid them 100% directly). | Backfill now skips `booking_data.direct_pay === true`; the transfer loop also skips any pre-existing phantom direct-pay payout as defence-in-depth. |
| Medium | WhatsApp booking door (`_shared/waIntake.ts`) quoted the **retired 7.5% escrow fee** as a lump "total charged", never telling the customer they pay the helper directly → risk of unpaid helpers. | Quote now uses `computeVanoFeeCents` (15% min €4) and states the direct-pay split. |
| Medium | Phone **voice** agent (`_shared/voiceIntake.ts` + `agent-prompt.md`) had the identical stale-fee quote. | Same fix; prompt reworded to direct-pay. |
| Low | Checkout dropped an invalidated referral discount but left `fee_due_cents` discounted, so a lost-CAS / failed-welcome booking still billed the discounted fee (one credit → two discounts). | `feeDueCents` restored to the undiscounted amount in both strip branches (auth hold, capture, payload now agree). |
| Low | `TrackBooking` completion toast said "Your helper has been paid" for **direct-pay** (VANO paid them nothing). | Toast branches on `direct_pay`: "settle up with your helper directly". |
| Low | `StudentJobDetail` `on_way` reload started the GPS watch with stale `null` customer coords → the at-door "start the job" shortcut never appeared. | Fresh coords passed into `startLocationWatch` on the reload path. |

**Owner cleanup for the critical bug:** the buggy backfill has run since the
direct-pay pivot, so production likely holds phantom `pending` `household_payouts`
rows for direct-pay bookings (and some may have already transferred). The transfer
loop now skips them, but you should reconcile/void the existing phantom rows —
e.g. rows whose `booking_id` maps to a `booking_data->>direct_pay = 'true'`
booking — and review Stripe for any transfers already sent on those.
Migration `20260729000004_void_phantom_directpay_payouts.sql` does the void
automatically (flips pending/transferring phantoms to `reversed`) and raises a
NOTICE counting any that already transferred and need manual Stripe review.

## Follow-up pass (this session) — two more items done + a latent payout bug

- **#2 `arrival_code` / `rating_token` — now FIXED.** Both secrets moved into a
  new service-role-only `household_booking_secrets` table
  (`20260729000005_move_booking_secrets.sql`); the base columns are kept but
  always NULL, so a raw PostgREST select or a realtime payload carries nothing,
  and `get_household_booking` splices the real values back in for the anonymous
  customer only. `household-arrival`, `capture-household-payment` and
  `rate-household-booking` read/write the secrets table. The RPC return shape and
  every frontend type are unchanged. **Still needs a Playwright pass on the
  arrival-code handshake + the rating flow before merge** (I can't drive those
  against live Supabase from here); typecheck, tests and a full prod build pass.

- **NEW latent bug — the payout release cron was silently paying nobody.**
  `release-household-payouts` claims a row by writing `status='transferring'`
  (index.ts:219), but the `household_payouts` CHECK constraint (last set in
  `20260706020000`) never included `transferring` — so the claim update fails the
  constraint, the client returns `{error}` (which the code doesn't read, only
  `data`), `claimed` is null, and the row is treated as "taken by another run"
  and skipped. Net: **no payout ever transfers through this cron**; legacy-escrow
  helper payouts silently stick at `pending`. It slipped past because direct-pay
  made new payout rows rare. Fixed by `20260729000003_payout_status_add_transferring.sql`
  (adds `transferring` to the allowed set).

## Second bug sweep (this session) — 6 more fixed

A third adversarial pass over cancel/refund, the helper funnel, cron
idempotency, and the native/PWA shell surfaced these (all fixed):

| Severity | Bug | Fix |
|----------|-----|-----|
| **High** | `no-helper-fallback` released the Stripe hold/refund **before** its compare-and-swap cancel, so a booking a helper accepts (and whose fee is captured) mid-run gets its fee refunded while the row stays `accepted` — Vano loses the only money it collects. | CAS the cancel first; release money only after winning it (mirrors `remind-unpaid-bookings`). |
| Low | `cancel-household-booking` customer_cancel wrote `cancelled` unconditionally after a Stripe round-trip, so a helper who starts the job mid-refund gets cancelled out from under them (in_progress gate bypassed). | Same CAS-first ordering, guarded on the cancellable status set. |
| Low | `create-verified-plan` had no in-flight dedup → two completed checkouts = two €2/mo subscriptions, one orphaned and un-cancellable in-app. | Search Stripe for an existing active sub before minting; `confirm-verified-plan` cancels a duplicate instead of orphaning it. |
| Low | `household-winback` measured cadence from booking `created_at`, not completion, so book-ahead customers got a "need a hand again?" nudge right after their job. | Measure age from the completion timestamp (`household_job_updates`), fallback to `created_at`. |
| Low | Gap-recruit nudge stamped `gap_nudged_at` non-atomically (SELECT then UPDATE), so concurrent same-city dispatches double-texted helpers. | Atomic claim: conditional UPDATE ... RETURNING; text only the rows won. |
| Low | Returning customers got **no tracking push** on new bookings — the per-origin subscription flipped the UI to "subscribed" without registering a row for the new `booking_id`. | On mount, idempotently register the existing subscription for the current booking before marking subscribed. |

(Two candidates were adversarially **refuted** and left alone: a
`verify-student-email-otp` email write-back and a `remind-confirm-completion`
Stage-3 double-SMS — both contrived/guard-covered.)

## Verification
- `npm run typecheck` — clean.
- `npm test` — 234/234 pass (incl. the updated WhatsApp/voice fee lock-step tests).
- All edited edge functions pass an esbuild transform (syntax) check (Deno isn't
  available in this environment for a full `deno check`).
- The migrations are additive policy/function changes.
- The frontend edits are copy/logic-only on the critical flows; per the repo's
  must-never-break rule they should still get a Playwright pass before merge, but
  they change no data path (a toast string; an added coords argument).
