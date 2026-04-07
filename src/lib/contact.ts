/** Override in `.env` with `VITE_TEAM_CONTACT_EMAIL` if needed. */
export const TEAM_CONTACT_EMAIL =
  (import.meta.env.VITE_TEAM_CONTACT_EMAIL as string | undefined)?.trim() || 'vano1app@gmail.com';

export const TEAM_PHONE_DISPLAY = '089 981 7111';

/** Irish mobile 089 → E.164 for tel: links */
export const TEAM_PHONE_TEL = '+353899817111';

export const TEAM_INSTAGRAM_HANDLE = 'vano.app';

export const TEAM_INSTAGRAM_URL = 'https://www.instagram.com/vano.app/';

const subject = encodeURIComponent('VANO — question for the team');

export const teamMailtoHref = `mailto:${TEAM_CONTACT_EMAIL}?subject=${subject}`;

export const teamTelHref = `tel:${TEAM_PHONE_TEL}`;

export const teamWhatsAppHref = `https://wa.me/${TEAM_PHONE_TEL.replace('+', '')}`;
