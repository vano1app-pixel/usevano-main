// Shared customer-facing labels for a booking's category + status, plus a date
// formatter. Used by the My Bookings page (and any other booking list) so the
// category/status wording never drifts.

export const CATEGORY_LABELS: Record<string, string> = {
  business: 'Business temp staff', shopping: 'Laundry', 'grocery-shopping': 'Grocery shopping',
  'dog-walk': 'Dog walk', 'dog-walking': 'Dog walking',
  garden: 'Garden help', 'lawn-mowing': 'Lawn mowing',
  moving: 'Moving help', 'moving-help': 'Moving help',
  cleaning: 'Cleaning', 'outdoor-cleaning': 'Outdoor cleaning',
  tutoring: 'Online tutoring', 'tutoring-grinds': 'Online tutoring',
  'post-office': 'Post office run', 'pharmacy-run': 'Pharmacy run',
  'furniture-assembly': 'Furniture assembly', 'tech-help': 'Tech help',
  'wait-delivery': 'Wait for delivery', 'midnight-lift': 'Midnight Lift',
  handyman: 'Handyman', plumbing: 'Plumbing help',
  custom: 'Home help',
};

export const STATUS_LABEL: Record<string, { label: string; colour: string }> = {
  awaiting_payment: { label: 'Securing booking…', colour: 'text-amber-600' },
  pending:          { label: 'Finding helper…',  colour: 'text-blue-600' },
  // 'Helper confirmed', NOT 'on the way' — accepted only means a helper said
  // yes; on_way is the real travelling status. Two stages sharing one label
  // made the list look stuck when the helper actually left.
  accepted:         { label: 'Helper confirmed',  colour: 'text-emerald-600' },
  on_way:           { label: 'On the way',        colour: 'text-emerald-600' },
  arrived:          { label: 'Helper arrived',    colour: 'text-emerald-600' },
  in_progress:      { label: 'In progress',       colour: 'text-emerald-600' },
  completed:        { label: 'Completed',          colour: 'text-foreground/50' },
  cancelled:        { label: 'Cancelled',          colour: 'text-destructive/70' },
};

/** Bookings whose status means the job is still live (worth surfacing first). */
export const ACTIVE_STATUSES = new Set([
  'awaiting_payment', 'pending', 'accepted', 'on_way', 'arrived', 'in_progress',
]);

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function statusLabel(status: string): { label: string; colour: string } {
  return STATUS_LABEL[status] ?? { label: status, colour: 'text-muted-foreground' };
}

export function formatBookingDate(scheduledDate: string | null): string {
  // scheduled_date stores the human "when" LABEL, not always a real date —
  // quick-books write 'Now', '1pm', 'Tomorrow 9am', 'flexible' (see
  // create-household-payment-checkout: scheduled_date = when_label || 'flexible').
  // new Date('Now') is Invalid Date → this used to render "Invalid Date" on
  // every quick-booked row. Only format genuine dates; show the label as-is.
  if (!scheduledDate || scheduledDate.toLowerCase() === 'flexible') return 'Flexible';
  if (scheduledDate.toLowerCase() === 'now') return 'As soon as possible';
  const parsed = new Date(scheduledDate);
  if (isNaN(parsed.getTime())) return scheduledDate;
  return parsed.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Category emoji — the same tiles the customer tapped to book, so a booking
 *  is recognisable at a glance everywhere it's listed. '✨' is the custom /
 *  unknown fallback (matches the "Anything else" tile). */
export const CATEGORY_EMOJI: Record<string, string> = {
  business: '💼', shopping: '🧺', 'grocery-shopping': '🛒',
  'dog-walk': '🐕', 'dog-walking': '🐕',
  garden: '🌿', 'lawn-mowing': '🌿',
  moving: '📦', 'moving-help': '📦',
  cleaning: '🧹', 'outdoor-cleaning': '🧽',
  tutoring: '📚', 'tutoring-grinds': '📚',
  'furniture-assembly': '🔧', 'tech-help': '💻',
  'wait-delivery': '📬', handyman: '🔨', plumbing: '🔧',
};

export function categoryEmoji(category: string): string {
  return CATEGORY_EMOJI[category] ?? '✨';
}
