import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// GDPR "right to erasure" for a household helper, from /student-account.
// Auth: phone number verified against helper_id (same model as
// cancel-helper-subscription) PLUS an explicit confirm token ("DELETE").
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

const normalizePhone = (p: string) => p.replace(/[\s\-().+]/g, '').replace(/^0/, '353');
const phonesMatch = (a: string, b: string) => {
  const na = normalizePhone(a), nb = normalizePhone(b);
  return na === nb || na.endsWith(nb) || nb.endsWith(na);
};

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

    const body = await req.json().catch(() => ({})) as { helper_id?: string; phone?: string; confirm?: string };
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
    if (helper.status === 'deleted') return ok({ deleted: true }); // idempotent

    // Guard 1 — active job in progress. Deleting mid-job would strand a paying
    // customer, so refuse until it's finished or cancelled.
    const { count: activeJobs } = await supabase
      .from('household_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_helper_id', helper.id)
      .in('status', ACTIVE_JOB_STATUSES);
    if ((activeJobs ?? 0) > 0) {
      return bad(409, 'You have a job in progress. Please finish or cancel it before deleting your account.');
    }

    // Guard 2 — unpaid earnings owed. Don't let a helper delete away money we
    // still owe them (and then wipe the Stripe account it would pay to).
    const { data: pendingPayouts } = await supabase
      .from('household_payouts')
      .select('amount_cents')
      .eq('helper_id', helper.id)
      .eq('status', 'pending') as { data: Array<{ amount_cents: number }> | null };
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

    // Best-effort: delete the linked Supabase auth user (if any).
    if (helper.user_id) {
      try { await supabase.auth.admin.deleteUser(helper.user_id); }
      catch (e) { console.warn('[delete-helper-account] auth user delete failed (non-fatal):', e); }
    }

    return ok({ deleted: true });
  } catch (err) {
    console.error('[delete-helper-account] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
