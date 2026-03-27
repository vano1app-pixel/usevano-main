/** Only this Google account may open /admin (see Admin.tsx, Navbar). */
export const ADMIN_OWNER_EMAIL = 'vano1app@gmail.com';

export function isAdminOwnerEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === ADMIN_OWNER_EMAIL;
}
