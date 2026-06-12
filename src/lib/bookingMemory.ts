/**
 * Remembers the customer's quick-book details (phone, address, city) in
 * localStorage so a returning customer books in two taps instead of
 * re-typing everything. Saved the moment we hand off to Stripe checkout —
 * that's the strongest signal the details are real.
 *
 * Privacy: this is the customer's own device and the booking sheets show a
 * visible "clear" affordance whenever remembered details are prefilled.
 */

const KEY = 'vano_booking_memory_v1';

export interface BookingMemory {
  phone:    string;
  address?: string;
  lat?:     number;
  lng?:     number;
  city?:    string;
  /** Last booked job — powers the one-tap "book your usual" shortcut. */
  lastCategory?: string;
  lastSize?:     string;
  savedAt:  number;
}

/** Details older than this are stale (people move, change numbers). */
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 180; // ~6 months

export function loadBookingMemory(): BookingMemory | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BookingMemory;
    if (!parsed || typeof parsed.phone !== 'string' || !parsed.phone) return null;
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveBookingMemory(details: Omit<BookingMemory, 'savedAt'>): void {
  try {
    const prev = loadBookingMemory();
    const next: BookingMemory = {
      // Keep previously remembered fields (e.g. address) when the current
      // sheet doesn't collect them — the extra-services sheet has no address.
      ...prev,
      ...Object.fromEntries(
        Object.entries(details).filter(([, v]) => v !== undefined && v !== ''),
      ),
      phone: details.phone,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full / private mode — booking still works without memory */
  }
}

export function clearBookingMemory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
