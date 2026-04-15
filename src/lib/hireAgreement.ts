/**
 * Creating a formal "✓ Hired" record from the conversation header.
 *
 * Until this existed, business + freelancer would agree in chat and the
 * thread would just… keep being a chat. Now one click drops a row into
 * hire_agreements, a DB trigger posts a system message in the thread,
 * and we have an artifact to build reviews / repeat-hire flows on top of.
 */
import { supabase } from '@/integrations/supabase/client';
import { track } from '@/lib/track';

export class HireAgreementError extends Error {}

export interface CreateHireAgreementInput {
  businessId: string;
  freelancerId: string;
  conversationId: string;
  brief?: string | null;
  hourlyRate?: number | null;
  totalBudget?: number | null;
}

export async function createHireAgreement(
  input: CreateHireAgreementInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('hire_agreements' as any)
    .insert({
      business_id: input.businessId,
      freelancer_id: input.freelancerId,
      conversation_id: input.conversationId,
      brief: input.brief ?? null,
      hourly_rate: input.hourlyRate ?? null,
      total_budget: input.totalBudget ?? null,
      status: 'active',
    } as any)
    .select('id')
    .single();
  if (error || !data) {
    // 23505 is Postgres unique-violation — treat "already hired" as a
    // success-with-no-op so the button is idempotent from the user's view.
    if ((error as any)?.code === '23505') {
      throw new HireAgreementError('You already marked this freelancer as hired.');
    }
    throw new HireAgreementError(error?.message || 'Could not mark as hired.');
  }
  track('hire_agreement_created', {
    conversation_id: input.conversationId,
    freelancer_id: input.freelancerId,
  });
  return { id: (data as any).id as string };
}

/** Load the active agreement for a conversation, if any. */
export async function getActiveHireAgreement(
  conversationId: string,
): Promise<{ id: string; business_id: string; freelancer_id: string; created_at: string } | null> {
  const { data } = await supabase
    .from('hire_agreements' as any)
    .select('id, business_id, freelancer_id, created_at')
    .eq('conversation_id', conversationId)
    .eq('status', 'active')
    .maybeSingle();
  return (data as any) || null;
}
