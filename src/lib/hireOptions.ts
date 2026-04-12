// Shared option constants for hire flows (HirePage, QuoteModal, HireNowModal).
// Kept in one place so labels/ids stay consistent.

export const HIRE_TIMELINES = [
  { id: 'this_week', label: 'This week', sub: 'Rush job' },
  { id: '2_weeks', label: '2 weeks', sub: 'Standard' },
  { id: '1_month', label: '1 month', sub: 'No rush' },
  { id: 'flexible', label: 'Flexible', sub: 'Whenever' },
] as const;

export const HIRE_BUDGETS = [
  { id: 'under_100', label: 'Under €100', sub: 'Small task' },
  { id: '100_250', label: '€100–250', sub: 'Most popular' },
  { id: '250_500', label: '€250–500', sub: 'Bigger project' },
  { id: '500_plus', label: '€500+', sub: 'Full project' },
  { id: 'unsure', label: 'Not sure yet', sub: "We'll advise" },
] as const;

export const HIRE_CATEGORY_STARTERS: Record<string, string> = {
  videography: 'I need a video for ',
  photography: 'I need photos for ',
  websites: 'I need a website for ',
  social_media: 'I need help with social media for ',
};

export const budgetLabel = (id: string | null | undefined) =>
  HIRE_BUDGETS.find((b) => b.id === id)?.label ?? null;

export const timelineLabel = (id: string | null | undefined) =>
  HIRE_TIMELINES.find((t) => t.id === id)?.label ?? null;

/** Default window in hours for a direct hire request to expire if not responded to. */
export const DIRECT_HIRE_EXPIRY_HOURS = 2;
