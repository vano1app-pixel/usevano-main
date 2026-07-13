# Ring Vano — the phone door (ElevenLabs voice agent)

Someone rings a Galway number and a warm voice answers: *"Hi, you're through
to Vano — what can I sort for you today?"* It asks what they need, quotes the
real price out loud, takes the address, and books — through the **same
pipeline** as the website and WhatsApp. The helpers get dispatched, and the
pay-by-text link lands on the caller's phone when one accepts. No card
details are ever spoken.

```
Caller dials the Vano number
  → Twilio number (imported into ElevenLabs) → ElevenLabs voice agent
      · voice loop (speech-in, LLM, voice-out) is 100% ElevenLabs
      · at connect: personalize webhook → greet a known caller by name
      · mid-call it calls YOUR server tools:
          quote_job     → _shared price table (agent never invents a price)
          create_booking→ create-household-payment-checkout  (the ONE pipeline)
          booking_status→ latest booking state
  → dispatch → accept → notify-household-accepted TEXTS the pay link
    (pay-after-accept, exactly as web/WhatsApp)
```

Repo side is built: `supabase/functions/voice-agent-tools` (the four actions)
and the prompt in `voice-agent-tools/agent-prompt.md`. The rest is dashboard
wiring — below.

## Build order (do it in this order — nothing costs money until step 6)

### 1. Deploy the function + set the secret
- Merge to main (auto-deploys `voice-agent-tools`, already pinned
  `verify_jwt=false` in `supabase/config.toml`).
- Make up a long random secret and set it in Supabase → Edge Functions →
  Secrets as **`VOICE_AGENT_SECRET`**. You'll paste the same value into
  ElevenLabs in step 4. (`SITE_URL` optional.)
- Your function base URL is:
  `https://puomfwjtpvqedwxjxogh.supabase.co/functions/v1/voice-agent-tools`

### 2. Name the agent + voice (free)
In the agent you already made: **Agent** tab → rename to **Vano**, paste the
system prompt and first message from `agent-prompt.md`, pick an Irish/British
voice. Model: GPT-4o-mini or Gemini Flash is plenty and cheap.

### 3. Add the three tools (Agent → Tools → Add tool → Webhook)
For each, method **POST**, URL = base URL + the `?action=` below, and add a
custom header **`X-Vano-Secret`** = your secret. Give each the parameters
shown (all strings unless noted) so the agent knows what to collect:

| Tool name | URL | Parameters |
|---|---|---|
| `quote_job` | `…/voice-agent-tools?action=quote` | `category`, `hours` (number), `request` |
| `create_booking` | `…/voice-agent-tools?action=book` | `category`, `hours` (number), `name`, `phone`, `address`, `when`, `note` |
| `booking_status` | `…/voice-agent-tools?action=status` | `phone` |

Each tool returns a `spoken` field — tell the agent (already in the prompt)
to read it back. Pass the caller's number into `phone` using the ElevenLabs
system variable `{{system__caller_id}}`.

### 4. (Optional but lovely) returning-caller greeting
Agent → **Settings → Security / Webhooks → Conversation-initiation webhook**:
- URL: `…/voice-agent-tools?action=personalize`
- Header: `X-Vano-Secret` = your secret
It returns `caller_name`, `last_job`, `saved_address` as dynamic variables
(already referenced in the prompt) and overrides the first line to greet a
known home by name. Unknown numbers fall through to the default greeting.

### 5. Test in the browser (free — uses your 15 free minutes)
Hit **Test / Talk to agent** and run through: *"can someone clean my apartment
for two hours"* → it should quote, take an address, confirm, and (if you let
it book with a real test number) create a booking you can see in
`household_bookings`. Tune the prompt, re-test. This is all free.

### 6. Go live — attach a phone number (this is the paid step)
- **Twilio** (you already have an account): buy an Irish number, e.g. a
  Galway 091 landline-style or an Irish mobile.
- **ElevenLabs** → **Phone Numbers → Import from Twilio**: paste your Twilio
  Account SID + Auth Token, pick the number, assign it to the **Vano** agent.
- **ElevenLabs plan**: Starter ($6/mo) gives the commercial licence; Creator
  ($11 first month) includes ~275 call minutes ≈ 70–90 booking calls, with
  add-on minutes beyond that.
- Ring it from your own phone. Done.

## Costs, plainly
- ElevenLabs conversational minutes ≈ €0.08–0.12/min; Twilio inbound ≈ €0.01/min.
- A typical 2–4 minute booking call ≈ **€0.30–0.50**, against ~€9 take on a
  €40 booking. The number itself is a few euro a month. Cancellable any month.

## Guardrails already enforced in code
- **One flow**: books ONLY via `create-household-payment-checkout` — safety
  screen (no childminding/trade/height/driving), discounts, dedupe, dispatch
  all inherited. A blocked job returns a spoken apology.
- **The agent can't invent prices**: `quote_job` reads
  `_shared/householdPricing.ts`, the same table checkout charges from
  (cross-checked by vitest).
- **No payment on the call**: pay-after-accept, link sent by text — the
  existing pipeline's second half.
- **Auth**: every tool + the webhook require the `X-Vano-Secret` header; the
  function refuses all requests if `VOICE_AGENT_SECRET` isn't set.

## Test with real Galway accents before you advertise it
ElevenLabs' speech recognition is good but not perfect on strong accents and
kitchen noise. The prompt already makes Vano read the address and price back
to confirm — keep that. Try it with a few real voices before the number goes
on a poster or radio ad.

## v1 limits (deliberate)
- **Timing is a label, not a scheduled slot**: "later this afternoon" is
  shown to helpers but the job dispatches now (same as web "flexible").
  Real scheduled slots by voice are a v2 step.
- **Transfer-to-human** uses ElevenLabs' built-in transfer — set the
  forwarding number in the agent if you want the escalation path live.
