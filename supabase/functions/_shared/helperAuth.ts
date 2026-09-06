import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Same loosely-typed client every function builds; keeps the helpers callable
// from any of them without generic gymnastics.
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;
void createClient;

// A helper's Supabase auth user — the ONE bridge between the phone-gated
// helper row and the session the dashboard / job screen / claim need.
//
// Helpers are created WITHOUT an auth user (create-helper-application). Until
// 2026-09-06 one was provisioned only when they accepted a job by link
// (accept-job). Now the phone OTP gate (student-account-otp) provisions the
// same way and also mints a session, so a helper who signs in with their phone
// can open Find, claim, and work a job inside the app with no second login.
//
// SECURITY (carried over from accept-job): the helper-row email is NOT proof
// of identity — a helper can set it to any address. We only provision or link
// BY EMAIL when the helper has proven they own it (student_email_verified).
// Otherwise the auth user is keyed on the helper's own phone, and — because
// generateLink needs an email — given a synthetic, confirmed address on our
// own domain that nobody can receive mail at. That address is an identifier,
// not a channel.

export interface HelperAuthRow {
  id: string;
  user_id: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  student_email_verified: boolean | null;
}

export function syntheticHelperEmail(helperId: string): string {
  return `helper-${helperId}@helpers.vanojobs.com`;
}

/** Bounded page scan for an existing auth user by (verified) email. */
export async function findUserIdByEmail(supabase: SupabaseClient, email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u: { id: string; email?: string | null }) => (u.email ?? '').toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Returns the helper's auth user id, provisioning one if the row has none.
 *  Never throws; null means "couldn't" (caller falls back to its old path). */
export async function ensureHelperAuthUser(supabase: SupabaseClient, helper: HelperAuthRow): Promise<string | null> {
  if (helper.user_id) return helper.user_id;
  let userId: string | null = null;
  const emailVerified = helper.student_email_verified === true;
  const trustedEmail = emailVerified && helper.email ? helper.email.trim().toLowerCase() : null;
  try {
    const createArgs: Record<string, unknown> = {
      email_confirm: true,
      user_metadata: { household_helper_id: helper.id, name: helper.name },
    };
    if (trustedEmail) {
      createArgs.email = trustedEmail;
    } else {
      // Synthetic, confirmed, on our domain: an identifier so magic-link
      // sessions can be minted, never a mailbox. Phone rides along when known.
      createArgs.email = syntheticHelperEmail(helper.id);
      if (helper.phone) { createArgs.phone = helper.phone; createArgs.phone_confirm = true; }
    }
    const { data: created, error: createErr } = await supabase.auth.admin.createUser(createArgs as never);
    if (!createErr && created?.user?.id) {
      userId = created.user.id;
    } else if (createErr) {
      // Almost always "already registered" — link the existing account. Only
      // ever by an email the helper has proven (or our own synthetic one).
      userId = await findUserIdByEmail(supabase, (createArgs.email as string));
    }
    if (userId) {
      // `.is('user_id', null)`: two near-simultaneous hits could both
      // provision — the loser must never overwrite the winner's link.
      await supabase.from('household_helpers').update({ user_id: userId }).eq('id', helper.id).is('user_id', null);
      // Re-read in case we lost that race, so we return the linked id.
      const { data: fresh } = await supabase.from('household_helpers').select('user_id').eq('id', helper.id).maybeSingle() as { data: { user_id: string | null } | null };
      if (fresh?.user_id) userId = fresh.user_id;
    }
  } catch (e) {
    console.warn('[helperAuth] provision failed', e);
  }
  return userId;
}

export interface MintedSession { token_hash: string; type: 'magiclink' }

/** A one-shot magic-link token the client turns into a real session with
 *  supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }). Fail-soft. */
export async function mintHelperSession(supabase: SupabaseClient, userId: string, helperId: string): Promise<MintedSession | null> {
  try {
    const { data: u } = await supabase.auth.admin.getUserById(userId);
    let email = u?.user?.email ?? null;
    if (!email) {
      // Phone-only auth user from the old accept-job path — give it the
      // synthetic identifier so a link can be minted.
      email = syntheticHelperEmail(helperId);
      const { error: updErr } = await supabase.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (updErr) { console.warn('[helperAuth] could not set synthetic email', updErr); return null; }
    }
    const { data: link, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
    const hashed = (link as { properties?: { hashed_token?: string } } | null)?.properties?.hashed_token;
    if (error || !hashed) { console.warn('[helperAuth] generateLink failed', error); return null; }
    return { token_hash: hashed, type: 'magiclink' };
  } catch (e) {
    console.warn('[helperAuth] mint failed', e);
    return null;
  }
}
