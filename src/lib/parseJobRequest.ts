// Turn a spoken/typed sentence into a bookable job — "ask only what's missing".
//
// AI first (parse-custom-job → Gemini, grounded on OUR catalogue so it can only
// ever return a job VANO legally does), then FAIL-SOFT to the local keyword
// matcher the describe-it page already uses. Never throws, never blocks: the
// worst case is a low-confidence "General help" the bubble confirms with a chip.
//
// Nothing here invents a price or a category — it resolves to a customJobs
// catalogue key, and the sheet's existing custom-booking path prices it.

import { supabase } from '@/integrations/supabase/client';
import { CUSTOM_JOBS, customJobByKey, searchCustomJobs, type CustomJob } from '@/lib/customJobs';

export interface ParsedJob {
  source: 'ai' | 'keyword' | 'none';
  jobKey: string;              // catalogue key, or 'other'
  label: string;               // display label ("Deep clean" / "Something else")
  emoji: string;
  group: string;               // catalogue group — drives the tools question
  hours: number;               // 1..8
  whenText?: string;           // "today", "after 4"… (display only)
  eircode?: string;            // if the sentence already named the house
  confidence: 'high' | 'medium' | 'low';
  /** True when the job plausibly needs kit (garden/moving/cleaning) and the
   *  sentence didn't mention having it — the bubble asks one chip. */
  needsToolsQuestion: boolean;
  /** True when we're not sure how long — the bubble confirms with 1h/2h/3h+. */
  needsDurationQuestion: boolean;
  raw: string;
}

// Irish Eircode: routing key (a letter, two chars — plus the D6W special) then
// four alphanumerics. Excludes the letters Eircode never uses. Space optional.
const EIRCODE_RE = /\b(?:[AC-FHKNPRTV-Y][0-9W][0-9]|D6W)\s?[0-9AC-FHKNPRTV-Y]{4}\b/i;

function findEircode(text: string): string | undefined {
  const m = text.match(EIRCODE_RE);
  return m ? m[0].toUpperCase().replace(/\s+/g, ' ') : undefined;
}

const TODAY_RE = /\b(today|now|asap|this (?:morning|afternoon|evening)|tonight)\b/i;
const SOON_RE = /\b(tomorrow|this week|weekend|next week)\b/i;
function findWhen(text: string): string | undefined {
  if (TODAY_RE.test(text)) return 'today';
  if (SOON_RE.test(text)) return (text.match(SOON_RE)?.[0] ?? '').toLowerCase() || undefined;
  const after = text.match(/\bafter (\d{1,2})\s?(am|pm)?\b/i);
  if (after) return `after ${after[1]}${after[2] ? after[2].toLowerCase() : ''}`;
  return undefined;
}

// "for two hours", "a couple of hours", "3 hrs", "half a day".
const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, 'a couple of': 2, couple: 2, half: 4 };
function findHours(text: string): number | null {
  const digit = text.match(/\b(\d{1,2})\s?(?:h\b|hr|hrs|hour|hours)\b/i);
  if (digit) return clampHours(Number(digit[1]));
  for (const [word, n] of Object.entries(NUM_WORDS)) {
    if (new RegExp(`\\b${word}\\b\\s*(?:hour|hr)`, 'i').test(text)) return clampHours(n);
  }
  if (/\ball day|full day\b/i.test(text)) return 6;
  return null;
}
const clampHours = (n: number) => (Number.isFinite(n) ? Math.min(8, Math.max(1, Math.round(n))) : 2);

// The sentence mentions having (or needing) the kit, so don't ask again.
const TOOLS_MENTIONED_RE = /\b(products?|supplies|tools?|mower|lawnmower|hoover|vacuum|van|equipment|i have|bring|no products|got the)\b/i;
const TOOLS_GROUPS = new Set(['Cleaning', 'Garden & outdoor', 'Garden', 'Moving & delivery', 'Moving']);

function build(job: CustomJob, opts: {
  source: ParsedJob['source'];
  hours: number;
  confidence: ParsedJob['confidence'];
  whenText?: string;
  eircode?: string;
  raw: string;
  durationStated: boolean;
}): ParsedJob {
  const toolsMentioned = TOOLS_MENTIONED_RE.test(opts.raw);
  return {
    source: opts.source,
    jobKey: job.key,
    label: job.label,
    emoji: job.emoji,
    group: job.group,
    hours: opts.hours,
    whenText: opts.whenText,
    eircode: opts.eircode,
    confidence: opts.confidence,
    needsToolsQuestion: TOOLS_GROUPS.has(job.group) && !toolsMentioned,
    needsDurationQuestion: !opts.durationStated && opts.confidence !== 'high',
    raw: opts.raw,
  };
}

/** The catalogue we hand the AI — key + label only (the function caps + sanitises). */
function catalogueForAi(): { key: string; label: string }[] {
  return CUSTOM_JOBS.map(j => ({ key: j.key, label: j.label }));
}

/**
 * Resolve a sentence to a bookable job. Always returns something (worst case a
 * low-confidence 'other'/General help). Never throws.
 */
export async function parseJobRequest(text: string): Promise<ParsedJob> {
  const raw = text.trim();
  const eircode = findEircode(raw);
  const whenText = findWhen(raw);
  const statedHours = findHours(raw);

  // ── AI first ──────────────────────────────────────────────────────────────
  try {
    const { data } = await supabase.functions.invoke('parse-custom-job', {
      body: { text: raw, jobs: catalogueForAi() },
    });
    const r = data as {
      ok?: boolean; jobKey?: string; hours?: number; whenText?: string; confidence?: number;
    } | null;
    if (r?.ok && typeof r.jobKey === 'string') {
      const job = customJobByKey(r.jobKey);
      const hours = statedHours ?? clampHours(r.hours ?? job.typicalHours);
      // parse-custom-job returns a 0..1 confidence; map to our three bands.
      const conf: ParsedJob['confidence'] =
        (r.confidence ?? 0) >= 0.75 ? 'high' : (r.confidence ?? 0) >= 0.45 ? 'medium' : 'low';
      return build(job, {
        source: 'ai',
        hours,
        confidence: r.jobKey === 'other' ? 'low' : conf,
        whenText: whenText ?? (r.whenText || undefined),
        eircode,
        raw,
        durationStated: statedHours != null,
      });
    }
  } catch {
    /* network / cold start / origin — fall through to keywords */
  }

  // ── Keyword fallback (same matcher the describe-it page uses) ───────────────
  // Guard a lone filler word: "help" alone would substring-match "Greenhouse
  // help". A single generic word carries no job signal → General help, which the
  // bubble confirms with chips anyway. Any real word ("clean", "garden") or
  // multi-word phrase still goes through the matcher. The AI path (primary)
  // handles rich sentences on its own.
  const FILLER = new Set(['help', 'hi', 'hey', 'hello', 'please', 'someone', 'something', 'stuff', 'job', 'jobs', 'work', 'anything', 'yes', 'ok']);
  const lone = raw.split(/\s+/).length === 1 && FILLER.has(raw.toLowerCase());
  const hit = lone ? undefined : searchCustomJobs(raw, 1)[0];
  if (hit) {
    return build(hit, {
      source: 'keyword',
      hours: statedHours ?? clampHours(hit.typicalHours),
      confidence: 'low',
      whenText,
      eircode,
      raw,
      durationStated: statedHours != null,
    });
  }

  // ── Nothing matched → General help (an ID-verified student, a couple hours) ─
  return build(customJobByKey('other'), {
    source: 'none',
    hours: statedHours ?? 2,
    confidence: 'low',
    whenText,
    eircode,
    raw,
    durationStated: statedHours != null,
  });
}

/** "1 hour" / "2 hours" — the size label the sheet + server price on. */
export function hoursToSizeLabel(hours: number): string {
  return hours === 1 ? '1 hour' : `${hours} hours`;
}
