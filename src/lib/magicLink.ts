/**
 * Passwordless magic-link auth. Complements Google OAuth — critical for
 * users in embedded in-app browsers (Fiverr / Instagram / TikTok) where
 * Google's disallowed_useragent block makes OAuth impossible. The magic
 * link lands in the user's email, which they open in a real browser.
 *
 * Flow:
 *  1. User types email + picks user_type on /auth → `sendMagicLink()`.
 *  2. We stash user_type + intent in **localStorage** (not sessionStorage
 *     like Google OAuth uses) because the user may open the email on a
 *     different device or tab, where sessionStorage wouldn't carry over.
 *  3. Supabase sends an email with a link back to `emailRedirectTo`.
 *  4. User clicks → lands on Vano with `access_token` in the URL fragment.
 *     Supabase auto-restores the session via `detectSessionInUrl`.
 *  5. Landing's on-mount effect calls `tryFinishMagicLinkRedirect()`, which
 *     reads the stashed intent, ensures the profile row exists, clears the
 *     intent, and routes the user to the right next step.
 *
 * Requires the `emailRedirectTo` URL to be allow-listed in Supabase Auth
 * settings (Auth → URL Configuration → Redirect URLs).
 */
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { isEmailVerified, resolvePostGoogleAuthDestination } from '@/lib/authSession';
import { ensureProfileAfterAuth } from '@/lib/googleOAuth';
import { getGoogleOAuthRedirectUrl } from '@/lib/siteUrl';
import { hasPendingHireBrief } from '@/lib/hireFlow';

const MAGIC_LINK_PENDING_KEY = 'vano_magiclink_pending';
const MAGIC_LINK_USER_TYPE_KEY = 'vano_magiclink_user_type';
const MAGIC_LINK_EMAIL_KEY = 'vano_magiclink_email';
// Expire stale intents after 1h so a user who abandons sign-up doesn't have
// us silently create a profile a week later when they finally click the link.
const MAGIC_LINK_MAX_AGE_MS = 60 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function clearMagicLinkIntent(): void {
  try {
    localStorage.removeItem(MAGIC_LINK_PENDING_KEY);
    localStorage.removeItem(MAGIC_LINK_USER_TYPE_KEY);
    localStorage.removeItem(MAGIC_LINK_EMAIL_KEY);
  } catch {
    /* ignore — storage blocked */
  }
}

/**
 * Send the magic link and stash the intent for profile creation on return.
 *
 * `isLogin` governs `shouldCreateUser`:
 *  - true  → login-only. If no account exists, Supabase returns an error
 *            and we surface a friendly "no account with that email" message.
 *  - false → signup-or-login. Creates a new user if needed; passes
 *            `user_type` in via our localStorage intent.
 */
export interface SendMagicLinkResult {
  ok: boolean;
  /** Populated with a user-friendly message when ok is false. */
  message?: string;
}

export async function sendMagicLink(
  email: string,
  userType: 'student' | 'business' | null,
  isLogin: boolean,
): Promise<SendMagicLinkResult> {
  const trimmed = email.trim();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, message: 'Enter a valid email address.' };
  }

  try {
    localStorage.setItem(MAGIC_LINK_PENDING_KEY, nowIso());
    localStorage.setItem(MAGIC_LINK_EMAIL_KEY, trimmed);
    if (userType) localStorage.setItem(MAGIC_LINK_USER_TYPE_KEY, userType);
    else localStorage.removeItem(MAGIC_LINK_USER_TYPE_KEY);
  } catch {
    /* ignore — intent will simply not round-trip */
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      emailRedirectTo: getGoogleOAuthRedirectUrl(),
      // On login we don't want to silently create a new account if the
      // email is wrong — shouldCreateUser=false surfaces that as an error.
      // On signup we do want auto-create (it's the whole point).
      shouldCreateUser: !isLogin,
    },
  });

  if (error) {
    clearMagicLinkIntent();
    // Map the most common cases to friendlier copy. `user_not_found`
    // appears when shouldCreateUser was false and the email has no account.
    const msg = error.message.toLowerCase();
    if (msg.includes('user not found') || msg.includes('signups not allowed')) {
      return { ok: false, message: "No account found with that email. Try signing up instead." };
    }
    if (msg.includes('rate limit') || msg.includes('too many requests')) {
      return { ok: false, message: "Too many emails. Wait a few minutes and try again." };
    }
    return { ok: false, message: error.message || 'Could not send the link.' };
  }
  return { ok: true };
}

/** Whether we have a fresh-enough magic-link intent to act on. */
export function hasMagicLinkPending(): boolean {
  try {
    const ts = localStorage.getItem(MAGIC_LINK_PENDING_KEY);
    if (!ts) return false;
    const age = Date.now() - new Date(ts).getTime();
    if (age > MAGIC_LINK_MAX_AGE_MS) {
      clearMagicLinkIntent();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Mirrors tryFinishGoogleOAuthRedirect but for magic-link. Runs on Landing
 * mount (alongside the Google variant). Returns true if it handled the
 * session (routed the user), false otherwise.
 */
export async function tryFinishMagicLinkRedirect(
  navigate: NavigateFunction,
): Promise<boolean> {
  if (!hasMagicLinkPending()) return false;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user || !isEmailVerified(session)) return false;
  try {
    let stored: string | null = null;
    try { stored = localStorage.getItem(MAGIC_LINK_USER_TYPE_KEY); } catch { /* ignore */ }
    const userType: 'student' | 'business' | null =
      stored === 'business' ? 'business' : stored === 'student' ? 'student' : null;

    await ensureProfileAfterAuth(session, userType);
    clearMagicLinkIntent();

    // Same post-auth routing as Google: if a hire brief is queued, resume
    // that flow; otherwise send them to their natural landing page.
    if (hasPendingHireBrief()) {
      navigate('/hire', { replace: true });
      return true;
    }
    const path = await resolvePostGoogleAuthDestination(session.user.id);
    navigate(path, { replace: true });
    return true;
  } catch {
    clearMagicLinkIntent();
    return false;
  }
}

/** Retrieve the email we just sent a link to — handy for "Check {email}" toast copy. */
export function getLastMagicLinkEmail(): string | null {
  try {
    return localStorage.getItem(MAGIC_LINK_EMAIL_KEY);
  } catch {
    return null;
  }
}
