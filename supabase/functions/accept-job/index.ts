import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAcceptToken } from "../_shared/acceptToken.ts";
import { isReviewDemoBooking, isReviewDemoHelperPhone } from "../_shared/reviewDemo.ts";

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
  business: 'Business temp staff', shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
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
//
// 'confirm' is the BOT GATE (2026-07-29, real repro: the owner's own accept
// tap said "someone else got it"): email scanners and WhatsApp/SMS link
// previewers GET every link the moment a message lands, and this endpoint
// used to CLAIM on any GET — so the bot claimed first (as the same helper!)
// and the human's real tap fell into the taken branch. A bare GET is now
// read-only: it bounces to /accepted?status=confirm, where the SPA
// immediately re-navigates here with &go=1 (JS — which preview bots don't
// run) and THAT request claims. POST also claims, for a future in-app path.
type AcceptStatus = 'claimed' | 'mine' | 'taken' | 'expired' | 'notfound' | 'login' | 'confirm';

// The /accepted success URL. Shared so the silent-sign-in redirect_to and the
// plain fallback always point at the same place.
function acceptedUrl(
  siteUrl: string,
  status: AcceptStatus,
  opts: { job?: string; cat?: string; city?: string | null; t?: string } = {},
): string {
  const params = new URLSearchParams({ status });
  if (opts.job) params.set('job', opts.job);
  if (opts.cat) params.set('cat', opts.cat);
  if (opts.city) params.set('city', opts.city);
  // 'confirm' only: the token rides along so the SPA can bounce straight
  // back here with &go=1. Single-purpose, expiring, already in the URL the
  // helper tapped — this adds no new exposure.
  if (opts.t) params.set('t', opts.t);
  return `${siteUrl}/accepted?${params.toString()}`;
}

function redirect(
  siteUrl: string,
  status: AcceptStatus,
  opts: { job?: string; cat?: string; city?: string | null; t?: string } = {},
): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: acceptedUrl(siteUrl, status, opts) },
  });
}

// Best-effort silent sign-in: mint a magic link for the helper and redirect
// THROUGH it, so the browser establishes a session before landing on `dest` —
// the helper is signed in with no login screen after their one-tap accept, and
// stays signed in (persisted session). Returns null if it can't (no email, or
// auth misconfig); callers then fall back to a plain redirect, so the claim is
// never blocked by this.
async function signedInRedirect(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  dest: string,
): Promise<Response | null> {
  try {
    const { data: u } = await supabase.auth.admin.getUserById(userId);
    const email = u?.user?.email ?? null;
    if (!email) return null;
    const { data: link, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: dest },
    });
    const action = (link as { properties?: { action_link?: string } } | null)?.properties?.action_link;
    if (error || !action) return null;
    return new Response(null, { status: 303, headers: { Location: action } });
  } catch (e) {
    console.warn('[accept-job] silent sign-in failed', e);
    return null;
  }
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

  // Scanners often probe with HEAD before (or instead of) GET — never a claim.
  if (req.method === 'HEAD') return new Response(null, { status: 200 });

  const reqUrl = new URL(req.url);
  const token = reqUrl.searchParams.get('t') ?? '';
  // A claim only happens on a CONFIRMED hit (see the bot-gate note above).
  const confirmed = req.method === 'POST' || reqUrl.searchParams.get('go') === '1';
  const payload = await verifyAcceptToken(token);
  if (!payload) {
    return redirect(siteUrl, 'expired');
  }

  const { b: bookingId, h: helperId } = payload;

  // Booking must still be open.
  const { data: booking } = await supabase
    .from('household_bookings')
    .select('id, status, student_id, category, city, booking_data')
    .eq('id', bookingId)
    .maybeSingle() as { data: { id: string; status: string; student_id: string | null; category: string; city: string | null; booking_data: Record<string, unknown> | null } | null };

  if (!booking) return redirect(siteUrl, 'notfound');
  const catLabel = CATEGORY_LABELS[booking.category] ?? 'job';

  // Defence-in-depth: a one-tap token is only ever issued to an APPROVED,
  // ID-VERIFIED helper (dispatch filters on both), but a helper can be
  // suspended, removed, or have their verification revoked after their offer
  // went out — and pre-gate links from before the first-job ID gate shipped
  // may still be in old messages. Re-check at claim time so a stale link can't
  // claim a job. A missing row (deleted helper) is treated the same. 'expired'
  // reads honestly as "this link no longer works".
  const { data: helperRow } = await supabase
    .from('household_helpers').select('status, id_verified, phone').eq('id', helperId).maybeSingle() as { data: { status: string; id_verified: boolean | null; phone: string | null } | null };
  if (!helperRow || helperRow.status !== 'approved' || !helperRow.id_verified) {
    return redirect(siteUrl, 'expired');
  }
  // Review demo wall: demo bookings only for the demo helper, never the other way.
  if (isReviewDemoBooking(booking.booking_data) !== isReviewDemoHelperPhone(helperRow.phone)) {
    return redirect(siteUrl, 'expired');
  }

  // BOT GATE: everything up to here was read-only, so a link-preview fetch
  // costs nothing. The first human-tap GET bounces through the SPA, which
  // instantly re-navigates here with &go=1 — only that (or a POST) claims.
  if (!confirmed) {
    return redirect(siteUrl, 'confirm', { cat: catLabel, city: booking.city, t: token });
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
    if (mine) {
      // Their job already — still land them signed in so they can manage it.
      const dest = acceptedUrl(siteUrl, 'mine', { job: bookingId, cat: catLabel, city: booking.city });
      const signed = booking.student_id ? await signedInRedirect(supabase, booking.student_id, dest) : null;
      return signed ?? redirect(siteUrl, 'mine', { job: bookingId, cat: catLabel, city: booking.city });
    }
    return redirect(siteUrl, 'taken', { cat: catLabel });
  }

  // Resolve the helper's auth user id — provision one if they don't have an
  // account yet, so the link works for every helper.
  let userId = payload.u ?? null;
  if (!userId) {
    const { data: helper } = await supabase
      .from('household_helpers')
      .select('id, user_id, email, phone, name, student_email_verified')
      .eq('id', helperId)
      .maybeSingle() as { data: { id: string; user_id: string | null; email: string | null; phone: string | null; name: string | null; student_email_verified: boolean | null } | null };

    userId = helper?.user_id ?? null;

    if (!userId && helper) {
      // SECURITY: the helper-row email is NOT proof of identity — a helper can
      // set it to any address via update-helper-profile (which only drops the
      // verified flag, it doesn't stop the row being dispatchable). If we then
      // provisioned / linked an auth user from that raw email and minted a
      // magic-link session for it, a helper could point their row at a victim's
      // email (e.g. the owner's) and take over that account on one tap. So we
      // only ever provision or link BY EMAIL when the helper has PROVEN they own
      // it (student_email_verified). Unverified email ⇒ skip email entirely and
      // fall back to the helper's own phone (or the plain login page); the
      // silent sign-in can never land on an unproven identity.
      const emailVerified = helper.student_email_verified === true;
      const trustedEmail = emailVerified && helper.email ? helper.email.trim().toLowerCase() : null;
      try {
        const createArgs: Record<string, unknown> = { email_confirm: true, user_metadata: { household_helper_id: helper.id, name: helper.name } };
        if (trustedEmail) createArgs.email = trustedEmail;
        else if (helper.phone) { createArgs.phone = helper.phone; createArgs.phone_confirm = true; }
        if (createArgs.email || createArgs.phone) {
          const { data: created, error: createErr } = await supabase.auth.admin.createUser(createArgs as never);
          if (!createErr && created?.user?.id) {
            userId = created.user.id;
          } else if (createErr && trustedEmail) {
            // createUser failed — almost always because the email is already
            // registered. Recover by linking that existing account so the
            // one-tap claim still works for returning users. Gated on
            // student_email_verified above, so this can only resolve to an
            // account whose email the helper has proven they control.
            userId = await findUserIdByEmail(supabase, trustedEmail);
          }
          if (userId) {
            // `.is('user_id', null)`: two near-simultaneous hits could both
            // provision — the loser must never overwrite the winner's link
            // (a mismatched user_id vs the booking's student_id left the
            // dashboard's "my jobs" empty for the claimed job).
            await supabase.from('household_helpers').update({ user_id: userId }).eq('id', helper.id).is('user_id', null);
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

  // Atomic claim — only one helper can flip pending → accepted. accepted_at
  // (re)starts the stall clock so sweep-stalled-jobs measures lateness from
  // THIS acceptance, not the original payment.
  const { data: claimed } = await supabase
    .from('household_bookings')
    .update({ student_id: userId, status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', bookingId)
    .is('student_id', null)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (!claimed) {
    // The atomic claim lost — but to WHOM? Two of this helper's own requests
    // can race (double-tap, a retry, links in two channels), and this branch
    // used to say "someone else got it" even when the winner WAS this helper
    // — while the customer's page showed them assigned. Re-read and treat
    // own-claim as success, not defeat.
    const { data: after } = await supabase
      .from('household_bookings')
      .select('student_id')
      .eq('id', bookingId)
      .maybeSingle() as { data: { student_id: string | null } | null };
    let mineNow = !!after?.student_id && after.student_id === userId;
    if (!mineNow && after?.student_id) {
      const { data: ownOffer } = await supabase
        .from('household_job_offers')
        .select('status')
        .eq('booking_id', bookingId)
        .eq('helper_id', helperId)
        .maybeSingle() as { data: { status: string } | null };
      mineNow = ownOffer?.status === 'accepted';
    }
    if (mineNow && after?.student_id) {
      const dest = acceptedUrl(siteUrl, 'mine', { job: bookingId, cat: catLabel, city: booking.city });
      const signed = await signedInRedirect(supabase, after.student_id, dest);
      return signed ?? redirect(siteUrl, 'mine', { job: bookingId, cat: catLabel, city: booking.city });
    }
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

  // Land them signed in (magic-link handoff), falling back to the plain success
  // page if it can't be minted — so they go straight from the SMS link into a
  // logged-in dashboard with no login step, and stay signed in afterwards.
  const dest = acceptedUrl(siteUrl, 'claimed', { job: bookingId, cat: catLabel, city: booking.city });
  const signed = await signedInRedirect(supabase, userId, dest);
  return signed ?? redirect(siteUrl, 'claimed', { job: bookingId, cat: catLabel, city: booking.city });
});
