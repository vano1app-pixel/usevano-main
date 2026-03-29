/** Only these accounts may open /admin (see Admin.tsx, Navbar). */
const ADMIN_EMAILS = ['vano1app@gmail.com', 'ayushpuri1239@gmail.com'];

export const ADMIN_OWNER_EMAIL = ADMIN_EMAILS[0];

export function isAdminOwnerEmail(email: string | null | undefined): boolean {
  return ADMIN_EMAILS.includes(email?.trim().toLowerCase() ?? '');
}
