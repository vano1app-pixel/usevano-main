/** Convert a display name to a URL-safe slug. e.g. "Sinéad Ní Fhaoláin" → "sinead-ni-fhaolain" */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
