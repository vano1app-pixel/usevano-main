/** PostgREST / Supabase errors are plain objects with `message`, `code`, `details`, `hint` — not always `Error`. */
export function getSupabaseErrorMessage(err: unknown): string {
  if (err == null) return 'Unknown error';
  if (typeof err === 'object' && err !== null) {
    const o = err as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message.length > 0) return o.message;
    if (typeof o.error_description === 'string') return o.error_description;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export function logSupabaseError(context: string, err: unknown): void {
  console.error(`[VANO] ${context}`, err);
  if (typeof err === 'object' && err !== null) {
    const o = err as Record<string, unknown>;
    if (o.code != null) console.error(`  code: ${String(o.code)}`);
    if (o.details != null) console.error(`  details: ${String(o.details)}`);
    if (o.hint != null) console.error(`  hint: ${String(o.hint)}`);
  }
}
