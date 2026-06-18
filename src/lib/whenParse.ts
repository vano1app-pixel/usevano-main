// Turns a natural-language timing phrase ("tomorrow morning", "this Saturday",
// "tonight") into the CustomJobBuilder's When state, so the AI brain can fill
// the day picker as well as the job. Deliberately conservative: anything it
// isn't sure about returns null and the picker is left untouched.
//
// Returned `when` vocabulary matches the builder: a same-day booking uses the
// live clock slots (so the component maps `today` → 'Now'); future days use
// the Morning / Afternoon / Evening dayparts.

export type Daypart = 'Morning' | 'Afternoon' | 'Evening';
export interface WhenParse {
  day: 'today' | 'tomorrow' | 'pick';
  /** YYYY-MM-DD, only set when day === 'pick'. */
  date?: string;
  daypart: Daypart;
}

const WEEKDAYS: Array<{ idx: number; re: RegExp }> = [
  { idx: 0, re: /\bsun(day)?\b/ },
  { idx: 1, re: /\bmon(day)?\b/ },
  { idx: 2, re: /\btue(s|sday)?\b/ },
  { idx: 3, re: /\bwed(s|nesday)?\b/ },
  { idx: 4, re: /\bthu(r|rs|rsday)?\b/ },
  { idx: 5, re: /\bfri(day)?\b/ },
  { idx: 6, re: /\bsat(urday)?\b/ },
];

function fmtLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseWhenText(text: string, now: Date = new Date()): WhenParse | null {
  const t = ` ${text.toLowerCase()} `;

  // Daypart (if any was mentioned).
  let daypart: Daypart | null = null;
  if (/\bmorning\b/.test(t)) daypart = 'Morning';
  else if (/\bafternoon\b/.test(t)) daypart = 'Afternoon';
  else if (/\b(evening|tonight|night)\b/.test(t)) daypart = 'Evening';

  let day: 'today' | 'tomorrow' | 'pick' | null = null;
  let date: string | undefined;

  if (/\btoday\b/.test(t) || /\btonight\b/.test(t) || /\bthis (morning|afternoon|evening)\b/.test(t) || /\b(right )?now\b/.test(t) || /\basap\b/.test(t)) {
    day = 'today';
  } else if (/\btomorrow\b/.test(t)) {
    day = 'tomorrow';
  } else {
    // "this weekend" maps to the coming Saturday; otherwise a named weekday.
    let targetIdx: number | null = null;
    if (/\bweekend\b/.test(t)) targetIdx = 6;
    else for (const w of WEEKDAYS) { if (w.re.test(t)) { targetIdx = w.idx; break; } }
    if (targetIdx !== null) {
      const delta = (targetIdx - now.getDay() + 7) % 7;
      if (delta === 0) {
        day = 'today'; // they named today's weekday
      } else {
        const d = new Date(now);
        d.setDate(d.getDate() + delta);
        date = fmtLocal(d);
        day = 'pick';
      }
    }
  }

  if (day === null) {
    // A bare daypart ("in the afternoon") implies today; nothing at all → null.
    if (daypart) day = 'today';
    else return null;
  }

  return { day, ...(date ? { date } : {}), daypart: daypart ?? 'Afternoon' };
}
