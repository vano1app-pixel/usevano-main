/**
 * Client-side list of admin-owner emails. ONLY used to gate cosmetic
 * affordances (the /admin nav link visibility, admin-only delete
 * buttons on StudentsByCategory). The real admin authority is the
 * server-side user_roles table check inside useIsAdmin + every admin
 * RPC — so exposing this list doesn't grant anyone access; it just
 * makes the UI less confusing for real admins on their own devices.
 *
 * Read from VITE_ADMIN_OWNER_EMAILS (comma-separated) when set so the
 * list can vary between environments without a code change. Falls
 * back to the original owner emails baked in before this file moved
 * to env-driven configuration, which keeps older .env files working.
 */
const DEFAULT_ADMIN_OWNER_EMAILS = ['vano1app@gmail.com', 'ayushpuri1239@gmail.com'];

function loadAdminEmails(): string[] {
  const raw = import.meta.env.VITE_ADMIN_OWNER_EMAILS;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return DEFAULT_ADMIN_OWNER_EMAILS;
  }
  const parsed = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_ADMIN_OWNER_EMAILS;
}

const ADMIN_EMAILS = loadAdminEmails();

export const ADMIN_OWNER_EMAIL = ADMIN_EMAILS[0];

export function isAdminOwnerEmail(email: string | null | undefined): boolean {
  return ADMIN_EMAILS.includes(email?.trim().toLowerCase() ?? '');
}
