export type CommunityRateUnit = 'hourly' | 'day' | 'project' | 'negotiable' | null;

const unitSuffix: Record<string, string> = {
  hourly: '/hr',
  day: '/day',
  project: '', // "From €X" reads clearly for flat project fees
  negotiable: '',
};

function formatEuro(n: number): string {
  const rounded = Number.isInteger(n) ? n : Math.round(n * 100) / 100;
  return `€${rounded}`;
}

export function formatCommunityBudget(
  rateMin: number | null | undefined,
  rateMax: number | null | undefined,
  rateUnit: string | null | undefined,
  fallbackHourlyRate?: number | null
): { label: string; emphasis: boolean } {
  const unit = (rateUnit || '') as CommunityRateUnit;
  if (unit === 'negotiable') {
    return { label: 'Budget negotiable', emphasis: false };
  }

  const min = rateMin != null ? Number(rateMin) : null;
  const max = rateMax != null ? Number(rateMax) : null;
  const suffix = unit ? unitSuffix[unit] || '' : '/hr';

  if (min != null && max != null && min !== max) {
    return { label: `${formatEuro(min)} – ${formatEuro(max)}${suffix}`, emphasis: true };
  }
  if (min != null) {
    return { label: `From ${formatEuro(min)}${suffix}`, emphasis: true };
  }
  if (max != null) {
    return { label: `Up to ${formatEuro(max)}${suffix}`, emphasis: true };
  }

  if (fallbackHourlyRate != null && fallbackHourlyRate > 0) {
    return { label: `${formatEuro(fallbackHourlyRate)}/hr on profile`, emphasis: false };
  }

  return { label: 'Ask for a quote', emphasis: false };
}
