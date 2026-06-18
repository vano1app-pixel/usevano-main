// The "name any job" catalogue — the grounding database behind the custom
// booking section. A deliberately broad taxonomy of the everyday jobs a
// student can actually do, each with:
//   • typicalHours      — a sensible default so the price is alive instantly
//   • marketHourlyCents — a CONSERVATIVE typical local PRO rate, display-only
//                         (shown beside VANO's price for comparison, never
//                         charged) so the saving is never overstated
//   • keywords          — drive the local recogniser (matchCustomJob), which
//                         is the zero-cost stand-in for an AI brain: type
//                         "leaky tap" and it snaps to the right job. When we
//                         later wrap this in a Gemini call, the model is
//                         grounded by exactly this table.
//
// Pricing is ALWAYS time-based at VANO_HOURLY_CENTS server-side, so whatever
// the job, it can never be quoted under minimum wage.

export const VANO_HOURLY_CENTS = 1800; // €18/hr — the canonical labour rate

export interface CustomJob {
  key: string;
  emoji: string;
  label: string;
  group: string;
  /** Sensible default duration in hours (1–8). */
  typicalHours: number;
  /** Typical local pro hourly rate in cents — comparison only, never charged. */
  marketHourlyCents: number;
  /** Lowercase substrings the recogniser scores a free-text job against. */
  keywords: string[];
  /** Surfaced as a one-tap quick chip. */
  popular?: boolean;
  /** Placeholder / starter hint. */
  example?: string;
}

export const CUSTOM_JOBS: CustomJob[] = [
  // ── Home & repairs ─────────────────────────────────────────────────────
  { key: 'painting',   emoji: '🎨', label: 'Painting & decorating', group: 'Home & repairs', typicalHours: 3, marketHourlyCents: 3000, popular: true,
    keywords: ['paint', 'painting', 'decorat', 'emulsion', 'primer', 'wall', 'ceiling', 'skirting'], example: 'paint my spare bedroom' },
  { key: 'assembly',   emoji: '🔧', label: 'Flat-pack & assembly', group: 'Home & repairs', typicalHours: 2, marketHourlyCents: 3500, popular: true,
    keywords: ['flat pack', 'flatpack', 'flat-pack', 'ikea', 'assemble', 'assembly', 'wardrobe', 'bed frame', 'drawers', 'desk', 'build furniture'], example: 'build a wardrobe and a bed' },
  { key: 'mounting',   emoji: '🖼️', label: 'Mounting & hanging', group: 'Home & repairs', typicalHours: 1, marketHourlyCents: 3500, popular: true,
    keywords: ['mount', 'hang', 'shelf', 'shelves', 'bracket', 'mirror', 'picture', 'curtain', 'blind', 'tv on wall'], example: 'hang shelves and a mirror' },
  { key: 'oddjobs',    emoji: '🛠️', label: 'Odd jobs / handyman', group: 'Home & repairs', typicalHours: 2, marketHourlyCents: 3500, popular: true,
    keywords: ['odd job', 'handyman', 'fix', 'repair', 'small jobs', 'bits and bobs', 'around the house', 'diy'], example: 'a few small fixes around the house' },
  { key: 'plumbing',   emoji: '🚰', label: 'Minor plumbing', group: 'Home & repairs', typicalHours: 1, marketHourlyCents: 4000,
    keywords: ['tap', 'leak', 'leaky', 'plumb', 'sink', 'toilet', 'drain', 'washer', 'silicone', 'sealant'], example: 'fix a dripping tap' },
  { key: 'doors',      emoji: '🚪', label: 'Doors, locks & hinges', group: 'Home & repairs', typicalHours: 1, marketHourlyCents: 3500,
    keywords: ['door', 'lock', 'handle', 'hinge', 'latch', 'sticking door', 'draught'], example: 'a door that won’t close properly' },

  // ── Cleaning ───────────────────────────────────────────────────────────
  { key: 'deepclean',  emoji: '🧽', label: 'Deep clean', group: 'Cleaning', typicalHours: 3, marketHourlyCents: 2500, popular: true,
    keywords: ['deep clean', 'spring clean', 'scrub', 'big clean', 'top to bottom'], example: 'deep clean before guests arrive' },
  { key: 'clean',      emoji: '🧹', label: 'Standard clean', group: 'Cleaning', typicalHours: 2, marketHourlyCents: 2200,
    keywords: ['clean', 'hoover', 'vacuum', 'mop', 'dust', 'tidy', 'housework'], example: 'a general clean of the house' },
  { key: 'tenancy',    emoji: '🧴', label: 'End-of-tenancy clean', group: 'Cleaning', typicalHours: 4, marketHourlyCents: 2800,
    keywords: ['end of tenancy', 'move out', 'moveout', 'deposit clean', 'landlord clean'], example: 'end-of-tenancy clean to get my deposit back' },
  { key: 'oven',       emoji: '🔥', label: 'Oven & kitchen clean', group: 'Cleaning', typicalHours: 2, marketHourlyCents: 2800,
    keywords: ['oven', 'kitchen', 'degrease', 'hob', 'extractor', 'fridge clean'], example: 'clean the oven and kitchen' },
  { key: 'windows',    emoji: '🪟', label: 'Window cleaning', group: 'Cleaning', typicalHours: 2, marketHourlyCents: 2500,
    keywords: ['window', 'windows', 'glass', 'panes'], example: 'clean the windows inside and out' },
  { key: 'ironing',    emoji: '🧺', label: 'Ironing & laundry', group: 'Cleaning', typicalHours: 2, marketHourlyCents: 2000,
    keywords: ['iron', 'ironing', 'laundry', 'fold', 'washing'], example: 'a basket of ironing' },

  // ── Garden & outdoor ───────────────────────────────────────────────────
  { key: 'mowing',     emoji: '🌱', label: 'Lawn mowing', group: 'Garden & outdoor', typicalHours: 1, marketHourlyCents: 2800, popular: true,
    keywords: ['mow', 'lawn', 'grass', 'cut the grass', 'strimm'], example: 'mow the front and back lawn' },
  { key: 'weeding',    emoji: '🌿', label: 'Weeding & garden tidy', group: 'Garden & outdoor', typicalHours: 2, marketHourlyCents: 2800,
    keywords: ['weed', 'weeding', 'tidy garden', 'beds', 'borders', 'planting'], example: 'weed and tidy the garden' },
  { key: 'hedge',      emoji: '✂️', label: 'Hedge & pruning', group: 'Garden & outdoor', typicalHours: 2, marketHourlyCents: 3000,
    keywords: ['hedge', 'trim', 'bush', 'bushes', 'prune', 'pruning', 'shrub'], example: 'trim the hedges' },
  { key: 'clearance',  emoji: '🍂', label: 'Garden clearance', group: 'Garden & outdoor', typicalHours: 3, marketHourlyCents: 3000,
    keywords: ['clearance', 'clear garden', 'overgrown', 'green waste', 'leaves', 'jungle'], example: 'clear an overgrown garden' },
  { key: 'powerwash',  emoji: '💦', label: 'Power washing', group: 'Garden & outdoor', typicalHours: 2, marketHourlyCents: 3000, popular: true,
    keywords: ['power wash', 'jet wash', 'pressure wash', 'patio', 'driveway', 'decking', 'paving'], example: 'power wash the driveway' },
  { key: 'gutters',    emoji: '🪜', label: 'Gutter clearing', group: 'Garden & outdoor', typicalHours: 2, marketHourlyCents: 3000,
    keywords: ['gutter', 'gutters', 'downpipe', 'fascia'], example: 'clear the gutters' },

  // ── Moving & lifting ───────────────────────────────────────────────────
  { key: 'vanhelp',    emoji: '📦', label: 'Loading / van help', group: 'Moving & lifting', typicalHours: 2, marketHourlyCents: 2800, popular: true,
    keywords: ['move', 'moving', 'load', 'van', 'lift', 'lifting', 'boxes', 'carry'], example: 'help load a van' },
  { key: 'housemove',  emoji: '🏠', label: 'House move help', group: 'Moving & lifting', typicalHours: 4, marketHourlyCents: 2800,
    keywords: ['house move', 'full move', 'relocate', 'moving house', 'flat move'], example: 'help moving to a new place' },
  { key: 'furniture',  emoji: '🛋️', label: 'Furniture shifting', group: 'Moving & lifting', typicalHours: 1, marketHourlyCents: 2800,
    keywords: ['furniture', 'sofa', 'shift', 'rearrange', 'wardrobe move', 'heavy'], example: 'shift a sofa upstairs' },
  { key: 'tiprun',     emoji: '🚛', label: 'Tip / dump run', group: 'Moving & lifting', typicalHours: 2, marketHourlyCents: 3000,
    keywords: ['dump', 'tip run', 'rubbish', 'junk', 'haul', 'disposal', 'skip', 'clear out'], example: 'take a load to the dump' },
  { key: 'packing',    emoji: '🗃️', label: 'Packing & boxing', group: 'Moving & lifting', typicalHours: 2, marketHourlyCents: 2500,
    keywords: ['packing', 'pack', 'wrap', 'box up', 'bubble wrap'], example: 'pack up the kitchen' },

  // ── Tech & home ────────────────────────────────────────────────────────
  { key: 'tvmount',    emoji: '📺', label: 'TV mounting & setup', group: 'Tech & home', typicalHours: 1, marketHourlyCents: 3500, popular: true,
    keywords: ['tv mount', 'tv setup', 'mount the tv', 'soundbar', 'television'], example: 'mount and set up a TV' },
  { key: 'wifi',       emoji: '📶', label: 'Wi-Fi & devices', group: 'Tech & home', typicalHours: 1, marketHourlyCents: 3000,
    keywords: ['wifi', 'wi-fi', 'router', 'broadband', 'printer', 'set up', 'install'], example: 'sort out the Wi-Fi and printer' },
  { key: 'techhelp',   emoji: '💻', label: 'Phone / laptop help', group: 'Tech & home', typicalHours: 1, marketHourlyCents: 3000,
    keywords: ['laptop', 'computer', 'pc', 'phone', 'tablet', 'email', 'password', 'tech help'], example: 'help getting set up on a new laptop' },
  { key: 'smarthome',  emoji: '🏡', label: 'Smart home setup', group: 'Tech & home', typicalHours: 2, marketHourlyCents: 3500,
    keywords: ['smart home', 'alexa', 'nest', 'smart bulb', 'doorbell', 'smart plug', 'hive'], example: 'set up smart bulbs and a doorbell' },

  // ── Errands & life admin ───────────────────────────────────────────────
  { key: 'shopping',   emoji: '🛍️', label: 'Shopping & collections', group: 'Errands & admin', typicalHours: 1, marketHourlyCents: 2200, popular: true,
    keywords: ['shop', 'shopping', 'collect', 'pick up', 'grocer', 'messages', 'errand'], example: 'collect a few things in town' },
  { key: 'postrun',    emoji: '📮', label: 'Pharmacy / post run', group: 'Errands & admin', typicalHours: 1, marketHourlyCents: 2200,
    keywords: ['pharmacy', 'post office', 'parcel', 'prescription', 'post', 'drop off'], example: 'a pharmacy and post-office run' },
  { key: 'waitin',     emoji: '⏳', label: 'Wait-in / queue', group: 'Errands & admin', typicalHours: 2, marketHourlyCents: 2000,
    keywords: ['wait', 'queue', 'wait in', 'delivery', 'let in', 'meter reader'], example: 'wait in for a delivery' },
  { key: 'lift',       emoji: '🚗', label: 'Airport / station lift', group: 'Errands & admin', typicalHours: 1, marketHourlyCents: 2500,
    keywords: ['lift', 'airport', 'station', 'drop', 'collect from', 'drive'], example: 'a lift to the airport' },

  // ── Events & seasonal ──────────────────────────────────────────────────
  { key: 'party',      emoji: '🎉', label: 'Party setup / cleanup', group: 'Events & seasonal', typicalHours: 3, marketHourlyCents: 2500,
    keywords: ['party', 'event', 'setup', 'clean up', 'cleanup', 'decorate', 'host'], example: 'set up and clean up after a party' },
  { key: 'xmas',       emoji: '🎄', label: 'Decorations & seasonal', group: 'Events & seasonal', typicalHours: 2, marketHourlyCents: 2500,
    keywords: ['christmas', 'xmas', 'decorations', 'lights', 'tree', 'halloween'], example: 'put up the Christmas decorations' },
  { key: 'declutter',  emoji: '🪑', label: 'Declutter & staging', group: 'Events & seasonal', typicalHours: 2, marketHourlyCents: 2800,
    keywords: ['declutter', 'stage', 'staging', 'organise', 'organize', 'sort out', 'tidy up'], example: 'declutter and organise a room' },

  // ── Pets ───────────────────────────────────────────────────────────────
  { key: 'dog',        emoji: '🐕', label: 'Dog walking', group: 'Pets', typicalHours: 1, marketHourlyCents: 2000,
    keywords: ['dog', 'walk', 'walkies'], example: 'walk the dog' },
  { key: 'petsit',     emoji: '🐾', label: 'Pet sitting / feeding', group: 'Pets', typicalHours: 1, marketHourlyCents: 2000,
    keywords: ['pet', 'cat', 'feed', 'sitting', 'litter', 'rabbit'], example: 'feed the cat while I’m out' },

  // ── Catch-all ──────────────────────────────────────────────────────────
  { key: 'other',      emoji: '✨', label: 'Something else', group: 'Other', typicalHours: 2, marketHourlyCents: 3000, popular: true,
    keywords: [], example: 'tell us exactly what you need done' },
];

const OTHER = CUSTOM_JOBS.find((j) => j.key === 'other')!;

export const POPULAR_CUSTOM_JOBS = CUSTOM_JOBS.filter((j) => j.popular);

/** Look a job up by key, falling back to the catch-all so callers never crash. */
export function customJobByKey(key: string | null | undefined): CustomJob {
  return CUSTOM_JOBS.find((j) => j.key === key) ?? OTHER;
}

/**
 * The local recogniser — the zero-cost "AI brain" stand-in. Scores a free-text
 * job against every entry's keywords (longer keywords weigh more, as they're
 * more specific) and returns the best hit, or null if nothing meaningful
 * matched. Deterministic, instant, offline; a Gemini wrapper can replace this
 * later without touching the rest of the flow.
 */
export function matchCustomJob(text: string): CustomJob | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ')} `;
  if (t.trim().length < 2) return null;
  let best: CustomJob | null = null;
  let bestScore = 0;
  for (const job of CUSTOM_JOBS) {
    let score = 0;
    for (const kw of job.keywords) {
      if (t.includes(kw)) score += kw.length >= 5 ? 2 : 1;
    }
    if (score > bestScore) { bestScore = score; best = job; }
  }
  return bestScore > 0 ? best : null;
}
