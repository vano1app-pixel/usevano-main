/**
 * Shared conversation primitives used by QuoteModal, HireNowModal, and
 * quoteBroadcast. Three independent call-sites were each rolling their own
 * "find or create conversation + send first message + fire push" — that's
 * copy-paste drift waiting to happen. Collapsing them here keeps the
 * ordering + error handling consistent across all hire entry points.
 */
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getSupabaseProjectRef } from '@/lib/supabaseEnv';

/** Find an existing 1:1 conversation between the two users, or create one. */
export async function findOrCreateConversation(
  userA: string,
  userB: string,
  options: { broadcastId?: string | null } = {},
): Promise<string> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .or(
      `and(participant_1.eq.${userA},participant_2.eq.${userB}),` +
        `and(participant_1.eq.${userB},participant_2.eq.${userA})`,
    )
    .maybeSingle();

  if (existing?.id) return existing.id;

  const payload: Record<string, unknown> = {
    participant_1: userA,
    participant_2: userB,
  };
  if (options.broadcastId) payload.broadcast_id = options.broadcastId;

  const { data: created, error } = await supabase
    .from('conversations')
    .insert(payload as any)
    .select('id')
    .single();
  if (error || !created) {
    throw error || new Error('Could not create conversation');
  }
  return created.id;
}

/**
 * Insert the first message of a thread. Separate from findOrCreateConversation
 * so the broadcast helper can fan one message out over many conversations.
 * Updates the conversation's updated_at so the thread sorts to the top.
 */
export async function insertMessage(
  conversationId: string,
  senderId: string,
  content: string,
): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, content });
  if (error) throw error;
  // Fire-and-forget — the thread still works if this fails, it just won't
  // resort in /messages until the next message lands.
  void supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);
}

/**
 * Fire the `notify-new-message` edge function for a recipient. Fire-and-forget
 * by design — push notifications are a nice-to-have, not a correctness
 * concern. Never throws.
 *
 * Retry logic: up to 3 attempts with exponential backoff (500ms, 1500ms) on
 * network errors and 5xx responses. Was previously a single best-effort fetch,
 * which meant one transient blip = permanently missed notification. 4xx
 * responses (e.g. recipient has no active push subscription) are NOT retried.
 */
const PUSH_RETRY_DELAYS_MS = [500, 1500];

export function firePushNotification(
  session: Session | null,
  recipientId: string,
  messagePreview: string,
): void {
  if (!session?.access_token) return;
  const projectId =
    (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined) ||
    getSupabaseProjectRef();
  if (!projectId) return;

  const url = `https://${projectId}.supabase.co/functions/v1/notify-new-message`;
  const body = JSON.stringify({
    recipient_id: recipientId,
    message_preview: messagePreview.slice(0, 140),
  });
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };

  void (async () => {
    for (let attempt = 0; attempt <= PUSH_RETRY_DELAYS_MS.length; attempt++) {
      try {
        const res = await fetch(url, { method: 'POST', headers, body });
        // 2xx: done. 4xx: recipient likely lacks a push subscription —
        // retrying won't help, give up silently. 5xx / network: retry.
        if (res.ok) return;
        if (res.status >= 400 && res.status < 500) return;
      } catch {
        /* network error — fall through to backoff */
      }
      const nextDelay = PUSH_RETRY_DELAYS_MS[attempt];
      if (nextDelay === undefined) return; // exhausted
      await new Promise((resolve) => setTimeout(resolve, nextDelay));
    }
  })();
}

/**
 * One-shot: ensure a conversation exists, post a first message, fire a push
 * notification. The canonical "send a first message to someone" call used by
 * QuoteModal and the broadcast fan-out.
 */
export async function sendFirstMessage(args: {
  session: Session;
  recipientId: string;
  content: string;
  broadcastId?: string | null;
}): Promise<{ conversationId: string }> {
  const conversationId = await findOrCreateConversation(
    args.session.user.id,
    args.recipientId,
    { broadcastId: args.broadcastId ?? null },
  );
  await insertMessage(conversationId, args.session.user.id, args.content);
  firePushNotification(args.session, args.recipientId, args.content);
  return { conversationId };
}
