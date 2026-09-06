import { areaFromCoords, areaFromAddressText } from "./serviceAreas.ts";

// Search tags for open orders (2026-09-06). A helper types "cleaning tonight"
// or "dog walk salthill"; the board matches by PREFIX on these lowercase
// tokens, so every job carries: what it is (category words + the sheet's
// labels), where roughly (the neighbourhood name — never the street), and
// when (time buckets). Stamped on household_bookings.search_tags at checkout;
// find-open-orders recomputes for rows that predate the column.

export const CATEGORY_TAGS: Record<string, string[]> = {
  cleaning:              ['cleaning', 'clean', 'hoover', 'kitchen', 'bathroom', 'tidy', 'house'],
  garden:                ['garden', 'gardening', 'lawn', 'mow', 'mowing', 'weeding', 'hedge', 'outdoor'],
  'dog-walk':            ['dog', 'dog walk', 'walk', 'pet', 'puppy'],
  shopping:              ['laundry', 'ironing', 'washing', 'clothes', 'shopping'],
  moving:                ['move', 'moving', 'lift', 'van', 'boxes', 'furniture', 'carry'],
  handyman:              ['handyman', 'odd jobs', 'fix', 'diy', 'paint', 'painting', 'shelf'],
  'furniture-assembly':  ['furniture', 'ikea', 'assembly', 'assemble', 'flatpack'],
  'tech-help':           ['tech', 'computer', 'phone', 'wifi', 'tv', 'setup'],
  'wait-delivery':       ['delivery', 'wait', 'parcel'],
  plumbing:              ['plumbing', 'tap', 'leak', 'sink'],
  tutoring:              ['tutoring', 'tutor', 'grinds', 'lesson'],
  business:              ['business', 'temp', 'staff', 'shift'],
  other:                 ['odd jobs', 'help', 'general', 'anything'],
  custom:                ['odd jobs', 'help', 'general'],
};

const WORD_TAGS: Array<[RegExp, string]> = [
  [/\bhoover|vacuum\b/, 'hoover'], [/\bkitchen\b/, 'kitchen'], [/\bbathroom\b/, 'bathroom'],
  [/\bwindow/, 'windows'], [/\bbins?\b/, 'bins'], [/\blawn|grass|mow/, 'lawn'],
  [/\bhedge/, 'hedge'], [/\bweed/, 'weeding'], [/\bikea|flat.?pack|assembl/, 'ikea'],
  [/\bpaint/, 'paint'], [/\bironing\b/, 'ironing'], [/\blaundry|wash/, 'laundry'],
  [/\bdog|puppy\b/, 'dog'], [/\bcat\b/, 'cat'], [/\bmove|moving|van\b/, 'move'],
  [/\bdeep clean/, 'deep clean'], [/\bend of tenancy|move.?out clean/, 'end of tenancy'],
];

export interface TagInput {
  category: string | null | undefined;
  size_label?: string | null;
  extra_label?: string | null;
  note?: string | null;
  area?: string | null;
  city?: string | null;
  scheduled_at?: string | null;
  created_at?: string | null;
}

const DUBLIN = 'Europe/Dublin';

function dublinParts(iso: string): { ymd: string; hour: number; dow: number } {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-IE', { timeZone: DUBLIN, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, dow };
}

/** Time-bucket tags: now / today / tonight / tomorrow / morning / afternoon /
 *  evening / weekend, relative to `now` in Irish time. */
export function timeTags(scheduledAt: string | null | undefined, now: Date = new Date()): string[] {
  const tags = new Set<string>();
  if (!scheduledAt) { tags.add('now'); tags.add('today'); tags.add('asap'); return [...tags]; }
  const s = dublinParts(scheduledAt);
  const n = dublinParts(now.toISOString());
  const tomorrow = dublinParts(new Date(now.getTime() + 24 * 3600_000).toISOString());
  if (s.ymd === n.ymd) {
    tags.add('today');
    if (new Date(scheduledAt).getTime() - now.getTime() <= 3 * 3600_000) tags.add('now');
  } else if (s.ymd === tomorrow.ymd) {
    tags.add('tomorrow');
  }
  if (s.hour < 12) tags.add('morning');
  else if (s.hour < 17) tags.add('afternoon');
  else { tags.add('evening'); if (s.ymd === n.ymd) tags.add('tonight'); }
  if (s.dow === 0 || s.dow === 6) tags.add('weekend');
  return [...tags];
}

export function areaToken(opts: { lat?: number | null; lng?: number | null; address?: string | null; city?: string | null }): string | null {
  return areaFromCoords(opts.lat, opts.lng) ?? areaFromAddressText(opts.address) ?? (opts.city?.trim() || null);
}

export function buildSearchTags(input: TagInput, now: Date = new Date()): string[] {
  const tags = new Set<string>();
  const cat = (input.category ?? 'other').toLowerCase();
  for (const t of CATEGORY_TAGS[cat] ?? CATEGORY_TAGS.other) tags.add(t);
  const text = [input.extra_label, input.size_label, input.note].filter(Boolean).join(' ').toLowerCase();
  for (const [re, tag] of WORD_TAGS) if (re.test(text)) tags.add(tag);
  if (input.area) tags.add(input.area.toLowerCase());
  if (input.city) tags.add(input.city.toLowerCase());
  tags.add('galway'); // every live order is in the Galway service area today
  for (const t of timeTags(input.scheduled_at ?? null, now)) tags.add(t);
  return [...tags];
}

/** Prefix match: every word the helper typed must start some tag or word. */
export function matchesQuery(q: string, haystack: string[]): boolean {
  const words = q.toLowerCase().split(/\s+/).map((w) => w.trim()).filter(Boolean);
  if (!words.length) return true;
  const hay = haystack.map((h) => h.toLowerCase());
  return words.every((w) => hay.some((h) => h.startsWith(w) || h.split(/\s+/).some((p) => p.startsWith(w))));
}
