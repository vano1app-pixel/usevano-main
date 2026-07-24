// Slugs only — imported eagerly by App.tsx to register the routes without
// pulling the full landing-page copy (src/content/services.ts) into the main
// bundle. Keep in step with SERVICE_LANDINGS; the ServiceLanding page 404s on
// any slug listed here that has no matching content.
export const SERVICE_LANDING_SLUGS = [
  'cleaning-galway',
  'dog-walking-galway',
  'garden-help-galway',
  'laundry-service-galway',
  // PARKED (2026-07-24): stays routed so ServiceLanding can redirect old
  // links home — the content entry moved to PARKED_SERVICE_LANDINGS.
  'moving-help-galway',
] as const;
