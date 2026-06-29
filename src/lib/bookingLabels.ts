// Shared customer-facing labels for a booking's category + status, plus a date
// formatter. Used by the track-a-booking lookup (FindBookingBar) and the
// My Bookings page so the two never drift.

export const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Laundry', 'grocery-shopping': 'Grocery shopping',
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
  awaiting_payment: { label: 'Awaiting payment', colour: 'text-amber-600' },
  pending:          { label: 'Finding helper…',  colour: 'text-blue-600' },
  accepted:         { label: 'Helper on the way', colour: 'text-emerald-600' },
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
  if (!scheduledDate) return 'Flexible';
  return new Date(scheduledDate).toLocaleDateString('en-IE', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}
