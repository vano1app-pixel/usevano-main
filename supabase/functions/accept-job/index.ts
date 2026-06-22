import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAcceptToken } from "../_shared/acceptToken.ts";

// Public one-tap accept endpoint (verify_jwt = false). A helper taps the link
// in their WhatsApp/SMS/email and claims the job in a single tap — no login.
//
// Security: the token is HMAC-signed and expiring (see _shared/acceptToken.ts),
// scoped to one booking + one helper, and delivered only to that helper. It
// authorises nothing else. The atomic claim keeps the existing race guard
// (update … where student_id IS NULL AND status='pending'), so two helpers
// tapping at once still results in exactly one winner.
//
// Helpers without an account are silently provisioned one on first tap (and
// their helper row is linked), so the link works for everyone — which also
// closes the gap where most helpers had no user_id and couldn't be assigned.

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring',
  handyman: 'Handyman', plumbing: 'Plumbing help',
  'furniture-assembly': 'Furniture assembly', 'tech-help': 'Tech help',
  'wait-delivery': 'Wait for delivery', other: 'General help',
};

// Result is shown by redirecting into the SPA's public /accepted route rather
// than returning inline HTML. A redirect renders reliably in every browser and
// in-app webview, whereas some in-app browsers ignore the text/html content-type
// and display the markup as raw source (the bug this replaces). The page reads
// `status` (+ optional job/cat/city) from the query string — see
// src/pages/JobAccepted.tsx.
type AcceptStatus = 'claimed' | 'mine' | 'taken' | 'expired' | 'notfound' | 'login';

function redirect(
  siteUrl: string,
  status: AcceptStatus,
  opts: { job?: string; cat?: string; city?: string | null } = {},
): Response {
  const params = new URLSearchParams({ status });
  if (opts.job) params.set('job', opts.job);
  if (opts.cat) params.set('cat', opts.cat);
  if (opts.city) params.set('city', opts.city);
  return new Response(null, {
    status: 303,
    headers: { Location: `${siteUrl}/accepted?${params.toString()}` },
  });
}

// Best-effort email → existing auth user id. Lets a helper who already had an
// account (e.g. they once booked as a customer) but whose helper row was never
// linked still claim in one tap, instead of being bounced to the login page.
// Bounded page scan; returns null (→ login fallback) if not found.
async function findUserIdByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) return null; // last page reached
  }
  return null;
}

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const siteUrl     = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
  const supabase = createClient(supabaseUrl, serviceKey);

  const token = new URL(req.url).searchParams.get('t') ?? '';
  const payload = await verifyAcceptToken(token);
  if (!payload) {
    return redirect(siteUrl, 'expired');
  }

  const { b: bookingId, h: helperId } = payload;

  // Booking must still be open.
  const { data: booking } = await supabase
    .from('household_bookings')
    .select('id, status, student_id, category, city')
    .eq('id', bookingId)
    .maybeSingle() as { data: { id: string; status: string; student_id: string | null; category: string; city: string | null } | null };

  if (!booking) return redirect(siteUrl, 'notfound');
  const catLabel = CATEGORY_LABELS[booking.category] ?? 'job';

  // Defence-in-depth: a one-tap token is only ever issued to an APPROVED helper
  // (dispatch filters on status='approved'), but a helper can be suspended,
  // cancelled or removed after their offer went out. Re-check at claim time so a
  // stale link from a since-removed/blocked helper can't claim a job. A missing
  // row (deleted helper) is treated the same. 'expired' reads honestly as "this
  // link no longer works".
  const { data: helperRow } = await supabase
    .from('household_helpers').select('status').eq('id', helperId).maybeSingle() as { data: { status: string } | null };
  if (!helperRow || helperRow.status !== 'approved') {
    return redirect(siteUrl, 'expired');
  }

  if (booking.status !== 'pending' || booking.student_id) {
    // "Mine" if the token's user matches, or this helper's own offer is the one
    // that was accepted (covers helpers who had no user_id in the token).
    let mine = !!payload.u && booking.student_id === payload.u;
    if (!mine) {
      const { data: ownOffer } = await supabase
        .from('household_job_offers')
        .select('status')
        .eq('booking_id', bookingId)
        .eq('helper_id', helperId)
        .maybeSingle() as { data: { status: string } | null };
      mine = ownOffer?.status === 'accepted';
    }
    return mine
      ? redirect(siteUrl, 'mine', { job: bookingId, cat: catLabel, city: booking.city })
      : redirect(siteUrl, 'taken', { cat: catLabel });
  }

  // Resolve the helper's auth user id — provision one if they don't have an
  // account yet, so the link works for every helper.
  let userId = payload.u ?? null;
  if (!userId) {
    const { data: helper } = await supabase
      .from('household_helpers')
      .select('id, user_id, email, phone, name')
      .eq('id', helperId)
      .maybeSingle() as { data: { id: string; user_id: string | null; email: string | null; phone: string | null; name: string | null } | null };

    userId = helper?.user_id ?? null;

    if (!userId && helper) {
      try {
        const createArgs: Record<string, unknown> = { email_confirm: true, user_metadata: { household_helper_id: helper.id, name: helper.name } };
        if (helper.email) createArgs.email = helper.email.trim().toLowerCase();
        else if (helper.phone) { createArgs.phone = helper.phone; createArgs.phone_confirm = true; }
        if (createArgs.email || createArgs.phone) {
          const { data: created, error: createErr } = await supabase.auth.admin.createUser(createArgs as never);
          if (!createErr && created?.user?.id) {
            userId = created.user.id;
          } else if (createErr && helper.email) {
            // createUser failed — almost always because the email is already
            // registered. Recover by linking that existing account so the
            // one-tap claim still works for returning users.
            userId = await findUserIdByEmail(supabase, helper.email);
          }
          if (userId) {
            await supabase.from('household_helpers').update({ user_id: userId }).eq('id', helper.id);
          }
        }
      } catch (e) {
        console.warn('[accept-job] provision failed', e);
      }
    }
  }

  if (!userId) {
    // Couldn't auto-provision (no email/phone, or it already exists) — let them
    // claim the normal way after a quick login.
    return redirect(siteUrl, 'login', { job: bookingId, cat: catLabel });
  }

  // Atomic claim — only one helper can flip pending → accepted.
  const { data: claimed } = await supabase
    .from('household_bookings')
    .update({ student_id: userId, status: 'accepted' })
    .eq('id', bookingId)
    .is('student_id', null)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (!claimed) {
    return redirect(siteUrl, 'taken', { cat: catLabel });
  }

  // Mark this helper's offer accepted (best-effort; supabase returns {error}
  // rather than throwing, so this never blocks the success page).
  await supabase.from('household_job_offers')
    .update({ status: 'accepted' })
    .eq('booking_id', bookingId)
    .eq('helper_id', helperId);

  // Fire the same post-accept flow the in-app accept uses: customer pay-link +
  // "your helper is confirmed" notification + the 'accepted' job update.
  // Internal service-role path (x-internal-accept) so it doesn't need a user JWT.
  fetch(`${supabaseUrl}/functions/v1/notify-household-accepted`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceKey}`, 'x-internal-accept': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ booking_id: bookingId }),
  }).catch(() => {});

  console.log(`[accept-job] booking ${bookingId} claimed by helper ${helperId} (user ${userId})`);
  return redirect(siteUrl, 'claimed', { job: bookingId, cat: catLabel, city: booking.city });
});
