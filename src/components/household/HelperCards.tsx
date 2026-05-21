import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Student {
  name: string;
  course: string;
  tagline: string;
  rating: string;
  jobs: number;
}

const STUDENTS: Student[] = [
  { name: 'Emma',  course: 'Nursing · ATU',       tagline: 'Great with dogs and older clients',  rating: '4.9', jobs: 23 },
  { name: 'Cian',  course: 'Business · ATU',       tagline: 'Fast, reliable, Knocknacarra local',  rating: '4.8', jobs: 41 },
  { name: 'Aoife', course: 'Engineering · ATU',    tagline: 'Flat-pack, garden, errands — sorted', rating: '5.0', jobs: 17 },
  { name: 'Seán',  course: 'Sports Science · ATU', tagline: 'Garden and moving specialist',        rating: '4.9', jobs: 35 },
  { name: 'Niamh', course: 'Education · ATU',      tagline: 'Patient, thorough, great craic',      rating: '5.0', jobs: 12 },
  { name: 'Liam',  course: 'IT · ATU',             tagline: 'Tech help and general errands',       rating: '4.7', jobs: 28 },
];

/* Each student gets a distinct hue so the row reads as a team, not a clone. */
const AVATAR_BG = [
  'bg-sage text-white',
  'bg-rose-400 text-white',
  'bg-amber-400 text-white',
  'bg-sky-500 text-white',
  'bg-purple-400 text-white',
  'bg-emerald-500 text-white',
];

export const HelperCards: React.FC = () => {
  return (
    <section className="py-12">
      <div className="px-4 max-w-5xl mx-auto mb-5">
        <p className="eyebrow mb-3">Our helpers</p>
        <h2 className="display-lg text-foreground">Meet the team</h2>
      </div>

      <div className="overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-4">
        <div className="flex gap-3 px-4" style={{ width: 'max-content' }}>
          {STUDENTS.map((s, i) => (
            <article
              key={s.name}
              className="snap-start w-[190px] bg-white rounded-2xl shadow-tinted p-4 flex flex-col gap-3 border border-border/40"
            >
              {/* Coloured initial avatar */}
              <div
                className={cn(
                  'w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0',
                  AVATAR_BG[i % AVATAR_BG.length],
                )}
                aria-hidden="true"
              >
                {s.name[0]}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm">{s.name}</p>
                <p className="text-muted-foreground text-xs leading-snug mt-0.5">{s.course}</p>
                <p className="text-foreground/70 text-xs leading-relaxed mt-2">{s.tagline}</p>
              </div>

              {/* Rating — Lucide Star icon, not emoji */}
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 fill-gold text-gold flex-shrink-0" aria-hidden="true" />
                <span className="text-xs font-semibold text-foreground tabular-nums">{s.rating}</span>
                <span className="text-xs text-muted-foreground">· {s.jobs} jobs</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
