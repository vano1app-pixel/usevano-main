import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Mic2, Play, Radio } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { EPISODES, PLATFORMS, STATS, CONTACT, SHOW, BOOKING } from '@/content/podcast';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

// The motif: a waveform that breathes. Echoed small in the logo dot, big in the
// hero, tiny in the footer — one thing at every scale.
const Wave = ({ bars = 48, className = '' }: { bars?: number; className?: string }) => (
  <div className={`flex items-end gap-[3px] ${className}`} aria-hidden>
    {Array.from({ length: bars }).map((_, i) => (
      <motion.span
        key={i}
        className="w-[3px] rounded-full bg-gold"
        animate={{ height: [8, 14 + Math.abs(Math.sin(i * 1.7)) * 34, 8] }}
        transition={{ duration: 1.6 + (i % 5) * 0.22, repeat: Infinity, ease: 'easeInOut', delay: i * 0.05 }}
        style={{ height: 8 }}
      />
    ))}
  </div>
);

const CTA = ({ href, children, ghost = false }: { href: string; children: React.ReactNode; ghost?: boolean }) => (
  <a
    href={href}
    target={href.startsWith('http') ? '_blank' : undefined}
    rel="noreferrer"
    className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition ${
      ghost
        ? 'border border-white/25 text-white hover:border-gold hover:text-gold'
        : 'bg-sage text-cream hover:bg-sage-dark shadow-lg shadow-sage/25'
    }`}
  >
    {children}
  </a>
);

export default function Podcast() {
  const guestCTA = CONTACT.linkedin;
  return (
    <div className="min-h-screen bg-navy text-cream antialiased">
      <SEOHead
        title="The VANO Podcast — founders, on the record"
        description="Ayush Puri interviews founders about how they actually think and build. New episodes weekly — Spotify, Apple, YouTube and everywhere else."
      />

      {/* nav */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <a href="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <span className="flex h-6 w-6 items-end justify-center gap-[2px] rounded-full bg-gold pb-1">
            <span className="h-1.5 w-[2px] rounded bg-navy" /><span className="h-3 w-[2px] rounded bg-navy" /><span className="h-2 w-[2px] rounded bg-navy" />
          </span>
          VANO<span className="font-normal text-cream/60">.podcast</span>
        </a>
        <CTA href={guestCTA}>Be a guest <ArrowRight className="h-4 w-4" /></CTA>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-5xl px-6 pb-16 pt-10 md:pt-20">
        <motion.p {...fadeUp} className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-gold">
          Founder interviews · Galway → the world
        </motion.p>
        <motion.h1
          {...fadeUp}
          className="font-display text-5xl font-bold leading-[1.02] tracking-tight md:text-7xl"
        >
          Founders,<br />on the record.
        </motion.h1>
        <motion.p {...fadeUp} className="mt-6 max-w-xl text-lg leading-relaxed text-cream/70">
          {SHOW.tagline} Hosted by {SHOW.hosts} in {SHOW.city}.
        </motion.p>
        <motion.div {...fadeUp} className="mt-8 flex flex-wrap gap-3">
          <CTA href={PLATFORMS[0].url}><Play className="h-4 w-4" /> Listen on Spotify</CTA>
          <CTA href={guestCTA} ghost><Mic2 className="h-4 w-4" /> Book an episode</CTA>
        </motion.div>
        <motion.div {...fadeUp} className="mt-14 h-16 overflow-hidden">
          <Wave />
        </motion.div>
      </section>

      {/* stats */}
      <motion.section {...fadeUp} className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto grid max-w-5xl grid-cols-3 divide-x divide-white/10 px-6">
          {[
            [STATS.viewsPerWeek, 'views a week, across episodes + clips'],
            [String(STATS.episodesReleased), 'episodes released'],
            [String(STATS.accounts), 'accounts putting out clips'],
          ].map(([num, label]) => (
            <div key={label} className="px-4 py-8 text-center md:px-8">
              <div className="font-display text-3xl font-bold text-gold md:text-4xl">{num}</div>
              <div className="mt-1 text-xs leading-snug text-cream/60 md:text-sm">{label}</div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* episodes */}
      <section className="mx-auto max-w-5xl px-6 py-16 md:py-24">
        <motion.h2 {...fadeUp} className="font-display text-3xl font-bold md:text-4xl">The episodes</motion.h2>
        <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
          {EPISODES.map((ep, i) => (
            <motion.a
              key={ep.n}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.06 }}
              href={ep.link || PLATFORMS[0].url}
              target="_blank" rel="noreferrer"
              className="group flex items-center justify-between gap-4 py-5"
            >
              <div className="flex items-baseline gap-4 md:gap-6">
                <span className="w-10 shrink-0 font-display text-sm font-semibold text-gold">{ep.n}</span>
                <div>
                  <div className="font-display text-lg font-semibold md:text-xl">
                    {ep.title}
                  </div>
                  <div className="mt-0.5 text-sm text-cream/60">
                    {ep.guest} · {ep.topic}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="hidden text-xs text-cream/40 md:block">{ep.date} · {ep.length}</span>
                <ArrowRight className="h-5 w-5 text-cream/40 transition group-hover:translate-x-1 group-hover:text-gold" />
              </div>
            </motion.a>
          ))}
        </div>
      </section>

      {/* clips */}
      <section className="border-y border-white/10 bg-white/[0.03] px-6 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <motion.h2 {...fadeUp} className="font-display text-3xl font-bold md:text-4xl">The clips</motion.h2>
          <motion.p {...fadeUp} className="mt-3 max-w-xl text-cream/70">
            The best 30 seconds of every conversation — cut for your feed.
          </motion.p>
          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <motion.div
                key={i}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.07 }}
                whileHover={{ y: -6 }}
                className="group relative aspect-[9/16] cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-navy to-[hsl(var(--navy)/0.6)]"
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <Wave bars={7} className="opacity-60" />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy to-transparent p-4 pt-10">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold text-navy transition group-hover:scale-110">
                    <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* platforms */}
      <section className="mx-auto max-w-5xl px-6 py-16 md:py-24">
        <motion.h2 {...fadeUp} className="font-display text-3xl font-bold md:text-4xl">Wherever you listen</motion.h2>
        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {PLATFORMS.map((p, i) => (
            <motion.a
              key={p.name}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.05 }}
              href={p.url || PLATFORMS[0].url}
              target="_blank" rel="noreferrer"
              className="group rounded-2xl border border-white/10 p-5 transition hover:border-gold/50 hover:bg-white/[0.04]"
            >
              <Radio className="h-5 w-5 text-gold" />
              <div className="mt-3 font-display font-semibold">{p.name}</div>
              <div className="mt-0.5 text-xs text-cream/50">{p.note}</div>
            </motion.a>
          ))}
        </div>
      </section>

      {/* booking — digital or in-person episode, €100 */}
      <section id="book" className="mx-auto max-w-5xl px-6 pb-16 md:pb-24">
        <motion.h2 {...fadeUp} className="font-display text-3xl font-bold md:text-4xl">
          Book an episode
        </motion.h2>
        <motion.p {...fadeUp} className="mt-3 max-w-xl text-cream/70">
          {BOOKING.price} per episode. Pick how you want to record — we handle the rest.
        </motion.p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {[
            {
              name: 'Digital episode',
              desc: 'Remote recording — join from anywhere. Edited episode + the clips pack for your own channels.',
              tag: 'video call · ~1 hour',
            },
            {
              name: 'In-person episode',
              desc: `In the room in ${SHOW.city}. Full episode + clips, and the conversation's better over a table.`,
              tag: 'Galway · ~90 min',
            },
          ].map((opt, i) => (
            <motion.div
              key={opt.name}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.07 }}
              className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-8"
            >
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">{opt.tag}</div>
              <h3 className="mt-2 font-display text-2xl font-bold">{opt.name}</h3>
              <p className="mt-3 flex-1 leading-relaxed text-cream/70">{opt.desc}</p>
              <div className="mt-6 flex items-center justify-between">
                <span className="font-display text-xl font-bold">{BOOKING.price}</span>
                <CTA
                  href={
                    BOOKING.stripePaymentLink ||
                    `https://wa.me/${BOOKING.whatsapp}?text=${encodeURIComponent(
                      `Hey — I want to book a ${opt.name} on the VANO Podcast (${BOOKING.price}). I'm from: `,
                    )}`
                  }
                >
                  Book it <ArrowRight className="h-4 w-4" />
                </CTA>
              </div>
            </motion.div>
          ))}
        </div>
        <motion.div {...fadeUp} className="mt-6 rounded-3xl border border-gold/30 bg-white/[0.03] p-6 text-center">
          <span className="text-sm text-cream/70">
            Want your brand on an episode instead? <a href={CONTACT.linkedin} target="_blank" rel="noreferrer" className="font-semibold text-gold underline underline-offset-4">Ask about a sponsor slot</a> — one per episode, it stays personal.
          </span>
        </motion.div>
      </section>

      {/* notes — the quiet blog. Semantic, searchable, kept at the bottom. */}
      <section className="border-t border-white/10 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <motion.h2 {...fadeUp} className="font-display text-2xl font-bold">Notes from the show</motion.h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            <motion.article {...fadeUp}>
              <h3 className="font-display text-lg font-semibold">An Irish startup podcast, from Galway</h3>
              <p className="mt-2 text-sm leading-relaxed text-cream/60">
                The VANO Podcast is a founder-interview show recorded in Galway, Ireland —
                long conversations with the people actually building companies here and
                beyond. Not the highlight reel: the early decisions, the wrong turns, and
                what they would do differently with the same hand again.
              </p>
            </motion.article>
            <motion.article {...fadeUp}>
              <h3 className="font-display text-lg font-semibold">What a guest gets</h3>
              <p className="mt-2 text-sm leading-relaxed text-cream/60">
                One honest hour on the record, an edited episode on Spotify and every major
                platform, and a pack of clips cut for LinkedIn, TikTok and Shorts. Digital
                episodes run anywhere; in-person happens in Galway. Episodes are {BOOKING.price} to record.
              </p>
            </motion.article>
            <motion.article {...fadeUp}>
              <h3 className="font-display text-lg font-semibold">The hosts</h3>
              <p className="mt-2 text-sm leading-relaxed text-cream/60">
                {SHOW.hosts} — two Galway-based founders who interview the founders they
                want to learn from. Past guests include the Kríos team (AI sales training,
                Cork), Jack Garvey (Ganzy) and Milosz Nelka.
              </p>
            </motion.article>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between text-xs text-cream/40">
          <span>© 2026 VANO Podcast · Galway, Ireland</span>
          <Wave bars={12} className="opacity-40" />
        </div>
      </footer>
    </div>
  );
}
