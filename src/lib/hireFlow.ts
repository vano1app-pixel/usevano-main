/**
 * Persists a signed-out hire brief across the Google OAuth round-trip so the
 * user never has to re-enter it (and never has to click "Send" twice).
 *
 * localStorage with a 1-hour TTL: sessionStorage was lost on some browsers
 * (mobile Safari with cross-site tracking prevention, some in-app browsers)
 * during the cross-origin OAuth redirect, which made signed-out hirers
 * answer the wizard twice. localStorage survives the round-trip universally;
 * the TTL preserves the original privacy intent — an abandoned brief expires
 * within an hour rather than living forever.
 *
 * The auto-pay intent flag distinguishes "user typed in the wizard but
 * didn't submit" (no flag) from "user clicked Match me with AI / Free
 * match" (flag set). On post-OAuth return, only the latter auto-triggers
 * the relevant handler — wizard-abandoners just see their brief restored.
 */

const HIRE_BRIEF_KEY = 'vano_hire_brief_v1';
const HIRE_BRIEF_AUTOPAY_KEY = 'vano_hire_brief_autopay_v1';
const HIRE_BRIEF_TTL_MS = 60 * 60 * 1000; // 1h

export type HireBrief = {
  description: string;
  category: string | null;
  subtype: string | null;
  timeline: string | null;
  budget: string | null;
};

export type HireAutoPayIntent = 'ai' | 'vano';

type StoredBrief = HireBrief & { savedAt: number };

export function saveHireBrief(brief: HireBrief, autoPay?: HireAutoPayIntent): void {
  try {
    const stored: StoredBrief = { ...brief, savedAt: Date.now() };
    localStorage.setItem(HIRE_BRIEF_KEY, JSON.stringify(stored));
    if (autoPay) {
      localStorage.setItem(HIRE_BRIEF_AUTOPAY_KEY, autoPay);
    } else {
      // Don't carry over a stale auto-pay intent from a prior submit.
      localStorage.removeItem(HIRE_BRIEF_AUTOPAY_KEY);
    }
  } catch {
    /* ignore */
  }
}

function readStored(): StoredBrief | null {
  try {
    const raw = localStorage.getItem(HIRE_BRIEF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredBrief>;
    if (typeof parsed.description !== 'string') return null;
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
    if (savedAt && Date.now() - savedAt > HIRE_BRIEF_TTL_MS) {
      // Expired — proactively clean up so subsequent calls don't re-check.
      clearHireBrief();
      return null;
    }
    return {
      description: parsed.description,
      category: typeof parsed.category === 'string' ? parsed.category : null,
      subtype: typeof parsed.subtype === 'string' ? parsed.subtype : null,
      timeline: typeof parsed.timeline === 'string' ? parsed.timeline : null,
      budget: typeof parsed.budget === 'string' ? parsed.budget : null,
      savedAt,
    };
  } catch {
    return null;
  }
}

export function loadHireBrief(): HireBrief | null {
  const stored = readStored();
  if (!stored) return null;
  // Strip savedAt — callers don't need it.
  const { savedAt: _ignored, ...brief } = stored;
  void _ignored;
  return brief;
}

export function clearHireBrief(): void {
  try {
    localStorage.removeItem(HIRE_BRIEF_KEY);
    localStorage.removeItem(HIRE_BRIEF_AUTOPAY_KEY);
  } catch {
    /* ignore */
  }
}

export function hasPendingHireBrief(): boolean {
  return readStored() !== null;
}

/**
 * Single-use read of the auto-pay intent flag. Returns the intent (if any)
 * AND clears it, so a subsequent page refresh or remount doesn't re-trigger
 * payment. Caller is responsible for actually invoking the handler — this
 * function only signals "the user previously tapped submit, you may proceed".
 */
export function consumeHireBriefAutoPay(): HireAutoPayIntent | null {
  try {
    const v = localStorage.getItem(HIRE_BRIEF_AUTOPAY_KEY);
    localStorage.removeItem(HIRE_BRIEF_AUTOPAY_KEY);
    return v === 'ai' || v === 'vano' ? v : null;
  } catch {
    return null;
  }
}
