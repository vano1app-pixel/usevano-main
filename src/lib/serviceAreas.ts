// FRONTEND MIRROR of supabase/functions/_shared/serviceAreas.ts.
//
// Neighbourhood-level areas — "Salthill", "Mervue" — for every surface a
// helper sees BEFORE they've claimed a job (owner call 2026-07-30: "don't
// show the eircode till the helper accepts, just give them a roundabout
// area"). The canonical table + the full rationale live in the _shared
// module; serviceAreas.test.ts holds the two copies in lock-step, exactly
// like the pricing tables. Edge functions can't be imported by the browser
// bundle, which is why this mirror exists at all.
//
// THE INVARIANT (identical in both copies): these functions can only return
// a name from the fixed table, or the city, or a safe generic. They NEVER
// echo any part of a typed address — address matching is allowlist-only.

export interface ServiceArea {
  name: string;
  lat: number;
  lng: number;
}

/**
 * Galway city + commuter areas, approximate centroids. Deliberately
 * neighbourhood-grained: no estates, no streets. Approximations are fine and
 * intentional — the whole point is to be roughly right, never precise.
 * Add areas as coverage grows; keep both copies of this file in step.
 */
export const SERVICE_AREAS: ServiceArea[] = [
  { name: 'City Centre',   lat: 53.2724, lng: -9.0490 },
  { name: 'Woodquay',      lat: 53.2762, lng: -9.0530 },
  { name: 'Bohermore',     lat: 53.2765, lng: -9.0445 },
  { name: 'Terryland',     lat: 53.2836, lng: -9.0453 },
  { name: 'Ballinfoyle',   lat: 53.2884, lng: -9.0530 },
  { name: 'Headford Road', lat: 53.2846, lng: -9.0505 },
  { name: 'Castlegar',     lat: 53.2958, lng: -9.0330 },
  { name: 'Menlo',         lat: 53.2900, lng: -9.0300 },
  { name: 'Mervue',        lat: 53.2812, lng: -9.0272 },
  { name: 'Ballybane',     lat: 53.2830, lng: -9.0130 },
  { name: 'Renmore',       lat: 53.2742, lng: -9.0132 },
  { name: 'Doughiska',     lat: 53.2828, lng: -8.9930 },
  { name: 'Roscam',        lat: 53.2778, lng: -8.9880 },
  { name: 'Oranmore',      lat: 53.2690, lng: -8.9210 },
  { name: 'Claregalway',   lat: 53.3400, lng: -8.9450 },
  { name: 'Newcastle',     lat: 53.2790, lng: -9.0640 },
  { name: 'Shantalla',     lat: 53.2758, lng: -9.0668 },
  { name: 'Westside',      lat: 53.2762, lng: -9.0732 },
  { name: 'Rahoon',        lat: 53.2760, lng: -9.0872 },
  { name: 'Salthill',      lat: 53.2607, lng: -9.0800 },
  { name: 'Knocknacarra',  lat: 53.2680, lng: -9.1080 },
  { name: 'Barna',         lat: 53.2494, lng: -9.1519 },
];

/** How close a point must be to a centroid to take its name. ~2 km keeps the
 *  label honest at neighbourhood scale — beyond it we say the city instead of
 *  guessing a name that would send a helper to the wrong side of town. */
export const AREA_MATCH_KM = 2;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Nearest known area name within AREA_MATCH_KM, else null. Coordinates-only
 *  and deterministic — this is the primary path. */
export function areaFromCoords(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) return null;
  let best: { name: string; km: number } | null = null;
  for (const a of SERVICE_AREAS) {
    const km = haversineKm(lat, lng, a.lat, a.lng);
    if (km <= AREA_MATCH_KM && (!best || km < best.km)) best = { name: a.name, km };
  }
  return best?.name ?? null;
}

/**
 * ALLOWLIST-ONLY address fallback for bookings with no coordinates: does the
 * typed address mention a known area? Returns that area's canonical name —
 * never any other part of the string, so a house number or street can't ride
 * out through this path. Longest names are tested first so "Headford Road"
 * wins over a stray "Road" style partial.
 */
export function areaFromAddressText(address: string | null | undefined): string | null {
  if (typeof address !== 'string' || !address.trim()) return null;
  const hay = address.toLowerCase();
  const byLength = [...SERVICE_AREAS].sort((a, z) => z.name.length - a.name.length);
  for (const a of byLength) {
    const needle = a.name.toLowerCase();
    // Word-boundary match so "Barna" doesn't fire inside "Barnacle Road".
    const re = new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`, 'i');
    if (re.test(hay)) return a.name;
  }
  return null;
}

/**
 * THE ONE FUNCTION EVERY PRE-ACCEPT SURFACE SHOULD CALL. Coordinates first,
 * then the allowlist address check, then the city, then a safe generic.
 * Guaranteed never to contain street-level detail.
 */
export function approxAreaLabel(
  opts: { lat?: number | null; lng?: number | null; address?: string | null; city?: string | null },
): string {
  const byCoords = areaFromCoords(opts.lat, opts.lng);
  if (byCoords) return byCoords;
  const byText = areaFromAddressText(opts.address);
  if (byText) return byText;
  const city = (opts.city ?? '').trim();
  // The city is customer-chosen from a short chip list, not free-typed prose —
  // but cap it anyway so nothing long can ride out through this path.
  if (city && city.length <= 40) return city;
  return 'Galway area';
}
