import React from 'react';
import { Star } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Review-platform trust strip for the hero. Signals "we're a real, reviewable
 * business" by linking out to our Trustpilot / Yelp profiles.
 *
 * HONESTY RULE: `rating`/`count` are rendered ONLY when they hold a real number.
 * Until we've actually collected reviews, leave them undefined — the chip shows
 * the platform name alone (a legitimate "find us on X" badge). Never hard-code a
 * star score we haven't earned: it breaches Trustpilot/Yelp terms and torches
 * the exact trust this strip exists to build. Once reviews land, drop the live
 * numbers in here and the stars + score appear automatically.
 */

type Platform = {
  name: string;
  href: string;
  brand: string;      // accent colour for the star (the platform's own)
  rating?: number;    // e.g. 4.9 — REAL numbers only
  count?: number;     // total reviews — REAL numbers only
};

const PLATFORMS: Platform[] = [
  {
    name: 'Trustpilot',
    href: 'https://www.trustpilot.com/review/vanojobs.com',
    brand: '#00B67A',
    // rating / count: add once we have real Trustpilot reviews.
  },
  // Yelp — uncomment and paste the live business-page URL once it's up:
  // {
  //   name: 'Yelp',
  //   href: 'https://www.yelp.ie/biz/your-vano-page',
  //   brand: '#FF1A1A',
  //   // rating / count: add once we have real Yelp reviews.
  // },
];

/**
 * `inline` drops the standalone bottom margin so a parent row can own the
 * spacing (used by the merged hero trust row). Default keeps its own mb-3 so
 * existing standalone placements are unaffected.
 */
export const ReviewBadges: React.FC<{ inline?: boolean }> = ({ inline = false }) => {
  if (PLATFORMS.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`${inline ? '' : 'mb-3'} flex flex-wrap items-center justify-center gap-2`}
    >
      {PLATFORMS.map(({ name, href, brand, rating, count }) => (
        <a
          key={name}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={
            rating
              ? `${name}: rated ${rating} out of 5${count ? ` from ${count} reviews` : ''} — opens in a new tab`
              : `Review us on ${name} — opens in a new tab`
          }
          className="group inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] border border-white/10 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-sm shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.08)] transition-colors duration-200 hover:bg-white/[0.12]"
        >
          <Star
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: brand, fill: brand }}
            aria-hidden="true"
          />
          {rating ? (
            <span className="tabular-nums font-semibold text-white/95">{rating.toFixed(1)}</span>
          ) : null}
          <span className="text-white/80 group-hover:text-white/95 transition-colors">
            {rating ? `on ${name}` : name}
          </span>
          {rating && count ? (
            <span className="text-white/45">· {count}</span>
          ) : null}
        </a>
      ))}
    </motion.div>
  );
};
