import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const CATEGORY_LABELS: Record<string, string> = {
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
  'tech-help':          '📱 Tech help',
  'wait-delivery':      '🚪 Deliveries',
  'midnight-lift':      '🌙 Midnight Lift',
};

interface HelperRow {
  name:          string;
  photo_url:     string;
  city:          string;
  age:           number | null;
  bio:           string | null;
  categories:    string[] | null;
}

function Card({ h }: { h: HelperRow }) {
  const cats = (h.categories ?? []).slice(0, 3);
  const firstName = h.name.split(' ')[0];

  return (
    <article className="snap-start w-[220px] lg:w-auto bg-card rounded-2xl border border-border/40 shadow-sm overflow-hidden flex flex-col">
      {/* Photo — square crop, full width */}
      <div className="w-full aspect-[4/3] overflow-hidden bg-secondary/40 flex-shrink-0">
        <img
          src={h.photo_url}
          alt={h.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        {/* Name + age */}
        <div>
          <p className="font-semibold text-foreground text-sm leading-tight">
            Hey, I'm {firstName}
            {h.age ? <span className="font-normal text-muted-foreground"> · {h.age}</span> : null}
          </p>
          {h.bio ? (
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{h.bio}</p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">Based in {h.city}</p>
          )}
        </div>

        {/* Category chips */}
        {cats.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto">
            {cats.map(slug => (
              <span
                key={slug}
                className="text-[10px] font-medium bg-secondary text-foreground/70 rounded-full px-2 py-0.5"
              >
                {CATEGORY_LABELS[slug] ?? slug}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export const HelperCards: React.FC = () => {
  const [helpers, setHelpers] = useState<HelperRow[]>([]);

  useEffect(() => {
    (supabase as any)
      .from('household_helpers')
      .select('name, photo_url, city, age, bio, categories')
      .neq('status', 'suspended')
      .not('photo_url', 'is', null)
      .neq('photo_url', '')
      .limit(20)
      .then(({ data }: { data: HelperRow[] | null }) => {
        if (data && data.length > 0) {
          const shuffled = [...data].sort(() => Math.random() - 0.5);
          setHelpers(shuffled.slice(0, 6));
        }
      });
  }, []);

  if (helpers.length === 0) return null;

  return (
    <section className="py-12">
      <div className="px-4 max-w-5xl mx-auto mb-6">
        <p className="eyebrow mb-3">Meet the helpers</p>
        <h2 className="text-2xl font-semibold text-foreground" style={{ letterSpacing: '-0.02em' }}>
          Real students, ready to help
        </h2>
      </div>

      {/* Mobile: horizontal scroll */}
      <div className="overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-4 lg:hidden">
        <div className="flex gap-3 px-4" style={{ width: 'max-content' }}>
          {helpers.map((h) => <Card key={h.name} h={h} />)}
        </div>
      </div>

      {/* Desktop: grid */}
      <div className="hidden lg:grid lg:grid-cols-6 gap-3 px-4 max-w-5xl mx-auto">
        {helpers.map((h) => <Card key={h.name} h={h} />)}
      </div>
    </section>
  );
};
