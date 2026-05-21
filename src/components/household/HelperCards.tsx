import React from 'react';
import { cn } from '@/lib/utils';

interface Student {
  name: string;
  course: string;
  tagline: string;
  rating: string;
  jobs: number;
}

const STUDENTS: Student[] = [
  { name: 'Emma',  course: 'Nursing · ATU',        tagline: 'Loves dogs, rain or shine 🐕',        rating: '4.9', jobs: 23 },
  { name: 'Cian',  course: 'Business · ATU',        tagline: 'Quick, reliable, Knocknacarra local 🛒', rating: '4.8', jobs: 41 },
  { name: 'Aoife', course: 'Engineering · ATU',     tagline: 'Great with flat-pack furniture 📦',  rating: '5.0', jobs: 17 },
  { name: 'Seán',  course: 'Sports Science · ATU',  tagline: 'Garden & moving specialist 🌿',      rating: '4.9', jobs: 35 },
  { name: 'Niamh', course: 'Education · ATU',       tagline: 'Patient, thorough, great with kids', rating: '5.0', jobs: 12 },
  { name: 'Liam',  course: 'IT · ATU',              tagline: 'Tech help & errands around town 🤝', rating: '4.7', jobs: 28 },
];

/* Each student gets a distinct colour so the row looks varied rather than
   one flat colour repeated. Using Tailwind bg- classes so PurgeCSS keeps them. */
const AVATAR_COLOURS = [
  'bg-sage',
  'bg-rose-400',
  'bg-amber-400',
  'bg-sky-400',
  'bg-purple-400',
  'bg-emerald-400',
];

export const HelperCards: React.FC = () => {
  return (
    <section className="py-10">
      <div className="px-4 max-w-5xl mx-auto mb-6">
        <p className="eyebrow mb-2">Our helpers</p>
        <h2 className="text-2xl font-semibold text-foreground">Meet some of the team</h2>
      </div>

      {/* snap-x: users swipe between cards on mobile; scrollbar-hide keeps it clean */}
      <div className="overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-4">
        <div className="flex gap-4 px-4" style={{ width: 'max-content' }}>
          {STUDENTS.map((s, i) => (
            <article
              key={s.name}
              className="snap-start min-w-[200px] bg-white rounded-2xl shadow-tinted p-4 flex flex-col gap-3"
            >
              {/* Coloured initial avatar */}
              <div
                className={cn(
                  'w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl',
                  AVATAR_COLOURS[i % AVATAR_COLOURS.length],
                )}
                aria-hidden="true"
              >
                {s.name[0]}
              </div>

              <div>
                <p className="font-semibold text-foreground text-sm">{s.name}</p>
                <p className="text-muted-foreground text-xs">{s.course}</p>
              </div>

              <p className="text-foreground/80 text-xs leading-relaxed flex-1">
                "{s.tagline}"
              </p>

              <p className="text-xs text-muted-foreground">
                ⭐ {s.rating} · {s.jobs} jobs
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
