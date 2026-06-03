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

// Shown until real approved helpers exist in the DB
const PLACEHOLDERS = [
  { name: 'Emma',  city: 'Galway', tagline: 'Great with dogs and older clients',  rating: 4.9, jobs: 23, photo: 'https://randomuser.me/api/portraits/women/26.jpg' },
  { name: 'Cian',  city: 'Galway', tagline: 'Fast, reliable, Knocknacarra local',  rating: 4.8, jobs: 41, photo: 'https://randomuser.me/api/portraits/men/41.jpg'   },
  { name: 'Aoife', city: 'Galway', tagline: 'Flat-pack, garden, errands — sorted', rating: 5.0, jobs: 17, photo: 'https://randomuser.me/api/portraits/women/44.jpg' },
  { name: 'Seán',  city: 'Galway', tagline: 'Garden and moving specialist',        rating: 4.9, jobs: 35, photo: 'https://randomuser.me/api/portraits/men/22.jpg'   },
  { name: 'Niamh', city: 'Galway', tagline: 'Patient, thorough, great craic',      rating: 5.0, jobs: 12, photo: 'https://randomuser.me/api/portraits/women/68.jpg' },
  { name: 'Liam',  city: 'Galway', tagline: 'Tech help and general errands',       rating: 4.7, jobs: 28, photo: 'https://randomuser.me/api/portraits/men/55.jpg'   },
];

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
  const [realHelpers, setRealHelpers] = useState<HelperRow[]>([]);

  useEffect(() => {
    supabase
      .from('household_helpers' as never)
      .select('name, photo_url, city, rating_avg, accepted_count')
      .eq('status', 'approved')
      .not('photo_url', 'is', null)
      .neq('photo_url', '')
      .limit(6)
      .then(({ data }) => {
        if (data && data.length > 0) setRealHelpers(data as HelperRow[]);
      });
  }, []);

  const useReal = realHelpers.length > 0;

  const cards = useReal
    ? realHelpers.map((h) => (
        <Card
          key={h.name}
          name={h.name}
          photo={h.photo_url}
          city={h.city}
          rating={h.rating_avg ?? 5.0}
          jobs={h.accepted_count ?? 0}
        />
      ))
    : PLACEHOLDERS.map((p) => (
        <Card key={p.name} name={p.name} photo={p.photo} city={p.city} rating={p.rating} jobs={p.jobs} />
      ));

  return (
    <section className="py-12">
      <div className="px-4 max-w-5xl mx-auto mb-5">
        <p className="eyebrow mb-3">Our helpers</p>
        <h2 className="display-lg text-foreground">
          {useReal ? 'Your local helpers' : 'Meet the team'}
        </h2>
      </div>

      {/* Mobile: horizontal scroll */}
      <div className="overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-4 lg:hidden">
        <div className="flex gap-3 px-4" style={{ width: 'max-content' }}>
          {cards}
        </div>
      </div>

      {/* Desktop: 6-column grid */}
      <div className="hidden lg:grid lg:grid-cols-6 gap-3 px-4 max-w-5xl mx-auto">
        {cards}
      </div>
    </section>
  );
};
