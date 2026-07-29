/**
 * Colleges + the customer-facing "study line".
 *
 * "Student" is VANO's entire trust pitch, so the college a helper gave at
 * signup (required on /join) is promoted to a first-class, customer-visible
 * fact. This module is the ONE source for:
 *  - the college picker options (join form + both profile editors),
 *  - the year-of-study options (profile editors only — /join stays minimal),
 *  - the short display name ("Atlantic Technological University (ATU)" → "ATU"),
 *  - `studyLine()` — the composed one-liner shown on the profile page, the
 *    homepage helper cards and the /track helper chip:
 *    "2nd year Nursing at ATU".
 *
 * The accept-email builder (supabase/functions/notify-household-accepted)
 * mirrors this composition server-side — keep the rules in step.
 *
 * Every part is FAIL-SOFT: missing/unknown pieces just shorten the line, and
 * a helper with no study info renders exactly as before (no line at all).
 */

// Galway-first; ATU + University of Galway lead since dispatch is live there.
export const COLLEGES = [
  'University of Galway',
  'Atlantic Technological University (ATU)',
  'University College Dublin (UCD)',
  'Trinity College Dublin (TCD)',
  'University College Cork (UCC)',
  'University of Limerick (UL)',
  'Dublin City University (DCU)',
  'Maynooth University',
  'TU Dublin',
  'Munster Technological University (MTU)',
  'South East Technological University (SETU)',
  'TUS (Technological University of the Shannon)',
  'RCSI',
  'Other / not listed',
];

// Year-of-study options for the profile editors. Stored as the label string
// itself (display data, not an enum the server branches on).
export const STUDY_YEARS = [
  '1st year',
  '2nd year',
  '3rd year',
  '4th year',
  'Final year',
  'Masters',
  'PhD',
  'Erasmus / exchange',
];

/**
 * Short display name for a college. Uses the bracketed abbreviation when the
 * entry carries one ("… (ATU)" → "ATU"); when the brackets hold the LONG form
 * instead ("TUS (Technological University of the Shannon)") the part before
 * them wins. "Other / not listed" (and empty) → null so junk never renders.
 */
export function collegeShortName(college: string | null | undefined): string | null {
  const raw = (college ?? '').trim();
  if (!raw || raw === 'Other / not listed') return null;
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) {
    const before = m[1].trim();
    const inParens = m[2].trim();
    return (inParens.length <= 12 ? inParens : before) || null;
  }
  return raw;
}

/**
 * The one-line study summary a customer reads. All pieces optional:
 *  - year + course + college → "2nd year Nursing at ATU"
 *  - course + college        → "Nursing student at ATU"
 *  - year + college          → "2nd year student at ATU"
 *  - college only            → "Student at ATU"
 *  - year + course           → "2nd year Nursing student"
 *  - course only             → "Nursing student"
 *  - year only               → "2nd year student"
 *  - nothing                 → null (render nothing — never a hollow label)
 */
export function studyLine(h: {
  college?: string | null;
  course?: string | null;
  study_year?: string | null;
}): string | null {
  const college = collegeShortName(h.college);
  const course = (h.course ?? '').trim() || null;
  const year = (h.study_year ?? '').trim() || null;

  if (college) {
    if (year && course) return `${year} ${course} at ${college}`;
    if (course) return `${course} student at ${college}`;
    if (year) return `${year} student at ${college}`;
    return `Student at ${college}`;
  }
  if (year && course) return `${year} ${course} student`;
  if (course) return `${course} student`;
  if (year) return `${year} student`;
  return null;
}
