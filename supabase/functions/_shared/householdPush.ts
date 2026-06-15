// Best-effort trigger for a customer-facing web push on a household booking
// status step. Fires the send-household-push function with the service-role
// key and swallows all errors — callers must never block the booking flow on
// push delivery. Awaiting it is optional (it resolves quickly), but most
// callers `void` it.

export type HouseholdPushStatus = 'accepted' | 'on_way' | 'arrived' | 'completed';

export async function sendHouseholdPush(
  bookingId: string,
  status: HouseholdPushStatus,
): Promise<void> {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return;
    await fetch(`${url}/functions/v1/send-household-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ booking_id: bookingId, status }),
    });
  } catch (err) {
    console.error('sendHouseholdPush failed (non-fatal):', err);
  }
}
