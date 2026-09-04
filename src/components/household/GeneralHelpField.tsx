import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Mic, Loader2, X } from 'lucide-react';
import { track } from '@/lib/track';
import { haptic } from '@/lib/haptics';
import { useSpeechInput } from '@/hooks/useSpeechInput';
import { parseJobRequest, hoursToSizeLabel, type ParsedJob } from '@/lib/parseJobRequest';
import { GENERAL_HELP_CATEGORY, GENERAL_HELP_LABEL, GENERAL_HELP_CHECKLIST } from '@/lib/generalHelp';

const EXPO = [0.16, 1, 0.3, 1] as const;

// The ghost line rotates real Galway asks so the empty field reads like the
// start of a text to someone you know — not a search box.
const PLACEHOLDERS = [
  'clean the kitchen and walk the dog',
  'the spare room before mum visits',
  'someone for a couple of hours',
  'mow the lawn and take the bins out',
  'help me shift a wardrobe upstairs',
];

type Timing = 'today' | 'week';
const TIMING_LABEL: Record<Timing, string> = { today: 'Today', week: 'This week' };
const TIMING_NOTE: Record<Timing, string> = { today: 'Prefer today', week: 'Sometime this week' };

type Tools = 'have' | 'bring' | 'unsure';
const TOOLS_NOTE: Record<Tools, string> = {
  have: 'Has the products/tools',
  bring: 'Bring the products/tools',
  unsure: '',
};

const isOther = (p: ParsedJob) => p.jobKey === 'other';

/** The job note the helper reads — their words lead, our understood bits
 *  follow. No surrounding quotes: the sheet already renders the note quoted. */
function composeNote(p: ParsedJob, opts: { rooms: readonly string[]; tools: Tools | null; timing: Timing }): string {
  const parts: string[] = [];
  const said = p.raw.trim();
  if (said) parts.push(said);
  if (isOther(p) && opts.rooms.length) parts.push(`Start with: ${opts.rooms.join(' · ')}`);
  if (opts.tools && TOOLS_NOTE[opts.tools]) parts.push(TOOLS_NOTE[opts.tools]);
  if (p.eircode) parts.push(`At ${p.eircode}`);
  parts.push(TIMING_NOTE[opts.timing]);
  return parts.join(' — ');
}

/**
 * The one front door. You speak or type what you want done; we take the
 * keywords and only ask what's genuinely missing (how long, tools) as chips —
 * the rest is shown back as tags so you can see what we understood ("the
 * leash"). Sending opens the existing booking sheet on a custom job with all
 * of it prefilled; in waitlist mode that sheet ends on "we'll text you back",
 * so the "no card until a student says yes" promise holds.
 */
export const GeneralHelpField: React.FC = () => {
  const reduce = useReducedMotion();
  const [said, setSaid] = useState('');
  const [phIndex, setPhIndex] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedJob | null>(null);
  const parsedForRef = useRef(''); // the exact text `parsed` describes

  // Answers to the "ask what's missing" chips + the general-help room default.
  const [hours, setHours] = useState<number | null>(null);
  const [tools, setTools] = useState<Tools | null>(null);
  const [rooms, setRooms] = useState<readonly string[]>(GENERAL_HELP_CHECKLIST);
  const [timing, setTiming] = useState<Timing>('today');

  const areaRef = useRef<HTMLTextAreaElement>(null);

  const speech = useSpeechInput(
    // interim → mirror into the field so they watch it appear
    (t) => setSaid(t),
    // final → treat like a submit-worthy sentence: parse it
    (t) => { setSaid(t); void runParse(t); },
  );

  // Ambient ghost rotation — slow, opacity-only, paused while typing/parsed and
  // off under reduced motion.
  useEffect(() => {
    if (reduce || said.trim() || parsed) return;
    const id = window.setInterval(() => setPhIndex(i => (i + 1) % PLACEHOLDERS.length), 3600);
    return () => window.clearInterval(id);
  }, [reduce, said, parsed]);

  async function runParse(text: string): Promise<ParsedJob | null> {
    const t = text.trim();
    if (t.length < 3) return null;
    if (parsed && parsedForRef.current === t) return parsed; // already understood this
    setParsing(true);
    try {
      const p = await parseJobRequest(t);
      setParsed(p);
      parsedForRef.current = t;
      setHours(p.hours);
      setTools(null);
      track('hero_general_help_parse', { source: p.source, jobKey: p.jobKey, confidence: p.confidence });
      return p;
    } finally {
      setParsing(false);
    }
  }

  // Editing the sentence invalidates what we understood.
  const onEdit = (v: string) => {
    setSaid(v);
    if (parsed && v.trim() !== parsedForRef.current) { setParsed(null); setHours(null); setTools(null); }
  };

  const toggleRoom = (room: string) => {
    haptic(6);
    setRooms(prev => (prev.includes(room) ? prev.filter(r => r !== room) : [...prev, room]));
  };

  const micTap = () => {
    if (speech.listening) { speech.stop(); return; }
    haptic(10);
    speech.start();
  };

  const sendSomeone = async () => {
    haptic(12);
    // Parse on send if they typed and never blurred, so we always book against
    // something real. Never blocks — worst case it's a low-confidence job.
    const p = parsed ?? await runParse(said);
    const job = p ?? await parseJobRequest(said.trim() || 'general help');
    const finalHours = hours ?? job.hours;
    const picked = GENERAL_HELP_CHECKLIST.filter(r => rooms.includes(r));
    const note = composeNote(job, { rooms: picked, tools, timing });
    const extraLabel = isOther(job) ? GENERAL_HELP_LABEL : job.label;
    track('hero_general_help_submit', {
      source: job.source, jobKey: job.jobKey, hours: finalHours, tools: tools ?? 'unset', timing,
    });
    window.dispatchEvent(new CustomEvent('vano:select-category', {
      detail: {
        slug: GENERAL_HELP_CATEGORY,           // everything books as custom (€22/hr × hours)
        size: hoursToSizeLabel(finalHours),
        extraLabel,
        label: extraLabel,                     // the sheet header reads the understood job
        note,
        direct: true,                          // land on the form, skip the sub-service wizard
      },
    }));
  };

  const showThinChips = parsed && (parsed.needsDurationQuestion || parsed.needsToolsQuestion);

  return (
    <div className="relative mx-auto w-full max-w-xl text-left">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[130%] h-[150%] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(ellipse at center, hsl(43 92% 62% / 0.20), hsl(28 90% 60% / 0.09) 45%, transparent 68%)' }}
      />

      <div className="relative z-10 rounded-[1.75rem] border border-black/5 bg-white shadow-[0_20px_60px_-24px_rgba(11,52,55,0.35)] p-3 sm:p-4">
        {/* The message field + mic. */}
        <div className="relative">
          <textarea
            ref={areaRef}
            id="general-help-input"
            value={said}
            onChange={e => onEdit(e.target.value)}
            onBlur={() => { if (said.trim() && !parsed) void runParse(said); }}
            rows={2}
            aria-label="Say or type what you want done"
            className="w-full resize-none rounded-2xl bg-cream/70 pl-4 pr-12 py-3 text-base leading-snug text-foreground placeholder:text-transparent focus:outline-none focus:ring-2 focus:ring-sage/40"
          />
          {/* Animated ghost — only while empty and unparsed. */}
          {!said && (
            <div className="pointer-events-none absolute left-4 top-3 right-12 text-base leading-snug text-foreground/40">
              <span className="text-foreground/55">what do you want done? </span>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={reduce ? 'static' : phIndex}
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.4, ease: EXPO }}
                  className="italic"
                >
                  “{PLACEHOLDERS[reduce ? 0 : phIndex]}”
                </motion.span>
              </AnimatePresence>
            </div>
          )}
          {/* Mic — only when the browser can actually do speech. Never blocks. */}
          {speech.supported && (
            <button
              type="button"
              onClick={micTap}
              aria-label={speech.listening ? 'Stop listening' : 'Speak what you want done'}
              aria-pressed={speech.listening}
              className={[
                'absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full transition-colors duration-150 active:scale-95',
                speech.listening ? 'bg-sage text-white' : 'bg-cream text-foreground/55 hover:text-sage',
              ].join(' ')}
            >
              {speech.listening && (
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-sage/40"
                  animate={reduce ? undefined : { scale: [1, 1.5], opacity: [0.5, 0] }}
                  transition={{ duration: 1.4, ease: 'easeOut', repeat: Infinity }}
                />
              )}
              <Mic className="relative h-4 w-4" strokeWidth={2.2} />
            </button>
          )}
        </div>

        {speech.error === 'denied' && (
          <p className="mt-2 text-[12.5px] text-foreground/50">Mic’s off — no bother, just type it.</p>
        )}

        {/* The leash — what we understood, shown back as editable tags. */}
        <AnimatePresence initial={false}>
          {parsing && (
            <motion.div
              key="parsing"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="mt-3 flex items-center gap-2 text-[13px] font-medium text-foreground/50"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> reading that…
            </motion.div>
          )}

          {parsed && !parsing && (
            <motion.div
              key="leash"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EXPO }}
              className="mt-3"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] font-medium text-foreground/45 mr-0.5">Got it —</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-sage/12 border border-sage/30 px-2.5 py-1 text-[13px] font-semibold text-sage-dark">
                  <span aria-hidden="true">{parsed.emoji}</span>
                  {isOther(parsed) ? GENERAL_HELP_LABEL : parsed.label}
                </span>
                <span className="inline-flex items-center rounded-full bg-cream border border-black/10 px-2.5 py-1 text-[13px] font-medium text-foreground/70">
                  ~{hours ?? parsed.hours} {(hours ?? parsed.hours) === 1 ? 'hr' : 'hrs'}
                </span>
                {parsed.whenText && (
                  <span className="inline-flex items-center rounded-full bg-cream border border-black/10 px-2.5 py-1 text-[13px] font-medium text-foreground/70">
                    {parsed.whenText}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => { setParsed(null); setSaid(''); setHours(null); setTools(null); areaRef.current?.focus(); }}
                  aria-label="Start over"
                  className="ml-0.5 grid h-6 w-6 place-items-center rounded-full text-foreground/40 hover:bg-cream hover:text-foreground/70 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Only-what's-missing chips (max two). */}
              {showThinChips && (
                <div className="mt-2.5 space-y-2">
                  {parsed.needsDurationQuestion && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[12px] font-medium text-foreground/45 mr-0.5">About how long?</span>
                      {[1, 2, 3].map(h => {
                        const on = (hours ?? parsed.hours) === h || (h === 3 && (hours ?? parsed.hours) >= 3);
                        return (
                          <button key={h} type="button" onClick={() => { haptic(6); setHours(h); }} aria-pressed={on}
                            className={['rounded-full px-3 py-1 text-[13px] font-semibold border transition-colors duration-150 active:scale-[0.97]',
                              on ? 'bg-sage/12 text-sage-dark border-sage/30' : 'bg-transparent text-foreground/50 border-black/10'].join(' ')}>
                            {h === 3 ? '3 hrs+' : `${h} hr${h > 1 ? 's' : ''}`}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {parsed.needsToolsQuestion && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[12px] font-medium text-foreground/45 mr-0.5">Products / tools?</span>
                      {(['have', 'bring', 'unsure'] as Tools[]).map(t => (
                        <button key={t} type="button" onClick={() => { haptic(6); setTools(t); }} aria-pressed={tools === t}
                          className={['rounded-full px-3 py-1 text-[13px] font-semibold border transition-colors duration-150 active:scale-[0.97]',
                            tools === t ? 'bg-sage/12 text-sage-dark border-sage/30' : 'bg-transparent text-foreground/50 border-black/10'].join(' ')}>
                          {t === 'have' ? 'I have them' : t === 'bring' ? 'Bring them' : 'Not sure'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* General help with no specific job → the room default, editable. */}
              {isOther(parsed) && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] font-medium text-foreground/45 mr-0.5">Start with</span>
                  {GENERAL_HELP_CHECKLIST.map(room => {
                    const on = rooms.includes(room);
                    return (
                      <button key={room} type="button" onClick={() => toggleRoom(room)} aria-pressed={on}
                        className={['rounded-full px-3 py-1 text-[13px] font-semibold border transition-colors duration-150 active:scale-[0.97]',
                          on ? 'bg-sage/12 text-sage-dark border-sage/30' : 'bg-transparent text-foreground/40 border-black/10 line-through decoration-foreground/20'].join(' ')}>
                        {room}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* When + the one loud action. */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex rounded-full bg-cream/70 p-0.5" role="group" aria-label="When">
            {(['today', 'week'] as Timing[]).map(t => (
              <button key={t} type="button" onClick={() => { haptic(6); setTiming(t); }} aria-pressed={timing === t}
                className={['rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150',
                  timing === t ? 'bg-white text-foreground shadow-sm' : 'text-foreground/50'].join(' ')}>
                {TIMING_LABEL[t]}
              </button>
            ))}
          </div>

          <motion.button
            type="button"
            onClick={() => void sendSomeone()}
            disabled={parsing}
            whileTap={{ scale: 0.97 }}
            className="ml-auto inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-primary-glow transition-[background-color,opacity] duration-150 hover:bg-sage-dark disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            Send someone
            <span aria-hidden="true" className="text-lg leading-none">→</span>
          </motion.button>
        </div>
      </div>

      <p className="relative z-10 mt-3 text-center text-[13px] font-medium text-foreground/55">
        No card until a student says yes
        <span className="mx-1.5 text-foreground/25" aria-hidden="true">·</span>
        from <span className="font-semibold text-foreground/80">€22/hr</span>
      </p>
    </div>
  );
};
