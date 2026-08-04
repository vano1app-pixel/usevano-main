import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { approxAreaLabel } from "../_shared/serviceAreas.ts";

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
// replaces — customers are anonymous. verify_jwt=false in config.toml.
//
// Privacy: the ADDRESS IS NEVER STORED OR SENT. Nobody is coming to the house,
// so the exact address has no purpose here; the owner gets the neighbourhood
// ("Salthill") which is all he needs to say whether he can cover it. Same rule
// as the dispatch offers — see _shared/serviceAreas.ts.

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
    const phone = str(body.customer_phone, 32);
    if (!phone) return json(400, { error: 'customer_phone is required' });

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

    const supabase = createClient(supabaseUrl, serviceKey);

    // Durable record FIRST, fail-soft. Email and WhatsApp both get lost or
    // ignored; a row doesn't. analytics_events already exists and is the
    // repo's event sink, so this needs no migration — and it means the owner
    // can count demand per area later and know where to recruit.
    try {
      const { error: insErr } = await supabase.from('analytics_events').insert({
        event: 'waitlist_request',
        properties: { category, size_label: sizeLabel, when_label: whenLabel, area, city, note, price_euros: priceEuros, phone },
      });
      if (insErr) console.error('[waitlist-request] record failed (non-fatal)', insErr);
    } catch (e) { console.error('[waitlist-request] record threw (non-fatal)', e); }

    // Page the owner and AWAIT it — the honest `notified` flag lets the
    // customer's screen fall back to "text us yourself" rather than implying
    // someone has definitely heard. The admin channel does WhatsApp AND
    // email, which is the repo's rule for anything the owner must not miss.
    let notified = false;
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'waitlist_request',
          customer_phone: phone,
          category, size_label: sizeLabel, when_label: whenLabel,
          city, area, note, price_euros: priceEuros,
        }),
      });
      const sent = await resp.json().catch(() => null) as { sent?: boolean } | null;
      notified = resp.ok && sent?.sent !== false;
    } catch (e) {
      console.error('[waitlist-request] admin page failed', e);
    }

    return json(200, { success: true, notified, area });
  } catch (err) {
    console.error('[waitlist-request] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
