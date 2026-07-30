import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import {
  EXTRA_TIME_MAX_MINUTES,
  approvedExtraCents,
  approvedExtraMinutes,
  extraTimeText,
  pendingExtraTime,
  type ExtraTimeState,
} from "../_shared/extraTime.ts";

// The customer's half of the extra-time handshake (2026-07-30).
//
// The helper asks on their job screen (household-arrival's
// `request_extra_time`); this is the tap on /track that answers. Nothing
// about a job's price can change without it — there is no auto-approval and
// no timeout that says yes.
//
// Auth: unauthenticated and gated by the booking UUID, exactly like
// complete-household-job and customer_cancel — customers are anonymous, so
// the booking link IS the credential. verify_jwt=false in config.toml.
//
// Money: NOTHING here touches Stripe. Approved extra time is paid directly to
// the helper at the end (Revolut/cash) in both pay modes, with no Vano fee,
// so there is no second charge to capture, reconcile or refund.
// price_estimate_cents is never rewritten — it is what was quoted and, under
// card-pay, what was charged. The agreed extra accumulates alongside it in
// booking_data.extra_time_minutes / extra_time_cents.

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (status: number, payload: Record<string, unknown>): Response =>
    new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const bad = (status: number, error: string): Response => json(status, { error });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id : null;
    const approve = body?.approve === true;
    if (!bookingId) return bad(400, 'booking_id required');

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: booking, error: fetchErr } = await supabase
      .from('household_bookings')
      .select('id, status, category, student_id, booking_data')
      .eq('id', bookingId)
      .maybeSingle() as { data: { id: string; status: string; category: string; student_id: string | null; booking_data: Record<string, unknown> | null } | null; error: unknown };

    if (fetchErr || !booking) return bad(404, 'Booking not found');

    const bd = (booking.booking_data ?? {}) as Record<string, unknown> & ExtraTimeState;
    const request = pendingExtraTime(bd);
    if (!request) {
      // Idempotent: a double-tap, a stale tab, or the helper withdrawing the
      // ask between render and tap. Report the settled state rather than an
      // error the customer can do nothing about.
      return json(200, {
        success: true,
        already_settled: true,
        extra_time_minutes: approvedExtraMinutes(bd),
        extra_time_cents: approvedExtraCents(bd),
      });
    }

    const decidedAt = new Date().toISOString();
    const nextBd: Record<string, unknown> = {
      ...bd,
      extra_time: { ...request, status: approve ? 'approved' : 'declined', decided_at: decidedAt },
    };

    if (approve) {
      // Re-check the cap HERE too. The helper's request passed it when it was
      // made, but a second request could have been approved in between.
      const totalMinutes = approvedExtraMinutes(bd) + request.minutes;
      if (totalMinutes > EXTRA_TIME_MAX_MINUTES) {
        return bad(409, 'That would go past the extra-time limit for one booking.');
      }
      nextBd.extra_time_minutes = totalMinutes;
      nextBd.extra_time_cents = approvedExtraCents(bd) + request.cents;
    }

    const { error: updErr } = await supabase
      .from('household_bookings')
      .update({ booking_data: nextBd })
      .eq('id', bookingId);
    if (updErr) {
      console.error('[respond-extra-time] update failed', updErr);
      return bad(500, 'Could not save your answer. Please try again.');
    }

    await supabase.from('household_job_updates').insert({
      booking_id: bookingId,
      status: booking.status,
      note: approve
        ? `Customer approved ${extraTimeText(request.minutes)} extra (€${(request.cents / 100).toFixed(2)}, paid directly to the helper).`
        : `Customer declined the request for ${extraTimeText(request.minutes)} extra.`,
    });

    // Tell the helper, who is standing there waiting on the answer. Their job
    // screen polls too, but a phone in a pocket beats a screen in a bag.
    if (booking.student_id) {
      const { data: helper } = await supabase
        .from('household_helpers').select('phone').eq('user_id', booking.student_id).maybeSingle() as { data: { phone?: string | null } | null };
      if (helper?.phone) {
        void sendSms(
          helper.phone,
          approve
            ? `✅ Approved: ${extraTimeText(request.minutes)} extra on your VANO job — €${(request.cents / 100).toFixed(2)} more, paid straight to you.`
            : `The customer declined the extra ${extraTimeText(request.minutes)}. Finish what was booked and flag anything left over in the app.`,
        );
      }
    }

    return json(200, {
      success: true,
      approved: approve,
      extra_time_minutes: approve ? (nextBd.extra_time_minutes as number) : approvedExtraMinutes(bd),
      extra_time_cents: approve ? (nextBd.extra_time_cents as number) : approvedExtraCents(bd),
    });
  } catch (err) {
    console.error('[respond-extra-time] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});

// WhatsApp-first with SMS fallback — the same inlined Twilio pattern every
// other function here uses (there is deliberately no shared sender). Always
// best-effort: a dead Twilio must never fail the customer's tap.
function normalizeIrishPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('+')) return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
  if (cleaned.startsWith('00')) {
    const c = '+' + cleaned.slice(2);
    return /^\+\d{8,15}$/.test(c) ? c : null;
  }
  if (/^08[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned.slice(1);
  if (/^8[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned;
  return null;
}

async function sendSms(to: string | null | undefined, body: string): Promise<void> {
  try {
    const sid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
    const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
    const e164 = normalizeIrishPhone(to);
    if (!sid || !token || !e164) return;
    const waFrom = Deno.env.get('TWILIO_WHATSAPP_FROM')?.trim();
    const smsFrom = (Deno.env.get('TWILIO_SMS_FROM') || Deno.env.get('TWILIO_FROM_NUMBER'))?.trim();
    const params = waFrom
      ? { To: `whatsapp:${e164}`, From: waFrom.startsWith('whatsapp:') ? waFrom : `whatsapp:${waFrom}`, Body: body }
      : (Deno.env.get('VANO_SMS_ENABLED')?.trim() === 'true' && smsFrom && !smsFrom.startsWith('whatsapp:'))
        ? { To: e164, From: smsFrom, Body: body }
        : null;
    if (!params) return;
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
  } catch (e) {
    console.warn('[respond-extra-time] notify failed', e);
  }
}
