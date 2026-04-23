/**
 * Persists an in-progress direct-hire form (HireNowModal) across a
 * sign-in round-trip so a hirer whose JWT expired mid-form doesn't
 * lose their brief / timeline / budget when we bounce them through
 * /auth.
 *
 * Mirrors the AI-Find brief pattern in `hireFlow.ts`, but keyed by
 * freelancer id because each direct hire targets one specific
 * freelancer — opening HireNowModal for a different freelancer must
 * not surface the previous draft.
 *
 * sessionStorage so it doesn't outlive the tab.
 */

const DIRECT_HIRE_DRAFT_KEY = 'vano_direct_hire_draft_v1';

export type DirectHireDraft = {
  freelancerId: string;
  brief: string;
  timeline: string | null;
  budget: string | null;
};

export function saveDirectHireDraft(draft: DirectHireDraft): void {
  try {
    sessionStorage.setItem(DIRECT_HIRE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* private mode or quota — silently skip; the form just won't restore */
  }
}

/**
 * Returns the saved draft only if it matches the requested freelancer
 * id. Null otherwise — guarantees a draft for freelancer A never leaks
 * into the modal for freelancer B.
 */
export function loadDirectHireDraft(freelancerId: string): DirectHireDraft | null {
  try {
    const raw = sessionStorage.getItem(DIRECT_HIRE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DirectHireDraft>;
    if (parsed.freelancerId !== freelancerId) return null;
    if (typeof parsed.brief !== 'string') return null;
    return {
      freelancerId,
      brief: parsed.brief,
      timeline: typeof parsed.timeline === 'string' ? parsed.timeline : null,
      budget: typeof parsed.budget === 'string' ? parsed.budget : null,
    };
  } catch {
    return null;
  }
}

export function clearDirectHireDraft(): void {
  try {
    sessionStorage.removeItem(DIRECT_HIRE_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
