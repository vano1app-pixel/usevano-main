/** Format typical project budget for display (whole euros). */
export function formatTypicalBudget(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  const a = min != null && min > 0 ? Math.round(min) : null;
  const b = max != null && max > 0 ? Math.round(max) : null;
  if (a != null && b != null) {
    if (a <= b) return `€${a}–€${b}`;
    return `€${b}–€${a}`;
  }
  if (a != null) return `From €${a}`;
  if (b != null) return `Up to €${b}`;
  return null;
}
