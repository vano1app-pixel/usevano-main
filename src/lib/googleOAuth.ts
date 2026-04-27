import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * Set in sessionStorage immediately before `signInWithOAuth({ provider: 'google' })`.
 * After redirect back to the site root (OAuth `redirectTo`), Landing runs post-OAuth routing.
 */
export const GOOGLE_OAUTH_PENDING_KEY = 'vano_oauth_pending';
export const GOOGLE_OAUTH_USER_TYPE_KEY = 'vano_oauth_user_type';

export function setGoogleOAuthIntent(userType: 'student' | 'business' | null) {
  try {
    sessionStorage.setItem(GOOGLE_OAUTH_PENDING_KEY, '1');
    if (userType) sessionStorage.setItem(GOOGLE_OAUTH_USER_TYPE_KEY, userType);
    else sessionStorage.removeItem(GOOGLE_OAUTH_USER_TYPE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearGoogleOAuthIntent() {
  try {
    sessionStorage.removeItem(GOOGLE_OAUTH_PENDING_KEY);
    sessionStorage.removeItem(GOOGLE_OAUTH_USER_TYPE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Returns true if we should run post-OAuth profile setup (user just returned from Google).
 */
export function hasGoogleOAuthPending(): boolean {
  try {
    return sessionStorage.getItem(GOOGLE_OAUTH_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Provider-agnostic: creates or patches `profiles` after any successful auth
 * flow (Google OAuth, magic-link, future OTP). Takes the resolved user_type
 * intent as an argument so callers can read from wherever it was stashed
 * (sessionStorage for Google, localStorage for magic-link).
 *
 * If `resolvedFromIntent` is null the user lands with no user_type and the
 * existing ChooseAccountType flow catches them.
 */
export async function ensureProfileAfterAuth(
  session: Session,
  resolvedFromIntent: 'student' | 'business' | null,
): Promise<void> {
  const userId = session.user.id;
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;

  // If the caller couldn't recover the intent (common on cross-device
  // magic-link clicks where the other device's localStorage is empty),
  // fall back to what we stashed on auth.users.raw_user_meta_data via
  // signInWithOtp's `options.data.user_type`.
  const metaUserType = meta.user_type;
  const intent: 'student' | 'business' | null =
    resolvedFromIntent
    ?? (metaUserType === 'student' ? 'student'
      : metaUserType === 'business' ? 'business'
      : null);

  const name =
    (meta.full_name as string | undefined) ||
    (meta.name as string | undefined) ||
    session.user.email?.split('@')[0] ||
    'User';

  // Google provides a profile picture on `user_metadata.avatar_url`; some
  // providers use `picture`. Seeding this means freelancers don't need a
  // separate avatar-upload step before the wizard — they can still replace
  // it later from /profile.
  const avatarUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url.trim()) ? meta.avatar_url.trim()
    : (typeof meta.picture === 'string' && meta.picture.trim()) ? meta.picture.trim()
    : null;

  // Race-proof profile bootstrap. The handle_new_user trigger
  // (migration 20251029164531) fires AFTER INSERT ON auth.users and
  // seeds a profiles row with display_name only — no user_type. The
  // client used to do SELECT-then-INSERT, which threw a UNIQUE
  // violation if the trigger had already committed when the SELECT
  // ran — a timing window only realistically hit when the OAuth
  // round-trip was slow (e.g. users with multiple Google accounts
  // pausing on the picker). Use upsert(ignoreDuplicates) so whoever
  // got there first keeps the row, then patch missing fields below.
  const { error: upsertErr } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        display_name: name,
        user_type: intent ?? undefined,
        avatar_url: avatarUrl ?? undefined,
      },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
  if (upsertErr) throw upsertErr;

  const { data: existing } = await supabase
    .from('profiles')
    .select('user_id, user_type, avatar_url')
    .eq('user_id', userId)
    .maybeSingle();
  if (!existing) throw new Error('Profile row missing after upsert');

  const patch: { user_type?: string; avatar_url?: string } = {};
  if (!existing.user_type && intent) patch.user_type = intent;
  if (!existing.avatar_url && avatarUrl) patch.avatar_url = avatarUrl;
  if (Object.keys(patch).length > 0) {
    const { error: upErr } = await supabase.from('profiles').update(patch).eq('user_id', userId);
    if (upErr) throw upErr;
  }

  // Student-side row. Make sure it exists (idempotent), and only seed
  // avatar_url when the row is missing one — never overwrite a custom upload
  // with OAuth metadata on re-login.
  //
  // Important: DO NOT reintroduce the old SELECT-then-INSERT pattern here.
  // Historical SELECT RLS on student_profiles hid the owner's own row when
  // community_board_status != 'approved', which made the SELECT return null
  // for anyone who'd signed up but never published. The blind INSERT that
  // followed then hit the UNIQUE(user_id) constraint, threw, and tanked the
  // whole auth-finish handler — which presented to the user as "I can't log
  // in" because Landing silently swallowed the error. Fixed the RLS in
  // migration 20260423150000, but keep the client idempotent so a similar
  // policy regression can never silently break login again.
  const isOrBecomingStudent =
    (!existing.user_type && intent === 'student') || existing.user_type === 'student';
  if (isOrBecomingStudent) {
    const { error: ensErr } = await supabase
      .from('student_profiles')
      .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (ensErr) throw ensErr;

    // Backfill the OAuth avatar only when the row doesn't already have one.
    // Guarded at the DB layer (avatar_url IS NULL OR '') so we never clobber
    // a custom upload the user set from /profile.
    if (avatarUrl) {
      await supabase
        .from('student_profiles')
        .update({ avatar_url: avatarUrl })
        .eq('user_id', userId)
        .or('avatar_url.is.null,avatar_url.eq.');
    }
  }
}

/**
 * Google-specific wrapper. Reads the user_type intent from sessionStorage
 * (where setGoogleOAuthIntent stashed it before the OAuth redirect) and
 * delegates to the provider-agnostic helper. Preserved as a named export so
 * the existing callers in finishGoogleOAuthRedirect don't need to change.
 */
export async function ensureProfileAfterGoogleOAuth(session: Session): Promise<void> {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(GOOGLE_OAUTH_USER_TYPE_KEY);
  } catch {
    /* ignore */
  }
  const resolvedFromIntent: 'student' | 'business' | null =
    stored === 'business' ? 'business' : stored === 'student' ? 'student' : null;
  return ensureProfileAfterAuth(session, resolvedFromIntent);
}
