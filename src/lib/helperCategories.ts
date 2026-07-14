/* Shared labels for helper category slugs + availability slots.
   Used by HelperCards, HelperPublicProfile and HelperProfile so the
   homepage cards and the profile pages never drift apart. */

export const HELPER_CATEGORY_LABELS: Record<string, string> = {
  'shopping':           '🛒 Shopping',
  'grocery-shopping':   '🛒 Groceries',
  'dog-walk':           '🐕 Dog walks',
  'dog-walking':        '🐕 Dog walks',
  'garden':             '🌿 Garden',
  'lawn-mowing':        '🌿 Lawn mowing',
  'moving':             '📦 Moving',
  'moving-help':        '📦 Moving',
  'cleaning':           '🧹 Cleaning',
  'outdoor-cleaning':   '🧹 Cleaning',
  'tutoring':           '💻 Online tutoring',
  'tutoring-grinds':    '💻 Online tutoring',
  'post-office':        '📬 Post office',
  'pharmacy-run':       '💊 Pharmacy',
  'furniture-assembly': '🔧 Furniture',
  'handyman':           '🔨 Handyman',
  'tech-help':          '📱 Tech help',
  'wait-delivery':      '🚪 Deliveries',
  // 'plumbing' and 'midnight-lift' were RETIRED (July 2026 liability triage —
  // trade work / unlicensed passenger carriage). No labels for them: a label
  // here would advertise a service Vano refuses to sell. Migration
  // 20260714010000 strips the tags from helper rows, and the card/profile
  // renderers additionally FILTER unknown slugs so a stray legacy tag can
  // never leak onto a customer-facing surface as raw text.
};

export const AVAILABILITY_SLOTS: { id: string; label: string }[] = [
  { id: 'mon-fri-morning',   label: 'Mon–Fri mornings'   },
  { id: 'mon-fri-afternoon', label: 'Mon–Fri afternoons' },
  { id: 'mon-fri-evening',   label: 'Mon–Fri evenings'   },
  { id: 'sat-morning',       label: 'Sat mornings'       },
  { id: 'sat-afternoon',     label: 'Sat afternoons'     },
  { id: 'sat-evening',       label: 'Sat evenings'       },
  { id: 'sun-morning',       label: 'Sun mornings'       },
  { id: 'sun-afternoon',     label: 'Sun afternoons'     },
  { id: 'sun-evening',       label: 'Sun evenings'       },
];
