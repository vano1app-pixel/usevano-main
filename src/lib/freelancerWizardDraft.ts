import { supabase } from '@/integrations/supabase/client';

// Server-side backup of the ListOnCommunity wizard draft, so a
// freelancer who filled Step 1 on mobile can pick up on desktop. Every
// operation is best-effort: the wizard's localStorage path stays the
// source of truth, and these helpers silently no-op on failure so a
// dropped connection or RLS hiccup never blocks the wizard.
//
// The generated Supabase Database type is refreshed by running
// `supabase gen types` against the live schema, which won't know about
// `freelancer_wizard_drafts` until the new migration is applied and the
// types are regenerated. Until then we talk to this table via an
// `any`-cast client — cleaner than scattering `as never` casts through
// every call, and scoped to this one helper so the blast radius is
// exactly these three functions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyClient: any = supabase;
const TABLE = 'freelancer_wizard_drafts';
//
// Staleness window — we only rehydrate from the server row if it was
// updated in the last SERVER_DRAFT_MAX_AGE_MS. Prevents a six-month-old
// draft from ambushing someone who opened the wizard intending to start
// fresh. Seven days matches the "I'll come back to this tomorrow" use
// case without trapping long-abandoned drafts.
export const SERVER_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type ServerDraftLoadResult =
  | { kind: 'fresh'; draftJson: string; updatedAt: string }
  | { kind: 'none' };

export async function loadServerDraft(userId: string): Promise<ServerDraftLoadResult> {
  try {
    const { data, error } = await anyClient
      .from(TABLE)
      .select('draft_data, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return { kind: 'none' };

    const updatedAtMs = Date.parse((data.updated_at as string) || '');
    if (!Number.isFinite(updatedAtMs)) return { kind: 'none' };
    if (Date.now() - updatedAtMs > SERVER_DRAFT_MAX_AGE_MS) return { kind: 'none' };

    const payload = data.draft_data;
    // The wizard stores a JSON-serialized string in localStorage; we keep
    // the server column as jsonb for queryability but mirror the same
    // shape on write. Accept both possibilities here.
    const draftJson = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
    if (!draftJson || draftJson === '{}' || draftJson === 'null') return { kind: 'none' };
    return { kind: 'fresh', draftJson, updatedAt: data.updated_at as string };
  } catch (err) {
    console.warn('[wizard-draft] load failed', err);
    return { kind: 'none' };
  }
}

export async function saveServerDraft(userId: string, draftJson: string): Promise<void> {
  try {
    // draftJson is already-serialized from the wizard; parse once so it
    // lands as jsonb. If parsing fails we save an empty object rather
    // than crashing the autosave path.
    let parsed: unknown = {};
    try { parsed = JSON.parse(draftJson); } catch { parsed = {}; }
    const { error } = await anyClient
      .from(TABLE)
      .upsert({ user_id: userId, draft_data: parsed }, { onConflict: 'user_id' });
    if (error) throw error;
  } catch (err) {
    // Best-effort — localStorage has already captured the same state.
    console.warn('[wizard-draft] save failed', err);
  }
}

export async function clearServerDraft(userId: string): Promise<void> {
  try {
    await anyClient
      .from(TABLE)
      .delete()
      .eq('user_id', userId);
  } catch (err) {
    console.warn('[wizard-draft] clear failed', err);
  }
}
