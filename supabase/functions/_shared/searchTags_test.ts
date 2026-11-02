import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildSearchTags, matchesQuery, timeTags } from "./searchTags.ts";

Deno.test("cleaning tonight in Salthill matches the obvious searches", () => {
  const now = new Date('2026-09-06T12:00:00Z');
  const tags = buildSearchTags({ category: 'cleaning', extra_label: 'Kitchen + bathroom', area: 'Salthill', scheduled_at: '2026-09-06T18:30:00Z' }, now);
  assert(tags.includes('cleaning'));
  assert(tags.includes('kitchen'));
  assert(tags.includes('salthill'));
  assert(tags.includes('tonight'));
  assert(matchesQuery('cleaning tonight', tags));
  assert(matchesQuery('clean salt', tags));
  assert(!matchesQuery('dog walk', tags));
});

Deno.test("ASAP orders carry now/today", () => {
  assertEquals(timeTags(null).sort(), ['asap', 'now', 'today']);
});

Deno.test("dog walk tomorrow morning", () => {
  const now = new Date('2026-09-06T12:00:00Z');
  const tags = buildSearchTags({ category: 'dog-walk', scheduled_at: '2026-09-07T08:00:00Z', city: 'Galway' }, now);
  assert(tags.includes('dog walk'));
  assert(tags.includes('tomorrow'));
  assert(tags.includes('morning'));
  assert(matchesQuery('dog tomorrow', tags));
});
