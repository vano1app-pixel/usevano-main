import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { phonesMatch } from "../_shared/phoneMatch.ts";
import { hasAccountAccess } from "../_shared/accountToken.ts";
import { isReviewDemoHelperPhone } from "../_shared/reviewDemo.ts";

// GDPR "right to erasure" for a household helper, from /student-account.
// Auth: phone match + the account_token minted by student-account-otp
// (phone-gate hardening, July 2026 — the most destructive action on the page
// must never ride on a guessable number) PLUS an explicit confirm ("DELETE").
//
// We ANONYMISE rather than hard-delete: bookings + payouts reference this row
// for financial/legal records that must be retained, so we strip every piece
// of personal data, take the helper out of dispatch + homepage, and leave a
// tombstone. Best-effort side cleanup: delete the Stripe Connect account,
// remove the profile photo from storage, and delete any linked auth user.
//
// Two safety guards refuse deletion (so nobody is stranded or loses money):
//   • an active job assigned to them (finish/cancel it first)
//   • unpaid earnings owed (get paid out first, or contact support)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ACTIVE_JOB_STATUSES = ['accepted', 'on_way', 'arrived', 'in_progress'];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  const ok = (data: Record<string, unknown>) =>
    new Response(JSON.stringify(data), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripeKey   = Deno.env.get('STRIPE_SECRET_KEY');

    const body = await req.json().catch(() => ({})) as { helper_id?: string; phone?: string; confirm?: string; account_token?: string };
    const { helper_id, phone, confirm } = body;
    if (!helper_id || !phone) return bad(400, 'helper_id and phone are required');
    if (confirm !== 'DELETE') return bad(400, 'Missing confirmation');

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: helper } = await supabase
      .from('household_helpers')
      .select('id, phone, photo_url, stripe_account_id, user_id, status')
      .eq('id', helper_id)
      .maybeSingle() as {
        data: {
          id: string; phone: string; photo_url: string | null;
          stripe_account_id: string | null; user_id: string | null; status: string;
        } | null;
      };

    if (!helper) return bad(404, 'Helper account not found');
    if (!phonesMatch(helper.phone, phone)) return bad(403, 'Phone number does not match');
    if (!await hasAccountAccess(body.account_token, helper.id)) {
      return bad(401, 'Your secure session expired — verify your number again on the account page.');
    }
    if (helper.status === 'deleted') return ok({ deleted: true }); // idempotent
    // App Store review demo: the reviewer is told to try this button. It must
    // succeed on screen and change NOTHING, or the next reviewer can't sign in.
    if (isReviewDemoHelperPhone(helper.phone)) return ok({ deleted: true, demo: true });

    // Guard 1 — active job in progress. Deleting mid-job would strand a paying
    // customer, so refuse until it's finished or cancelled. Bookings key the
    // helper as student_id (NOT assigned_helper_id — that column never
    // existed, so this guard silently passed on a query error and helpers
    // could delete mid-job). Fail CLOSED on a query error for the same reason.
    // Both guards key on the helper's AUTH user id — that is what
    // household_bookings.student_id / household_payouts.student_id hold. (They
    // compared household_helpers.id until 2026-09-06, so they never matched
    // and silently passed.) No auth user ⇒ they can't have taken a job.
    const { count: activeJobs, error: activeErr } = helper.user_id ? await supabase
      .from('household_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', helper.user_id)
      .in('status', ACTIVE_JOB_STATUSES) : { count: 0, error: null };
    if (activeErr) {
      console.error('[delete-helper-account] active-job guard failed', activeErr);
      return bad(500, 'Could not check your active jobs — try again in a minute.');
    }
    if ((activeJobs ?? 0) > 0) {
      return bad(409, 'You have a job in progress. Please finish or cancel it before deleting your account.');
    }

    // Guard 2 — unpaid earnings owed. Don't let a helper delete away money we
    // still owe them (and then wipe the Stripe account it would pay to).
    // household_payouts keys the helper as student_id too.
    const { data: pendingPayouts, error: payoutsErr } = helper.user_id ? await supabase
      .from('household_payouts')
      .select('amount_cents')
      .eq('student_id', helper.user_id)
      .eq('status', 'pending') as { data: Array<{ amount_cents: number }> | null; error: unknown } : { data: [], error: null };
    if (payoutsErr) {
      console.error('[delete-helper-account] payout guard failed', payoutsErr);
      return bad(500, 'Could not check your pending earnings — try again in a minute.');
    }
    const owedCents = (pendingPayouts ?? []).reduce((s, p) => s + (p.amount_cents ?? 0), 0);
    if (owedCents > 0) {
      return bad(409, `You're owed €${(owedCents / 100).toFixed(2)} in unpaid earnings. Get paid out first, or WhatsApp us and we'll sort it before you go.`);
    }

    // Best-effort: delete the Stripe Connect account.
    if (stripeKey && helper.stripe_account_id) {
      try {
        await fetch(`https://api.stripe.com/v1/accounts/${helper.stripe_account_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${stripeKey}` },
        });
      } catch (e) { console.warn('[delete-helper-account] Stripe delete failed (non-fatal):', e); }
    }

    // Best-effort: remove the profile photo from storage.
    if (helper.photo_url) {
      try {
        const marker = '/helper-photos/';
        const idx = helper.photo_url.indexOf(marker);
        if (idx !== -1) {
          const path = helper.photo_url.slice(idx + marker.length).split('?')[0];
          if (path) await supabase.storage.from('helper-photos').remove([path]);
        }
      } catch (e) { console.warn('[delete-helper-account] photo delete failed (non-fatal):', e); }
    }

    // Anonymise the row — strip every piece of PII, drop them from dispatch +
    // homepage, and satisfy NOT NULL columns (name/phone/city/areas_served)
    // with tombstones. The phone tombstone embeds the id so it stays unique.
    const { error: updErr } = await supabase
      .from('household_helpers')
      .update({
        name: 'Deleted helper',
        phone: `deleted:${helper.id}`,
        email: null,
        photo_url: null,
        bio: null,
        age: null,
        revolut_tag: null,
        identity_session_id: null,
        application_data: {},
        tutor_subjects: [],
        tutor_levels: [],
        categories: [],
        availability: [],
        areas_served: [],
        user_id: null,
        referred_by_code: null,
        stripe_account_id: null,
        stripe_payouts_enabled: false,
        show_on_homepage: false,
        is_available: false,
        status: 'deleted',
      })
      .eq('id', helper.id);
    if (updErr) {
      console.error('[delete-helper-account] anonymise failed', updErr);
      return bad(500, 'Could not delete account');
    }

    // Delete the linked Supabase auth user. Apple 5.1.1(v) means the ACCOUNT,
    // not just the profile — so this is no longer best-effort. (The bookings /
    // payouts FKs are ON DELETE SET NULL since migration 20260906100000, which
    // is what used to make this fail quietly for any helper who took a job.)
    if (helper.user_id) {
      const { error: authErr } = await supabase.auth.admin.deleteUser(helper.user_id);
      if (authErr) {
        console.error('[delete-helper-account] auth user delete failed', authErr);
        return bad(500, "Your profile is gone but the sign-in record wouldn't delete — WhatsApp us and we'll finish it by hand.");
      }
    }

    return ok({ deleted: true });
  } catch (err) {
    console.error('[delete-helper-account] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
