import { describe, it, expect } from 'vitest';
import { SKILL_GROUPS, defaultSelectedGroups, toggleGroup, toggleSub, skillLabel } from '../helperSkills';

// Dispatch (dispatch-household-job) filters on these exact slugs — if a group
// id drifts, its helpers silently stop receiving that category's jobs.
const DISPATCH_SLUGS = ['cleaning', 'garden', 'moving', 'dog-walk', 'shopping', 'tutoring'];

describe('helperSkills', () => {
  it('keeps every dispatch-matched slug as a group id', () => {
    const ids = SKILL_GROUPS.map(g => g.id);
    for (const slug of DISPATCH_SLUGS) expect(ids).toContain(slug);
  });

  it('has globally unique ids across groups and subs', () => {
    const all = SKILL_GROUPS.flatMap(g => [g.id, ...g.subs.map(s => s.id)]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('fits the edge-function slug rules (regex + cap)', () => {
    const all = SKILL_GROUPS.flatMap(g => [g.id, ...g.subs.map(s => s.id)]);
    for (const id of all) expect(id).toMatch(/^[a-z0-9-]{1,40}$/);
    // update-helper-profile caps categories at 80 — the full catalogue must fit
    expect(all.length).toBeLessThanOrEqual(80);
  });

  it('selecting a sub auto-selects its parent group', () => {
    const sel = toggleSub([], 'cleaning', 'deep-clean');
    expect(sel).toContain('deep-clean');
    expect(sel).toContain('cleaning');
  });

  it('deselecting a group sweeps its subs away', () => {
    let sel = toggleSub([], 'cleaning', 'deep-clean');
    sel = toggleSub(sel, 'cleaning', 'oven-clean');
    sel = toggleGroup(sel, 'cleaning');
    expect(sel).toEqual([]);
  });

  it('deselecting a sub keeps the parent and other subs', () => {
    let sel = toggleSub([], 'garden', 'lawn-mowing');
    sel = toggleSub(sel, 'garden', 'weeding');
    sel = toggleSub(sel, 'garden', 'lawn-mowing');
    expect(sel).toContain('garden');
    expect(sel).toContain('weeding');
    expect(sel).not.toContain('lawn-mowing');
  });

  it('ignores unknown group/sub ids', () => {
    expect(toggleGroup(['cleaning'], 'nonsense')).toEqual(['cleaning']);
    expect(toggleSub(['cleaning'], 'cleaning', 'nonsense')).toEqual(['cleaning']);
    expect(toggleSub(['x'], 'nonsense', 'deep-clean')).toEqual(['x']);
  });

  it('pre-ticks only the no-skill commodity groups on the join form', () => {
    const defaults = defaultSelectedGroups();
    // Opt-out defaults: jobs any student can do on day one.
    expect(defaults.sort()).toEqual(['cleaning', 'dog-walk', 'errands', 'moving', 'shopping']);
    // Gear/skill-gated groups must stay opt-in, and 'other' (legacy) never defaults.
    for (const gated of ['garden', 'handyman', 'tutoring', 'other']) {
      expect(defaults).not.toContain(gated);
    }
    // Defaults are group slugs (dispatch matches groups) — never sub-skills.
    const groupIds = new Set(SKILL_GROUPS.map(g => g.id));
    for (const d of defaults) expect(groupIds.has(d)).toBe(true);
  });

  it('labels groups (with emoji) and subs (plain), null for unknown', () => {
    expect(skillLabel('cleaning')).toBe('🧹 Cleaning');
    expect(skillLabel('shopping')).toBe('🧺 Laundry');
    expect(skillLabel('deep-clean')).toBe('Deep clean');
    expect(skillLabel('not-a-skill')).toBeNull();
  });
});
