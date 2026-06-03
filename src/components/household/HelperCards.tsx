import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface HelperRow {
  name: string;
  photo_url: string;
  city: string;
  rating_avg: number | null;
  accepted_count: number | null;
}

function Card({ name, photo, city, rating, jobs }: {
  name: string; photo: string; city: string; rating: number; jobs: number;
}) {
  return (
    <article className="snap-start w-[190px] lg:w-auto bg-white rounded-2xl shadow-tinted p-4 flex flex-col gap-3 border border-border/40">
      <img
        src={photo} alt={name} width={48} height={48}
        className="w-12 h-12 rounded-full object-cover flex-shrink-0 ring-2 ring-border/30"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground text-sm">{name}</p>
        <p className="text-muted-foreground text-xs leading-snug mt-0.5">Verified helper · {city}</p>
      </div>
      <div className="flex items-center gap-1">
        <Star className="w-3 h-3 fill-gold text-gold flex-shrink-0" aria-hidden="true" />
        <span className="text-xs font-semibold text-foreground tabular-nums">{rating.toFixed(1)}</span>
        <span className="text-xs text-muted-foreground">· {jobs} jobs</span>
      </div>
    </article>
  );
}

export const HelperCards: React.FC = () => {
  const [helpers, setHelpers] = useState<HelperRow[]>([]);

  useEffect(() => {
    (supabase as any)
      .from('household_helpers')
      .select('name, photo_url, city, rating_avg, accepted_count')
      .not('photo_url', 'is', null)
      .neq('photo_url', '')
      .limit(20)
      .then(({ data }: { data: HelperRow[] | null }) => {
        if (data && data.length > 0) {
          // Shuffle and take up to 6 random helpers
          const shuffled = [...data].sort(() => Math.random() - 0.5);
          setHelpers(shuffled.slice(0, 6));
        }
      });
  }, []);

  // Nothing to show yet — hide the section entirely
  if (helpers.length === 0) return null;

  return (
    <section className="py-12">
      <div className="px-4 max-w-5xl mx-auto mb-5">
        <p className="eyebrow mb-3">Our helpers</p>
        <h2 className="display-lg text-foreground">Your local helpers</h2>
      </div>

      {/* Mobile: horizontal scroll */}
      <div className="overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-4 lg:hidden">
        <div className="flex gap-3 px-4" style={{ width: 'max-content' }}>
          {helpers.map((h) => (
            <Card key={h.name} name={h.name} photo={h.photo_url} city={h.city}
              rating={h.rating_avg ?? 5.0} jobs={h.accepted_count ?? 0} />
          ))}
        </div>
      </div>

      {/* Desktop: 6-column grid */}
      <div className="hidden lg:grid lg:grid-cols-6 gap-3 px-4 max-w-5xl mx-auto">
        {helpers.map((h) => (
          <Card key={h.name} name={h.name} photo={h.photo_url} city={h.city}
            rating={h.rating_avg ?? 5.0} jobs={h.accepted_count ?? 0} />
        ))}
      </div>
    </section>
  );
};
