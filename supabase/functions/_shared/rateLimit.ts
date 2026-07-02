// Shared rate-limit helper for unauthenticated edge functions.
//
// Backed by the SECURITY DEFINER `check_and_bump_rate_limit` RPC (see
// migration 20260702030000). Keyed on the caller's IP so an attacker can't
// cheaply enumerate the phone/referral lookup endpoints. Fail-OPEN: if the
// limiter errors we allow the request rather than break a legitimate lookup.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';
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
