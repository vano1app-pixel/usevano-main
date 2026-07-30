import { describe, expect, it } from 'vitest';
// The REAL server module the edge functions run (pure TS, no Deno APIs).
// bookedDurationMinutes drives job_ends_at — the countdown on the helper's
// job screen and the clock sweep-stalled-jobs measures a ghosting helper by.
import { bookedDurationMinutes, isTimedCategory } from '../../../supabase/functions/_shared/householdJob';
import {
  BUILDER_TASKS, SIZING_QUESTIONS, builderMinutes, builderSizeLabel, bookedMinutes,
} from '../jobBuilder';

const SHEET_SIZES: Record<string, string[]> = {
  cleaning: ['1 hour', '2 hours', '3 hours', '4 hours', '5 hours', '6 hours'],
  garden:   ['1 hour', '2 hours', '3 hours', '4 hours', '5 hours', '6 hours', '7 hours', '8 hours'],
  moving:   ['1 hour', '2 hours', '3 hours', '4+ hours'],
};

const allSubsets = <T,>(items: T[]): T[][] =>
  items.reduce<T[][]>((acc, item) => [...acc, ...acc.map((s) => [...s, item])], [[]]);

const mins = (size: string) => bookedDurationMinutes('cleaning', { size_label: size });

describe('bookedDurationMinutes — the clock the helper actually works to', () => {
  it('parses whole-hour, fractional, plus and minute labels', () => {
    expect(mins('1 hour')).toBe(60);
    expect(mins('2 hours')).toBe(120);
    expect(mins('4+ hours')).toBe(240);
    expect(mins('30 min')).toBe(30);
    expect(mins('45 min')).toBe(45);
    expect(mins('Half day')).toBe(240);
  });

  // THE REGRESSION. The hour pattern was `(\d+)`, which cannot match "1.75" —
  // the scanner skipped the "1." and matched the FRACTION instead, so a
  // 1.5-hour booking told the helper they had 5 hours. Live since half-hour
  // steps shipped 2026-07-27; found 2026-07-30 while adding quarter-hours.
  it('a fractional label is the fraction of an hour, NOT the digits after the dot', () => {
    expect(mins('1.5 hours')).toBe(90);
    expect(mins('1.25 hours')).toBe(75);
    expect(mins('1.75 hours')).toBe(105);
    expect(mins('2.5 hours')).toBe(150);
    expect(mins('5.75 hours')).toBe(345);
  });

  it('EVERY size the tick-box builder can compute parses back to the same minutes', () => {
    // The builder rounds an estimate UP to a label; this reads that label back
    // to set the countdown. If the two ever disagree the helper works to a
    // clock nobody sold. Enumerates every subset × every sizing answer.
    for (const [slug, tasks] of Object.entries(BUILDER_TASKS)) {
      const factors = SIZING_QUESTIONS[slug]?.options.map((o) => o.factor as number) ?? [1];
      for (const factor of factors) {
        for (const subset of allSubsets(tasks.map((t) => t.key))) {
          if (!subset.length) continue;
          const size = builderSizeLabel(builderMinutes(slug, subset, factor), SHEET_SIZES[slug]) as string;
          const expected = bookedMinutes(size);
          expect(bookedDurationMinutes(slug, { size_label: size }), `${slug} ×${factor} → ${size}`)
            .toBe(expected);
        }
      }
    }
  });

  it('still handles the legacy multi-step duration ids and no-duration jobs', () => {
    expect(bookedDurationMinutes('cleaning', { cleaningDuration: '2hr' })).toBe(120);
    expect(bookedDurationMinutes('garden', { gardenDuration: 'half-day' })).toBe(240);
    expect(bookedDurationMinutes('cleaning', { size_label: '2 bags' })).toBeNull();
    expect(bookedDurationMinutes('cleaning', null)).toBeNull();
    expect(bookedDurationMinutes('cleaning', {})).toBeNull();
  });

  it('the timed categories are the ones a countdown makes sense for', () => {
    expect(isTimedCategory('cleaning')).toBe(true);
    expect(isTimedCategory('garden')).toBe(true);
  });
});
