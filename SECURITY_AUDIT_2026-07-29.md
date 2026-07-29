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
| 2 | Medium | Assigned helper can read `arrival_code` / `rating_token` directly via PostgREST/Realtime | **Reported — owner fix (needs Playwright)** |
| 3 | Medium | Helper can set their own `status='approved'` → suspended helper self-unsuspends | **Reported — owner-acknowledged residual** |
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

## Verification
- `npm run typecheck` — clean.
- `npm test` — 234/234 pass.
- All six edited edge functions pass an esbuild transform (syntax) check (Deno
  isn't available in this environment for a full `deno check`).
- The two new migrations are additive policy/function changes.
- No frontend code was changed; no "must-never-break" flow was modified by the
  shipped fixes (they are backend auth/rate-limit/escaping + RLS-tightening).
