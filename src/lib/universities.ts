/** Single source of truth for Irish university data used across the app. */

export interface University {
  key: string;
  label: string;
  abbr: string;
  color: string;
  /** Extra lowercase patterns that should match this university (for backward compat with free-text values). */
  aliases: string[];
}

export const UNIVERSITIES: University[] = [
  { key: 'ATU',      label: 'Atlantic Technological University (ATU)',          abbr: 'ATU',  color: '#0066B3', aliases: ['atu', 'atlantic technological'] },
  { key: 'UGalway',  label: 'University of Galway',                            abbr: 'UG',   color: '#822433', aliases: ['university of galway', 'nui galway', 'nuig', 'ugalway', 'galway'] },
  { key: 'UCD',      label: 'University College Dublin (UCD)',                  abbr: 'UCD',  color: '#1A3A6B', aliases: ['ucd', 'university college dublin'] },
  { key: 'TCD',      label: 'Trinity College Dublin (TCD)',                     abbr: 'TCD',  color: '#003B8E', aliases: ['trinity', 'tcd'] },
  { key: 'DCU',      label: 'Dublin City University (DCU)',                     abbr: 'DCU',  color: '#C8102E', aliases: ['dcu', 'dublin city university'] },
  { key: 'UCC',      label: 'University College Cork (UCC)',                    abbr: 'UCC',  color: '#002147', aliases: ['ucc', 'university college cork'] },
  { key: 'UL',       label: 'University of Limerick (UL)',                      abbr: 'UL',   color: '#003087', aliases: ['university of limerick', 'ul '] },
  { key: 'MU',       label: 'Maynooth University (MU)',                         abbr: 'MU',   color: '#4A1942', aliases: ['maynooth'] },
  { key: 'TUDublin', label: 'Technological University Dublin (TU Dublin)',      abbr: 'TUD',  color: '#EA1D24', aliases: ['tu dublin', 'tudublin', 'technological university dublin'] },
  { key: 'SETU',     label: 'South East Technological University (SETU)',       abbr: 'SETU', color: '#003478', aliases: ['setu', 'south east technological'] },
  { key: 'MTU',      label: 'Munster Technological University (MTU)',           abbr: 'MTU',  color: '#C8102E', aliases: ['mtu', 'munster technological'] },
  { key: 'DkIT',     label: 'Dundalk Institute of Technology (DkIT)',           abbr: 'DkIT', color: '#E07B00', aliases: ['dkit', 'dundalk'] },
  { key: 'Other',    label: 'Other',                                           abbr: '',     color: '#6B7280', aliases: [] },
];

/**
 * Resolve a raw university value (canonical key OR legacy free-text) to a canonical key.
 * Use this when loading from DB or drafts to normalise before passing to a Select.
 */
export function resolveUniversityKey(value: string | null | undefined): string {
  if (!value?.trim()) return '';

  // Already a canonical key?
  if (UNIVERSITIES.some((u) => u.key === value)) return value;

  // Fuzzy match against aliases. Don't skip 'Other' — a stored "Other" string
  // should still match itself.
  const lower = value.toLowerCase();
  for (const uni of UNIVERSITIES) {
    if (lower.includes(uni.key.toLowerCase())) return uni.key;
    for (const alias of uni.aliases) {
      if (lower.includes(alias)) return uni.key;
    }
  }

  // Unmatched legacy value — bucket under 'Other' so the Radix Select trigger
  // shows a real option instead of an orphaned value the dropdown can't render.
  return 'Other';
}

/** Look up a university by its canonical key (e.g. 'UGalway'). */
export function getUniversityByKey(key: string): University | undefined {
  return UNIVERSITIES.find((u) => u.key === key);
}

/**
 * Resolve a stored university value (canonical key OR legacy free-text) to style info.
 * Returns `{ abbr, color }` or null if empty.
 */
export function getUniversityStyle(value: string | null | undefined): { abbr: string; color: string } | null {
  if (!value?.trim()) return null;

  // 1. Try exact key match first (new canonical values)
  const byKey = getUniversityByKey(value);
  if (byKey) return { abbr: byKey.abbr, color: byKey.color };

  // 2. Fuzzy match against aliases (backward compat with old free-text entries)
  const lower = value.toLowerCase();
  for (const uni of UNIVERSITIES) {
    if (uni.key === 'Other') continue;
    if (lower.includes(uni.key.toLowerCase())) return { abbr: uni.abbr, color: uni.color };
    for (const alias of uni.aliases) {
      if (lower.includes(alias)) return { abbr: uni.abbr, color: uni.color };
    }
  }

  // 3. Fallback for truly unknown values
  return { abbr: value.trim().toUpperCase(), color: '#6B7280' };
}

/**
 * Resolve a stored university value to its display label.
 * Returns the full label for known universities, or the raw value for unknown ones.
 */
export function getUniversityLabel(value: string | null | undefined): string {
  if (!value?.trim()) return '';

  const byKey = getUniversityByKey(value);
  if (byKey) return byKey.label;

  // Fuzzy match
  const lower = value.toLowerCase();
  for (const uni of UNIVERSITIES) {
    if (uni.key === 'Other') continue;
    if (lower.includes(uni.key.toLowerCase())) return uni.label;
    for (const alias of uni.aliases) {
      if (lower.includes(alias)) return uni.label;
    }
  }

  return value.trim();
}
