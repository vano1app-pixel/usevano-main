import { supabase } from '@/integrations/supabase/client';

// Typed client for the helper's Find feed + the in-app claim. The shapes
// mirror supabase/functions/find-open-orders and claim-order exactly.

export interface OpenOrder {
  id: string;
  category: string;
  label: string;
  area: string;
  size_label: string | null;
  extra_label: string | null;
  earn_cents: number;
  fee_note: 'You keep 100%';
  created_at: string;
  scheduled_at: string | null;
  when_label: string;
  distance_km: number | null;
  approx_lat: number | null;
  approx_lng: number | null;
  customer_rep: { paid_jobs?: number; unpaid_reports?: number; stars?: number } | null;
  tags: string[];
  kit_required: string[];
}

export interface FindOrdersQuery {
  lat?: number;
  lng?: number;
  radius_km?: number;
  q?: string;
  category?: string;
  min_cents?: number;
  when?: 'now' | 'today' | 'any';
}

export interface FindOrdersResult {
  orders: OpenOrder[];
  radius_km: number;
  eligible: boolean;
  reason?: 'not_verified' | 'not_approved' | 'no_helper';
  helper: { lat: number; lng: number } | null;
}

export type ClaimStatus = 'claimed' | 'mine' | 'taken' | 'expired' | 'notfound' | 'not_eligible';

export async function findOpenOrders(q: FindOrdersQuery): Promise<FindOrdersResult> {
  const { data, error } = await supabase.functions.invoke<FindOrdersResult>('find-open-orders', { body: q });
  if (error || !data) throw new Error(error?.message ?? 'Could not load orders');
  return { ...data, orders: Array.isArray(data.orders) ? data.orders : [] };
}

export async function claimOrder(bookingId: string, pos?: { lat: number; lng: number } | null): Promise<{ status: ClaimStatus; reason?: string }> {
  const { data, error } = await supabase.functions.invoke<{ status: ClaimStatus; reason?: string; error?: string }>('claim-order', {
    body: { booking_id: bookingId, ...(pos ? { lat: pos.lat, lng: pos.lng } : {}) },
  });
  if (error || !data?.status) throw new Error(data?.error ?? error?.message ?? 'Could not claim');
  return data;
}

export const formatEuro = (cents: number) => `€${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
export const formatKm = (km: number | null) => km === null ? null : km < 1 ? `${Math.max(1, Math.round(km * 10)) * 100} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
