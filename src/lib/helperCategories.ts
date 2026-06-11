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
  'tutoring':           '📚 Tutoring',
  'tutoring-grinds':    '📚 Tutoring',
  'post-office':        '📬 Post office',
  'pharmacy-run':       '💊 Pharmacy',
  'furniture-assembly': '🔧 Furniture',
  'handyman':           '🔨 Handyman',
  'plumbing':           '🚿 Plumbing',
  'tech-help':          '📱 Tech help',
  'wait-delivery':      '🚪 Deliveries',
  'midnight-lift':      '🌙 Midnight Lift',
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
