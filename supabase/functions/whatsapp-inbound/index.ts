import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CATEGORY_LABELS, type Category } from "../_shared/householdPricing.ts";
import {
  WA_CATEGORIES,
  WA_CATALOGUE,
  type WaCategory,
  keywordClassify,
  needsSize,
  parseDurationReply,
  isYes,
  isNo,
  isAsapWhen,
  euro,
  quoteDraft,
} from "../_shared/waIntake.ts";
import { allowRequest } from "../_shared/rateLimit.ts";

// ── The WhatsApp door ────────────────────────────────────────────────────────
// Twilio inbound-message webhook: customers book by texting the Vano WhatsApp
// number like they'd text a mate. This is NOT a second booking flow — it is a
// second DOOR into the one flow: every confirmed request is POSTed to
// create-household-payment-checkout exactly as the web sheet does, so pricing,
// the free-text safety screen, referral discounts, double-submit
// dedupe and dispatch are all inherited. After booking, the EXISTING pipeline
// carries the thread on WhatsApp (notify-household-accepted sends the pay
// link, progress messages follow) — one conversation, cradle to grave.
//
// Conversation model: a Gemini classify (fail-soft onto the offline keyword
// matcher, same philosophy as parse-custom-job) reads the FIRST message; every
// follow-up answer is parsed deterministically (_shared/waIntake.ts) through a
// tiny step machine — size → address → name → confirm — whose draft lives in
// wa_threads (30-min TTL). Home memory (household_homes, written by checkout's
// record_home_booking stamp) powers "welcome back", saved-address reuse and
// the "same again" fast path.
//
// Auth: the X-Twilio-Signature HMAC on every request (verify_jwt=false in
// config.toml — Twilio can't send a JWT). Requests that fail the signature
// are rejected before anything is read. Replies are TwiML (same-number reply
// inside the customer's 24h WhatsApp session — no REST send needed).
//
// Compliance: STOP opts the phone out (household_homes.wa_opted_out) and is
// honoured with silence ever after; START opts back in. The AI never sets a
// price — quotes come from the shared server price table and the charge is
// whatever checkout computes (discounts can only make it lower).
//
// Env: TWILIO_AUTH_TOKEN (required — signature check), GEMINI_API_KEY
// (optional — falls back to keyword matching), SITE_URL, and optionally
// TWILIO_INBOUND_URL when the webhook URL Twilio signs differs from
// SUPABASE_URL/functions/v1/whatsapp-inbound (e.g. behind a proxy).

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const THREAD_TTL_MS = 30 * 60 * 1000;

// ── Small utilities ──────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const twiml = (msg: string): Response =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(msg)}</Message></Response>`,
    { headers: { 'Content-Type': 'text/xml' } },
  );

const emptyTwiml = (): Response =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  });

/** whatsapp:+3538… / +3538… → E.164, or null if it isn't one. */
function phoneFromTwilio(from: string | undefined): string | null {
  if (!from) return null;
  const p = from.replace(/^whatsapp:/i, '').trim();
  return /^\+\d{8,15}$/.test(p) ? p : null;
}

/** +3538xxxxxxxx → 08xxxxxxxx (the form web bookings usually store). */
function irishNationalForm(e164: string): string | null {
  const m = e164.match(/^\+353(8[3-9]\d{7})$/);
  return m ? `0${m[1]}` : null;
}

function phoneForms(e164: string): string[] {
  const nat = irishNationalForm(e164);
  return nat ? [e164, nat] : [e164];
}

// Constant-time-ish comparison for the webhook signature.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// X-Twilio-Signature = Base64(HMAC-SHA1(authToken, url + sortedKey1 + val1 + …))
async function twilioSignatureValid(
  authToken: string,
  candidateUrls: string[],
  params: Record<string, string>,
  provided: string | null,
): Promise<boolean> {
  if (!provided) return false;
  const suffix = Object.keys(params).sort().map((k) => k + params[k]).join('');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  );
  for (const url of candidateUrls) {
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(url + suffix));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
    if (timingSafeEqual(b64, provided)) return true;
  }
  return false;
}

// ── Conversation state ───────────────────────────────────────────────────────

interface WaDraft {
  category: Category;
  size_label: string | null;
  note: string | null;      // the customer's own words — helper context + checkout's safety screen
  when_label: string;       // 'Now' or the stated timing preference (shown to helpers)
  name: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
}

type WaStep = 'size' | 'address' | 'name' | 'confirm';
interface WaState { step: WaStep; draft: WaDraft }

interface HomeRow {
  phone: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  last_category: string | null;
  last_size_label: string | null;
  bookings_count: number;
  wa_opted_out: boolean;
}

function nextStep(d: WaDraft): WaStep {
  const waCat: WaCategory = (WA_CATEGORIES as readonly string[]).includes(d.category)
    ? d.category as WaCategory : 'custom';
  if (needsSize(waCat) && !d.size_label) return 'size';
  // Address is always confirmed — a one-tap YES when the home is known.
  if (!d.address) return 'address';
  if (!d.name) return 'name';
  return 'confirm';
}

function sizeQuestion(category: Category): string {
  if (category === 'dog-walk') return 'How long a walk — 30 min (€15) or 1 hour (€20)?';
  if (category === 'custom')   return 'Roughly how long will it take? (e.g. 30 min, 1 hour, 2 hours — €18/hr, min €12)';
  return 'How many hours would you like? (1–8 — most homes book 2 or 3, €18/hr)';
}

function addressQuestion(home: HomeRow | null): string {
  return home?.address
    ? `Same place as last time — ${home.address}? Reply YES, or send the new address (Eircode helps).`
    : `What's the address? (include the Eircode if you can — it helps your helper find you)`;
}

function confirmMessage(d: WaDraft): string | null {
  const q = quoteDraft(
    (WA_CATEGORIES as readonly string[]).includes(d.category) ? d.category as WaCategory : 'custom',
    d.size_label ?? '',
  );
  if (!q) return null;
  const label = CATEGORY_LABELS[d.category] ?? d.category;
  return [
    `Here's your booking:`,
    `• ${label}${d.size_label ? ` — ${d.size_label}` : ''}`,
    `• ${d.address}`,
    `• When: ${d.when_label}`,
    `• Price: ${q.line}`,
    ``,
    `You're only CHARGED after a verified helper accepts — the secure card step lands right here. Book it? (YES/NO)`,
  ].join('\n');
}

// ── AI intake (fail-soft, same philosophy as parse-custom-job) ───────────────

interface Classified { category: WaCategory | 'greeting'; hours: number | null; whenText: string | null }

async function classifyWithGemini(text: string): Promise<Classified | null> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return null;

  const catalogue = (Object.entries(WA_CATALOGUE) as Array<[string, string]>)
    .map(([k, v]) => `- ${k}: ${v}`).join('\n');
  const system =
    'You are the WhatsApp intake brain for VANO, a same-day student-help service in Galway, Ireland. ' +
    'A homeowner texts what they need done in their own words. Map it to EXACTLY ONE catalogue key. ' +
    'Estimate how many hours of ONE student\'s time it needs as a whole number 1-8 (most domestic jobs are 1-3). ' +
    "If the message states WHEN they want it ('today', 'tomorrow at 2', 'Saturday morning'), copy that wording " +
    "into whenText; otherwise leave it empty. If the message is just a greeting or too vague to be a job, use " +
    "the key 'greeting'. If it's a real job that fits nothing, use 'custom'. Always call the tool.";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Catalogue (key: covers):\n${catalogue}\n\nThe customer wrote:\n"""${text}"""` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'classify_request',
            description: 'Return the best-fit catalogue key, a duration estimate and any stated timing.',
            parameters: {
              type: 'object',
              properties: {
                jobKey:   { type: 'string', enum: [...WA_CATEGORIES, 'greeting'] },
                hours:    { type: 'integer', minimum: 1, maximum: 8 },
                whenText: { type: 'string' },
              },
              required: ['jobKey'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'classify_request' } },
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => null);
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    const parsed = JSON.parse(args) as Record<string, unknown>;
    const jobKey = typeof parsed.jobKey === 'string' ? parsed.jobKey : 'custom';
    const valid = ([...WA_CATEGORIES, 'greeting'] as string[]).includes(jobKey);
    let hours = Math.round(Number(parsed.hours));
    if (!Number.isFinite(hours) || hours < 1 || hours > 8) hours = 0;
    const whenText = typeof parsed.whenText === 'string' && parsed.whenText.trim()
      ? parsed.whenText.trim().slice(0, 40) : null;
    return {
      category: (valid ? jobKey : 'custom') as WaCategory | 'greeting',
      hours: hours || null,
      whenText,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── The webhook ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  const site = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/$/, '');

  if (!authToken) {
    console.error('[whatsapp-inbound] TWILIO_AUTH_TOKEN not configured — refusing all requests');
    return new Response('Not configured', { status: 503 });
  }

  // Twilio posts application/x-www-form-urlencoded.
  const params: Record<string, string> = {};
  try {
    const form = await req.formData();
    for (const [k, v] of form.entries()) params[k] = typeof v === 'string' ? v : '';
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const candidates = [
    Deno.env.get('TWILIO_INBOUND_URL')?.trim() || '',
    `${supabaseUrl}/functions/v1/whatsapp-inbound`,
    req.url,
  ].filter((u, i, arr) => u && arr.indexOf(u) === i);
  const signatureOk = await twilioSignatureValid(
    authToken, candidates, params, req.headers.get('X-Twilio-Signature'),
  );
  if (!signatureOk) {
    console.warn('[whatsapp-inbound] bad signature — rejected');
    return new Response('Forbidden', { status: 403 });
  }

  const phone = phoneFromTwilio(params.From);
  if (!phone) return emptyTwiml();

  // Delivery/read receipts and other Body-less callbacks: acknowledge silently.
  const rawBody = (params.Body ?? '').trim();
  const numMedia = Number(params.NumMedia || '0');
  if (!rawBody) {
    if (numMedia > 0) return twiml("I can't see photos yet — describe the job in a quick text and I'll price it for you.");
    return emptyTwiml();
  }
  const body = rawBody.slice(0, 600);
  const profileName = (params.ProfileName ?? '').trim().slice(0, 60) || null;

  try {
    const supabase = createClient(supabaseUrl, serviceKey);

    // The signature already proves the request came from Twilio; this limiter
    // just stops a message flood (or an autoresponder loop) burning Gemini.
    if (!(await allowRequest(supabase, 'whatsapp-inbound', phone, 20, 600))) {
      return emptyTwiml();
    }

    // ── Home memory: load, or lazily materialise from booking history ──────
    const forms = phoneForms(phone);
    let home: HomeRow | null = null;
    {
      const { data } = await supabase
        .from('household_homes')
        .select('phone, name, address, lat, lng, city, last_category, last_size_label, bookings_count, wa_opted_out')
        .eq('phone', phone)
        .maybeSingle();
      home = (data as HomeRow | null) ?? null;
    }
    if (!home) {
      // First contact from this phone — seed the record from their latest web
      // booking if one exists (record_home_booking keeps it fresh from here on).
      const { data: last } = await supabase
        .from('household_bookings')
        .select('customer_name, customer_address, customer_lat, customer_lng, city, category, booking_data, id')
        .in('customer_phone', forms)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const bd = (last?.booking_data as Record<string, unknown> | null) ?? {};
      const seed = {
        phone,
        name: (last?.customer_name as string | null) ?? profileName,
        address: last?.customer_address && last.customer_address !== 'Not provided' ? last.customer_address : null,
        lat: (last?.customer_lat as number | null) ?? null,
        lng: (last?.customer_lng as number | null) ?? null,
        city: (last?.city as string | null) ?? null,
        last_category: (last?.category as string | null) ?? null,
        last_size_label: (bd.size_label as string | null) ?? null,
        last_booking_id: (last?.id as string | null) ?? null,
        bookings_count: last ? 1 : 0, // approximate — record_home_booking counts from here
        wa_last_inbound_at: new Date().toISOString(),
      };
      const { data: inserted } = await supabase
        .from('household_homes')
        .upsert(seed, { onConflict: 'phone' })
        .select('phone, name, address, lat, lng, city, last_category, last_size_label, bookings_count, wa_opted_out')
        .maybeSingle();
      home = (inserted as HomeRow | null) ?? { ...seed, wa_opted_out: false } as HomeRow;
    } else {
      await supabase
        .from('household_homes')
        .update({ wa_last_inbound_at: new Date().toISOString() })
        .eq('phone', phone);
    }

    const lower = body.toLowerCase().replace(/[!.?]+$/, '').trim();
    const firstName = home?.name ? home.name.split(/\s+/)[0] : null;

    // ── Commands (checked before anything conversational) ──────────────────
    if (/^(stop|unsubscribe|opt ?out)$/.test(lower)) {
      await supabase.from('household_homes').update({ wa_opted_out: true }).eq('phone', phone);
      await supabase.from('wa_threads').delete().eq('phone', phone);
      return twiml("You're opted out — Vano won't message this number again. Reply START any time to switch back on.");
    }
    if (home?.wa_opted_out) {
      if (/^(start|unstop|opt ?in)$/.test(lower)) {
        await supabase.from('household_homes').update({ wa_opted_out: false }).eq('phone', phone);
        return twiml(`Welcome back${firstName ? `, ${firstName}` : ''}! Text me what you need done at home and I'll sort a verified student helper.`);
      }
      return emptyTwiml(); // opted out — stay silent
    }
    if (/^(cancel|reset|start over)$/.test(lower)) {
      await supabase.from('wa_threads').delete().eq('phone', phone);
      return twiml('No bother — nothing booked. Text me whenever you need a hand. (To cancel a LIVE booking, use the link on your tracking page.)');
    }
    if (/^help$/.test(lower)) {
      return twiml(
        `I'm Vano — same-day home help from ID-verified Galway students.\n` +
        `Just text what you need: "clean my apartment for 2 hours", "walk my dog at 5", "help moving a couch".\n` +
        `Commands: STATUS (latest booking) · CANCEL (start over) · STOP (no more messages).`,
      );
    }
    if (/^status$/.test(lower) || /where('| i)?s my (helper|booking)/.test(lower)) {
      const { data: b } = await supabase
        .from('household_bookings')
        .select('id, status, category, paid_at')
        .in('customer_phone', forms)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!b) return twiml("No bookings on this number yet — text me what you need and let's fix that!");
      const label = CATEGORY_LABELS[b.category as Category] ?? b.category;
      const lines: Record<string, string> = {
        awaiting_payment: "one tap left — hit the secure card link in this chat to lock it in (you're only charged when a helper accepts)",
        pending:     "we're still finding your helper — you'll hear from me the second someone accepts",
        accepted:    b.paid_at ? 'your helper is confirmed and will be in touch' : 'a helper accepted! Your payment link is in this chat (and your email) — the job locks in once paid',
        on_way:      'your helper is on the way 🚗',
        arrived:     'your helper has arrived',
        in_progress: 'the job is underway',
        completed:   "that job's done ✅ — text me when you need the next one",
      };
      return twiml(`${label}: ${lines[b.status as string] ?? b.status}.\nTrack live: ${site}/track/${b.id}`);
    }

    // ── Load any open conversation (30-min TTL) ─────────────────────────────
    let state: WaState | null = null;
    {
      const { data } = await supabase
        .from('wa_threads')
        .select('state, updated_at')
        .eq('phone', phone)
        .maybeSingle();
      if (data?.state && data.updated_at && Date.now() - Date.parse(data.updated_at as string) < THREAD_TTL_MS) {
        const s = data.state as Record<string, unknown>;
        if (s.step && s.draft) state = s as unknown as WaState;
      }
    }

    const saveState = async (s: WaState) => {
      await supabase.from('wa_threads').upsert(
        { phone, state: s as unknown as Record<string, unknown>, updated_at: new Date().toISOString() },
        { onConflict: 'phone' },
      );
    };
    const clearState = async () => { await supabase.from('wa_threads').delete().eq('phone', phone); };

    // Ask the next question for a draft, persisting the step.
    const advance = async (draft: WaDraft): Promise<Response> => {
      const step = nextStep(draft);
      if (step === 'confirm') {
        const msg = confirmMessage(draft);
        if (!msg) {
          // Unpriceable size slipped through — re-ask the duration.
          draft.size_label = null;
          await saveState({ step: 'size', draft });
          return twiml(sizeQuestion(draft.category));
        }
        await saveState({ step, draft });
        return twiml(msg);
      }
      await saveState({ step, draft });
      if (step === 'size') return twiml(sizeQuestion(draft.category));
      if (step === 'address') return twiml(addressQuestion(home));
      return twiml('What name should the helper ask for?');
    };

    // Create the booking through the ONE pipeline (same endpoint the web uses).
    const book = async (d: WaDraft): Promise<Response> => {
      const resp = await fetch(`${supabaseUrl}/functions/v1/create-household-payment-checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: d.category,
          when_label: d.when_label,
          size_label: d.size_label ?? '',
          note: d.note,
          customer_name: d.name,
          customer_phone: phone,
          customer_address: d.address,
          ...(d.lat !== null && d.lng !== null ? { customer_lat: d.lat, customer_lng: d.lng } : {}),
          ...(d.city ? { city: d.city } : {}),
        }),
      });
      const out = await resp.json().catch(() => null) as Record<string, unknown> | null;
      await clearState();
      if (resp.status === 422 && typeof out?.error === 'string') {
        return twiml(out.error); // safety screen — already customer-worded
      }
      if (!resp.ok || !out?.booking_id) {
        console.error('[whatsapp-inbound] checkout failed', resp.status, out);
        return twiml(`Sorry — something went wrong on my end and nothing was booked. Try again in a minute, or book at ${site}`);
      }
      const label = CATEGORY_LABELS[d.category] ?? d.category;
      const total = Number(out.total_cents) || 0;
      const quoted = quoteDraft(
        (WA_CATEGORIES as readonly string[]).includes(d.category) ? d.category as WaCategory : 'custom',
        d.size_label ?? '',
      );
      const discountLine = quoted && total > 0 && total < quoted.totalCents
        ? `\n🎉 A discount applied — your total is ${euro(total)}.`
        : '';
      // AUTH-AT-BOOKING: the checkout function returns the Stripe link and the
      // booking waits (awaiting_payment) until the card step is done — send
      // that link as the ONE next action. The promise stays literally true:
      // the fee is only reserved now; the charge happens when a helper accepts.
      if (out.auth_required === true && typeof out.checkout_url === 'string') {
        return twiml(
          `Booked ✅ ${label}${d.size_label ? ` — ${d.size_label}` : ''}.${discountLine}\n` +
          `🔒 One tap left — secure it with Apple Pay, Google Pay or card:\n${out.checkout_url}\n` +
          `💶 You're only CHARGED when a helper accepts (this just reserves the small VANO fee). Then we ping Galway's verified helpers.\n` +
          `📍 Track live: ${out.track_url}\n` +
          `Reply STATUS any time.`,
        );
      }
      return twiml(
        `Booked ✅ ${label}${d.size_label ? ` — ${d.size_label}` : ''}.\n` +
        `We're pinging Galway's verified helpers now.${discountLine}\n` +
        `💶 You only pay once a helper accepts — the secure link will land right here.\n` +
        `📍 Track live: ${out.track_url}\n` +
        `Reply STATUS any time.`,
      );
    };

    // ── Mid-conversation replies ────────────────────────────────────────────
    if (state) {
      const d = state.draft;
      const waCat: WaCategory = (WA_CATEGORIES as readonly string[]).includes(d.category)
        ? d.category as WaCategory : 'custom';

      if (state.step === 'size') {
        const size = parseDurationReply(body, waCat);
        if (!size) return twiml(`Sorry, I didn't catch that. ${sizeQuestion(d.category)} (Or reply CANCEL to start over.)`);
        d.size_label = size;
        return advance(d);
      }

      if (state.step === 'address') {
        if (home?.address && isYes(body)) {
          d.address = home.address;
          d.city = home.city ?? d.city;
          d.lat = home.lat;
          d.lng = home.lng;
          return advance(d);
        }
        if (isNo(body)) return twiml("No problem — what's the address? (include the Eircode if you can)");
        if (body.length < 8) return twiml("That address looks a bit short — can you send the full address? (Eircode helps your helper find you)");
        d.address = body.slice(0, 200);
        d.city = home?.city ?? 'Galway';
        d.lat = null;
        d.lng = null; // checkout geocodes server-side
        return advance(d);
      }

      if (state.step === 'name') {
        if (body.length < 2 || body.length > 60) return twiml('What name should the helper ask for?');
        d.name = body.replace(/\s+/g, ' ').trim();
        return advance(d);
      }

      // confirm
      if (isYes(body)) return book(d);
      if (isNo(body)) {
        await clearState();
        return twiml('No bother — nothing booked. Text me whenever you need a hand!');
      }
      const msg = confirmMessage(d);
      return twiml(`Just need a YES or NO on this one:\n\n${msg ?? 'Reply CANCEL to start over.'}`);
    }

    // ── New conversation ────────────────────────────────────────────────────

    // Greeting → welcome (with the "same again" nudge for returning homes).
    const greetingRe = /^(hi|hiya|hello|hey|howya|how'?s it going|good (morning|afternoon|evening)|yo|hi vano|hello vano)$/;
    const sameAgainRe = /\b(same again|the usual|same as (last time|before)|rebook|book (it|that) again|repeat that)\b/;

    // "Same again" fast path — the home memory payoff.
    if (sameAgainRe.test(lower) && home?.last_category && home?.last_size_label && home?.address) {
      const draft: WaDraft = {
        category: home.last_category as Category,
        size_label: home.last_size_label,
        note: 'Repeat of previous booking (requested on WhatsApp: "same again")',
        when_label: 'Now',
        name: home.name ?? profileName,
        address: home.address,
        city: home.city,
        lat: home.lat,
        lng: home.lng,
      };
      if (confirmMessage(draft)) return advance(draft);
      // Un-priceable old label (e.g. legacy category) — fall through to normal intake.
    }

    if (greetingRe.test(lower) || body.length < 4) {
      const back = home?.last_category
        ? `\nOr reply "same again" for your usual ${CATEGORY_LABELS[home.last_category as Category] ?? home.last_category}.`
        : '';
      return twiml(
        `Hey${firstName ? ` ${firstName}` : ''}! I'm Vano 👋 — same-day home help from ID-verified Galway students.\n` +
        `Just text what you need: "clean my apartment for 2 hours", "walk my dog at 5", "help moving a couch".${back}`,
      );
    }

    // Classify the request: Gemini first, offline keywords as the safety net.
    const ai = await classifyWithGemini(body);
    if (ai?.category === 'greeting') {
      return twiml(
        `Hey${firstName ? ` ${firstName}` : ''}! Text me the job and I'll sort it — e.g. "clean my apartment for 2 hours" or "walk my dog at 5".`,
      );
    }
    const category: WaCategory = (ai?.category as WaCategory | undefined) ?? keywordClassify(body);
    const hours = ai?.hours ?? null;
    const whenText = ai?.whenText ?? null;

    const draft: WaDraft = {
      category: category as Category,
      size_label: !needsSize(category)
        ? '' // flat-priced (laundry) — no duration question
        : hours
          ? (category === 'dog-walk' ? (hours === 1 ? '1 hour' : null) : (hours === 1 ? '1 hour' : `${hours} hours`))
          : null,
      note: body.slice(0, 300),
      when_label: isAsapWhen(whenText) ? 'Now' : (whenText as string),
      name: home?.name ?? profileName,
      address: null, // always confirmed (one-tap YES when we know the home)
      city: home?.city ?? null,
      lat: null,
      lng: null,
    };
    return advance(draft);
  } catch (err) {
    console.error('[whatsapp-inbound] unhandled', err);
    // Never let Twilio see a 5xx (it retries and the customer gets nothing) —
    // reply with a human apology instead.
    return twiml(`Sorry — I hit a snag there. Try again in a minute, or book at ${site}`);
  }
});
