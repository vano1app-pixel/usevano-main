import React, { useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

const INTERVAL = 4000;

export const ReviewCarousel: React.FC = () => {
  const [index, setIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  function startTimer() {
    timer.current = setInterval(() => {
      setIndex(i => (i + 1) % REVIEWS.length);
    }, INTERVAL);
  }

  useEffect(() => {
    startTimer();
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  function goTo(i: number) {
    if (timer.current) clearInterval(timer.current);
    setIndex(i);
    startTimer();
  }

  const review = REVIEWS[index];

  return (
    <section className="pt-16 pb-12 lg:pt-20 lg:pb-16">
      <div className="px-4 max-w-5xl mx-auto mb-8">
        <p className="eyebrow mb-3">Real customers · Galway</p>
        <h2 className="display-lg text-foreground">People love it</h2>
      </div>

      {/* Desktop: full-width 4-column static grid */}
      <div className="hidden lg:grid lg:grid-cols-4 gap-3 px-4 max-w-5xl mx-auto">
        {REVIEWS.map((r) => (
          <article key={r.name} className="bg-white rounded-2xl shadow-tinted p-5 flex flex-col gap-4 border border-border/40">
            <div className="flex gap-0.5" aria-label="5 out of 5 stars">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-gold text-gold" aria-hidden="true" />
              ))}
            </div>
            <p className="text-foreground/80 text-sm leading-relaxed flex-1">"{r.text}"</p>
            <p className="text-muted-foreground text-xs font-medium">{r.name} · {r.area}</p>
          </article>
        ))}
      </div>

      {/* Mobile: auto-rotating single card */}
      <div className="lg:hidden px-4">
        <div className="relative overflow-hidden" style={{ minHeight: 180 }}>
          <AnimatePresence mode="wait">
            <motion.article
              key={index}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-2xl shadow-tinted p-5 flex flex-col gap-4 border border-border/40"
            >
              <div className="flex gap-0.5" aria-label="5 out of 5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-gold text-gold" aria-hidden="true" />
                ))}
              </div>
              <p className="text-foreground/80 text-sm leading-relaxed">"{review.text}"</p>
              <p className="text-muted-foreground text-xs font-medium">{review.name} · {review.area}</p>
            </motion.article>
          </AnimatePresence>
        </div>

        {/* Dot indicators */}
        <div className="flex justify-center gap-2 mt-4">
          {REVIEWS.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Review ${i + 1}`}
              className={`rounded-full transition-all duration-300 ${
                i === index ? 'w-5 h-2 bg-foreground' : 'w-2 h-2 bg-border'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
