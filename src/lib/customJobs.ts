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
// The catalogue is deliberately HUGE (140+ everyday jobs across a dozen
// groups) so that, whatever a customer types, it lands on a real category with
// a real price instead of the generic "Something else". The recogniser also
// forgives single typos ("tutuor" → tutoring, "painnt" → painting), so a slip
// of the finger never drops someone back to the catch-all.
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
    keywords: ['paint', 'painting', 'decorat', 'emulsion', 'primer', 'wall', 'ceiling', 'skirting', 'gloss', 'undercoat'], example: 'paint my spare bedroom' },
  { key: 'assembly',   emoji: '🔧', label: 'Flat-pack & assembly', group: 'Home & repairs', typicalHours: 2, marketHourlyCents: 3500, popular: true,
    keywords: ['flat pack', 'flatpack', 'flat-pack', 'ikea', 'assemble', 'assembly', 'wardrobe', 'bed frame', 'drawers', 'desk', 'build furniture'], example: 'build a wardrobe and a bed' },
  { key: 'mounting',   emoji: '🖼️', label: 'Mounting & hanging', group: 'Home & repairs', typicalHours: 1, marketHourlyCents: 3500, popular: true,
    keywords: ['mount', 'hang', 'shelf', 'shelves', 'bracket', 'mirror', 'picture', 'curtain', 'blind', 'tv on wall', 'coat hook', 'pictures'], example: 'hang shelves and a mirror' },
  { key: 'oddjobs',    emoji: '🛠️', label: 'Odd jobs / handyman', group: 'Home & repairs', typicalHours: 2, marketHourlyCents: 3500, popular: true,
    keywords: ['odd job', 'handyman', 'handy man', 'fix', 'repair', 'small jobs', 'bits and bobs', 'around the house', 'diy', 'jobs around'], example: 'a few small fixes around the house' },
  { key: 'plumbing',   emoji: '🚰', label: 'Minor plumbing', group: 'Home & repairs', typicalHours: 1, marketHourlyCents: 4000,
    keywords: ['tap', 'leak', 'leaky', 'plumb', 'sink', 'toilet', 'drain', 'washer', 'silicone', 'sealant', 'dripping', 'overflow'], example: 'fix a dripping tap' },
  { key: 'doors',      emoji: '🚪', label: 'Doors, locks & hinges', group: 'Home & repairs', typicalHours: 1, marketHourlyCents: 3500,
    keywords: ['door', 'lock', 'handle', 'hinge', 'latch', 'sticking door', 'draught', 'door wont close'], example: 'a door that won’t close properly' },
  { key: 'tiling',     emoji: '🧱', label: 'Tiling & grout', group: 'Home & repairs', typicalHours: 4, marketHourlyCents: 3500,
    keywords: ['tile', 'tiling', 'tiles', 'grout', 'grouting', 'regrout', 'splashback', 'mosaic'], example: 'tile the kitchen splashback' },
  { key: 'flooring',   emoji: '🪵', label: 'Flooring & laminate', group: 'Home & repairs', typicalHours: 4, marketHourlyCents: 3200,
    keywords: ['floor', 'flooring', 'laminate', 'vinyl', 'lino', 'floorboard', 'click floor', 'lay floor'], example: 'lay laminate in the hall' },
  { key: 'carpet',     emoji: '🧶', label: 'Carpet fitting', group: 'Home & repairs', typicalHours: 3, marketHourlyCents: 3000,
    keywords: ['carpet fitting', 'fit carpet', 'underlay', 'carpet gripper', 'lay carpet', 'rug fit'], example: 'fit a carpet in the bedroom' },
  { key: 'fencing',    emoji: '🚧', label: 'Fencing & gates', group: 'Home & repairs', typicalHours: 4, marketHourlyCents: 3000,
    keywords: ['fence', 'fencing', 'fence panel', 'fence post', 'gate', 'garden gate', 'palisade'], example: 'replace a broken fence panel' },
  { key: 'decking',    emoji: '🪚', label: 'Decking build', group: 'Home & repairs', typicalHours: 5, marketHourlyCents: 3200,
    keywords: ['decking', 'build deck', 'deck boards', 'lay decking', 'timber deck'], example: 'build a small deck' },
  { key: 'shedbuild',  emoji: '🏚️', label: 'Shed build & repair', group: 'Home & repairs', typicalHours: 4, marketHourlyCents: 3000,
    keywords: ['shed', 'shed build', 'shed assembly', 'shed repair', 'wendy house', 'log cabin'], example: 'put up a flat-pack shed' },
  { key: 'plastering', emoji: '🧰', label: 'Plastering & filling', group: 'Home & repairs', typicalHours: 3, marketHourlyCents: 3500,
    keywords: ['plaster', 'skim', 'fill cracks', 'filler', 'polyfilla', 'patch wall', 'crack in wall', 'hole in wall'], example: 'fill some cracks before painting' },
  { key: 'woodwork',   emoji: '🪓', label: 'Carpentry & woodwork', group: 'Home & repairs', typicalHours: 3, marketHourlyCents: 3500,
    keywords: ['carpentry', 'carpenter', 'joinery', 'skirting board', 'architrave', 'timber', 'wooden', 'cut wood'], example: 'fit new skirting boards' },
  { key: 'draughtproof', emoji: '🌬️', label: 'Draught-proofing & insulation', group: 'Home & repairs', typicalHours: 2, marketHourlyCents: 2800,
    keywords: ['draught', 'draft', 'insulation', 'weatherstrip', 'draught proof', 'seal windows', 'cold room', 'lag pipes'], example: 'draught-proof the front door' },
  { key: 'lightfit',   emoji: '💡', label: 'Light fittings & bulbs', group: 'Home & repairs', typicalHours: 1, marketHourlyCents: 3500,
    keywords: ['light fitting', 'replace bulb', 'fit light', 'lampshade', 'ceiling light', 'change bulb', 'pendant light', 'spotlight'], example: 'fit a new ceiling light' },
  { key: 'radiator',   emoji: '♨️', label: 'Radiator help', group: 'Home & repairs', typicalHours: 1, marketHourlyCents: 3500,
    keywords: ['radiator', 'bleed radiator', 'bleed the rads', 'rad', 'cold radiator', 'radiator valve'], example: 'bleed the radiators' },
  { key: 'wallpaper',  emoji: '🧻', label: 'Wallpapering', group: 'Home & repairs', typicalHours: 3, marketHourlyCents: 3000,
    keywords: ['wallpaper', 'wall paper', 'paper the', 'hang paper', 'strip wallpaper', 'feature wall'], example: 'wallpaper a feature wall' },
  { key: 'sealing',    emoji: '🛁', label: 'Sealant & caulking', group: 'Home & repairs', typicalHours: 1, marketHourlyCents: 3000,
    keywords: ['seal', 'caulk', 'caulking', 'bath seal', 'reseal', 'mastic', 'mouldy sealant'], example: 'reseal around the bath' },
  { key: 'guttering',  emoji: '🏠', label: 'Gutter & fascia repair', group: 'Home & repairs', typicalHours: 2, marketHourlyCents: 3000,
    keywords: ['gutter repair', 'leaking gutter', 'fascia', 'soffit', 'downpipe repair', 'gutter bracket'], example: 'fix a leaking gutter joint' },
  { key: 'garagedoor', emoji: '🚗', label: 'Garage door & up-and-over', group: 'Home & repairs', typicalHours: 2, marketHourlyCents: 3200,
    keywords: ['garage door', 'up and over', 'garage door spring', 'roller door'], example: 'a garage door that sticks' },
  { key: 'catflap',    emoji: '🐈', label: 'Cat flap & pet door', group: 'Home & repairs', typicalHours: 1, marketHourlyCents: 3000,
    keywords: ['cat flap', 'catflap', 'pet door', 'dog door', 'fit a flap'], example: 'fit a cat flap in the door' },

  // ── Cleaning ───────────────────────────────────────────────────────────
  { key: 'deepclean',  emoji: '🧽', label: 'Deep clean', group: 'Cleaning', typicalHours: 3, marketHourlyCents: 2500, popular: true,
    keywords: ['deep clean', 'spring clean', 'scrub', 'big clean', 'top to bottom'], example: 'deep clean before guests arrive' },
  { key: 'clean',      emoji: '🧹', label: 'Standard clean', group: 'Cleaning', typicalHours: 2, marketHourlyCents: 2200,
    keywords: ['clean', 'hoover', 'vacuum', 'mop', 'dust', 'tidy', 'housework', 'cleaner', 'house clean'], example: 'a general clean of the house' },
  { key: 'tenancy',    emoji: '🧴', label: 'End-of-tenancy clean', group: 'Cleaning', typicalHours: 4, marketHourlyCents: 2800,
    keywords: ['end of tenancy', 'move out', 'moveout', 'deposit clean', 'landlord clean', 'vacate clean'], example: 'end-of-tenancy clean to get my deposit back' },
  { key: 'oven',       emoji: '🔥', label: 'Oven & kitchen clean', group: 'Cleaning', typicalHours: 2, marketHourlyCents: 2800,
    keywords: ['oven', 'kitchen', 'degrease', 'hob', 'extractor', 'fridge clean'], example: 'clean the oven and kitchen' },
  { key: 'windows',    emoji: '🪟', label: 'Window cleaning', group: 'Cleaning', typicalHours: 2, marketHourlyCents: 2500,
    keywords: ['window', 'windows', 'glass', 'panes', 'window cleaner'], example: 'clean the windows inside and out' },
  { key: 'ironing',    emoji: '🧺', label: 'Ironing & laundry', group: 'Cleaning', typicalHours: 2, marketHourlyCents: 2000,
    keywords: ['iron', 'ironing', 'laundry', 'fold', 'washing', 'press shirts'], example: 'a basket of ironing' },
  { key: 'carpetclean', emoji: '🧼', label: 'Carpet & upholstery clean', group: 'Cleaning', typicalHours: 2, marketHourlyCents: 2800,
    keywords: ['carpet', 'shampoo', 'carpet clean', 'carpet shampoo', 'steam clean', 'upholstery', 'clean the sofa', 'stain removal', 'rug clean'], example: 'shampoo the living-room carpet' },
  { key: 'afterbuild', emoji: '🚜', label: 'After-builders clean', group: 'Cleaning', typicalHours: 4, marketHourlyCents: 3000,
    keywords: ['after builders', 'builders', 'builders clean', 'post construction', 'renovation clean', 'dust everywhere', 'rubble clean'], example: 'clean up after the builders' },
  { key: 'mould',      emoji: '🦠', label: 'Mould & damp clean', group: 'Cleaning', typicalHours: 2, marketHourlyCents: 2800,
    keywords: ['mould', 'mold', 'damp', 'mildew', 'black spots', 'condensation'], example: 'treat mould in the bathroom' },
  { key: 'bathroomclean', emoji: '🚿', label: 'Bathroom deep clean', group: 'Cleaning', typicalHours: 2, marketHourlyCents: 2500,
    keywords: ['bathroom clean', 'shower clean', 'limescale', 'descale', 'clean the toilet', 'sparkle bathroom', 'ensuite'], example: 'deep clean the bathroom' },
  { key: 'fridgeclean', emoji: '🧊', label: 'Fridge & freezer clean', group: 'Cleaning', typicalHours: 1, marketHourlyCents: 2500,
    keywords: ['fridge', 'freezer', 'defrost', 'clean the fridge', 'fridge freezer'], example: 'defrost and clean the freezer' },
  { key: 'airbnb',     emoji: '🛎️', label: 'Airbnb changeover', group: 'Cleaning', typicalHours: 2, marketHourlyCents: 2500,
    keywords: ['airbnb', 'changeover', 'turnover', 'holiday let', 'guest ready', 'short let clean', 'bnb'], example: 'turn around my Airbnb between guests' },
  { key: 'officeclean', emoji: '🏢', label: 'Office / commercial clean', group: 'Cleaning', typicalHours: 2, marketHourlyCents: 2500,
    keywords: ['office clean', 'commercial clean', 'shop clean', 'workplace', 'clean the office'], example: 'evening clean of a small office' },
  { key: 'garageclean', emoji: '🧯', label: 'Garage clear & clean', group: 'Cleaning', typicalHours: 3, marketHourlyCents: 2500,
    keywords: ['garage clear', 'garage tidy', 'clean the garage', 'garage clean', 'sort the garage'], example: 'clear out and sweep the garage' },
  { key: 'atticclear', emoji: '📦', label: 'Attic / loft clearout', group: 'Cleaning', typicalHours: 3, marketHourlyCents: 2600,
    keywords: ['attic', 'loft', 'attic clear', 'loft clear', 'sort the attic', 'empty the loft'], example: 'clear out the attic' },
  { key: 'binclean',   emoji: '🗑️', label: 'Wheelie-bin clean', group: 'Cleaning', typicalHours: 1, marketHourlyCents: 2000,
    keywords: ['bin clean', 'wheelie bin', 'bin wash', 'clean the bins', 'smelly bin'], example: 'scrub out the wheelie bins' },
  { key: 'conservatory', emoji: '🌞', label: 'Conservatory clean', group: 'Cleaning', typicalHours: 2, marketHourlyCents: 2600,
    keywords: ['conservatory', 'sunroom', 'conservatory roof', 'orangery'], example: 'clean the conservatory roof and glass' },

  // ── Garden & outdoor ───────────────────────────────────────────────────
  { key: 'mowing',     emoji: '🌱', label: 'Lawn mowing', group: 'Garden & outdoor', typicalHours: 1, marketHourlyCents: 2800, popular: true,
    keywords: ['mow', 'lawn', 'grass', 'cut the grass', 'strimm', 'mowing', 'grass cutting'], example: 'mow the front and back lawn' },
  { key: 'weeding',    emoji: '🌿', label: 'Weeding & garden tidy', group: 'Garden & outdoor', typicalHours: 2, marketHourlyCents: 2800,
    keywords: ['weed', 'weeding', 'garden', 'gardening', 'tidy garden', 'beds', 'borders', 'planting'], example: 'weed and tidy the garden' },
  { key: 'hedge',      emoji: '✂️', label: 'Hedge & pruning', group: 'Garden & outdoor', typicalHours: 2, marketHourlyCents: 3000,
    keywords: ['hedge', 'trim', 'bush', 'bushes', 'prune', 'pruning', 'shrub', 'topiary'], example: 'trim the hedges' },
  { key: 'clearance',  emoji: '🍂', label: 'Garden clearance', group: 'Garden & outdoor', typicalHours: 3, marketHourlyCents: 3000,
    keywords: ['clearance', 'clear garden', 'overgrown', 'green waste', 'leaves', 'jungle', 'brambles'], example: 'clear an overgrown garden' },
  { key: 'powerwash',  emoji: '💦', label: 'Power washing', group: 'Garden & outdoor', typicalHours: 2, marketHourlyCents: 3000, popular: true,
    keywords: ['power wash', 'jet wash', 'pressure wash', 'patio', 'driveway', 'decking wash', 'paving'], example: 'power wash the driveway' },
  { key: 'gutters',    emoji: '🪜', label: 'Gutter clearing', group: 'Garden & outdoor', typicalHours: 2, marketHourlyCents: 3000,
    keywords: ['gutter', 'gutters', 'clear gutters', 'clean gutters', 'leaves in gutter'], example: 'clear the gutters' },
  { key: 'planting',   emoji: '🌸', label: 'Planting & beds', group: 'Garden & outdoor', typicalHours: 2, marketHourlyCents: 2800,
    keywords: ['plant flowers', 'flowers', 'bedding plant', 'flower bed', 'bulbs', 'pots', 'hanging basket', 'window box', 'sow seeds', 'potting'], example: 'plant up some flower beds' },
  { key: 'treework',   emoji: '🌳', label: 'Tree & branch work', group: 'Garden & outdoor', typicalHours: 3, marketHourlyCents: 3500,
    keywords: ['tree', 'branch', 'branches', 'tree cutting', 'fallen tree', 'limb', 'log up', 'firewood'], example: 'cut back some overhanging branches' },
  { key: 'leafclear',  emoji: '🍁', label: 'Leaf clearing & raking', group: 'Garden & outdoor', typicalHours: 2, marketHourlyCents: 2600,
    keywords: ['leaf', 'leaves', 'autumn leaves', 'raking', 'rake', 'sweep leaves'], example: 'rake up all the autumn leaves' },
  { key: 'snow',       emoji: '❄️', label: 'Snow & ice clearing', group: 'Garden & outdoor', typicalHours: 1, marketHourlyCents: 2500,
    keywords: ['snow', 'snow clearing', 'grit', 'ice', 'salt the path', 'clear snow', 'icy'], example: 'clear snow from the path' },
  { key: 'turfing',    emoji: '🟩', label: 'Turfing & new lawn', group: 'Garden & outdoor', typicalHours: 4, marketHourlyCents: 3000,
    keywords: ['turf', 'new turf', 'lay lawn', 'new lawn', 'returf', 'seed lawn', 'lawn laying', 'roll out turf'], example: 'lay new turf in the back garden' },
  { key: 'raisedbed',  emoji: '🥕', label: 'Raised beds & veg patch', group: 'Garden & outdoor', typicalHours: 3, marketHourlyCents: 2800,
    keywords: ['raised bed', 'vegetable patch', 'veg patch', 'allotment', 'grow your own', 'planter box'], example: 'build a raised veg bed' },
  { key: 'pondclean',  emoji: '🪷', label: 'Pond cleaning', group: 'Garden & outdoor', typicalHours: 2, marketHourlyCents: 2800,
    keywords: ['pond', 'pond clean', 'water feature', 'pond pump', 'algae'], example: 'clean out the garden pond' },
  { key: 'fencepaint', emoji: '🖌️', label: 'Fence & shed painting', group: 'Garden & outdoor', typicalHours: 3, marketHourlyCents: 2600,
    keywords: ['paint the fence', 'fence paint', 'paint fence', 'shed paint', 'paint the shed', 'creosote', 'wood stain', 'treat the fence'], example: 'paint the garden fence' },
  { key: 'greenhouse', emoji: '🏵️', label: 'Greenhouse help', group: 'Garden & outdoor', typicalHours: 2, marketHourlyCents: 2600,
    keywords: ['greenhouse', 'glasshouse', 'polytunnel', 'cold frame'], example: 'clean and set up the greenhouse' },
  { key: 'watering',   emoji: '🚿', label: 'Plant watering / holiday cover', group: 'Garden & outdoor', typicalHours: 1, marketHourlyCents: 2000,
    keywords: ['water plants', 'water the garden', 'plant watering', 'watering', 'water my plants', 'while on holiday'], example: 'water my plants while I’m away' },
  { key: 'compost',    emoji: '♻️', label: 'Compost & mulching', group: 'Garden & outdoor', typicalHours: 2, marketHourlyCents: 2400,
    keywords: ['compost', 'mulch', 'mulching', 'bark chip', 'soil', 'topsoil', 'manure'], example: 'spread mulch over the beds' },
  { key: 'bbqclean',   emoji: '🍖', label: 'BBQ & patio furniture clean', group: 'Garden & outdoor', typicalHours: 1, marketHourlyCents: 2400,
    keywords: ['bbq', 'barbecue', 'clean the bbq', 'patio furniture', 'garden furniture clean'], example: 'scrub down the BBQ for summer' },

  // ── Moving & lifting ───────────────────────────────────────────────────
  { key: 'vanhelp',    emoji: '📦', label: 'Loading / van help', group: 'Moving & lifting', typicalHours: 2, marketHourlyCents: 2800, popular: true,
    keywords: ['move', 'moving', 'load', 'van', 'lift', 'lifting', 'boxes', 'carry', 'man with a van'], example: 'help load a van' },
  { key: 'housemove',  emoji: '🏠', label: 'House move help', group: 'Moving & lifting', typicalHours: 4, marketHourlyCents: 2800,
    keywords: ['house move', 'full move', 'relocate', 'moving house', 'flat move', 'house removal'], example: 'help moving to a new place' },
  { key: 'furniture',  emoji: '🛋️', label: 'Furniture shifting', group: 'Moving & lifting', typicalHours: 1, marketHourlyCents: 2800,
    keywords: ['furniture', 'sofa', 'shift', 'rearrange', 'wardrobe move', 'heavy'], example: 'shift a sofa upstairs' },
  { key: 'tiprun',     emoji: '🚛', label: 'Tip / dump run', group: 'Moving & lifting', typicalHours: 2, marketHourlyCents: 3000,
    keywords: ['dump', 'tip run', 'rubbish', 'junk', 'haul', 'disposal', 'skip', 'clear out'], example: 'take a load to the dump' },
  { key: 'packing',    emoji: '🗃️', label: 'Packing & boxing', group: 'Moving & lifting', typicalHours: 2, marketHourlyCents: 2500,
    keywords: ['packing', 'pack', 'wrap', 'box up', 'bubble wrap', 'pack up'], example: 'pack up the kitchen' },
  { key: 'storage',    emoji: '🔐', label: 'Storage unit help', group: 'Moving & lifting', typicalHours: 2, marketHourlyCents: 2800,
    keywords: ['storage unit', 'storage', 'lock up', 'self storage', 'into storage'], example: 'move boxes into a storage unit' },
  { key: 'mattress',   emoji: '🛏️', label: 'Mattress / bed removal', group: 'Moving & lifting', typicalHours: 1, marketHourlyCents: 2800,
    keywords: ['mattress', 'old mattress', 'dispose mattress', 'bed removal', 'take the bed'], example: 'take away an old mattress' },
  { key: 'whitegoods', emoji: '🧺', label: 'Appliance moving', group: 'Moving & lifting', typicalHours: 1, marketHourlyCents: 3000,
    keywords: ['washing machine', 'appliance', 'dishwasher', 'tumble dryer', 'fridge move', 'cooker move', 'white goods'], example: 'move a washing machine' },
  { key: 'piano',      emoji: '🎹', label: 'Piano / heavy item move', group: 'Moving & lifting', typicalHours: 2, marketHourlyCents: 4000,
    keywords: ['piano', 'piano move', 'move a piano', 'move the piano', 'heavy piano', 'safe move', 'gym equipment'], example: 'help move an upright piano' },
  { key: 'studentmove', emoji: '🎓', label: 'Student / college move', group: 'Moving & lifting', typicalHours: 2, marketHourlyCents: 2800,
    keywords: ['student move', 'college move', 'dorm', 'digs', 'res move', 'campus'], example: 'move my stuff to college digs' },
  { key: 'officemove', emoji: '🗄️', label: 'Office move help', group: 'Moving & lifting', typicalHours: 4, marketHourlyCents: 3000,
    keywords: ['office move', 'desk move', 'move the office', 'relocate office', 'filing cabinets'], example: 'help move a small office' },
  { key: 'deliveryhelp', emoji: '🚚', label: 'Delivery carry-in', group: 'Moving & lifting', typicalHours: 1, marketHourlyCents: 2600,
    keywords: ['carry in', 'carry up the stairs', 'delivery carry', 'lift it upstairs', 'help carrying'], example: 'carry a delivery up three flights' },
  { key: 'dismantle',  emoji: '🪛', label: 'Dismantle / take apart', group: 'Moving & lifting', typicalHours: 2, marketHourlyCents: 2600,
    keywords: ['dismantle', 'take apart', 'flatpack dismantle', 'take down', 'disassemble', 'break down furniture'], example: 'dismantle a bed and wardrobe' },
  { key: 'houseclearance', emoji: '🧹', label: 'House clearance', group: 'Moving & lifting', typicalHours: 5, marketHourlyCents: 3000,
    keywords: ['house clearance', 'clear the house', 'probate clearance', 'full clearance', 'empty the house', 'clear a property'], example: 'clear a full house of furniture' },

  // ── Tech & home ────────────────────────────────────────────────────────
  { key: 'tvmount',    emoji: '📺', label: 'TV mounting & setup', group: 'Tech & home', typicalHours: 1, marketHourlyCents: 3500, popular: true,
    keywords: ['tv', 'tv mount', 'tv setup', 'mount the tv', 'set up tv', 'soundbar', 'television'], example: 'mount and set up a TV' },
  { key: 'wifi',       emoji: '📶', label: 'Wi-Fi & devices', group: 'Tech & home', typicalHours: 1, marketHourlyCents: 3000,
    keywords: ['wifi', 'wi fi', 'router', 'broadband', 'printer', 'internet', 'mesh', 'dead spot'], example: 'sort out the Wi-Fi and printer' },
  { key: 'techhelp',   emoji: '💻', label: 'Phone / laptop help', group: 'Tech & home', typicalHours: 1, marketHourlyCents: 3000,
    keywords: ['laptop', 'computer', 'pc', 'phone', 'tablet', 'email', 'password', 'tech help', 'slow computer'], example: 'help getting set up on a new laptop' },
  { key: 'smarthome',  emoji: '🏡', label: 'Smart home setup', group: 'Tech & home', typicalHours: 2, marketHourlyCents: 3500,
    keywords: ['smart home', 'alexa', 'nest', 'smart bulb', 'doorbell', 'smart plug', 'hive', 'google home', 'thermostat'], example: 'set up smart bulbs and a doorbell' },
  { key: 'cctv',       emoji: '🎥', label: 'CCTV & cameras', group: 'Tech & home', typicalHours: 2, marketHourlyCents: 3800,
    keywords: ['cctv', 'security camera', 'camera setup', 'spy cam', 'wired camera', 'nvr'], example: 'set up a security camera' },
  { key: 'soundsystem', emoji: '🔊', label: 'Speakers & sound system', group: 'Tech & home', typicalHours: 1, marketHourlyCents: 3500,
    keywords: ['speakers', 'sound system', 'hifi', 'hi fi', 'sonos', 'amplifier', 'av receiver', 'surround sound'], example: 'wire up a speaker system' },
  { key: 'gaming',     emoji: '🎮', label: 'Console & gaming setup', group: 'Tech & home', typicalHours: 1, marketHourlyCents: 3000,
    keywords: ['console', 'playstation', 'ps5', 'xbox', 'gaming setup', 'nintendo', 'switch', 'monitor setup'], example: 'set up a new games console' },
  { key: 'tvaerial',   emoji: '📡', label: 'Aerial & satellite', group: 'Tech & home', typicalHours: 1, marketHourlyCents: 3500,
    keywords: ['aerial', 'satellite', 'sky dish', 'freeview', 'saorview', 'no signal', 'retune'], example: 'sort out the TV aerial signal' },
  { key: 'datatransfer', emoji: '💾', label: 'Backup & data transfer', group: 'Tech & home', typicalHours: 1, marketHourlyCents: 3000,
    keywords: ['backup', 'data transfer', 'transfer photos', 'old laptop', 'move my files', 'recover photos', 'hard drive'], example: 'move my photos to a new phone' },
  { key: 'socialsetup', emoji: '📱', label: 'Social media & accounts', group: 'Tech & home', typicalHours: 1, marketHourlyCents: 3000,
    keywords: ['social media', 'facebook', 'instagram', 'tiktok', 'set up account', 'whatsapp help', 'online account'], example: 'set up a Facebook page' },
  { key: 'websitehelp', emoji: '🌐', label: 'Website / online help', group: 'Tech & home', typicalHours: 2, marketHourlyCents: 3500,
    keywords: ['website', 'wordpress', 'wix', 'squarespace', 'online shop', 'update my site', 'web page'], example: 'tweak my small business website' },

  // ── Errands & life admin ───────────────────────────────────────────────
  { key: 'shopping',   emoji: '🛍️', label: 'Shopping & collections', group: 'Errands & admin', typicalHours: 1, marketHourlyCents: 2200, popular: true,
    keywords: ['shop', 'shopping', 'collect', 'pick up', 'messages', 'errand', 'errands'], example: 'collect a few things in town' },
  { key: 'postrun',    emoji: '📮', label: 'Pharmacy / post run', group: 'Errands & admin', typicalHours: 1, marketHourlyCents: 2200,
    keywords: ['pharmacy', 'post office', 'parcel', 'prescription', 'post', 'drop off', 'chemist'], example: 'a pharmacy and post-office run' },
  { key: 'waitin',     emoji: '⏳', label: 'Wait-in / queue', group: 'Errands & admin', typicalHours: 2, marketHourlyCents: 2000,
    keywords: ['wait', 'queue', 'wait in', 'delivery', 'meter reader', 'wait for the'], example: 'wait in for a delivery' },
  { key: 'lift',       emoji: '🚗', label: 'Airport / station lift', group: 'Errands & admin', typicalHours: 1, marketHourlyCents: 2500,
    keywords: ['lift', 'airport', 'station', 'drop', 'collect from', 'drive', 'run me to'], example: 'a lift to the airport' },
  { key: 'groceries',  emoji: '🛒', label: 'Weekly grocery shop', group: 'Errands & admin', typicalHours: 2, marketHourlyCents: 2200,
    keywords: ['grocery', 'groceries', 'weekly shop', 'food shop', 'big shop', 'supermarket', 'aldi', 'lidl', 'tesco', 'dunnes'], example: 'do my weekly grocery shop' },
  { key: 'dryclean',   emoji: '👔', label: 'Dry-cleaning drop & collect', group: 'Errands & admin', typicalHours: 1, marketHourlyCents: 2000,
    keywords: ['dry cleaning', 'dry clean', 'dry cleaner', 'suit clean', 'alterations drop'], example: 'drop and collect the dry cleaning' },
  { key: 'returns',    emoji: '↩️', label: 'Parcel returns', group: 'Errands & admin', typicalHours: 1, marketHourlyCents: 2000,
    keywords: ['return parcel', 'drop returns', 'return to shop', 'send back', 'returns run', 'an post return'], example: 'drop off a few parcel returns' },
  { key: 'formfilling', emoji: '📝', label: 'Forms & paperwork help', group: 'Errands & admin', typicalHours: 1, marketHourlyCents: 2500,
    keywords: ['form', 'forms', 'paperwork', 'application', 'fill in', 'passport form', 'grant form', 'admin help'], example: 'help filling in some forms' },
  { key: 'printing',   emoji: '🖨️', label: 'Printing & scanning run', group: 'Errands & admin', typicalHours: 1, marketHourlyCents: 2200,
    keywords: ['print', 'printing', 'scan', 'photocopy', 'laminate', 'print out', 'documents printed'], example: 'print and scan some documents' },
  { key: 'carwash',    emoji: '🚙', label: 'Car wash & valet', group: 'Errands & admin', typicalHours: 1, marketHourlyCents: 2500,
    keywords: ['car wash', 'valet', 'clean my car', 'car cleaning', 'wash the car', 'hoover the car', 'car interior'], example: 'wash and valet the car' },
  { key: 'recycling',  emoji: '♻️', label: 'Recycling & bottle run', group: 'Errands & admin', typicalHours: 1, marketHourlyCents: 2000,
    keywords: ['recycling', 'bottle bank', 'recycle run', 'bring bank', 'glass recycling', 'cardboard'], example: 'take the recycling to the bottle bank' },
  { key: 'charityshop', emoji: '🎗️', label: 'Charity-shop donation drop', group: 'Errands & admin', typicalHours: 1, marketHourlyCents: 2000,
    keywords: ['charity shop', 'charity', 'donations', 'donate clothes', 'drop to charity', 'bags of clothes'], example: 'drop bags to the charity shop' },
  { key: 'libraryrun', emoji: '📚', label: 'Library returns', group: 'Errands & admin', typicalHours: 1, marketHourlyCents: 2000,
    keywords: ['library', 'return books', 'library books', 'book return', 'renew books'], example: 'return some library books' },
  { key: 'housesit',   emoji: '🔑', label: 'House sitting / checks', group: 'Errands & admin', typicalHours: 2, marketHourlyCents: 2200,
    keywords: ['house sit', 'house sitting', 'check the house', 'house check', 'mind the house', 'while away check'], example: 'check on the house while I’m away' },
  { key: 'keyholder',  emoji: '🗝️', label: 'Key drop / meet & let in', group: 'Errands & admin', typicalHours: 1, marketHourlyCents: 2000,
    keywords: ['key drop', 'hand over keys', 'let in', 'meet the', 'give keys to', 'collect keys', 'let the plumber in'], example: 'let a tradesman in and lock up' },
  { key: 'billswitch', emoji: '💡', label: 'Bills & provider switch', group: 'Errands & admin', typicalHours: 1, marketHourlyCents: 2500,
    keywords: ['bills', 'switch provider', 'switch energy', 'compare bills', 'set up bills', 'broadband deal', 'insurance quote'], example: 'help switch my energy provider' },
  { key: 'onlinesell', emoji: '📸', label: 'Sell my stuff online', group: 'Errands & admin', typicalHours: 2, marketHourlyCents: 2500,
    keywords: ['sell online', 'donedeal', 'done deal', 'ebay', 'vinted', 'marketplace', 'adverts', 'list for sale', 'sell my'], example: 'photograph and list things to sell' },

  // ── Care & family ──────────────────────────────────────────────────────
  { key: 'babysitting', emoji: '🍼', label: 'Babysitting & childminding', group: 'Care & family', typicalHours: 3, marketHourlyCents: 2200, popular: true,
    keywords: ['babysit', 'babysitting', 'childmind', 'child minding', 'childminder', 'mind the kids', 'mind my kids', 'sitter', 'minder', 'watch the kids'], example: 'babysit two kids on Friday evening' },
  { key: 'companionship', emoji: '🫂', label: 'Companionship visit', group: 'Care & family', typicalHours: 2, marketHourlyCents: 2200,
    keywords: ['companion', 'companionship', 'company', 'chat', 'visit elderly', 'befriend', 'someone to talk', 'keep company'], example: 'a companionship visit for my nan' },
  { key: 'elderlyhelp', emoji: '👵', label: 'Help for an older person', group: 'Care & family', typicalHours: 2, marketHourlyCents: 2500,
    keywords: ['elderly', 'senior', 'granny', 'grandad', 'grandmother', 'grandfather', 'help my mum', 'help my dad', 'older person', 'pensioner'], example: 'help my elderly mum around the house' },
  { key: 'schoolrun',  emoji: '🎒', label: 'School run & collection', group: 'Care & family', typicalHours: 1, marketHourlyCents: 2200,
    keywords: ['school', 'kids', 'school run', 'collect the kids', 'collect kids', 'pick up the kids', 'drop kids', 'pick up from school', 'school pickup', 'creche run', 'after school'], example: 'collect the kids from school' },
  { key: 'mealprep',   emoji: '🍲', label: 'Meal prep & cooking', group: 'Care & family', typicalHours: 2, marketHourlyCents: 2600,
    keywords: ['meal prep', 'cook', 'cooking', 'batch cook', 'prepare meals', 'make dinner', 'home cooking', 'meals for the week'], example: 'batch-cook meals for the week' },
  { key: 'newbaby',    emoji: '👶', label: 'New-baby / postnatal help', group: 'Care & family', typicalHours: 3, marketHourlyCents: 2600,
    keywords: ['new baby', 'postnatal', 'post natal', 'after birth', 'newborn help', 'maternity help', 'mother and baby'], example: 'a hand around the house with a newborn' },
  { key: 'mobility',   emoji: '🦽', label: 'Mobility & accessibility help', group: 'Care & family', typicalHours: 2, marketHourlyCents: 2500,
    keywords: ['mobility', 'wheelchair', 'disability', 'accessible', 'help getting around', 'walking frame', 'support worker'], example: 'help someone with limited mobility' },

  // ── Lessons & tutoring ─────────────────────────────────────────────────
  { key: 'tutoring',   emoji: '📓', label: 'Tutoring & grinds', group: 'Lessons & tutoring', typicalHours: 1, marketHourlyCents: 3500, popular: true,
    keywords: ['tutor', 'tutoring', 'tuition', 'grind', 'grinds', 'exam', 'leaving cert', 'junior cert', 'homework', 'study help', 'extra help'], example: 'grinds for my Leaving Cert son' },
  { key: 'maths',      emoji: '➗', label: 'Maths tutoring', group: 'Lessons & tutoring', typicalHours: 1, marketHourlyCents: 3500,
    keywords: ['maths', 'math', 'algebra', 'calculus', 'maths grind', 'trigonometry', 'fractions', 'project maths'], example: 'maths grinds once a week' },
  { key: 'englishtut', emoji: '✍️', label: 'English & essay tutoring', group: 'Lessons & tutoring', typicalHours: 1, marketHourlyCents: 3500,
    keywords: ['english grind', 'essay', 'reading help', 'spelling', 'comprehension', 'english tuition', 'creative writing'], example: 'help with English essays' },
  { key: 'languages',  emoji: '🗣️', label: 'Language tutoring', group: 'Lessons & tutoring', typicalHours: 1, marketHourlyCents: 3500,
    keywords: ['french', 'spanish', 'irish', 'gaeilge', 'german', 'italian', 'language', 'oral practice', 'conversation practice'], example: 'French conversation practice' },
  { key: 'sciencetut', emoji: '🔬', label: 'Science tutoring', group: 'Lessons & tutoring', typicalHours: 1, marketHourlyCents: 3800,
    keywords: ['science', 'physics', 'chemistry', 'biology', 'science grind', 'lab help'], example: 'physics grinds for the Leaving Cert' },
  { key: 'music',      emoji: '🎸', label: 'Music lessons', group: 'Lessons & tutoring', typicalHours: 1, marketHourlyCents: 3500,
    keywords: ['music lesson', 'guitar', 'piano lesson', 'learn piano', 'singing', 'violin', 'drums', 'instrument', 'music tuition', 'ukulele'], example: 'guitar lessons for a beginner' },
  { key: 'coding',     emoji: '👨‍💻', label: 'Coding & computer lessons', group: 'Lessons & tutoring', typicalHours: 1, marketHourlyCents: 4000,
    keywords: ['coding', 'programming', 'python', 'scratch', 'computer class', 'learn to code', 'javascript', 'excel lesson'], example: 'teach my kid to code in Python' },
  { key: 'examprep',   emoji: '🧠', label: 'Exam prep & study skills', group: 'Lessons & tutoring', typicalHours: 2, marketHourlyCents: 3500,
    keywords: ['exam prep', 'revision', 'study skills', 'mock prep', 'exam technique', 'study plan', 'cao help'], example: 'exam revision before the mocks' },

  // ── Events & seasonal ──────────────────────────────────────────────────
  { key: 'party',      emoji: '🎉', label: 'Party setup / cleanup', group: 'Events & seasonal', typicalHours: 3, marketHourlyCents: 2500,
    keywords: ['party', 'event', 'setup', 'clean up', 'cleanup', 'decorate', 'host', 'birthday party'], example: 'set up and clean up after a party' },
  { key: 'xmas',       emoji: '🎄', label: 'Decorations & seasonal', group: 'Events & seasonal', typicalHours: 2, marketHourlyCents: 2500,
    keywords: ['christmas', 'xmas', 'decorations', 'lights', 'tree', 'halloween', 'put up decorations'], example: 'put up the Christmas decorations' },
  { key: 'declutter',  emoji: '🪑', label: 'Declutter & staging', group: 'Events & seasonal', typicalHours: 2, marketHourlyCents: 2800,
    keywords: ['declutter', 'stage', 'staging', 'organise', 'organize', 'sort out', 'tidy up', 'marie kondo'], example: 'declutter and organise a room' },
  { key: 'wedding',    emoji: '💒', label: 'Wedding day help', group: 'Events & seasonal', typicalHours: 4, marketHourlyCents: 3000,
    keywords: ['wedding', 'wedding setup', 'big day', 'venue setup', 'wedding help', 'reception setup'], example: 'extra hands to set up a wedding venue' },
  { key: 'markethelp', emoji: '🎪', label: 'Market stall help', group: 'Events & seasonal', typicalHours: 4, marketHourlyCents: 2500,
    keywords: ['market stall', 'stall', 'farmers market', 'craft fair', 'set up stall', 'pop up'], example: 'help run a market stall for the day' },
  { key: 'gravetend',  emoji: '🪦', label: 'Grave tending', group: 'Events & seasonal', typicalHours: 1, marketHourlyCents: 2800,
    keywords: ['grave', 'headstone', 'cemetery', 'tidy grave', 'graveyard', 'tend a grave', 'flowers on the grave'], example: 'tidy and tend a family grave' },
  { key: 'carboot',    emoji: '🛻', label: 'Car-boot / table sale help', group: 'Events & seasonal', typicalHours: 3, marketHourlyCents: 2400,
    keywords: ['car boot', 'boot sale', 'table top sale', 'jumble sale', 'bric a brac'], example: 'help me run a car-boot sale' },
  { key: 'debs',       emoji: '🤵', label: 'Debs / formal prep', group: 'Events & seasonal', typicalHours: 2, marketHourlyCents: 2800,
    keywords: ['debs', 'prom', 'formal', 'graduation', 'getting ready help', 'event prep'], example: 'a hand getting ready for the debs' },
  { key: 'communion',  emoji: '⛪', label: 'Communion / christening setup', group: 'Events & seasonal', typicalHours: 3, marketHourlyCents: 2800,
    keywords: ['communion', 'confirmation', 'christening', 'naming day', 'family gathering setup'], example: 'set up the house for a Communion' },
  { key: 'furnitureflip', emoji: '🪞', label: 'Upcycle & furniture restore', group: 'Events & seasonal', typicalHours: 3, marketHourlyCents: 3000,
    keywords: ['upcycle', 'restore furniture', 'sand and paint', 'refurbish', 'chalk paint', 'french polish', 'flip furniture'], example: 'sand and repaint an old dresser' },

  // ── Pets ───────────────────────────────────────────────────────────────
  { key: 'dog',        emoji: '🐕', label: 'Dog walking', group: 'Pets', typicalHours: 1, marketHourlyCents: 2000, popular: true,
    keywords: ['dog', 'walk', 'walkies', 'walk the dog', 'dog walker'], example: 'walk the dog' },
  { key: 'petsit',     emoji: '🐾', label: 'Pet sitting / feeding', group: 'Pets', typicalHours: 1, marketHourlyCents: 2000,
    keywords: ['pet', 'cat', 'feed', 'sitting', 'litter', 'rabbit', 'pet sitting', 'mind the cat'], example: 'feed the cat while I’m out' },
  { key: 'puppy',      emoji: '🐶', label: 'Puppy visit / let-out', group: 'Pets', typicalHours: 1, marketHourlyCents: 2200,
    keywords: ['puppy', 'puppy visit', 'let the dog out', 'dog let out', 'lunchtime let out', 'pop in on the dog'], example: 'pop in to let the puppy out' },
  { key: 'doggroom',   emoji: '🛁', label: 'Dog wash & groom', group: 'Pets', typicalHours: 1, marketHourlyCents: 3000,
    keywords: ['groom', 'dog wash', 'bath the dog', 'dog groom', 'wash the dog', 'deshed', 'nail clip'], example: 'wash and brush the dog' },
  { key: 'pettransport', emoji: '🚐', label: 'Pet transport / vet trip', group: 'Pets', typicalHours: 1, marketHourlyCents: 2500,
    keywords: ['vet', 'to the vet', 'pet to vet', 'dog to vet', 'vet trip', 'pet transport', 'lift to the vet', 'groomers run'], example: 'take the dog to the vet' },
  { key: 'littertray', emoji: '🐈‍⬛', label: 'Litter tray & cage clean', group: 'Pets', typicalHours: 1, marketHourlyCents: 2000,
    keywords: ['litter', 'litter tray', 'cage clean', 'hutch clean', 'clean the cage', 'muck out cage'], example: 'clean out the cat litter and hutch' },
  { key: 'smallpets',  emoji: '🐹', label: 'Small-pet care', group: 'Pets', typicalHours: 1, marketHourlyCents: 2000,
    keywords: ['hamster', 'guinea pig', 'fish', 'bird', 'budgie', 'tortoise', 'small pets', 'reptile', 'gerbil'], example: 'feed and check on the guinea pigs' },
  { key: 'horses',     emoji: '🐴', label: 'Horse / stable help', group: 'Pets', typicalHours: 2, marketHourlyCents: 2800,
    keywords: ['horse', 'pony', 'stable', 'muck out', 'mucking out', 'turn out', 'feed the horses', 'paddock'], example: 'muck out and feed the horses' },
  { key: 'chickens',   emoji: '🐔', label: 'Hens & coop care', group: 'Pets', typicalHours: 1, marketHourlyCents: 2200,
    keywords: ['chickens', 'hens', 'coop', 'eggs', 'hen house', 'poultry', 'feed the hens'], example: 'feed the hens and clean the coop' },

  // ── Business & events staffing ─────────────────────────────────────────
  { key: 'flyering',   emoji: '📬', label: 'Leaflet & flyer drops', group: 'Business & events', typicalHours: 3, marketHourlyCents: 2200,
    keywords: ['leaflet', 'flyers', 'flyering', 'drop leaflets', 'distribution', 'leaflet drop', 'door to door'], example: 'deliver flyers around the estate' },
  { key: 'eventstaff', emoji: '🧑‍🍳', label: 'Event & hospitality staff', group: 'Business & events', typicalHours: 4, marketHourlyCents: 2800,
    keywords: ['event staff', 'waiting', 'bar help', 'kitchen porter', 'waitress', 'waiter', 'serving', 'function help', 'glass collector'], example: 'serving staff for a function' },
  { key: 'promo',      emoji: '📣', label: 'Promo & brand ambassador', group: 'Business & events', typicalHours: 4, marketHourlyCents: 2800,
    keywords: ['promo', 'brand ambassador', 'sampling', 'samples', 'hand out', 'promotion', 'handing out', 'street team', 'demo staff'], example: 'hand out samples at an event' },
  { key: 'datainput',  emoji: '⌨️', label: 'Data entry & typing', group: 'Business & events', typicalHours: 2, marketHourlyCents: 2500,
    keywords: ['data entry', 'typing', 'spreadsheet', 'data input', 'copy typing', 'transcribe', 'excel work'], example: 'type up a stack of records' },
  { key: 'photography', emoji: '📷', label: 'Product / event photos', group: 'Business & events', typicalHours: 2, marketHourlyCents: 4000,
    keywords: ['photos', 'product photos', 'photograph', 'photography', 'photo shoot', 'event photos', 'headshots'], example: 'photograph products for my shop' },
  { key: 'courier',    emoji: '🛵', label: 'Local courier / drop-offs', group: 'Business & events', typicalHours: 2, marketHourlyCents: 2600,
    keywords: ['courier', 'deliveries', 'drop offs', 'same day delivery', 'dropoffs', 'local delivery', 'run deliveries'], example: 'do a round of local deliveries' },
  { key: 'merchandising', emoji: '🏷️', label: 'Shelf stacking & merchandising', group: 'Business & events', typicalHours: 3, marketHourlyCents: 2500,
    keywords: ['shelf stacking', 'restock', 'merchandising', 'stock take', 'stocktake', 'price tagging', 'shop floor'], example: 'restock and face up shelves' },
  { key: 'mysteryshop', emoji: '🕵️', label: 'Mystery shopping / surveys', group: 'Business & events', typicalHours: 1, marketHourlyCents: 2500,
    keywords: ['mystery shop', 'mystery shopper', 'survey', 'audit', 'field research', 'in store check'], example: 'a mystery-shop visit to a store' },

  // ── Catch-all ──────────────────────────────────────────────────────────
  { key: 'other',      emoji: '✨', label: 'Something else', group: 'Other', typicalHours: 2, marketHourlyCents: 3000, popular: true,
    keywords: [], example: 'tell us exactly what you need done' },
];

const OTHER = CUSTOM_JOBS.find((j) => j.key === 'other')!;

export const POPULAR_CUSTOM_JOBS = CUSTOM_JOBS.filter((j) => j.popular);

// Short, visit-style jobs that suit a 30-/45-min booking (priced from €12)
// rather than a one-hour minimum — dog walks, let-outs, bins, key-drops,
// quick errands. Everything else is booked by the hour.
const SHORT_VISIT_KEYS = new Set<string>([
  'dog', 'puppy', 'petsit', 'littertray', 'smallpets', 'chickens', 'watering',
  'binclean', 'keyholder', 'postrun', 'returns', 'libraryrun', 'recycling',
  'charityshop', 'dryclean', 'lift', 'waitin',
]);

/** True for quick visit jobs that should offer sub-hour (30/45 min) booking. */
export function isShortVisit(key: string | null | undefined): boolean {
  return !!key && SHORT_VISIT_KEYS.has(key);
}

/** Look a job up by key, falling back to the catch-all so callers never crash. */
export function customJobByKey(key: string | null | undefined): CustomJob {
  return CUSTOM_JOBS.find((j) => j.key === key) ?? OTHER;
}

/**
 * Tiny Levenshtein edit distance, used only to forgive a single fat-finger typo
 * ("tutuor" → "tutor", "painnt" → "paint"). Bails early when the two words are
 * more than two characters apart in length, since we never forgive that much.
 */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * The local recogniser — the zero-cost "AI brain" stand-in. Scores a free-text
 * job against every entry's keywords and returns the best hit, or null if
 * nothing meaningful matched.
 *
 * Two signals:
 *   1. Exact substring (the strong one) — "end of tenancy" lands tenancy. A
 *      longer keyword weighs more, as it's more specific, and exact matches are
 *      weighted double so they always beat a fuzzy guess.
 *   2. Typo tolerance (the weak one) — each whole input word is compared to the
 *      single-word keywords; one fat-finger slip is forgiven, so "tutuor",
 *      "painnt" and "cleen" still find their home instead of dropping to
 *      "Something else".
 *
 * Deterministic, instant, offline; a Gemini wrapper can replace this later
 * without touching the rest of the flow.
 */
export function matchCustomJob(text: string): CustomJob | null {
  // Normalise: lowercase, and collapse every run of non-alphanumerics to a
  // single space, so "wi-fi", "flat-pack" and "end-of-tenancy" line up with
  // their spaced keywords.
  const norm = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (norm.length < 2) return null;
  const t = ` ${norm} `;
  // Whole words long enough to be worth a fuzzy compare (3+ chars).
  const words = norm.split(' ').filter((w) => w.length >= 3);

  let best: CustomJob | null = null;
  let bestScore = 0;
  for (const job of CUSTOM_JOBS) {
    let score = 0;
    for (const kw of job.keywords) {
      if (t.includes(kw)) {
        // Exact substring — the strong signal, weighted double so it can never
        // be overturned by a fuzzy near-miss of the same length.
        score += kw.length * 2;
        continue;
      }
      // Typo tolerance: single-word keywords (4+ chars) only, compared against
      // whole input words within one character of the same length. One slip is
      // forgiven — enough for "tutuor" → "tutor" — without inviting the false
      // hits a looser budget brings (e.g. "living" ≈ "lifting").
      if (kw.length >= 4 && !kw.includes(' ')) {
        for (const w of words) {
          if (Math.abs(w.length - kw.length) <= 1 && editDistance(w, kw) === 1) {
            score += kw.length; // fuzzy — counts, but never beats an exact hit
            break;
          }
        }
      }
    }
    if (score > bestScore) { bestScore = score; best = job; }
  }
  return bestScore > 0 ? best : null;
}

/**
 * Typeahead search — the dropdown behind the hero search bar. Returns the best
 * N matching jobs (not just one), so a customer types "clean" and sees Standard
 * clean, Deep clean, End-of-tenancy, Oven & kitchen… to pick from. Short/empty
 * input returns the popular jobs as starter suggestions. "Something else" is
 * always appended as a fallback so anything is bookable.
 */
export function searchCustomJobs(text: string, limit = 6): CustomJob[] {
  const norm = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (norm.length < 2) return POPULAR_CUSTOM_JOBS.filter((j) => j.key !== 'other').slice(0, limit);

  const t = ` ${norm} `;
  const words = norm.split(' ').filter((w) => w.length >= 3);

  const scored: { job: CustomJob; score: number }[] = [];
  for (const job of CUSTOM_JOBS) {
    if (job.key === 'other') continue;
    let score = 0;
    // Label hit is a strong, intuitive signal ("clean" → every *clean* label).
    if (job.label.toLowerCase().includes(norm)) score += 12;
    for (const kw of job.keywords) {
      if (t.includes(kw)) { score += kw.length * 2; continue; }
      if (kw.length >= 4 && !kw.includes(' ')) {
        for (const w of words) {
          if (Math.abs(w.length - kw.length) <= 1 && editDistance(w, kw) === 1) { score += kw.length; break; }
        }
      }
    }
    if (score > 0) scored.push({ job, score });
  }
  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, limit).map((s) => s.job);
  // Always leave a "Something else" escape hatch at the foot of the list.
  if (!top.some((j) => j.key === 'other')) top.push(OTHER);
  return top;
}
