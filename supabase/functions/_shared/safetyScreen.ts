// The free-text SAFETY SCREEN — the single place an unsafe request pattern
// is defined on the backend.
//
// Lifted verbatim out of create-household-payment-checkout (same move as
// householdPricing.ts) so the patterns are pure TypeScript with no Deno APIs:
// vitest imports this module directly and the blocked lines below are pinned
// by src/lib/__tests__/safetyScreen.test.ts instead of living untested inside
// an edge function.
//
// Helpers are ID-verified students, NOT Garda-vetted and not tradespeople.
// Work with children / vulnerable adults is "relevant work" under the
// National Vetting Bureau Acts, and trade/height/driving-for-hire work is an
// insurance and safety line we don't cross. The catalogue no longer offers
// these (plumbing and midnight-lift were retired in the July 2026 liability
// triage), but the "Something else" box takes any text — so requests are
// screened server-side before they can be inserted or dispatched.
// Deliberately conservative patterns to avoid blocking legitimate jobs
// (e.g. "clean the kids' bedroom" and "clean the sink" must still pass).

export const UNSAFE_REQUEST_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(babysit|baby[- ]?sit|babysitt|childmind|child[- ]?mind|nanny|au pair|creche|crèche)/i,
    reason: 'minding children' },
  { re: /\b(school (run|pickup|pick[- ]?up|drop[- ]?off|collection))|collect\w* (the |my )?(kids|children)\b/i,
    reason: 'minding children' },
  { re: /\b(mind|watch|look after|take care of|care for) (the |my |our )?(kid|kids|child|children|baby|toddler|son|daughter|little one)/i,
    reason: 'minding children' },
  { re: /\b(elderly|dementia|alzheimer|carer|caregiver|home care|personal care|medication|nursing)\b/i,
    reason: 'caring for a vulnerable person' },
  { re: /\b(rewire|fuse ?board|consumer unit|socket|mains|boiler|gas |immersion|electrics|electrical work)\b/i,
    reason: 'qualified trade work' },
  // Plumbing joined the trade line when the 'plumbing' category was retired —
  // fixture REPAIR is trade work; cleaning a sink is not, so the verbs matter.
  { re: /\b(plumb\w*|burst pipe|leak(y|ing)? (pipe|tap|sink|toilet|radiator)|(fix|repair|replace|instal\w*) (the |my |our |a )?(sink|tap|taps|toilet|radiator|shower|drain)|blocked (drain|toilet|sink))\b/i,
    reason: 'plumbing work' },
  { re: /\b(roof|chimney|scaffold|gutters?\b)/i,
    reason: 'working at height' },
  // "…home" variants matter since midnight-lift was retired: "a lift home" is
  // the exact request that category used to absorb.
  { re: /\b(lift|drive|run) (me|us|him|her) (to|home)\b|\ba lift (to|home)\b|\bairport (run|lift|drop)/i,
    reason: 'driving passengers' },
];

// Returns the human-readable reason a request is refused, or null if it passes.
export function screenRequestText(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  return UNSAFE_REQUEST_PATTERNS.find((p) => p.re.test(t))?.reason ?? null;
}
