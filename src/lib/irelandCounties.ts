/**
 * Ireland-wide location model for Vano.
 *
 * The 26 counties of the Republic of Ireland. Northern Ireland is
 * intentionally omitted — if we expand into NI later we'll add a
 * separate `NI_COUNTIES` list so callers can opt-in explicitly.
 *
 * Every freelancer ends up with either a `county` (they work locally
 * from that county) or `remote_ok = true` (they work anywhere in
 * Ireland remotely), or both (a local videographer who also takes
 * remote work). The `formatLocation` helper below turns those two
 * fields into the single string we display on cards.
 */
export const IRELAND_COUNTIES = [
  'Carlow',
  'Cavan',
  'Clare',
  'Cork',
  'Donegal',
  'Dublin',
  'Galway',
  'Kerry',
  'Kildare',
  'Kilkenny',
  'Laois',
  'Leitrim',
  'Limerick',
  'Longford',
  'Louth',
  'Mayo',
  'Meath',
  'Monaghan',
  'Offaly',
  'Roscommon',
  'Sligo',
  'Tipperary',
  'Waterford',
  'Westmeath',
  'Wexford',
  'Wicklow',
] as const;

export type IrelandCounty = (typeof IRELAND_COUNTIES)[number];

export function isIrelandCounty(v: string | null | undefined): v is IrelandCounty {
  if (!v) return false;
  return (IRELAND_COUNTIES as readonly string[]).includes(v);
}

/**
 * Turn a freelancer's `{ county, remote_ok }` pair into a display string.
 *
 *  - Both set      → "Cork · Remote OK"  (local + accepts remote work)
 *  - County only   → "Cork"              (strictly local)
 *  - Remote only   → "Remote — Ireland"  (digital-only, no county)
 *  - Neither       → null                (hide the chip entirely; no Galway fallback)
 *
 * Returning `null` lets callers skip rendering the chip rather than
 * show a stale default string. The old "Galway area · Ireland"
 * fallback was misleading outside Galway and is retired here.
 */
export function formatLocation(args: {
  county: string | null | undefined;
  remote_ok: boolean | null | undefined;
}): string | null {
  const county = args.county?.trim();
  const remote = !!args.remote_ok;
  if (county && remote) return `${county} · Remote OK`;
  if (county) return county;
  if (remote) return 'Remote — Ireland';
  return null;
}
