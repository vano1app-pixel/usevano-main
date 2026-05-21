import React from 'react';
import { Star } from 'lucide-react';

interface Review {
  text: string;
  name: string;
  area: string;
}

const REVIEWS: Review[] = [
  {
    text: "Cian picked up my shopping from Dunnes in the rain and had everything sorted in an hour. Brilliant service, will definitely use again.",
    name: "Sarah",
    area: "Salthill",
  },
  {
    text: "The two lads who came to help us move were brilliant — fast, careful with the furniture, and great craic. Saved us a fortune on a van hire.",
    name: "Michael",
    area: "Knocknacarra",
  },
  {
    text: "Emma walks my dog Biscuit every Tuesday now. He goes mad when he sees her coming. Absolutely delighted with the service.",
    name: "Áine",
    area: "Renmore",
  },
  {
    text: "I set this up for my mother and she says it's the best thing since sliced bread. Someone comes every week to help with the garden. She loves it.",
    name: "Margaret",
    area: "Salthill",
  },
];

export const ReviewCarousel: React.FC = () => {
  return (
    <section className="py-10">
      <div className="px-4 max-w-5xl mx-auto mb-6">
        <p className="eyebrow mb-2">Word on the street</p>
        <h2 className="text-2xl font-semibold text-foreground">What people are saying</h2>
      </div>

      <div className="overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-4">
        <div className="flex gap-4 px-4" style={{ width: 'max-content' }}>
          {REVIEWS.map((r) => (
            <article
              key={r.name}
              className="snap-start min-w-[280px] max-w-[320px] bg-white rounded-2xl shadow-tinted p-5 flex flex-col gap-3"
            >
              {/* Five gold stars */}
              <div className="flex gap-0.5" aria-label="5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className="w-4 h-4 fill-gold text-gold"
                    aria-hidden="true"
                  />
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
