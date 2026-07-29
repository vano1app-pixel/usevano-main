import React from 'react';
import { motion, type Variants } from 'framer-motion';
import { Star, ArrowUpRight } from 'lucide-react';
import { GOOGLE_BUSINESS_URL } from '@/lib/contact';
import { EXTERNAL_REVIEWS, PLATFORM_STATS, type ExternalReview } from '@/content/externalReviews';

/**
 * The navy social-proof band — replaced the "most booked" podium (owner call
 * 2026-07-29: the podium repeated the hero tiles; this slot now showcases
 * reviews on platforms we can't edit).
 *
 * Same honesty rule as ReviewBadges: review cards and star numbers render
 * ONLY from real entries pasted into src/content/externalReviews.ts. Until
 * then the band shows the two platform cards as honest "read us there"
 * doors — never a hard-coded score, never a sample review.
 */

const PLATFORMS = [
  {
    key: 'trustpilot' as const,
    name: 'Trustpilot',
    href: 'https://www.trustpilot.com/review/vanojobs.com',
    brand: '#00B67A',
  },
  {
    key: 'google' as const,
    name: 'Google',
    href: GOOGLE_BUSINESS_URL,
    brand: '#4285F4',
  },
];

// The stars fill one by one as the card scrolls into view — the eye counts
// the rating instead of reading it. 50ms stagger, strong ease-out, scale
// from 0.6 (never 0 — nothing real appears from nothing).
const starsRow: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.05, delayChildren: 0.12 } },
};
const starPop: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  show:   { opacity: 1, scale: 1, transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] as const } },
};

function Stars({ count }: { count: number }) {
  return (
    <motion.div className="flex gap-0.5" aria-label={`${count} out of 5 stars`} variants={starsRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <motion.span key={i} variants={starPop} className="inline-flex">
          <Star
            className={`w-4 h-4 ${i < count ? 'fill-gold text-gold' : 'fill-foreground/10 text-foreground/10'}`}
            aria-hidden="true"
          />
        </motion.span>
      ))}
    </motion.div>
  );
}

// Google's own no-photo fallback is a coloured initial circle — same here,
// deterministic per name so cards keep their colour between visits.
const AVATAR_COLORS = [
  'bg-sky-100 text-sky-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
];
// Full char-code sum, not just the initial — "Armaan" and "Karan" share a
// bucket on first letters alone and rendered identical circles.
const avatarColor = (name: string) =>
  AVATAR_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

// Laid out in Google's review anatomy — avatar + name (+ real platform meta
// like "Local Guide"), stars + date, then the text — so the cards read like
// the reviews people already know, not marketing quotes. Each card rises in
// when scrolled to; its star row inherits "show" and fills sequentially.
const cardRise: Variants = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.23, 1, 0.32, 1] as const } },
};

function ExternalCard({ r }: { r: ExternalReview }) {
  const platform = PLATFORMS.find(p => p.key === r.source);
  return (
    <motion.article
      variants={cardRise}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-40px' }}
      // Thin ink outline (owner call 2026-07-30: reviews are a main part of
      // the site — make them more seeable): the site's near-black foreground
      // at 1px, not pure #000, so the line sits in the palette.
      className="bg-white rounded-2xl shadow-tinted p-5 flex flex-col gap-2.5 border border-foreground/80 text-left w-[82vw] max-w-[320px] flex-shrink-0"
    >
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${avatarColor(r.name)}`}>
          {r.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight">{r.name}</p>
          {r.meta && <p className="text-[11px] text-muted-foreground mt-0.5">{r.meta}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Stars count={r.rating} />
        {r.when && <span className="text-[11px] text-muted-foreground">{r.when}</span>}
      </div>
      <p className="text-foreground/80 text-sm leading-relaxed flex-1">{r.text}</p>
      <p className="flex items-center gap-1 text-[10px] font-semibold self-end" style={{ color: platform?.brand }}>
        <Star className="w-3 h-3 fill-current flex-shrink-0" aria-hidden="true" />
        Left on {platform?.name}
      </p>
    </motion.article>
  );
}

export const SocialProof: React.FC = () => {
  const reviews = EXTERNAL_REVIEWS.slice(0, 6);

  return (
    // Cream variant (owner preview): same section on the page background —
    // no navy slab. Phone keeps the tight py-16 rhythm.
    <section id="reviews" className="relative px-4 py-16 sm:py-28 lg:py-32 scroll-mt-20">
      <div className="relative max-w-4xl mx-auto">
        <motion.div
          className="text-center mb-8 lg:mb-14"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="eyebrow mb-3">Reviews</p>
          <h2 className="display-lg text-foreground text-balance">
            Don't take our word for it
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base mt-3 max-w-md mx-auto text-pretty">
            Our reviews live on Trustpilot and Google — platforms we can't edit. Read them all, then decide.
          </p>
        </motion.div>

        {/* The two platform doors. Stats render only when the REAL numbers are
            pasted into externalReviews.ts (the ReviewBadges honesty rule). */}
        {/* Side-by-side on EVERY size — two brand chips paired read tighter
            than two stacked full-width list items on phone. */}
        <motion.div
          className="grid grid-cols-2 gap-2.5 sm:gap-3 max-w-xl mx-auto"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
        >
          {PLATFORMS.map(({ key, name, href, brand }) => {
            const stats = PLATFORM_STATS[key];
            return (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={
                  stats
                    ? `${name}: rated ${stats.rating} out of 5 from ${stats.count} reviews — opens in a new tab`
                    : `Read our reviews on ${name} — opens in a new tab`
                }
                className="tile-float group flex items-center gap-2.5 sm:gap-3 rounded-2xl bg-white border border-border/40 px-3.5 py-3.5 sm:px-5 sm:py-4 transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98]"
              >
                <Star className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" style={{ color: brand, fill: brand }} aria-hidden="true" />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-bold text-foreground leading-tight truncate">
                    {stats ? `${stats.rating.toFixed(1)} on ${name}` : name}
                  </span>
                  <span className="block text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">
                    {stats ? `${stats.count} review${stats.count === 1 ? '' : 's'}` : 'Read our reviews'}
                  </span>
                </span>
                <ArrowUpRight className="hidden sm:block w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors flex-shrink-0" aria-hidden="true" />
              </a>
            );
          })}
        </motion.div>

        {/* The reviews drift slowly sideways in a seamless loop (owner call
            2026-07-30: "slowly moving so we can see more reviews" — this also
            replaced the Leave-a-review button + foot lines, cut the same
            day). The list renders twice; the track slides exactly one
            list-width and restarts invisibly. Hover/press pauses it so cards
            stay readable; reduced-motion falls back to a plain swipe row
            (CSS in index.css — .vano-marquee). Speed scales with the list so
            adding reviews never speeds the belt up. */}
        {reviews.length > 0 && (
          <div className="vano-marquee mt-6 sm:mt-8 -mx-4 sm:mx-0">
            <div
              className="vano-marquee-track flex gap-3 w-max"
              style={{ '--marquee-dur': `${reviews.length * 14}s` } as React.CSSProperties}
            >
              {reviews.map((r, i) => <ExternalCard key={`a-${r.source}-${i}`} r={r} />)}
              <div aria-hidden="true" className="contents">
                {reviews.map((r, i) => <ExternalCard key={`b-${r.source}-${i}`} r={r} />)}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
