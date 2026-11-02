// The buyer's view of an order (2026-09-06): four honest steps, one label per
// booking status. Everything the track page and the Orders list say about
// "where is my job" reads from here, so the two can't drift.

export interface OrderStep {
  step: 0 | 1 | 2 | 3 | 4;
  label: string;
  sub: string;
  /** Terminal states the stepper should not animate. */
  done: boolean;
}

export function orderStatus(status: string | null | undefined): OrderStep {
  switch (status) {
    case 'awaiting_payment': return { step: 0, label: 'Securing your booking', sub: 'One tap left — the fee is held, not charged', done: false };
    case 'pending':          return { step: 1, label: 'Looking for a helper',  sub: 'Nearby helpers can see your job right now', done: false };
    case 'accepted':         return { step: 2, label: 'Helper on the way',     sub: 'A helper has claimed it — you have a name', done: false };
    case 'on_way':           return { step: 2, label: 'Helper on the way',     sub: 'Heading to you now', done: false };
    case 'arrived':          return { step: 2, label: 'Helper on the way',     sub: 'At your door', done: false };
    case 'in_progress':      return { step: 3, label: 'In progress',           sub: 'The job is underway', done: false };
    case 'completed':        return { step: 4, label: 'Done',                  sub: 'Pay your helper and leave a rating', done: true };
    case 'cancelled':        return { step: 0, label: 'Cancelled',             sub: 'This booking was cancelled', done: true };
    default:                 return { step: 1, label: 'Looking for a helper',  sub: '', done: false };
  }
}

/** The cancel rule, in words the buyer sees before they tap. */
export function cancelRule(status: string | null | undefined, feeCents: number | null | undefined): { free: boolean; text: string } {
  const fee = feeCents && feeCents > 0 ? `€${(feeCents / 100).toFixed(2)}` : 'the booking fee';
  if (status === 'awaiting_payment' || status === 'pending') {
    return { free: true, text: `Free to cancel until a helper claims — the hold on your card is released.` };
  }
  return { free: false, text: `A helper has already claimed this job, so ${fee} booking fee is kept. You owe nothing for the job itself.` };
}
