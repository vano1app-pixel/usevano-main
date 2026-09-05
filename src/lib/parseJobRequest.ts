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
  /** True when the sentence never said how long — the bubble confirms with
   *  1h/2h/3h+. Deliberately NOT gated on AI confidence: a confident job with
   *  no stated duration still needs the question (owner rule). */
  needsDurationQuestion: boolean;
  /** True when a duration was actually said ("two hours", "all day"). */
  durationStated: boolean;
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
    needsDurationQuestion: !opts.durationStated,
    durationStated: opts.durationStated,
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

// ─── Live peek — questions under the field WHILE they speak or type ──────────
//
// 100% local and synchronous: it runs on the running transcript on every
// keystroke / interim speech token, so the chips slide in immediately instead
// of waiting for Gemini. It NEVER calls the network — the official
// parseJobRequest still runs once when they stop. A room / intent lexicon
// leads (so a bare "kitchen" is a ROOM signal, not a lock on Oven & kitchen
// clean); the catalogue is only consulted for a strong, unambiguous verb.

export interface PeekResult {
  source: 'peek';
  /** Ordered display tags — rooms and any strong job, e.g. ["Kitchen","Dog"]. */
  tags: string[];
  /** 'other' (General help) unless ONE strong, unambiguous job was named. */
  jobKey: string;
  label: string;
  emoji: string;
  hours: number | null;      // only when a duration was actually said
  whenText?: string;
  eircode?: string;
  needsDuration: boolean;    // no duration said yet
  needsTools: boolean;       // a kit-relevant signal, and kit not mentioned
  /** Two or more distinct signals ("kitchen and the dog") → keep General help
   *  and carry every signal, never collapse to one catalogue job. */
  multiSignal: boolean;
}

interface Lexeme {
  re: RegExp;
  tag: string;
  /** kit-relevant (cleaning / garden / moving) → drives the tools question. */
  tools: boolean;
  /** A strong catalogue lock; only applied when `needs` (if set) also matches. */
  lock?: string;
  needs?: RegExp;
  /** A lock only — contributes no standalone tag/signal on its own. */
  verbOnly?: boolean;
  /** A qualifier ("upstairs", "lawn"), not a separate job — shows as a tag but
   *  never counts toward "two real jobs" (so "mow the lawn" is one signal). */
  modifier?: boolean;
}

// Tags that qualify a job rather than being one — never trip multi-signal.
const MODIFIER_TAGS = new Set(['Upstairs', 'Lawn']);

// Order is only for readability; tags are emitted in the order they appear in
// the sentence. Rooms keep the booking as General help (a room isn't a job).
const LEXEMES: Lexeme[] = [
  // Rooms & areas.
  { re: /\bkitchens?\b/,               tag: 'Kitchen',      tools: true },
  { re: /\bbathrooms?\b/,              tag: 'Bathroom',     tools: true },
  { re: /\bbedrooms?\b/,               tag: 'Bedrooms',     tools: true },
  { re: /\bspare room\b/,              tag: 'Spare room',   tools: true },
  { re: /\b(sitting|living) room\b/,   tag: 'Sitting room', tools: true },
  { re: /\bfloors?\b/,                 tag: 'Floors',       tools: true },
  { re: /\bbins?\b/,                   tag: 'Bins',         tools: false },
  { re: /\bupstairs\b/,                tag: 'Upstairs',     tools: false, modifier: true },
  { re: /\bgardens?\b/,                tag: 'Garden',       tools: true },
  { re: /\blawns?\b/,                  tag: 'Lawn',         tools: true,  modifier: true },
  // Strong, unambiguous jobs (a real verb / phrase) — these lock the catalogue.
  { re: /\b(mow|mowing)\b|\bcut the grass\b/,               tag: 'Lawn mowing',       tools: true,  lock: 'mowing' },
  { re: /\b(wardrobe|furniture|sofa|couch|dresser|desk)\b/, tag: 'Furniture',         tools: true,  lock: 'furniture', needs: /\b(shift|move|moving|lift|carry|upstairs|downstairs)\b/ },
  { re: /\bdogs?\b/,                                        tag: 'Dog',               tools: false, lock: 'dog' },
  { re: /\biron(ing)?\b/,                                   tag: 'Ironing',           tools: false, lock: 'ironing' },
  { re: /\bhoover(ing)?\b|\bvacuum(ing)?\b/,                tag: 'Hoovering',         tools: true },
  // Cleaning verbs — kit-relevant, but keep General help (no standalone tag).
  { re: /\bclean(ing)?\b|\btidy(ing)?\b|\bscrub\b|\bmop\b/, tag: '',                  tools: true,  verbOnly: true },
];

/**
 * Local live-read of a running transcript. Cheap, sync, never throws. Drives
 * the chips that appear WHILE the customer is still talking / typing.
 */
export function peekJobRequest(text: string): PeekResult {
  const raw = text.trim();
  const eircode = findEircode(raw);
  const whenText = findWhen(raw);
  const hours = findHours(raw);
  const toolsMentioned = TOOLS_MENTIONED_RE.test(raw);

  const hits = LEXEMES
    .map((lx) => ({ lx, idx: raw.search(lx.re) }))
    .filter((h) => h.idx >= 0)
    .sort((a, b) => a.idx - b.idx);

  // Tags in spoken order (no blanks, deduped).
  const tags: string[] = [];
  for (const { lx } of hits) if (lx.tag && !tags.includes(lx.tag)) tags.push(lx.tag);
  // A strong lawn-mow lock makes the bare "Lawn" tag redundant.
  const mowing = hits.some(({ lx }) => lx.lock === 'mowing');
  const shownTags = mowing ? tags.filter((t) => t !== 'Lawn') : tags;

  // Strong locks whose extra requirement (if any) is satisfied.
  const locks = hits
    .filter(({ lx }) => lx.lock && (!lx.needs || lx.needs.test(raw)))
    .map(({ lx }) => lx.lock!);

  const toolsRelevant = hits.some(({ lx }) => lx.tools);
  // A "real job" signal = a tag that isn't a mere qualifier. Two+ distinct
  // ones ("kitchen and the dog") → keep General help, carry every signal.
  const signalCount = shownTags.filter((t) => !MODIFIER_TAGS.has(t)).length;
  const multiSignal = signalCount >= 2;

  let jobKey = 'other';
  if (!multiSignal && locks.length === 1) jobKey = locks[0];
  const job = customJobByKey(jobKey);

  return {
    source: 'peek',
    tags: shownTags,
    jobKey: job.key,
    label: job.key === 'other' ? 'General help' : job.label,
    emoji: job.key === 'other' ? '✨' : job.emoji,
    hours,
    whenText,
    eircode,
    needsDuration: hours == null,
    needsTools: toolsRelevant && !toolsMentioned,
    multiSignal,
  };
}
