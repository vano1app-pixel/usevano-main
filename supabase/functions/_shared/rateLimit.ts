// Shared rate-limit helper for unauthenticated edge functions.
//
// Backed by the SECURITY DEFINER `check_and_bump_rate_limit` RPC (see
// migration 20260702030000). Keyed on the caller's IP so an attacker can't
// cheaply enumerate the phone/referral lookup endpoints. Fail-OPEN: if the
// limiter errors we allow the request rather than break a legitimate lookup.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export function clientIp(req: Request): string {
  // Prefer the headers set by the trusted edge/CDN (Cloudflare's
  // cf-connecting-ip, then x-real-ip) over X-Forwarded-For. The LEFTMOST XFF
  // entry is client-supplied and spoofable, so an attacker could send a random
  // XFF on each request to get a fresh rate-limit bucket every time and defeat
  // the anti-enumeration throttle. Use XFF only as a last resort, and take the
  // LAST (closest-hop) entry, which the infra appends, not the client-claimed
  // first one.
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return 'unknown';
}

/**
 * Returns true if the request is allowed, false if it has exceeded the limit.
 * @param bucket  logical name for the endpoint (e.g. 'find-booking-by-phone')
 * @param key     per-caller key (usually the IP)
 * @param max     max requests allowed within the window
 * @param windowSeconds  the rolling window length in seconds
 */
export async function allowRequest(
  supabase: SupabaseClient,
  bucket: string,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('check_and_bump_rate_limit', {
      p_bucket: bucket,
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) return true; // fail open — never block a real user on limiter error
    return data !== false;
  } catch {
    return true;
  }
}
