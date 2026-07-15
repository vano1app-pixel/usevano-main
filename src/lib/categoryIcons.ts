import { Shirt, PawPrint, Leaf, Package, SprayCan, PenLine, type LucideIcon } from 'lucide-react';

/**
 * One consistent line-icon per bookable category — the STOREFRONT iconography
 * (hero tiles, most-booked podium, "book your usual" pill). OS emoji render
 * differently on every device, fight the palette, and read as filler; a single
 * icon set drawn in the brand colours reads as designed.
 *
 * Deliberately NOT used inside the booking sheet: the sub-service rows there
 * pull ~100 catalogue emoji (src/lib/customJobs.ts) as menu illustrations
 * inside neutral chips — swapping those is a separate, much bigger pass.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  shopping: Shirt, // Laundry (legacy slug)
  'dog-walk': PawPrint, // Pets (legacy slug)
  garden: Leaf,
  moving: Package,
  cleaning: SprayCan,
  custom: PenLine, // "Anything else" — describe it
};

export function categoryIcon(slug: string): LucideIcon {
  return CATEGORY_ICONS[slug] ?? PenLine;
}
