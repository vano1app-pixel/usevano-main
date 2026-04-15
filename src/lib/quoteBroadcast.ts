/**
 * Multi-send "Get quotes from top N" — fans a single brief out to N matched
 * freelancers in parallel. See migration 20260415150000_quote_broadcasts.sql
 * for the data model.
 *
 * Semantics:
 *  - Skips freelancers the requester already has a conversation with (we
 *    don't want to drop a fresh brief into the middle of an existing chat).
 *  - One quote_broadcasts row per call; one conversation per target
 *    freelancer; the first message in each is the brief itself.
 *  - A DB trigger marks the broadcast `filled` the moment any non-requester
 *    sends a message in any of the broadcast's conversations.
 *  - Push notifications fire fire-and-forget; failures don't block the send.
 *
 * Fully client-side — no edge function required. Runs under the requester's
 * RLS so it can only create broadcasts and conversations the user owns.
 */
import { supabase } from '@/integrations/supabase/client';
import { getSupabaseProjectRef } from '@/lib/supabaseEnv';
import { track } from '@/lib/track';

export interface BroadcastInput {
  /** The hirer's brief — same text dropped into every conversation. */
  brief: string;
  /** Optional: category id for analytics + matching context. */
  category?: string | null;
  /** Optional: budget bucket id (HIRE_BUDGETS.id). */
  budget?: string | null;
  /** Optional: timeline id (HIRE_TIMELINES.id). */
  timeline?: string | null;
  /** Freelancer auth.user.id values to send to. Order matters for "top N". */
  targetFreelancerIds: string[];
}

export interface BroadcastResult {
  broadcastId: string;
  /** Number of freelancers the brief actually reached (post-dedup). */
  sentCount: number;
  /** Number of targets skipped because an existing conversation was found. */
  skippedExistingCount: number;
}

export class QuoteBroadcastError extends Error {}

export async function sendQuoteBroadcast(input: BroadcastInput): Promise<BroadcastResult> {
  const brief = input.brief.trim();
  if (brief.length < 5) throw new QuoteBroadcastError('Brief is too short.');
  if (input.targetFreelancerIds.length === 0) throw new QuoteBroadcastError('No freelancers selected.');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new QuoteBroadcastError('You need to be signed in.');
  const requesterId = session.user.id;

  // Dedup + drop self-targeting (paranoia: a freelancer browsing their own
  // card on the talent board should never broadcast to themselves).
  const targets = Array.from(new Set(input.targetFreelancerIds)).filter((id) => id !== requesterId);
  if (targets.length === 0) throw new QuoteBroadcastError('No valid freelancers to message.');

  // Identify which targets already have a conversation with this requester.
  // We skip those — surfacing the broadcast inside an in-progress chat is
  // jarring; the hirer can DM them through the existing thread.
  const { data: existingConvos } = await supabase
    .from('conversations')
    .select('id, participant_1, participant_2')
    .or(
      targets
        .map((fid) => `and(participant_1.eq.${requesterId},participant_2.eq.${fid})`)
        .concat(targets.map((fid) => `and(participant_1.eq.${fid},participant_2.eq.${requesterId})`))
        .join(','),
    );
  const alreadyChattingWith = new Set<string>();
  for (const c of existingConvos || []) {
    const other = c.participant_1 === requesterId ? c.participant_2 : c.participant_1;
    alreadyChattingWith.add(other);
  }

  const freshTargets = targets.filter((id) => !alreadyChattingWith.has(id));
  if (freshTargets.length === 0) {
    throw new QuoteBroadcastError(
      'You already have a conversation with each of these freelancers. Open Messages to follow up.',
    );
  }

  // 1. Create the broadcast row up-front so per-target conversations can
  //    reference it. target_count uses the post-dedup figure.
  const { data: broadcast, error: bErr } = await supabase
    .from('quote_broadcasts' as any)
    .insert({
      requester_id: requesterId,
      brief,
      category: input.category ?? null,
      budget_range: input.budget ?? null,
      timeline: input.timeline ?? null,
      target_count: freshTargets.length,
      status: 'open',
    } as any)
    .select('id')
    .single();
  if (bErr || !broadcast) {
    throw new QuoteBroadcastError(bErr?.message || 'Could not create broadcast.');
  }
  const broadcastId = (broadcast as any).id as string;

  // 2. For each target: create a conversation tagged with broadcast_id, then
  //    insert the brief as the first message. We do these sequentially
  //    rather than in parallel to keep RLS errors easy to attribute and to
  //    sidestep unique-constraint surprises if a parallel write created the
  //    conversation first.
  const projectId = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined) || getSupabaseProjectRef();
  let sentCount = 0;
  for (const freelancerId of freshTargets) {
    try {
      const { data: convo, error: cErr } = await supabase
        .from('conversations')
        .insert({
          participant_1: requesterId,
          participant_2: freelancerId,
          broadcast_id: broadcastId,
        } as any)
        .select('id')
        .single();
      if (cErr || !convo) {
        // eslint-disable-next-line no-console
        console.warn('Broadcast: convo create failed', freelancerId, cErr);
        continue;
      }
      const conversationId = (convo as any).id as string;

      const { error: mErr } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: requesterId, content: brief });
      if (mErr) {
        // eslint-disable-next-line no-console
        console.warn('Broadcast: first message insert failed', freelancerId, mErr);
        continue;
      }

      sentCount++;

      // Push / email notification — fire and forget.
      if (projectId && session.access_token) {
        fetch(`https://${projectId}.supabase.co/functions/v1/notify-new-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ recipient_id: freelancerId, message_preview: brief.slice(0, 140) }),
        }).catch(() => {});
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Broadcast: target failed', freelancerId, err);
    }
  }

  if (sentCount === 0) {
    // Every target failed — best-effort cancel the broadcast row so it
    // doesn't dangle as `open` forever and confuse the trigger logic.
    await supabase
      .from('quote_broadcasts' as any)
      .update({ status: 'cancelled' } as any)
      .eq('id', broadcastId);
    throw new QuoteBroadcastError('Could not send to any freelancers. Please try again.');
  }

  track('quote_broadcast_sent', {
    broadcast_id: broadcastId,
    sent_count: sentCount,
    target_count: freshTargets.length,
    category: input.category ?? null,
  });

  return {
    broadcastId,
    sentCount,
    skippedExistingCount: alreadyChattingWith.size,
  };
}
