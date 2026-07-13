import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CATEGORY_LABELS, type Category } from "../_shared/householdPricing.ts";
import { resolveCategory, sizeLabelFromHours, voiceQuote } from "../_shared/voiceIntake.ts";

// ── Ring Vano — the phone door ───────────────────────────────────────────────
// The server tools the ElevenLabs voice agent calls mid-conversation. Same
// principle as the WhatsApp door: this is NOT a second booking flow. quote_job
// reads the shared server price table (the agent can never invent a price) and
// create_booking POSTs to create-household-payment-checkout — the ONE pipeline
// — so pricing, the safety screen, discounts, dedupe and dispatch are all
// inherited. The call ends with pay-after-accept: the Stripe link is TEXTED to
// the caller when a helper accepts (notify-household-accepted, unchanged). No
// card details are ever spoken.
//
// One function, four actions selected by ?action= (each ElevenLabs tool points
// at its own URL):
//   ?action=quote        → quote_job     : price a described job out loud
//   ?action=book         → create_booking: create the booking, text the link
//   ?action=status       → booking_status: read back the latest booking's state
//   ?action=personalize  → conversation-initiation webhook: greet a known caller
//
// Auth: a shared secret in the X-Vano-Secret header (VOICE_AGENT_SECRET),
// checked on every request — ElevenLabs lets you attach a custom header to
// both server tools and the personalization webhook. verify_jwt=false is
// pinned in config.toml (ElevenLabs can't send a Supabase JWT).
//
// Env: VOICE_AGENT_SECRET (required), SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// (auto), SITE_URL (optional).

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Irish/E.164 phone normalisation — mirrors create-household-payment-checkout. */
function normalizeE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[\s\-()]/g, '').trim();
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
  if (cleaned.startsWith('00')) {
    const c = '+' + cleaned.slice(2);
    return /^\+\d{8,15}$/.test(c) ? c : null;
  }
  if (/^08[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned.slice(1);
  if (/^8[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned;
  return null;
}

function irishNationalForm(e164: string): string | null {
  const m = e164.match(/^\+353(8[3-9]\d{7})$/);
  return m ? `0${m[1]}` : null;
}
function phoneForms(e164: string): string[] {
  const nat = irishNationalForm(e164);
  return nat ? [e164, nat] : [e164];
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const secret = Deno.env.get('VOICE_AGENT_SECRET')?.trim();
  if (!secret) {
    console.error('[voice-agent-tools] VOICE_AGENT_SECRET not set — refusing all requests');
    return json(503, { error: 'Not configured' });
  }
  const provided = req.headers.get('X-Vano-Secret')?.trim() ?? '';
  if (!timingSafeEqual(provided, secret)) {
    return json(403, { error: 'Forbidden' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const site = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/$/, '');
  const action = new URL(req.url).searchParams.get('action') || 'quote';

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const supabase = createClient(supabaseUrl, serviceKey);

  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  try {
    // ── personalize: conversation-initiation webhook ───────────────────────
    // ElevenLabs calls this when a call connects, passing the caller's number.
    // We return dynamic variables the prompt can interpolate and, for a known
    // home, override the first line so Vano greets them by name. Unknown or
    // withheld numbers just fall through to the default greeting.
    if (action === 'personalize') {
      const callerId = str(body.caller_id) || str((body as Record<string, unknown>).from);
      const phone = normalizeE164(callerId);
      const base = {
        dynamic_variables: {
          caller_known: 'false',
          caller_name: '',
          last_job: '',
          saved_address: '',
        },
      };
      if (!phone) return json(200, base);

      const { data: home } = await supabase
        .from('household_homes')
        .select('name, address, last_category, last_size_label, bookings_count, wa_opted_out')
        .eq('phone', phone)
        .maybeSingle();
      if (!home?.name && !home?.last_category) return json(200, base);

      const firstName = home?.name ? String(home.name).split(/\s+/)[0] : '';
      const lastLabel = home?.last_category ? (CATEGORY_LABELS[home.last_category as Category] ?? '') : '';
      const lastJob = lastLabel
        ? `${lastLabel}${home?.last_size_label ? ` (${home.last_size_label})` : ''}`
        : '';
      const greeting = firstName
        ? `Hiya ${firstName}, welcome back to Vano! ${lastJob ? `Would you like the same as last time — your ${lastLabel}? Or something different today?` : 'What can I sort for you today?'}`
        : `Hi, you're through to Vano — same-day home help from verified Galway students. What can I sort for you today?`;

      return json(200, {
        dynamic_variables: {
          caller_known: firstName ? 'true' : 'false',
          caller_name: firstName,
          last_job: lastJob,
          saved_address: home?.address ? String(home.address) : '',
        },
        conversation_config_override: {
          agent: { first_message: greeting },
        },
      });
    }

    // ── quote: price a described job out loud ──────────────────────────────
    if (action === 'quote') {
      const category = resolveCategory(str(body.category), `${str(body.request)} ${str(body.note)}`);
      const sizeLabel = str(body.size_label) || sizeLabelFromHours(category, num(body.hours));
      const q = voiceQuote(category, sizeLabel);
      if (!q) {
        return json(200, {
          ok: false,
          spoken: "I couldn't price that just yet — roughly how many hours do you think it'll take? Most jobs are one to three.",
        });
      }
      const label = CATEGORY_LABELS[category as Category] ?? category;
      return json(200, {
        ok: true,
        category,
        job_label: label,
        size_label: sizeLabel,
        price_eur: (q.priceCents / 100).toFixed(2),
        service_fee_eur: (q.feeCents / 100).toFixed(2),
        total_eur: (q.totalCents / 100).toFixed(2),
        spoken: q.spoken,
      });
    }

    // ── book: create the booking through the one pipeline ──────────────────
    if (action === 'book') {
      const category = resolveCategory(str(body.category), `${str(body.request)} ${str(body.note)}`);
      const sizeLabel = str(body.size_label) || sizeLabelFromHours(category, num(body.hours));
      const name = str(body.name);
      const phone = normalizeE164(str(body.phone) || str(body.caller_id));
      const address = str(body.address);
      const whenRaw = str(body.when);
      const city = str(body.city) || 'Galway';
      const note = str(body.note) || str(body.request);

      if (!name) return json(200, { ok: false, spoken: "Sorry — what name should the helper ask for when they arrive?" });
      if (!phone) return json(200, { ok: false, spoken: "I didn't catch a phone number to text the details to — what's the best mobile number?" });
      if (!address || address.length < 6) return json(200, { ok: false, spoken: "And what's the address? An Eircode is perfect if you have it." });

      // Confirm it's priceable before we insert anything.
      const q = voiceQuote(category, sizeLabel);
      if (!q) return json(200, { ok: false, spoken: "Roughly how long will the job take? Most are one to three hours." });

      const resp = await fetch(`${supabaseUrl}/functions/v1/create-household-payment-checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          when_label: whenRaw && !/^(now|asap|today|any ?time|whenever|flexible)$/i.test(whenRaw) ? whenRaw : 'Now',
          size_label: sizeLabel,
          note: note ? `${note} (booked by phone)` : 'Booked by phone call',
          customer_name: name,
          customer_phone: phone,
          customer_address: address,
          city,
        }),
      });
      const out = await resp.json().catch(() => null) as Record<string, unknown> | null;

      if (resp.status === 422 && typeof out?.error === 'string') {
        // Safety screen (childminding / trade / etc.) — already human-worded.
        return json(200, { ok: false, spoken: out.error });
      }
      if (!resp.ok || !out?.booking_id) {
        console.error('[voice-agent-tools] checkout failed', resp.status, out);
        return json(200, {
          ok: false,
          spoken: `I'm sorry, something went wrong on my end and I couldn't lock that in. Could you try again in a moment, or book at ${site}?`,
        });
      }

      const label = CATEGORY_LABELS[category as Category] ?? category;
      const total = num(out.total_cents);
      const ref = String(out.booking_id).slice(-6).toUpperCase();
      return json(200, {
        ok: true,
        booking_id: out.booking_id,
        reference: ref,
        total_eur: total ? (total / 100).toFixed(2) : (q.totalCents / 100).toFixed(2),
        track_url: out.track_url,
        spoken:
          `Brilliant — your ${label} is booked. I'm messaging Galway's verified helpers now. ` +
          `You'll get a text the moment someone accepts, with a secure link to pay — remember, nothing's charged until then. ` +
          `Your reference is ${ref.split('').join(' ')}. Is there anything else I can sort?`,
      });
    }

    // ── status: read back the latest booking ───────────────────────────────
    if (action === 'status') {
      const phone = normalizeE164(str(body.phone) || str(body.caller_id));
      if (!phone) return json(200, { ok: false, spoken: "What's the mobile number the booking's under?" });
      const { data: b } = await supabase
        .from('household_bookings')
        .select('id, status, category, paid_at')
        .in('customer_phone', phoneForms(phone))
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!b) return json(200, { ok: true, found: false, spoken: "I don't see any bookings on that number yet — shall I set one up for you?" });
      const label = CATEGORY_LABELS[b.category as Category] ?? b.category;
      const lines: Record<string, string> = {
        pending: "we're still finding your helper — you'll get a text the second someone accepts",
        accepted: b.paid_at ? "your helper's confirmed and will be in touch" : "a helper accepted — there's a payment link in your texts; the job locks in once that's paid",
        on_way: "your helper is on the way",
        arrived: "your helper has arrived",
        in_progress: "the job is underway right now",
        completed: "that job's all done",
      };
      return json(200, {
        ok: true,
        found: true,
        booking_status: b.status,
        spoken: `Your ${label}: ${lines[b.status as string] ?? b.status}.`,
      });
    }

    return json(400, { error: `Unknown action "${action}"` });
  } catch (err) {
    console.error('[voice-agent-tools] unhandled', err);
    return json(200, {
      ok: false,
      spoken: "I'm sorry, I hit a snag there. Could you say that once more?",
    });
  }
});
