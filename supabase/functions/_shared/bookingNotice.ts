// Minimum notice on a booking (owner call 2026-07-31: "take the now choice
// out of the site — we don't have enough students to do it now, minimum of
// 3 hours").
//
// "Now" was a promise the supply side couldn't keep. A booking placed at 11am
// for 11am needs a student who is free, nearby and looking at their phone that
// minute. When nobody is, the job sits unclaimed and the customer watches an
// empty tracking page — a worse first experience than being told honestly that
// the earliest slot is 2pm. Three hours is also what makes the offer worth
// taking: a student can plan around a lecture instead of dropping everything.
//
// THE FLOOR LIVES HERE, ON THE SERVER, because the booking sheet is not the
// only door. The WhatsApp intake, "book your usual" rebooks, old deep links
// and any stale cached bundle all reach create-household-payment-checkout —
// and every one of them could otherwise still create an instant job. The
// sheet's chips are the polite version of this rule; this is the rule.
//
// Pure TypeScript, no Deno APIs, so src/lib/__tests__ can import it directly.

/** Hours of notice every booking gets, whichever door it came through.
 *  Mirrored by MIN_NOTICE_HOURS in src/components/household/CategoryGrid.tsx —
 *  bookingNotice.test.ts fails if the two drift. */
export const MIN_NOTICE_HOURS = 3;

export const MIN_NOTICE_MS = MIN_NOTICE_HOURS * 60 * 60 * 1000;

/**
 * The earliest a job may actually start, given when it was booked.
 * Rounded UP to the next half hour so the stamped time reads like a slot a
 * human would pick ("2:30pm"), not "2:07pm". Already-on-the-boundary times
 * are left alone — blindly rounding turned an exact 12:00 into 12:30 and cost
 * the customer half an hour of waiting for nothing.
 *
 * Granularity is the MINUTE (seconds are zeroed first), so a booking placed at
 * 11:00:59 gets 2h59m01s of real notice rather than a literal three hours.
 * That is deliberate: minute-granular slots are what the sheet shows, and 59
 * seconds does not change whether a student can get across town.
 */
export function earliestStart(now: number = Date.now()): Date {
  const d = new Date(now + MIN_NOTICE_MS);
  d.setSeconds(0, 0);
  // Round UP to the next :00/:30 — but only when we're not already ON one.
  // Blindly rounding turned an exact 12:00 into 12:30 and quietly charged the
  // customer half an hour of extra waiting for nothing.
  const mins = d.getMinutes();
  if (mins !== 0 && mins !== 30) d.setMinutes(mins < 30 ? 30 : 60, 0, 0);
  return d;
}

/**
 * Apply the floor to a requested start time.
 *
 * Returns the ISO timestamp the booking should actually be scheduled for, and
 * whether it had to be moved. Anything missing, unparseable or sooner than the
 * floor is lifted to `earliestStart` — never rejected. A booking must never
 * die because someone asked for it too soon; it just starts a bit later, and
 * the caller tells them so.
 */
export function applyNoticeFloor(
  requestedIso: string | null | undefined,
  now: number = Date.now(),
): { scheduledAt: string; moved: boolean } {
  const floor = earliestStart(now);
  const requested = requestedIso ? Date.parse(requestedIso) : NaN;
  if (!Number.isFinite(requested) || requested < floor.getTime()) {
    return { scheduledAt: floor.toISOString(), moved: true };
  }
  return { scheduledAt: new Date(requested).toISOString(), moved: false };
}

/**
 * A human "when" label for a floored booking — "Today 2:30pm", "Tomorrow 9am".
 *
 * Needed because `when_label` is the string EVERYONE reads: the helper's offer
 * SMS, the customer's confirmation, the tracking page, the dedupe key. A
 * booking that arrived saying "Now" (a stale bundle) or "flexible" (the
 * WhatsApp door) but was floored to 3 hours out would otherwise tell both
 * sides a time that isn't the time.
 *
 * Formatted in EUROPE/DUBLIN, not the server's UTC — an edge function in
 * another region would otherwise label an Irish 2:30pm booking as 1:30pm for
 * half the year.
 */
export function noticeLabel(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Flexible';
  const TZ = 'Europe/Dublin';
  const dayOf = (t: Date) => t.toLocaleDateString('en-IE', { timeZone: TZ });
  const time = d
    .toLocaleTimeString('en-IE', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(':00', '')
    .replace(/\s/g, '')
    .toLowerCase();
  const today = dayOf(new Date(now));
  const tomorrow = dayOf(new Date(now + 24 * 60 * 60 * 1000));
  const day = dayOf(d);
  if (day === today) return `Today ${time}`;
  if (day === tomorrow) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString('en-IE', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}
