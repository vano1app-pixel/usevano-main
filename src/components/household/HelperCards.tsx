import React from 'react';
import { Star } from 'lucide-react';

interface Student {
  name: string;
  course: string;
  tagline: string;
  rating: string;
  jobs: number;
  photo: string;
}

const STUDENTS: Student[] = [
  { name: 'Emma',  course: 'Nursing · ATU',       tagline: 'Great with dogs and older clients',  rating: '4.9', jobs: 23, photo: 'https://randomuser.me/api/portraits/women/26.jpg' },
  { name: 'Cian',  course: 'Business · ATU',       tagline: 'Fast, reliable, Knocknacarra local',  rating: '4.8', jobs: 41, photo: 'https://randomuser.me/api/portraits/men/41.jpg'   },
  { name: 'Aoife', course: 'Engineering · ATU',    tagline: 'Flat-pack, garden, errands — sorted', rating: '5.0', jobs: 17, photo: 'https://randomuser.me/api/portraits/women/44.jpg' },
  { name: 'Seán',  course: 'Sports Science · ATU', tagline: 'Garden and moving specialist',        rating: '4.9', jobs: 35, photo: 'https://randomuser.me/api/portraits/men/22.jpg'   },
  { name: 'Niamh', course: 'Education · ATU',      tagline: 'Patient, thorough, great craic',      rating: '5.0', jobs: 12, photo: 'https://randomuser.me/api/portraits/women/68.jpg' },
  { name: 'Liam',  course: 'IT · ATU',             tagline: 'Tech help and general errands',       rating: '4.7', jobs: 28, photo: 'https://randomuser.me/api/portraits/men/55.jpg'   },
];

export const HelperCards: React.FC = () => {
  const cards = STUDENTS.map((s) => (
    <article
      key={s.name}
      className="snap-start w-[190px] lg:w-auto bg-white rounded-2xl shadow-tinted p-4 flex flex-col gap-3 border border-border/40"
    >
      <img
        src={s.photo}
        alt={s.name}
        width={48}
        height={48}
        className="w-12 h-12 rounded-full object-cover flex-shrink-0 ring-2 ring-border/30"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground text-sm">{s.name}</p>
        <p className="text-muted-foreground text-xs leading-snug mt-0.5">{s.course}</p>
        <p className="text-foreground/70 text-xs leading-relaxed mt-2">{s.tagline}</p>
      </div>
      <div className="flex items-center gap-1">
        <Star className="w-3 h-3 fill-gold text-gold flex-shrink-0" aria-hidden="true" />
        <span className="text-xs font-semibold text-foreground tabular-nums">{s.rating}</span>
        <span className="text-xs text-muted-foreground">· {s.jobs} jobs</span>
      </div>
    </article>
  ));

  return (
    <section className="py-12">
      <div className="px-4 max-w-5xl mx-auto mb-5">
        <p className="eyebrow mb-3">Our helpers</p>
        <h2 className="display-lg text-foreground">Meet the team</h2>
      </div>

      {/* Mobile: horizontal scroll */}
      <div className="overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-4 lg:hidden">
        <div className="flex gap-3 px-4" style={{ width: 'max-content' }}>
          {cards}
        </div>
      </div>

      {/* Desktop: full-width 6-column grid */}
      <div className="hidden lg:grid lg:grid-cols-6 gap-3 px-4 max-w-5xl mx-auto">
        {cards}
      </div>
    </section>
  );
};
