import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { approxAreaLabel } from "../_shared/serviceAreas.ts";
import { allowRequest, clientIp } from "../_shared/rateLimit.ts";
import { isReviewDemoPhone } from "../_shared/reviewDemo.ts";

// Waitlist request — what the booking sheet does INSTEAD of checkout while
// there aren't enough helpers to cover a job (owner call 2026-07-31, see
// src/lib/waitlist.ts).
//
// Taking a payment for a job no student can accept is worse than saying "not
// yet": the customer waits, nobody comes, and we charged them for it. So the
// flow stops one step short — it captures what they wanted and pages the owner
// so he can ring them back.
//
// NO booking row, NO Stripe, NO dispatch. This function's entire job is to
// make sure a real person hears about a real customer.
//
// Auth: unauthenticated and origin-checked, exactly like the checkout it
// replaces — customers are anonymous. verify_jwt=false in config.toml. The
// origin gate stops a foreign web page; it does NOTHING against curl (no Origin
// header = allowed, by design, for server callers), so the real abuse control
// is the two rate-limit buckets below.
//
// Privacy: the ADDRESS IS NEVER STORED OR SENT. Nobody is coming to the house,
// so the exact address has no purpose here; the owner gets the neighbourhood
// ("Salthill") which is all he needs to say whether he can cover it. Same rule
// as the dispatch offers — see _shared/serviceAreas.ts.

/**
 * Server-side backstop for the phone field. Mirrors the frontend's
 * `normalizePhoneE164` (src/lib/validation.ts): Irish mobiles bare, otherwise a
 * `+`/`00` country code, and country codes never start with 0. Returns E.164 or
 * null. Also rejects all-same-digit junk (0000000000, 1111111111) — a real
 * number never looks like that, and that's exactly what a bored troll types.
 */
function normalizeWaitlistPhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-().]/g, '').trim();
  if (!cleaned) return null;
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length >= 8 && /^(\d)\1+$/.test(digits)) return null; // all one digit
  if (cleaned.startsWith('+')) return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : null;
  if (cleaned.startsWith('00')) {
    const c = '+' + cleaned.slice(2);
    return /^\+[1-9]\d{7,14}$/.test(c) ? c : null;
  }
  if (/^08[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned.slice(1);
  if (/^8[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned;
  return null;
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const json = (status: number, payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (!isOriginAllowed(req)) return json(403, { error: 'Forbidden origin' });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const body = await req.json().catch(() => ({}));

    const str = (v: unknown, max = 200) =>
      typeof v === 'string' ? v.trim().slice(0, max) : '';
    const rawPhone = str(body.customer_phone, 32);
    if (!rawPhone) return json(400, { error: 'customer_phone is required' });

    // Reject junk before it costs anything — no owner page, no row.
    const phone = normalizeWaitlistPhone(rawPhone) ?? rawPhone;
    if (!normalizeWaitlistPhone(rawPhone)) {
      return json(400, { error: "That doesn't look like a mobile we can text. Irish mobiles (08…) work as-is." });
    }

    // ── App Store review demo (owner ask 2026-09-05) ─────────────────────────
    // The reviewer books with the ONE demo number: they get the confirmed
    // screen, and nobody is paged and no lead is stored. Only while the
    // REVIEW_DEMO secret is "true" — see _shared/reviewDemo.ts.
    if (isReviewDemoPhone(phone)) {
      return json(200, { success: true, notified: true, area: 'Galway', demo: true });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Bucket 1 — per IP: caps a spammer (browser or curl) at 5 requests/hour so
    // a loop can't drain the owner's attention or the Twilio balance. Fail-open
    // (a limiter error never blocks a real person on a waiting list).
    if (!await allowRequest(supabase, 'waitlist-request-ip', clientIp(req), 5, 3600)) {
      return json(429, { error: "You're already on the list — we'll be in touch. (Too many requests just now.)" });
    }

    // Name (waitlist mode) — the owner RINGS these leads, so the page needs
    // someone to ask for. Optional on the wire: the WhatsApp door and any
    // older client can still post without it rather than 400 on a lead.
    const customerName = str(body.customer_name, 80);
    const category = str(body.category, 40);
    const sizeLabel = str(body.size_label, 60);
    const whenLabel = str(body.when_label, 60);
    const city = str(body.city, 60);
    const note = str(body.note, 400);
    const priceEuros = Number.isFinite(Number(body.price_euros)) ? Number(body.price_euros) : null;
    // Neighbourhood only — never the street. See the header.
    const area = approxAreaLabel({
      lat: Number.isFinite(Number(body.customer_lat)) ? Number(body.customer_lat) : null,
      lng: Number.isFinite(Number(body.customer_lng)) ? Number(body.customer_lng) : null,
      address: str(body.customer_address, 200),
      city,
    });

    // Durable record FIRST, fail-soft. Email and WhatsApp both get lost or
    // ignored; a row doesn't. analytics_events already exists and is the repo's
    // event sink, so this needs no migration — and it means the owner can count
    // demand per area later and know where to recruit.
    // NOTE: the column is `props`, not `properties` (see track.ts) — the old
    // insert used `properties`, which PostgREST rejected, so EVERY waitlist
    // request silently failed to persist. Fixed 2026-08-11.
    try {
      const { error: insErr } = await supabase.from('analytics_events').insert({
        event: 'waitlist_request',
        props: { name: customerName, category, size_label: sizeLabel, when_label: whenLabel, area, city, note, price_euros: priceEuros, phone },
      });
      if (insErr) console.error('[waitlist-request] record failed (non-fatal)', insErr);
    } catch (e) { console.error('[waitlist-request] record threw (non-fatal)', e); }

    // Bucket 2 — per phone: only page the owner the FIRST time a number asks in
    // any 24h. A repeat (or a troll re-submitting from the same prefilled sheet)
    // still stores its row and still sees the friendly "you're on the list"
    // screen — the owner just isn't buzzed twice for the same person. Fail-open
    // so a limiter error errs toward paging, never toward silence.
    const firstToday = await allowRequest(supabase, 'waitlist-request-phone', phone, 1, 86400);

    let notified = false;
    if (firstToday) {
      // Page the owner and AWAIT it — the honest `notified` flag lets the
      // customer's screen fall back to "text us yourself" rather than implying
      // someone has definitely heard. The admin channel does WhatsApp AND email,
      // which is the repo's rule for anything the owner must not miss.
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'waitlist_request',
            customer_phone: phone,
            customer_name: customerName,
            category, size_label: sizeLabel, when_label: whenLabel,
            city, area, note, price_euros: priceEuros,
          }),
        });
        const sent = await resp.json().catch(() => null) as { sent?: boolean } | null;
        notified = resp.ok && sent?.sent !== false;
      } catch (e) {
        console.error('[waitlist-request] admin page failed', e);
      }
    } else {
      // Already paged for this number today — treat as handled so the customer
      // screen stays reassuring rather than pushing them to "text us yourself".
      notified = true;
    }

    return json(200, { success: true, notified, area });
  } catch (err) {
    console.error('[waitlist-request] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
