/**
 * Validates whether an email belongs to a recognised student/university domain.
 *
 * Accepted patterns
 * ─────────────────
 * • .edu (global academic)
 * • .ac.uk (UK academic)
 * • .ac.ie (Irish academic — not widely used but valid)
 * • Known Irish university / institute of technology domains
 */

const IRISH_STUDENT_DOMAINS: string[] = [
  // Universities
  'ucd.ie',
  'ucdconnect.ie',
  'tcd.ie',
  'universityofgalway.ie',
  'nuigalway.ie',
  'ul.ie',
  'studentmail.ul.ie',
  'ucc.ie',
  'mu.ie',
  'dcu.ie',
  'mail.dcu.ie',

  // Technological Universities
  'tudublin.ie',
  'mytudublin.ie',
  'atu.ie',
  'student.atu.ie',
  'learner.atu.ie',
  'research.atu.ie',
  'setu.ie',
  'mtu.ie',
  'student.mtu.ie',
  'student.tudublin.ie',

  // Former ITs (some still in use — many now ATU / SETU / MTU)
  'itcarlow.ie',
  'wit.ie',
  'gmit.ie',
  'student.gmit.ie',
  'lyit.ie',
  'student.lyit.ie',
  'itsligo.ie',
  'mail.itsligo.ie',
  'lit.ie',
  'ittralee.ie',
  'cit.ie',
  'dkit.ie',
  'student.dkit.ie',

  // Other Irish institutions
  'rcsi.ie',
  'ncad.ie',
  'iadt.ie',
  'ncirl.ie',
  'griffith.ie',
  'mic.ul.ie',
  'spd.dcu.ie',
  'carlow.ie',
  'dorset.ie',
  'ccm.ie',
  'portobelloinstitute.ie',
  'ibat.ie',
  'diblin.ie',
  'nci.ie',

  // UK universities commonly attended by Irish students
  'qub.ac.uk',
  'ulster.ac.uk',
];

/** Return `true` when the email belongs to a student / academic domain. */
export function isStudentEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;

  // Generic academic suffixes
  if (domain.endsWith('.edu')) return true;
  if (domain.endsWith('.ac.uk')) return true;
  if (domain.endsWith('.ac.ie')) return true;

  // Check against curated list of Irish institutions
  return IRISH_STUDENT_DOMAINS.some(
    (d) => domain === d || domain.endsWith(`.${d}`),
  );
}

/** Human-readable hint shown to users */
export const STUDENT_EMAIL_HINT =
  'Use your university email (e.g. .ac.ie, .atu.ie, .edu, .ac.uk, or an Irish college address like @ucdconnect.ie, @universityofgalway.ie).';

/** Shown when a freelancer tries to sign up with a non-student email */
export const FREELANCER_STUDENT_EMAIL_ERROR =
  'Please use your student email to sign up as a freelancer.';

/**
 * Domains allowed on /verify-student (institutional addresses only; no inbox verification).
 */
export function isStrictInstitutionVerificationEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  // Root domains like atu.ie / lit.ie are valid institutional hosts; subdomains use *.atu.ie etc.
  return (
    domain.endsWith('.ac.ie') ||
    domain === 'atu.ie' ||
    domain.endsWith('.atu.ie') ||
    domain === 'lit.ie' ||
    domain.endsWith('.lit.ie')
  );
}

export const STRICT_INSTITUTION_EMAIL_HINT =
  'Must end with .ac.ie, .atu.ie, or .lit.ie (e.g. name@university.ac.ie, name@student.atu.ie).';
