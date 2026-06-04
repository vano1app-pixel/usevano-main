import React, { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CreditCard, MessageCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { SUPPORTED_CITIES } from '@/lib/cities';
import { supabase } from '@/integrations/supabase/client';
import { teamWhatsAppHref } from '@/lib/contact';

interface Task {
  emoji:         string;
  label:         string;
  slug:          string;
  price:         string;
  description:   string;
  sizes?:        string[];
  sizeLabel?:    string;
  whatsappOnly?: boolean;
}

const ALL_TASKS: Task[] = [
  {
    emoji: '🛒', label: 'Grocery shopping',   slug: 'grocery-shopping',   price: '€15 flat',
    description: 'We shop any store, follow your list, and deliver to your door.',
  },
  {
    emoji: '🐕', label: 'Dog walking',         slug: 'dog-walking',        price: '€15–€20',
    description: 'Collected from your door, walked on-lead, returned home safely.',
    sizeLabel: 'How long?', sizes: ['30 min', '1 hour'],
  },
  {
    emoji: '🌿', label: 'Lawn mowing',         slug: 'lawn-mowing',        price: 'from €18/hr',
    description: 'Grass cut, edges trimmed and clippings cleared — all done in one visit.',
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', 'Half day'],
  },
  {
    emoji: '📦', label: 'Moving help',         slug: 'moving-help',        price: 'from €18/hr',
    description: 'Loading, carrying, unloading — you arrange the van, we do the heavy lifting.',
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', '3 hours', '4+ hours'],
  },
  {
    emoji: '🧹', label: 'Outdoor cleaning',    slug: 'outdoor-cleaning',   price: 'from €16/hr',
    description: 'Patios, driveways, bins, windows and gutters — outside sorted.',
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', '3 hours'],
  },
  {
    emoji: '📚', label: 'Tutoring & grinds',   slug: 'tutoring-grinds',    price: 'from €15/hr',
    description: 'One-to-one at your home. Any subject — Maths, science, languages.',
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', '3 hours'],
  },
  {
    emoji: '💊', label: 'Pharmacy run',        slug: 'pharmacy-run',       price: '€10 flat',
    description: 'We collect your prescription or over-the-counter items from your local pharmacy.',
  },
  {
    emoji: '📬', label: 'Post office run',     slug: 'post-office',        price: '€10 flat',
    description: 'We drop off or collect parcels, letters and forms at your local post office.',
  },
  {
    emoji: '🔧', label: 'Furniture assembly',  slug: 'furniture-assembly', price: 'from €15/hr',
    description: 'IKEA or any flat-pack furniture assembled at your home — no tools needed on your end.',
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', '3 hours'],
  },
  {
    emoji: '📱', label: 'Tech help',           slug: 'tech-help',          price: 'from €15/hr',
    description: 'Phone, tablet, laptop or TV setup and troubleshooting. Great for elderly family members.',
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours'],
  },
  {
    emoji: '🚪', label: 'Wait for deliveries', slug: 'wait-delivery',      price: '€10 flat',
    description: "We wait at your home for a delivery or tradesperson while you're out.",
  },
  {
    emoji: '✨', label: 'Anything else',        slug: 'anything-else',      price: 'Custom',
    description: "Not listed? Send us a WhatsApp and we'll sort it out.",
    whatsappOnly: true,
  },
];

function getPriceCents(slug: string, size: string): number | null {
  const flat: Record<string, number> = {
    'grocery-shopping': 1500,
    'pharmacy-run':     1000,
    'post-office':      1000,
    'wait-delivery':    1000,
  };
  if (slug in flat) return flat[slug];
  const key = `${slug}|${size}`;
  const map: Record<string, number> = {
    'dog-walking|30 min':          1500,
    'dog-walking|1 hour':          2000,
    'lawn-mowing|1 hour':          1800,
    'lawn-mowing|2 hours':         3600,
    'lawn-mowing|Half day':        7200,
    'moving-help|1 hour':          1800,
    'moving-help|2 hours':         3600,
    'moving-help|3 hours':         5400,
    'moving-help|4+ hours':        7200,
    'outdoor-cleaning|1 hour':     1600,
    'outdoor-cleaning|2 hours':    3200,
    'outdoor-cleaning|3 hours':    4800,
    'tutoring-grinds|1 hour':      1500,
    'tutoring-grinds|2 hours':     3000,
    'tutoring-grinds|3 hours':     4500,
    'furniture-assembly|1 hour':   1500,
    'furniture-assembly|2 hours':  3000,
    'furniture-assembly|3 hours':  4500,
    'tech-help|1 hour':            1500,
    'tech-help|2 hours':           3000,
  };
  return map[key] ?? null;
}

function getTimeSlots(): string[] {
  const now = new Date();
  const slots: string[] = ['Now'];
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(now.getMinutes() < 30 ? 30 : 60);
  const fmt = (d: Date) => {
    const h = d.getHours(), m = d.getMinutes();
    const period = h >= 12 ? 'pm' : 'am';
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''}${period}`;
  };
  while (next.getHours() < 21) {
    slots.push(fmt(next));
    next.setMinutes(next.getMinutes() + 30);
  }
  return slots;
}

const chipBase =
  'px-3.5 py-1.5 rounded-full text-sm font-medium border transition-[background-color,color,border-color] duration-150';

const fadeSlide = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -4 },
  transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const },
};

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const card = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
};

export const TaskShowcase: React.FC = () => {
  const [selected, setSelected] = useState<Task | null>(null);
  const [when, setWhen]         = useState('');
  const [size, setSize]         = useState('');
  const [note, setNote]         = useState('');
  const [name, setName]         = useState('');
  const [phone, setPhone]       = useState('');
  const [city, setCity]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const timeSlots = useMemo(() => getTimeSlots(), []);

  function open(task: Task) {
    setSelected(task);
    setWhen(''); setSize(''); setNote('');
    setName(''); setPhone(''); setCity('');
    setError(null);
    setTimeout(() => {
      document.getElementById('task-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }

  function close() {
    setSelected(null);
    setError(null);
  }

  const priceCents  = selected ? getPriceCents(selected.slug, size) : null;
  const canBook     = !!when && priceCents !== null;
  const canWhatsApp = !!when || !!selected?.whatsappOnly;

  function sendWhatsApp() {
    if (!selected) return;
    const lines = [`Hi VANO! I need help with: ${selected.label}.`];
    if (when) lines.push(`When: ${when === 'Now' ? 'ASAP / right now' : `today at ${when}`}`);
    if (size) lines.push(`Duration: ${size}`);
    if (note.trim()) lines.push(note.trim());
    lines.push('Can you let me know who is available?');
    window.open(`${teamWhatsAppHref}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer');
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !priceCents || !when) return;
    if (!name.trim())  { setError('Please enter your name.');         return; }
    if (!phone.trim()) { setError('Please enter your phone number.'); return; }
    if (!city)         { setError('Please select your city.');        return; }
    setLoading(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        'create-household-payment-checkout',
        { body: {
          category:        selected.slug,
          when_label:      when,
          size_label:      size,
          note:            note.trim(),
          customer_name:   name.trim(),
          customer_phone:  phone.trim(),
          city,
        }},
      );
      if (fnErr || !data?.checkout_url) {
        throw new Error((data as { error?: string } | null)?.error || fnErr?.message || 'Something went wrong.');
      }
      window.location.href = data.checkout_url as string;
    } catch (err: unknown) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <section className="px-4 py-12 max-w-5xl mx-auto">
      <p className="eyebrow mb-3">Full list</p>
      <h2 className="text-2xl font-semibold text-foreground mb-8" style={{ letterSpacing: '-0.02em' }}>
        What can your helper do?
      </h2>

      <motion.div
        className="grid grid-cols-2 sm:grid-cols-3 gap-2.5"
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-48px' }}
      >
        {ALL_TASKS.map((task) => (
          <motion.button
            key={task.slug}
            variants={card}
            onClick={() => selected?.slug === task.slug ? close() : open(task)}
            aria-pressed={selected?.slug === task.slug}
            className={cn(
              'group flex items-center gap-2.5 rounded-xl p-3 text-left',
              'border transition-[background-color,border-color,box-shadow] duration-200',
              'active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              selected?.slug === task.slug
                ? 'bg-primary/[0.06] border-primary/30 shadow-tinted-sm'
                : 'bg-secondary/50 border-border/40 hover:bg-primary/[0.04] hover:border-primary/20 hover:shadow-tinted-sm',
            )}
          >
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-background shadow-tinted-sm text-lg leading-none" aria-hidden="true">
              {task.emoji}
            </span>
            <span className="flex-1 min-w-0 text-sm font-medium text-foreground/80 leading-tight">{task.label}</span>
            <span className="flex-shrink-0 text-[11px] text-muted-foreground/70 font-medium whitespace-nowrap">{task.price}</span>
          </motion.button>
        ))}
      </motion.div>

      {/* Inline booking panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            id="task-panel"
            key={selected.slug}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="mt-4 rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden max-w-sm"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-secondary/30">
              <span className="text-xl leading-none select-none">{selected.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{selected.label}</p>
                <p className="text-xs text-muted-foreground">{selected.price}</p>
              </div>
              <button onClick={close} aria-label="Close" className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Description */}
            <div className="px-4 py-3 border-b border-border/30 bg-background/60">
              <p className="text-xs text-muted-foreground leading-relaxed">{selected.description}</p>
            </div>

            <div className="p-4">
              <AnimatePresence mode="wait">
                {selected.whatsappOnly ? (
                  <motion.div key="whatsapp-only" {...fadeSlide} className="space-y-3">
                    <textarea
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="Tell us what you need..."
                      rows={3}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none"
                    />
                    <Button onClick={sendWhatsApp} className="w-full rounded-full gap-2 font-semibold bg-[#25D366] hover:bg-[#1ebe5d] text-white border-transparent">
                      <MessageCircle className="w-4 h-4" />
                      Chat to us on WhatsApp
                    </Button>
                  </motion.div>
                ) : (
                  <motion.form key="book-form" {...fadeSlide} onSubmit={handlePay} className="space-y-4">
                    {/* When? */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">When?</p>
                      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                        {timeSlots.map(opt => (
                          <motion.button
                            key={opt} type="button"
                            onClick={() => setWhen(when === opt ? '' : opt)}
                            whileTap={{ scale: 0.91 }}
                            transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                            className={cn(
                              chipBase, 'flex-shrink-0',
                              when === opt
                                ? opt === 'Now' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-primary text-primary-foreground border-primary'
                                : opt === 'Now' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800' : 'bg-background text-foreground border-border hover:border-primary/40',
                            )}
                          >{opt}</motion.button>
                        ))}
                      </div>
                    </div>

                    {/* Duration */}
                    {selected.sizes && selected.sizes.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                          {selected.sizeLabel ?? 'How long?'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selected.sizes.map(opt => (
                            <motion.button
                              key={opt} type="button"
                              onClick={() => setSize(size === opt ? '' : opt)}
                              whileTap={{ scale: 0.91 }}
                              transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                              className={cn(chipBase, size === opt ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:border-primary/40')}
                            >{opt}</motion.button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Note */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                        Anything to add? <span className="font-normal normal-case text-muted-foreground/60">(optional)</span>
                      </p>
                      <input
                        type="text" value={note} onChange={e => setNote(e.target.value)}
                        placeholder="Address or special requests"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                      />
                    </div>

                    {/* Contact details — revealed when time is picked */}
                    <AnimatePresence>
                      {when && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="space-y-3 overflow-hidden"
                        >
                          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your details</p>
                          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" required
                            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent" />
                          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Your phone number" required
                            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent" />
                          <Select value={city} onValueChange={setCity}>
                            <SelectTrigger className="rounded-xl h-10"><SelectValue placeholder="Your city" /></SelectTrigger>
                            <SelectContent>{SUPPORTED_CITIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                          </Select>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* CTAs */}
                    {canBook && (
                      <Button type="submit" disabled={loading} className="w-full rounded-full gap-2 font-semibold">
                        {loading
                          ? <><Loader2 className="w-4 h-4 animate-spin" />Opening secure checkout…</>
                          : <><CreditCard className="w-4 h-4" />Book for €{(priceCents! / 100).toFixed(0)} — pay by card</>}
                      </Button>
                    )}
                    <Button
                      type="button" onClick={sendWhatsApp}
                      disabled={!canWhatsApp}
                      variant={canBook ? 'outline' : 'default'}
                      className={cn('w-full rounded-full gap-2 font-semibold', !canBook && when ? 'bg-[#25D366] hover:bg-[#1ebe5d] text-white border-transparent' : '')}
                    >
                      <MessageCircle className="w-4 h-4" />
                      {canBook ? 'Or book via WhatsApp' : 'Book via WhatsApp'}
                    </Button>
                    {!when && <p className="text-center text-xs text-muted-foreground !mt-1.5">Pick a time above to continue</p>}
                    {error && <p className="text-center text-xs text-destructive">{error}</p>}
                    {canBook && <p className="text-center text-xs text-muted-foreground">Stripe secure checkout · paid upfront, confirmed instantly</p>}
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};
