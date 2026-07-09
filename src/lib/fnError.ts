/**
 * Extract the REAL server message from a supabase.functions.invoke result.
 *
 * On any non-2xx response, supabase-js sets `data` to null and returns a
 * FunctionsHttpError whose `.message` is the useless generic string
 * "Edge Function returned a non-2xx status code" — the actual reason the
 * server sent (e.g. "You're owed €12.40 — get paid out first") is hidden in
 * `error.context` (the raw Response). Every call site that showed
 * `data?.error || error.message` was therefore showing robot-speak at the
 * exact moment a user needed clarity.
 *
 * Usage:
 *   const { data, error } = await supabase.functions.invoke('fn', {...});
 *   if (error || data?.error) {
 *     const msg = await extractFnError(data, error, 'Could not save. Try again.');
 *     ...show msg...
 *   }
 */
export async function extractFnError(
  data: unknown,
  error: unknown,
  fallback: string,
): Promise<string> {
  // 2xx-with-error-body path — the message is right there.
  const dataMsg = (data as { error?: string } | null)?.error;
  if (dataMsg) return dataMsg;

  // Non-2xx path — unwrap the Response hidden on error.context.
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.clone().json()) as { error?: string; message?: string } | null;
      const msg = body?.error ?? body?.message;
      if (msg && typeof msg === 'string') return msg;
    } catch { /* body not JSON / already consumed — fall through */ }
  }
  return fallback;
}
