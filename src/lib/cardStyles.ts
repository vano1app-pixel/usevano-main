// Canonical card class strings for the app. Before this every
// surface rolled its own border / radius / shadow combination
// (rounded-xl vs rounded-2xl vs rounded-[20px], border-border vs
// border-foreground/10 vs border-border/60, shadow-sm vs shadow-tinted
// vs bespoke [0_24px_60px_-20px_...] tuples). The visual drift is
// subtle on one page but compounds into a "which app am I in"
// feeling across the site.
//
// Usage: spread via cn() into the existing div, so migration is
// gradual and low-risk — no wholesale component rewrites required.
//
//   <div className={cn(cardBase, 'p-5')}>…</div>
//   <div className={cn(cardElevated, 'p-6')}>…</div>
//
// cardBase is the neutral surface — use it everywhere a plain
// container is wanted. cardElevated is for "this is the primary
// thing" surfaces (celebration modals, next-step nudges, match
// cards). cardHover adds the lift-on-hover micro-interaction for
// clickable cards; compose it onto either base.

export const cardBase =
  'rounded-2xl border border-border bg-card shadow-sm';

export const cardElevated =
  'rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.06] via-card to-card shadow-sm';

export const cardDanger =
  'rounded-2xl border border-destructive/25 bg-destructive/[0.04] shadow-sm';

export const cardWarning =
  'rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] shadow-sm';

export const cardHover =
  'transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md';
