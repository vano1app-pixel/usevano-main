/**
 * Derives the booking "area" (city/town) from an address, so customers never
 * have to pick Galway/Sligo/etc. manually — the Eircode or address they type
 * already knows. Dispatch matches helper city exactly, then falls back to a
 * platform-wide search, so any reasonable town name works here.
 */

export interface AddressLocality {
  suburb?:  string;
  village?: string;
  town?:    string;
  city?:    string;
  county?:  string;
}

// Fallback when the geocoder gives coords but no usable locality text.
const CITY_CENTERS: { name: string; lat: number; lng: number }[] = [
  { name: 'Galway',    lat: 53.2707, lng: -9.0568 },
  { name: 'Dublin',    lat: 53.3498, lng: -6.2603 },
  { name: 'Cork',      lat: 51.8985, lng: -8.4756 },
  { name: 'Limerick',  lat: 52.6638, lng: -8.6267 },
  { name: 'Sligo',     lat: 54.2766, lng: -8.4761 },
  { name: 'Waterford', lat: 52.2593, lng: -7.1101 },
];
const NEAR_KM = 30;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clean(raw: string): string {
  let s = raw.trim().replace(/^(County|Co\.?)\s+/i, '');
  // "Galway City" / "Cork City" → "Galway" / "Cork"
  s = s.replace(/\s+City$/i, '');
  // Title-case each word so it matches helper-registered cities ("galway" → "Galway")
  s = s.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return s;
}

/** Best-effort area from geocoder locality parts, falling back to the nearest
 *  known city centre when only coordinates are available. */
export function deriveArea(
  locality: AddressLocality | null | undefined,
  coords?: { lat: number; lng: number } | null,
): string | null {
  for (const candidate of [locality?.city, locality?.town, locality?.county]) {
    if (candidate && candidate.trim().length >= 3) return clean(candidate);
  }
  if (coords) {
    let best: { name: string; km: number } | null = null;
    for (const c of CITY_CENTERS) {
      const km = haversineKm(coords.lat, coords.lng, c.lat, c.lng);
      if (km <= NEAR_KM && (!best || km < best.km)) best = { name: c.name, km };
    }
    if (best) return best.name;
  }
  return null;
}
