// Existing private/operational URLs are still sent by notification emails and
// payment returns. They stay available, outside podcast navigation and search.
const OPERATIONAL = new Set([
  "home",
  "join",
  "find",
  "track",
  "auth",
  "account",
  "bookings",
  "student-dashboard",
  "student-account",
  "student-job",
  "accepted",
  "verify-helper",
  "household-admin",
  "helpers",
  "helper",
  "privacy",
  "terms",
  "cover",
  "safety",
  "helper-terms",
]);
export function isLegacyOperationalPath(path: string): boolean {
  return OPERATIONAL.has(path.split("/").filter(Boolean)[0]);
}

/** Auth links issued before the rebrand still return to the site root. */
export function isLegacyAuthReturn(
  path: string,
  search: string,
  hash: string,
): boolean {
  return (
    path === "/" &&
    (new URLSearchParams(search).has("code") ||
      /(?:^#|&)(?:access_token|refresh_token|error_description)=/.test(hash))
  );
}
