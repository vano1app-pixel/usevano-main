/**
 * Central place for Vite-exposed Supabase settings (Vercel / local .env).
 * Use VITE_SUPABASE_PUBLISHABLE_KEY (dashboard name) or legacy VITE_SUPABASE_ANON_KEY — same key value.
 */

export function getSupabaseUrl(): string {
  const raw = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return (raw || '').trim().replace(/\/+$/, '');
}

/** Publishable (anon) JWT from Supabase → Project Settings → API */
export function getSupabaseAnonKey(): string {
  const a = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();
  const b = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  return a || b || '';
}

/**
 * For URLs like https://abcdefghijklmnop.supabase.co — avoids needing VITE_SUPABASE_PROJECT_ID.
 */
export function getSupabaseProjectRef(): string | null {
  const explicit = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined)?.trim();
  if (explicit) return explicit;
  const url = getSupabaseUrl();
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function assertSupabaseEnvForBuild(): void {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error(
      'Missing Supabase env: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY). ' +
        'On Vercel: Project → Settings → Environment Variables, then redeploy. See .env.example.',
    );
  }
}
