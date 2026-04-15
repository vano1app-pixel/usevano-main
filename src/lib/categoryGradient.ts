/**
 * Category-aware deterministic gradients for freelancer cards / banners.
 *
 * Replaces the old random-hash palette in StudentCard so a videographer's card
 * reads as warm + cinematic, a website builder's reads as cool + technical, etc.
 * Same userId always maps to the same shade within its category — keeps cards
 * visually distinct without random churn between renders.
 */

type CategoryKey = 'videography' | 'digital_sales' | 'websites' | 'social_media' | 'other';

const PALETTES: Record<CategoryKey, Array<[string, string]>> = {
  videography: [
    ['hsl(14 75% 50%)', 'hsl(340 65% 45%)'],
    ['hsl(22 80% 48%)', 'hsl(0 70% 42%)'],
    ['hsl(354 65% 48%)', 'hsl(20 70% 45%)'],
  ],
  digital_sales: [
    ['hsl(152 55% 38%)', 'hsl(178 50% 35%)'],
    ['hsl(140 50% 36%)', 'hsl(168 55% 32%)'],
    ['hsl(160 60% 32%)', 'hsl(190 55% 38%)'],
  ],
  websites: [
    ['hsl(212 70% 45%)', 'hsl(232 60% 48%)'],
    ['hsl(200 65% 42%)', 'hsl(220 70% 45%)'],
    ['hsl(225 60% 48%)', 'hsl(195 65% 42%)'],
  ],
  social_media: [
    ['hsl(280 55% 50%)', 'hsl(316 55% 50%)'],
    ['hsl(295 60% 48%)', 'hsl(335 55% 50%)'],
    ['hsl(265 55% 48%)', 'hsl(310 55% 50%)'],
  ],
  other: [
    ['hsl(var(--primary))', 'hsl(262 50% 52%)'],
    ['hsl(232 55% 48%)', 'hsl(var(--primary))'],
  ],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function categoryFromSkills(skills: string[] | null | undefined): CategoryKey {
  if (!skills || skills.length === 0) return 'other';
  const flat = skills.join(' ').toLowerCase();
  if (/(video|film|reel|edit|premiere|davinci|motion|drone)/.test(flat)) return 'videography';
  if (/(sales|sdr|cold|outbound|lead gen|prospect|closing)/.test(flat)) return 'digital_sales';
  if (/(web|website|wordpress|html|css|frontend|shopify|developer|react)/.test(flat)) return 'websites';
  if (/(social|instagram|tiktok|content|canva|marketing)/.test(flat)) return 'social_media';
  return 'other';
}

/**
 * Deterministic gradient string for a freelancer.
 * Pass an explicit category id when known; otherwise we infer from skills.
 */
export function freelancerGradient(
  userId: string,
  opts: { category?: string | null; skills?: string[] | null } = {},
): string {
  const key: CategoryKey =
    (opts.category as CategoryKey | undefined) && PALETTES[opts.category as CategoryKey]
      ? (opts.category as CategoryKey)
      : categoryFromSkills(opts.skills);
  const variants = PALETTES[key];
  const [a, b] = variants[hash(userId) % variants.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

/**
 * A tiny inline SVG noise pattern, base64-encoded as a data URL. Adds tactile
 * grain over flat gradients so they don't look like a default Tailwind class.
 */
export const NOISE_BG_IMAGE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.18 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";
