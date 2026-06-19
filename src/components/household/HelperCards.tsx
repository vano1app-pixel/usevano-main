import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { HELPER_CATEGORY_LABELS as CATEGORY_LABELS } from '@/lib/helperCategories';

interface HelperRow {
  id:             string;
  name:           string;
  photo_url:      string;
  city:           string;
  age:            number | null;
  bio:            string | null;
  categories:     string[] | null;
  average_rating: number | null;
  accepted_count: number;
}

function Card({ h }: { h: HelperRow }) {
  const cats = (h.categories ?? []).slice(0, 3);
  const firstName = h.name.split(' ')[0];
  // Fade the photo in once it loads (no pop). Covers cached images too — they
  // may be `complete` before onLoad ever fires.
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  useEffect(() => { if (imgRef.current?.complete) setImgLoaded(true); }, []);

  return (
    <Link
      to={`/helpers/${h.id}`}
      aria-label={`View ${firstName}'s profile`}
      className="snap-start flex-shrink-0 w-[200px] sm:w-[220px] group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl"
    >
      <article className="h-full bg-card rounded-2xl border border-border/40 shadow-sm overflow-hidden flex flex-col transition-[transform,box-shadow,border-color] duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-tinted-lg group-hover:border-border/70 group-active:scale-[0.98]">
        <div className="w-full aspect-[4/3] overflow-hidden bg-secondary/40 flex-shrink-0">
          <img
            ref={imgRef}
            src={h.photo_url}
            alt={h.name}
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            className={`w-full h-full object-cover transition-[transform,opacity] duration-500 ease-out group-hover:scale-[1.03] ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
          />
        </div>
        <div className="p-3 flex flex-col gap-2 flex-1">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-foreground text-sm leading-tight">
                Hey, I'm {firstName}
                {h.age ? <span className="font-normal text-muted-foreground"> · {h.age}</span> : null}
              </p>
              {h.average_rating ? (
                <span className="flex items-center gap-0.5 text-xs font-semibold text-foreground flex-shrink-0">
                  <Star className="w-3 h-3 fill-gold text-gold" aria-hidden="true" />
                  {Number(h.average_rating).toFixed(1)}
                </span>
              ) : null}
            </div>
            {h.bio ? (
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{h.bio}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">Based in {h.city}</p>
            )}
          </div>
          {cats.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-auto">
              {cats.map(slug => (
                <span key={slug} className="text-[10px] font-medium bg-secondary text-foreground/70 rounded-full px-2 py-0.5">
                  {CATEGORY_LABELS[slug] ?? slug}
                </span>
              ))}
            </div>
          )}
          <span className="text-[11px] font-semibold text-sage opacity-0 group-hover:opacity-100 transition-opacity duration-200 hidden sm:flex items-center gap-1">
            View profile
            <span className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true">→</span>
          </span>
        </div>
      </article>
    </Link>
  );
}

export const HelperCards: React.FC = () => {
  const [helpers, setHelpers] = useState<HelperRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    return () => el.removeEventListener('scroll', updateScrollState);
  }, [helpers, updateScrollState]);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -460 : 460, behavior: 'smooth' });
  };

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('household_helpers')
      .select('id, name, photo_url, city, age, bio, categories, average_rating, accepted_count')
      .eq('status', 'approved')
      .not('photo_url', 'is', null)
      .neq('photo_url', '')
      .limit(20)
      .then(({ data }: { data: HelperRow[] | null }) => {
        if (data && data.length > 0) {
          const shuffled = [...data].sort(() => Math.random() - 0.5);
          setHelpers(shuffled);
        }
        setLoaded(true);
      });
  }, []);

  return (
    <section className="pt-20 pb-16 lg:py-20 min-h-[100svh] lg:flex lg:flex-col lg:justify-center">
      <div className="px-4 max-w-5xl mx-auto mb-6">
        <p className="eyebrow mb-3">Meet the helpers</p>
        <h2 className="display-lg text-foreground">
          Real students, ready to help
        </h2>
      </div>

      {!loaded ? (
        <div className="relative">
          <div className="overflow-x-auto scrollbar-hide pb-4">
            <div className="flex gap-3 px-4" style={{ width: 'max-content' }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[200px] sm:w-[220px]">
                  <div className="shimmer h-full bg-card rounded-2xl border border-border/40 overflow-hidden">
                    <div className="w-full aspect-[4/3] bg-secondary/50" />
                    <div className="p-3 space-y-2">
                      <div className="h-3.5 w-2/3 rounded bg-secondary/60" />
                      <div className="h-3 w-full rounded bg-secondary/40" />
                      <div className="h-3 w-4/5 rounded bg-secondary/40" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : helpers.length === 0 ? (
        <div className="px-4 max-w-5xl mx-auto">
          <div className="rounded-2xl border border-dashed border-border/60 bg-secondary/30 py-12 flex flex-col items-center justify-center text-center gap-3">
            <span className="text-3xl">🎓</span>
            <p className="font-semibold text-foreground text-sm">Be the first helper on VANO</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Students who sign up will be featured right here. Join today and be first.
            </p>
            <a
              href="/join"
              className="mt-2 inline-flex items-center rounded-full bg-primary text-primary-foreground px-5 py-2 text-sm font-semibold hover:-translate-y-px transition-transform duration-150"
            >
              Join as a helper →
            </a>
          </div>
        </div>
      ) : (
        <div className="relative">
          {/* Left arrow */}
          <AnimatePresence>
            {canScrollLeft && (
              <motion.button
                key="arrow-left"
                onClick={() => scroll('left')}
                aria-label="Scroll left"
                initial={{ opacity: 0, scale: 0.6, y: '-50%' }}
                animate={{ opacity: 1, scale: 1, y: '-50%' }}
                exit={{ opacity: 0, scale: 0.6, y: '-50%' }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="absolute left-1 top-1/2 z-10 hidden sm:flex items-center justify-center w-9 h-9 rounded-full bg-card border border-border/60 shadow-tinted hover:bg-secondary transition-colors duration-150"
              >
                <ChevronLeft className="w-4 h-4 text-foreground/70" />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Scroll container */}
          <div
            ref={scrollRef}
            className="overflow-x-auto overscroll-x-contain scrollbar-hide snap-x snap-mandatory pb-4"
          >
            <div className="flex gap-3 px-4" style={{ width: 'max-content' }}>
              {helpers.map((h) => <Card key={h.id} h={h} />)}
            </div>
          </div>

          {/* Right arrow */}
          <AnimatePresence>
            {canScrollRight && (
              <motion.button
                key="arrow-right"
                onClick={() => scroll('right')}
                aria-label="Scroll right"
                initial={{ opacity: 0, scale: 0.6, y: '-50%' }}
                animate={{ opacity: 1, scale: 1, y: '-50%' }}
                exit={{ opacity: 0, scale: 0.6, y: '-50%' }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-1 top-1/2 z-10 hidden sm:flex items-center justify-center w-9 h-9 rounded-full bg-card border border-border/60 shadow-tinted hover:bg-secondary transition-colors duration-150"
              >
                <ChevronRight className="w-4 h-4 text-foreground/70" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
};
