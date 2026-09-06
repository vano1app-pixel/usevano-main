import { isNativeApp } from '@/lib/platform';
import { supabase } from '@/integrations/supabase/client';

// The Stripe hand-off, both worlds (2026-09-06).
//
// Web: a hard navigation to Stripe's hosted page, as always — Stripe's
// success_url brings the customer back to /track.
//
// Native: the webview's origin is capacitor://localhost, which Stripe will not
// send anyone back to. So the app opens Stripe in the in-app browser
// (SFSafariViewController) and POLLS the booking through the same anonymous
// RPC the track page uses; the moment the hold lands (status leaves
// awaiting_payment) it closes the browser and lands on /track. If the
// customer closes the sheet themselves, /track's "Finish securing" card
// picks up where they left off. Nothing here can lose a booking.

export interface CheckoutHandoff {
  url: string;
  bookingId: string;
  /** Called with the in-app path to navigate to once the hand-off settles. */
  onSettled: (path: string) => void;
}

interface Poller {
  /** Returns the booking status, or null if it couldn't be read. */
  readStatus: () => Promise<string | null>;
  intervalMs?: number;
  timeoutMs?: number;
}

/** Poll until the status leaves awaiting_payment. Resolves 'secured' when the
 *  hold landed, 'timeout' otherwise. Pure, so it's testable. */
export async function waitForHold(p: Poller, signal?: { cancelled: boolean }): Promise<'secured' | 'timeout' | 'cancelled'> {
  const interval = p.intervalMs ?? 2500;
  const deadline = Date.now() + (p.timeoutMs ?? 15 * 60_000);
  while (Date.now() < deadline) {
    if (signal?.cancelled) return 'cancelled';
    const status = await p.readStatus();
    if (status && status !== 'awaiting_payment') return 'secured';
    await new Promise((r) => setTimeout(r, interval));
  }
  return 'timeout';
}

export async function openExternalCheckout(h: CheckoutHandoff, readStatus?: () => Promise<string | null>): Promise<void> {
  if (!isNativeApp()) {
    window.location.href = h.url;
    return;
  }
  const { Browser } = await import('@capacitor/browser');
  const signal = { cancelled: false };
  const trackPath = `/track/${h.bookingId}`;
  // If they dismiss Stripe's sheet, land on /track — its card finishes the job.
  const finished = await Browser.addListener('browserFinished', () => {
    if (!signal.cancelled) { signal.cancelled = true; h.onSettled(trackPath); }
  });
  await Browser.open({ url: h.url, presentationStyle: 'popover' });
  const status = await waitForHold({ readStatus: readStatus ?? defaultReadStatus(h.bookingId) }, signal);
  if (status === 'secured') {
    signal.cancelled = true;
    await finished.remove();
    try { await Browser.close(); } catch { /* already closed */ }
    h.onSettled(`${trackPath}?authorized=true`);
  } else if (status === 'timeout') {
    await finished.remove();
    h.onSettled(trackPath);
  }
}

function defaultReadStatus(bookingId: string): () => Promise<string | null> {
  return async () => {
    try {
      // Same untyped RPC call the track page makes (the generated types
      // predate this function).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc('get_household_booking', { p_booking_id: bookingId });
      const row = Array.isArray(data) ? data[0] : data;
      return (row as { status?: string } | null)?.status ?? null;
    } catch {
      return null;
    }
  };
}
