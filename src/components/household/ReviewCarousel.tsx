import React from 'react';
import { Star } from 'lucide-react';

interface Review {
  text: string;
  name: string;
  area: string;
}

const REVIEWS: Review[] = [
  {
    text: "Cian picked up my shopping from Dunnes in the rain and had everything sorted in an hour. Brilliant.",
    name: 'Sarah M.',
    area: 'Salthill',
  },
  {
    text: "The lads who helped us move were fast, careful with the furniture, and great craic. Saved us a fortune.",
    name: 'Michael O.',
    area: 'Knocknacarra',
  },
  {
    text: "Emma walks my dog Biscuit every Tuesday. He goes mad when he sees her coming. Absolutely delighted.",
    name: 'Áine K.',
    area: 'Renmore',
  },
  {
    text: "I set this up for my mother and she says it's the best thing since sliced bread. Someone every week for the garden.",
    name: 'Margaret F.',
    area: 'Salthill',
  },
];

export const ReviewCarousel: React.FC = () => {
  return (
    <section className="py-12">
      <div className="px-4 max-w-5xl mx-auto mb-5">
        <p className="eyebrow mb-3">Reviews</p>
        <h2 className="display-lg text-foreground">What people say</h2>
      </div>

      <div className="overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-4">
        <div className="flex gap-3 px-4" style={{ width: 'max-content' }}>
          {REVIEWS.map((r) => (
            <article
              key={r.name}
              className="snap-start w-[300px] bg-white rounded-2xl shadow-tinted p-5 flex flex-col gap-4 border border-border/40"
            >
              {/* Five gold stars — Lucide icons, not emoji */}
              <div className="flex gap-0.5" aria-label="5 out of 5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-gold text-gold" aria-hidden="true" />
                ))}
              </div>

              <p className="text-foreground/80 text-sm leading-relaxed flex-1">
                "{r.text}"
              </p>

              <p className="text-muted-foreground text-xs font-medium">
                {r.name} · {r.area}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
