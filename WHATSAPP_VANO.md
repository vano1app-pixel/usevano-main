# Text Vano — the WhatsApp booking door

Customers book by messaging the Vano WhatsApp number like they'd text a
mate: *"can someone clean my gaff for 2 hours tomorrow"* → Vano quotes the
real price, confirms the address (one-tap for returning homes), and books —
through the exact same pipeline as the website. No app, no account, no form.

```
Customer WhatsApp message
  → Twilio number → functions/whatsapp-inbound  (signature-verified webhook)
      · Gemini classifies the request (fail-soft → offline keyword matcher)
      · deterministic follow-ups: duration → address → name → confirm
      · quote = _shared/householdPricing.ts + 7.5% fee (AI never sets a price)
  → create-household-payment-checkout            (the ONE pipeline — unchanged)
  → dispatch → accept → notify-household-accepted sends the pay link
    back into the SAME WhatsApp thread. Pay-after-accept, as always.
```

**AUTH-AT-BOOKING (when `VANO_AUTH_AT_BOOKING=1`):** checkout instead returns
the secure Stripe link immediately — the booked reply sends it as the one
next action ("you're only CHARGED when a helper accepts"; the hold just
reserves the fee), dispatch starts once the webhook confirms the hold, and
accept captures it — no pay link needed on accept. `STATUS` knows the
`awaiting_payment` state. Flag off = the flow above, unchanged.

Home memory (`household_homes`, written by checkout on every booking, web or
WhatsApp) makes the second booking one message: *"same again"* → confirm →
booked. `STATUS` returns the latest booking's live state + track link.

## Switch it on (~15 minutes)

1. **Apply the migration** `supabase/migrations/20260713000000_home_memory_whatsapp.sql`
   (creates `household_homes`, `wa_threads`, `record_home_booking`).
2. **Deploy functions** — merging to main auto-deploys the fleet, including
   `whatsapp-inbound` (already pinned `verify_jwt=false` in `supabase/config.toml`).
3. **Supabase env** (Project → Edge Functions → Secrets):
   - `TWILIO_AUTH_TOKEN` — required; the webhook rejects everything without a
     valid X-Twilio-Signature. (Already set if WhatsApp sends work.)
   - `GEMINI_API_KEY` — optional but recommended (already set for
     parse-custom-job). Without it the offline keyword matcher runs alone.
   - `TWILIO_INBOUND_URL` — only if the URL Twilio signs ever differs from
     `https://<project-ref>.supabase.co/functions/v1/whatsapp-inbound`.
4. **Twilio Console** → Messaging → your WhatsApp sender
   (`TWILIO_WHATSAPP_FROM`) → **"When a message comes in"**:
   `https://puomfwjtpvqedwxjxogh.supabase.co/functions/v1/whatsapp-inbound`,
   method **HTTP POST**. That's it — replies are TwiML, sent from the same
   number inside the customer's 24-hour session window.

## Try it

Text the number:
- `hi` → welcome (+ "same again" nudge if you've booked before)
- `clean my apartment for 2 hours` → address → name → quote → `yes` → booked,
  track link comes back, pay link arrives when a helper accepts (with
  auth-at-booking on: the secure card link comes back immediately instead,
  and accept charges the reserved fee with no second link)
- `same again` → one-tap repeat of your last booking
- `status` / `cancel` / `help` / `stop` / `start`

## Guardrails already in place

- **One flow**: bookings are created ONLY via
  `create-household-payment-checkout` — safety screen (no childminding/trade/
  height/driving jobs), loyalty + referral discounts, double-submit dedupe
  and dispatch all apply exactly as on the web.
- **Pricing**: quotes come from `functions/_shared/householdPricing.ts` — the
  same table checkout charges from; vitest cross-checks it against the
  frontend table (`src/lib/__tests__/homeMemoryWhatsapp.test.ts`).
- **Compliance**: STOP opts the phone out permanently (silence, not even
  errors); START opts back in. Conversation drafts expire after 30 minutes.
- **Abuse**: Twilio signature required; per-phone rate limit (20 msgs / 10
  min) stops autoresponder loops from burning Gemini.

## v1 limits (known, deliberate)

- **Timing is a label, not a schedule**: "tomorrow morning" is shown to
  helpers on the offer (`when_label`) but the job dispatches immediately —
  same as the web sheet's "flexible". Wiring real `scheduled_at` slots into
  the chat is a v2 step.
- **No photos yet** — the bot asks for a text description.
- **City defaults to the home's saved city, else Galway** for brand-new
  addresses; checkout geocodes the address server-side either way.
