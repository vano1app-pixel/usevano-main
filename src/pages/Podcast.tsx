import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Mic2, Play, Radio } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { EPISODES, PLATFORMS, STATS, CONTACT } from '@/content/podcast';

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
          Real conversations with the people building things — how they think, what
          broke, what they'd do again. Hosted by Ayush Puri, learning in public.
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
                <span className="font-display text-sm font-semibold text-gold">{ep.n}</span>
                <div>
                  <div className="font-display text-lg font-semibold md:text-xl">
                    {ep.guest || 'New episode — details soon'}
                  </div>
                  {ep.topic && <div className="mt-0.5 text-sm text-cream/60">{ep.topic}</div>}
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-cream/40 transition group-hover:translate-x-1 group-hover:text-gold" />
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

      {/* guest + sponsor */}
      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-20 md:grid-cols-2">
        <motion.div {...fadeUp} className="rounded-3xl bg-sage p-8 md:p-10">
          <h3 className="font-display text-2xl font-bold">Be a guest</h3>
          <p className="mt-3 leading-relaxed text-cream/85">
            Building something? I want to hear how you think — the real version,
            not the pitch deck. Episodes are a conversation, not an interrogation.
          </p>
          <div className="mt-6">
            <CTA href={guestCTA} ghost>Message me <ArrowRight className="h-4 w-4" /></CTA>
          </div>
        </motion.div>
        <motion.div {...fadeUp} className="rounded-3xl border border-gold/30 bg-white/[0.03] p-8 md:p-10">
          <h3 className="font-display text-2xl font-bold text-gold">Run an ad</h3>
          <p className="mt-3 leading-relaxed text-cream/70">
            A read on an episode, your name on the clips, in front of founders and
            the people who follow them. One sponsor per episode — it stays personal.
          </p>
          <div className="mt-6">
            <CTA href={guestCTA}>Ask about a slot <ArrowRight className="h-4 w-4" /></CTA>
          </div>
        </motion.div>
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
