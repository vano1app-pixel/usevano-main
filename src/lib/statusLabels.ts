/**
 * Single source of truth for displaying status values to users.
 *
 * The codebase had drifted: a hire request was "Pending", a Vano Match
 * was "Open", an AI Find was "In progress", a Vano Pay was "Awaiting
 * payment", a hire agreement was "Active". Six different words for
 * "still happening." Users tracking multiple things on a dashboard
 * couldn't tell at a glance which ones needed their attention.
 *
 * This helper maps domain-specific raw status strings (which stay in
 * the DB / API) to a small set of user-friendly labels grouped by what
 * the user actually cares about: is it open, in flight, done, or did
 * something go wrong.
 *
 * Usage:
 *   const { label, tone } = statusLabel('awaiting_payment', 'payment');
 *   //   → { label: 'Awaiting payment', tone: 'warning' }
 *
 * `tone` matches the StatusChip tones so it can flow straight into the chip.
 */

import type { StatusTone } from '@/components/ui/StatusChip';

export type StatusKind =
  | 'request'   // hire_requests.status      — pending / accepted / declined / expired
  | 'match'     // ai_find_requests.status   — awaiting_payment / paid / scouting / complete / failed / refunded
  | 'payment'   // vano_payments.status      — awaiting_payment / paid / transferred / refunded
  | 'listing'   // community_posts.moderation_status — pending / approved / rejected
  | 'agreement' // hire_agreements.status    — active / completed / cancelled
  | 'job';      // jobs.status               — open / filled / completed / closed

interface Label {
  label: string;
  tone: StatusTone;
}

const FALLBACK: Label = { label: 'Unknown', tone: 'neutral' };

/* Hire requests — the freelancer's inbox view of "a business wants to hire me". */
const requestMap: Record<string, Label> = {
  pending:  { label: 'Awaiting reply', tone: 'warning' },
  accepted: { label: 'Accepted',       tone: 'success' },
  declined: { label: 'Declined',       tone: 'neutral' },
  expired:  { label: 'Expired',        tone: 'neutral' },
};

/* AI Find / Vano Match — the hirer's "I asked for a match" flow. */
const matchMap: Record<string, Label> = {
  awaiting_payment: { label: 'Awaiting payment', tone: 'warning' },
  paid:             { label: 'Matching',         tone: 'info' },
  scouting:         { label: 'Matching',         tone: 'info' },
  complete:         { label: 'Matched',          tone: 'success' },
  failed:           { label: 'No match',         tone: 'neutral' },
  refunded:         { label: 'Refunded',         tone: 'neutral' },
};

/* Vano Pay escrow — the money-flow view (both sides). */
const paymentMap: Record<string, Label> = {
  awaiting_payment: { label: 'Awaiting payment', tone: 'warning' },
  paid:             { label: 'Held in escrow',   tone: 'info' },
  transferred:      { label: 'Released',         tone: 'success' },
  refunded:         { label: 'Refunded',         tone: 'neutral' },
};

/* Community-board listings (freelancer side). */
const listingMap: Record<string, Label> = {
  pending:  { label: 'In review', tone: 'warning' },
  approved: { label: 'Live',      tone: 'success' },
  rejected: { label: 'Rejected',  tone: 'danger'  },
};

/* Hire agreements — the deal record once both sides agree. */
const agreementMap: Record<string, Label> = {
  active:    { label: 'In progress', tone: 'info'    },
  completed: { label: 'Done',        tone: 'success' },
  cancelled: { label: 'Cancelled',   tone: 'neutral' },
};

/* Jobs (legacy gigs flow). */
const jobMap: Record<string, Label> = {
  open:      { label: 'Open',        tone: 'info'    },
  filled:    { label: 'Filled',      tone: 'success' },
  completed: { label: 'Done',        tone: 'success' },
  closed:    { label: 'Closed',      tone: 'neutral' },
};

const MAPS: Record<StatusKind, Record<string, Label>> = {
  request:   requestMap,
  match:     matchMap,
  payment:   paymentMap,
  listing:   listingMap,
  agreement: agreementMap,
  job:       jobMap,
};

export function statusLabel(rawStatus: string | null | undefined, kind: StatusKind): Label {
  if (!rawStatus) return FALLBACK;
  return MAPS[kind][rawStatus] ?? FALLBACK;
}
