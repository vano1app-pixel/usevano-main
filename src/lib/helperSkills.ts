/**
 * The "Jobs I do" skill model shared by the join form and the helper account
 * page, so the two pickers can never drift apart (they used to offer
 * different lists, and the account page mislabelled `shopping` as "Shopping"
 * when customers book it as Laundry).
 *
 * Shape: a helper picks top-level GROUPS (the slugs dispatch matches on —
 * see dispatch-household-job) and optionally SUB-SKILLS within each group.
 * Everything is stored in the one `categories` array on household_helpers:
 * dispatch only ever filters on the group slugs, so sub-skill slugs ride
 * along harmlessly as profile detail shown to customers.
 *
 * INVARIANT: a sub-skill is only ever stored alongside its parent group —
 * `toggleSub` auto-selects the parent and `toggleGroup` (off) sweeps the
 * subs — because dispatch matches on the parent slug alone. A sub without
 * its parent would be invisible to matching.
 */

export interface SkillSub {
  id: string;
  label: string;
}

export interface SkillGroup {
  id: string;
  emoji: string;
  label: string;
  subs: SkillSub[];
}

// Group slugs must match the quick-book categories customer-side
// (CategoryGrid) — slug 'shopping' is Laundry. Sub-skill labels follow the
// custom-jobs catalogue (src/lib/customJobs.ts) so helpers describe work in
// the same words customers book it with.
export const SKILL_GROUPS: SkillGroup[] = [
  {
    id: 'cleaning', emoji: '🧹', label: 'Cleaning',
    subs: [
      { id: 'deep-clean',        label: 'Deep clean' },
      { id: 'end-of-tenancy',    label: 'End-of-tenancy' },
      { id: 'oven-clean',        label: 'Oven & kitchen' },
      { id: 'window-clean',      label: 'Windows (inside)' },
      { id: 'ironing',           label: 'Ironing' },
      { id: 'airbnb-changeover', label: 'Airbnb changeover' },
    ],
  },
  {
    id: 'garden', emoji: '🌿', label: 'Garden',
    subs: [
      { id: 'lawn-mowing',      label: 'Lawn mowing' },
      { id: 'weeding',          label: 'Weeding & tidy' },
      { id: 'hedge-pruning',    label: 'Hedges & pruning' },
      { id: 'power-washing',    label: 'Power washing' },
      { id: 'garden-clearance', label: 'Garden clearance' },
      { id: 'planting',         label: 'Planting & beds' },
    ],
  },
  {
    id: 'moving', emoji: '📦', label: 'Moving',
    subs: [
      { id: 'van-loading',     label: 'Loading / van help' },
      { id: 'house-move',      label: 'House moves' },
      { id: 'furniture-shift', label: 'Furniture shifting' },
      { id: 'packing',         label: 'Packing & boxing' },
      { id: 'tip-run',         label: 'Tip / dump runs' },
      { id: 'student-move',    label: 'Student moves' },
    ],
  },
  {
    id: 'dog-walk', emoji: '🐕', label: 'Dog walk',
    subs: [
      { id: 'pet-sitting', label: 'Pet sitting' },
      { id: 'pet-feeding', label: 'Feeding visits' },
      { id: 'dog-wash',    label: 'Dog washing' },
    ],
  },
  // Flat single service — nothing meaningful to subdivide.
  { id: 'shopping', emoji: '🧺', label: 'Laundry', subs: [] },
  {
    id: 'handyman', emoji: '🔧', label: 'Handyman & odd jobs',
    subs: [
      { id: 'flat-pack',        label: 'Flat-pack & assembly' },
      { id: 'hanging-mounting', label: 'Hanging & mounting' },
      { id: 'painting',         label: 'Painting' },
      { id: 'odd-jobs',         label: 'Odd jobs' },
      { id: 'tv-setup',         label: 'TV & tech setup' },
      { id: 'wifi-help',        label: 'Wi-Fi & devices' },
    ],
  },
  {
    id: 'errands', emoji: '🛒', label: 'Errands & shopping',
    subs: [
      { id: 'grocery-run',     label: 'Grocery runs' },
      { id: 'pharmacy-pickup', label: 'Pharmacy pickup' },
      { id: 'parcel-returns',  label: 'Parcel returns' },
      { id: 'queueing',        label: 'Queueing & waiting in' },
      { id: 'bins-out',        label: 'Bins out' },
    ],
  },
  // Tutoring detail (subjects/levels) lives in its own columns via the join
  // form's dedicated panel — no generic subs here.
  { id: 'tutoring', emoji: '💻', label: 'Online tutoring', subs: [] },
  // Legacy catch-all some existing helpers have selected; kept so it still
  // shows as picked rather than silently disappearing from their profile.
  { id: 'other', emoji: '🧰', label: 'Other', subs: [] },
];

const GROUP_BY_ID = new Map(SKILL_GROUPS.map(g => [g.id, g]));
const SUB_LABELS = new Map(SKILL_GROUPS.flatMap(g => g.subs.map(s => [s.id, s.label] as const)));

/** Toggle a top-level group; deselecting sweeps away its sub-skills too. */
export function toggleGroup(selected: string[], groupId: string): string[] {
  const group = GROUP_BY_ID.get(groupId);
  if (!group) return selected;
  if (selected.includes(groupId)) {
    const subIds = new Set(group.subs.map(s => s.id));
    return selected.filter(s => s !== groupId && !subIds.has(s));
  }
  return [...selected, groupId];
}

/** Toggle a sub-skill; selecting one auto-selects its parent group. */
export function toggleSub(selected: string[], groupId: string, subId: string): string[] {
  const group = GROUP_BY_ID.get(groupId);
  if (!group || !group.subs.some(s => s.id === subId)) return selected;
  if (selected.includes(subId)) return selected.filter(s => s !== subId);
  const withSub = [...selected, subId];
  return withSub.includes(groupId) ? withSub : [...withSub, groupId];
}

/** Label for any skill slug — group or sub — or null if unknown. */
export function skillLabel(slug: string): string | null {
  const group = GROUP_BY_ID.get(slug);
  if (group) return `${group.emoji} ${group.label}`;
  return SUB_LABELS.get(slug) ?? null;
}
