import React, { useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Review {
  text:   string;
  name:   string;
  area:   string;
  color:  string;
  stars:  number;
}

const REVIEWS: Review[] = [
  {
    text:  "Cian picked up my shopping from Dunnes in the rain and had everything sorted in an hour. Brilliant.",
    name:  'Sarah M.',   area: 'Salthill',      color: 'bg-violet-100 text-violet-700', stars: 5,
  },
  {
    text:  "The lads who helped us move were fast, careful with the furniture, and great craic. Saved us a fortune.",
    name:  'Michael O.', area: 'Knocknacarra',  color: 'bg-sky-100 text-sky-700',       stars: 5,
  },
  {
    text:  "Emma walks my dog Biscuit every Tuesday. He goes mad when he sees her coming. Absolutely delighted.",
    name:  'Áine K.',    area: 'Renmore',       color: 'bg-emerald-100 text-emerald-700', stars: 5,
  },
  {
    text:  "I set this up for my mother and she says it's the best thing since sliced bread. Someone every week for the garden.",
    name:  'Margaret F.', area: 'Salthill',     color: 'bg-amber-100 text-amber-700',   stars: 5,
  },
  {
    text:  "Really handy service. Lad came to clean for 2 hours, did a great job. Would've been 5 stars but he was 10 minutes late.",
    name:  'Declan R.',  area: 'Oranmore',      color: 'bg-rose-100 text-rose-700',     stars: 4,
  },
  {
    text:  "Booked a dog walker same morning and someone was here by noon. Dog was happy, I was happy. Simple as.",
    name:  'Sinéad B.',  area: 'Westside',      color: 'bg-teal-100 text-teal-700',     stars: 5,
  },
  {
    text:  "Used it for garden tidying before a party. Two hours, looks brilliant. Very affordable for what you get.",
    name:  'Pádraig M.', area: 'Barna',         color: 'bg-lime-100 text-lime-700',     stars: 5,
  },
  {
    text:  "Cleaned the whole house top to bottom. Not bad at all — a couple of small spots missed but overall happy.",
    name:  'Orla C.',    area: 'Castlebar',     color: 'bg-orange-100 text-orange-700', stars: 4,
  },
  {
    text:  "Got someone to help shift furniture into a new house. Showed up on time, worked hard, no complaints.",
    name:  'Tomás F.',   area: 'Tuam',          color: 'bg-indigo-100 text-indigo-700', stars: 5,
  },
  {
    text:  "Booked a Maths tutor for my daughter — she actually understood it by the end. Will be booking again.",
    name:  'Nuala D.',   area: 'Galway City',   color: 'bg-pink-100 text-pink-700',     stars: 5,
  },
];

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${color}`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < count ? 'fill-gold text-gold' : 'fill-foreground/10 text-foreground/10'}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function ReviewCard({ r }: { r: Review }) {
  return (
    <article className="bg-white rounded-2xl shadow-tinted p-5 flex flex-col gap-4 border border-border/40 w-72 flex-shrink-0">
      <Stars count={r.stars} />
      <p className="text-foreground/80 text-sm leading-relaxed flex-1">"{r.text}"</p>
      <div className="flex items-center gap-2.5 mt-auto">
        <Avatar name={r.name} color={r.color} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground leading-tight">{r.name} · {r.area}</p>
          <p className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium mt-0.5">
            <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Verified booking
          </p>
        </div>
      </div>
    </article>
  );
}

// Infinite horizontal ticker
function ReviewTicker() {
  // Duplicate reviews so the loop looks seamless
  const items = [...REVIEWS, ...REVIEWS];

  return (
    <div className="overflow-hidden" aria-hidden="true">
      <motion.div
        className="flex gap-4 py-1"
        animate={{ x: ['0%', '-50%'] }}
        transition={{
          duration: 35,
          ease: 'linear',
          repeat: Infinity,
        }}
        style={{ width: 'max-content' }}
      >
        {items.map((r, i) => (
          <ReviewCard key={`${r.name}-${i}`} r={r} />
        ))}
      </motion.div>
    </div>
  );
}

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
    <section className="pt-16 pb-12 lg:pt-20 lg:pb-16 overflow-hidden">
      <div className="px-4 max-w-6xl mx-auto mb-8">
        <p className="eyebrow mb-3">Real customers · Galway</p>
        <h2 className="display-lg text-foreground">People love it</h2>
      </div>

      {/* Desktop: infinite scrolling ticker */}
      <div className="hidden lg:block px-4">
        <ReviewTicker />
      </div>

      {/* Mobile: auto-rotating single card */}
      <div className="lg:hidden px-4">
        <div className="relative overflow-hidden" style={{ minHeight: 190 }}>
          <AnimatePresence mode="wait">
            <motion.article
              key={index}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-2xl shadow-tinted p-5 flex flex-col gap-4 border border-border/40"
            >
              <Stars count={review.stars} />
              <p className="text-foreground/80 text-sm leading-relaxed">"{review.text}"</p>
              <div className="flex items-center gap-2.5">
                <Avatar name={review.name} color={review.color} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground leading-tight">{review.name} · {review.area}</p>
                  <p className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium mt-0.5">
                    <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Verified booking
                  </p>
                </div>
              </div>
            </motion.article>
          </AnimatePresence>
        </div>

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
