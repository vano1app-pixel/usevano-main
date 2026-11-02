// The four "when" answers a buyer can give (owner brief 2026-09-06: Now /
// Today / Tonight / Pick time). Read out of the spoken/typed sentence to
// prefill the chips; always editable. 'scheduled' means "let me pick" — the
// booking sheet opens its time picker on it.

export type WhenBucket = 'asap' | 'today' | 'tonight' | 'scheduled';

export const WHEN_LABEL: Record<WhenBucket, string> = { asap: 'Now', today: 'Today', tonight: 'Tonight', scheduled: 'Pick time' };
export const WHEN_ORDER: WhenBucket[] = ['asap', 'today', 'tonight', 'scheduled'];

/** Local + synchronous. `whenText` is the parser's hint ("tomorrow", "after 4"). */
export function whenBucketFromText(text: string, whenText?: string): WhenBucket | null {
  const t = text.toLowerCase();
  if (/\b(right )?now\b|\basap\b|\bstraight away\b|\bin (an|one|half an) hour\b|\bin \d+ (min|mins|minutes|hours?)\b/.test(t)) return 'asap';
  if (/\btonight\b|\bthis evening\b|\bafter (6|7|8)\s?(pm)?\b/.test(t)) return 'tonight';
  if (/\btoday\b|\bthis (morning|afternoon)\b|\blater\b/.test(t)) return 'today';
  if (whenText) return 'scheduled';
  return null;
}
