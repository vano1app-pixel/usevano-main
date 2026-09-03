import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { track } from '@/lib/track';
import { haptic } from '@/lib/haptics';
import {
  GENERAL_HELP_CATEGORY,
  GENERAL_HELP_SIZE,
  GENERAL_HELP_LABEL,
  GENERAL_HELP_CHECKLIST,
  composeGeneralHelpNote,
} from '@/lib/generalHelp';

const EXPO = [0.16, 1, 0.3, 1] as const;

// Real Galway phrases — the field should feel like the start of a text to a
// person you already know, not a search box. Rotates slowly (ambient motion),
// and freezes on the first line under prefers-reduced-motion.
const PLACEHOLDERS = [
  'haven’t touched it since the weekend…',
  'kitchen + dog + I have to leave at 5',
  'just someone for a couple of hours',
  'spare room’s a state before mum visits',
  'bins, floors, and the sink of doom',
];

type Timing = 'today' | 'week';
const TIMING_LABEL: Record<Timing, string> = { today: 'Today', week: 'This week' };
const TIMING_NOTE: Record<Timing, string> = { today: 'Prefer today', week: 'Sometime this week' };

/**
 * The general-help front door. You don't pick a job — you say what's going on
 * (or say nothing), pick the rooms to start with, and a local student comes
 * for a couple of hours. Submitting dispatches the existing `vano:select-
 * category` event, which CategoryGrid catches and opens its booking sheet on a
 * custom 2-hour job with these words prefilled — the ONE booking pipeline, no
 * second flow. In waitlist mode the sheet ends on "we'll text you back", so the
 * "no card until a student says yes" promise holds.
 */
export const GeneralHelpField: React.FC = () => {
  const reduce = useReducedMotion();
  const [said, setSaid] = useState('');
  const [rooms, setRooms] = useState<readonly string[]>(GENERAL_HELP_CHECKLIST);
  const [timing, setTiming] = useState<Timing>('today');
  const [phIndex, setPhIndex] = useState(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Ambient placeholder rotation — slow (3.6s), opacity-only, paused while the
  // customer is typing and off entirely under reduced motion.
  useEffect(() => {
    if (reduce || said.trim()) return;
    const id = window.setInterval(() => setPhIndex(i => (i + 1) % PLACEHOLDERS.length), 3600);
    return () => window.clearInterval(id);
  }, [reduce, said]);

  const toggleRoom = (room: string) => {
    haptic(6);
    setRooms(prev => (prev.includes(room) ? prev.filter(r => r !== room) : [...prev, room]));
  };

  const sendSomeone = () => {
    haptic(12);
    // Keep the checklist in the canonical order regardless of toggle sequence.
    const picked = GENERAL_HELP_CHECKLIST.filter(r => rooms.includes(r));
    const note = composeGeneralHelpNote({ rooms: picked, said, timing: TIMING_NOTE[timing] });
    track('hero_general_help_submit', { rooms: picked, timing, typed: said.trim().length > 0 });
    window.dispatchEvent(
      new CustomEvent('vano:select-category', {
        detail: {
          slug: GENERAL_HELP_CATEGORY,
          size: GENERAL_HELP_SIZE,
          extraLabel: GENERAL_HELP_LABEL,
          note,
          direct: true,
        },
      }),
    );
  };

  return (
    <div className="relative mx-auto w-full max-w-xl text-left">
      {/* Warm halo behind the card — the field is the focal point of the hero,
          so the amber glow that used to sit under the tiles moves here. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[130%] h-[150%] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(ellipse at center, hsl(43 92% 62% / 0.20), hsl(28 90% 60% / 0.09) 45%, transparent 68%)' }}
      />

      <div className="relative z-10 rounded-[1.75rem] border border-black/5 bg-white shadow-[0_20px_60px_-24px_rgba(11,52,55,0.35)] p-3 sm:p-4">
        {/* The message field — looks like texting a neighbour. */}
        <div className="relative">
          <textarea
            ref={areaRef}
            id="general-help-input"
            value={said}
            onChange={e => setSaid(e.target.value)}
            rows={2}
            aria-label="Tell us what's going on (optional)"
            className="w-full resize-none rounded-2xl bg-cream/70 px-4 py-3 text-base leading-snug text-foreground placeholder:text-transparent focus:outline-none focus:ring-2 focus:ring-sage/40"
          />
          {/* Custom animated placeholder — only when the field is empty. */}
          {!said && (
            <div className="pointer-events-none absolute left-4 top-3 right-4 text-base leading-snug text-foreground/40">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={reduce ? 'static' : phIndex}
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.4, ease: EXPO }}
                  className="block truncate"
                >
                  {PLACEHOLDERS[reduce ? 0 : phIndex]}
                </motion.span>
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Start-with rooms — the default answer to "what do you need?". All on
            unless you say otherwise; tap to drop one. Rides the job note. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-medium text-foreground/45 mr-0.5">Start with</span>
          {GENERAL_HELP_CHECKLIST.map(room => {
            const on = rooms.includes(room);
            return (
              <button
                key={room}
                type="button"
                onClick={() => toggleRoom(room)}
                aria-pressed={on}
                className={[
                  'rounded-full px-3 py-1 text-[13px] font-semibold transition-[background-color,color,border-color] duration-150 active:scale-[0.97] border',
                  on
                    ? 'bg-sage/12 text-sage-dark border-sage/30'
                    : 'bg-transparent text-foreground/40 border-black/10 line-through decoration-foreground/20',
                ].join(' ')}
              >
                {room}
              </button>
            );
          })}
        </div>

        {/* When + the one loud action. Timing pills are quiet; Send someone is
            the single primary button on the hero. */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex rounded-full bg-cream/70 p-0.5" role="group" aria-label="When">
            {(['today', 'week'] as Timing[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { haptic(6); setTiming(t); }}
                aria-pressed={timing === t}
                className={[
                  'rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150',
                  timing === t ? 'bg-white text-foreground shadow-sm' : 'text-foreground/50',
                ].join(' ')}
              >
                {TIMING_LABEL[t]}
              </button>
            ))}
          </div>

          <motion.button
            type="button"
            onClick={sendSomeone}
            whileTap={{ scale: 0.97 }}
            className="ml-auto inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-primary-glow transition-[background-color] duration-150 hover:bg-sage-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            Send someone
            <span aria-hidden="true" className="text-lg leading-none">→</span>
          </motion.button>
        </div>
      </div>

      {/* Microcopy — the two things that lower the flinch: no card yet, and the
          honest starting rate. Gold is spent once here, on the price. */}
      <p className="relative z-10 mt-3 text-center text-[13px] font-medium text-foreground/55">
        No card until a student says yes
        <span className="mx-1.5 text-foreground/25" aria-hidden="true">·</span>
        from <span className="font-semibold text-foreground/80">€22/hr</span>
      </p>
    </div>
  );
};
