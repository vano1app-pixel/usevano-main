/**
 * Persists a signed-out hire brief across the Google OAuth round-trip so the
 * user never has to re-enter it (and never has to click "Send" twice).
 *
 * sessionStorage is intentional — the brief should not outlive the tab.
 */

const HIRE_BRIEF_KEY = 'vano_hire_brief_v1';

export type HireBrief = {
  description: string;
  category: string | null;
  subtype: string | null;
  timeline: string | null;
  budget: string | null;
};

export function saveHireBrief(brief: HireBrief): void {
  try {
    sessionStorage.setItem(HIRE_BRIEF_KEY, JSON.stringify(brief));
  } catch {
    /* ignore */
  }
}

export function loadHireBrief(): HireBrief | null {
  try {
    const raw = sessionStorage.getItem(HIRE_BRIEF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HireBrief>;
    if (typeof parsed.description !== 'string') return null;
    return {
      description: parsed.description,
      category: typeof parsed.category === 'string' ? parsed.category : null,
      subtype: typeof parsed.subtype === 'string' ? parsed.subtype : null,
      timeline: typeof parsed.timeline === 'string' ? parsed.timeline : null,
      budget: typeof parsed.budget === 'string' ? parsed.budget : null,
    };
  } catch {
    return null;
  }
}

export function clearHireBrief(): void {
  try {
    sessionStorage.removeItem(HIRE_BRIEF_KEY);
  } catch {
    /* ignore */
  }
}

export function hasPendingHireBrief(): boolean {
  try {
    return sessionStorage.getItem(HIRE_BRIEF_KEY) !== null;
  } catch {
    return false;
  }
}
