import React from 'react';
import { motion } from 'framer-motion';
import { Star, ArrowUpRight } from 'lucide-react';
import { GOOGLE_BUSINESS_URL, GOOGLE_REVIEW_URL } from '@/lib/contact';
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
// the reviews people already know, not marketing quotes.
function ExternalCard({ r }: { r: ExternalReview }) {
  const platform = PLATFORMS.find(p => p.key === r.source);
  return (
    <article className="bg-white rounded-2xl shadow-tinted p-5 flex flex-col gap-2.5 border border-black/5 text-left">
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
    </article>
  );
}

export const SocialProof: React.FC = () => {
  const reviews = EXTERNAL_REVIEWS.slice(0, 6);

  return (
    <section id="reviews" className="relative bg-navy rounded-[2rem] sm:rounded-[3rem] px-4 py-24 sm:py-28 lg:py-32 scroll-mt-20">
      <div className="relative max-w-4xl mx-auto">
        <motion.div
          className="text-center mb-10 lg:mb-14"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="eyebrow text-white/40 before:bg-white/25 mb-3">Reviews</p>
          <h2 className="display-lg text-white text-balance">
            Don't take our word for it
          </h2>
          <p className="text-white/70 text-sm sm:text-base mt-3 max-w-md mx-auto text-pretty">
            Our reviews live on Trustpilot and Google — platforms we can't edit. Read them all, then decide.
          </p>
        </motion.div>

        {/* The two platform doors. Stats render only when the REAL numbers are
            pasted into externalReviews.ts (the ReviewBadges honesty rule). */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto"
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
                className="tile-float group flex items-center gap-3 rounded-2xl bg-white border border-black/5 px-5 py-4 transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98]"
              >
                <Star className="w-6 h-6 flex-shrink-0" style={{ color: brand, fill: brand }} aria-hidden="true" />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-bold text-foreground leading-tight">
                    {stats ? `${stats.rating.toFixed(1)} on ${name}` : name}
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {stats ? `${stats.count} review${stats.count === 1 ? '' : 's'}` : 'Read our reviews'}
                  </span>
                </span>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors flex-shrink-0" aria-hidden="true" />
              </a>
            );
          })}
        </motion.div>

        {reviews.length > 0 && (
          <motion.div
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-8"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
          >
            {reviews.map((r, i) => <ExternalCard key={`${r.source}-${i}`} r={r} />)}
          </motion.div>
        )}

        {/* The other half of the loop — collecting the next review. Ghost
            button on navy (the page's one primary action stays "book");
            GOOGLE_REVIEW_URL opens Google's write-a-review dialog directly. */}
        <motion.div
          className="text-center mt-10"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <a
            href={GOOGLE_REVIEW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-[background-color,border-color,transform] duration-200 hover:bg-white/10 hover:border-white/35 active:scale-[0.97]"
          >
            <Star className="w-4 h-4 fill-gold text-gold" aria-hidden="true" />
            Booked with us? Leave a review
          </a>
          <p className="mt-2.5 text-xs text-white/45">
            Takes 30 seconds on Google — or{' '}
            <a
              href="https://www.trustpilot.com/evaluate/vanojobs.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-white/70 transition-colors"
            >
              review us on Trustpilot
            </a>
            .
          </p>
        </motion.div>

        <p className="text-center text-white/60 text-sm mt-8">
          You only pay once a helper says yes · money-back guarantee
        </p>
      </div>
    </section>
  );
};
