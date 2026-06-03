import React, { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, MessageCircle, CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { SUPPORTED_CITIES } from '@/lib/cities';
import { supabase } from '@/integrations/supabase/client';
import { teamWhatsAppHref } from '@/lib/contact';

interface Category {
  emoji:       string;
  label:       string;
  slug:        string;
  price:       string;
  description: string;
  sizeLabel?:  string;
  sizes?:      string[];
}

const CATEGORIES: Category[] = [
  {
    emoji: '🛒', label: 'Shopping',  slug: 'shopping',  price: 'from €15',
    description: 'We shop any store, follow your list, and deliver to your door.',
  },
  {
    emoji: '🐕', label: 'Dog walk',  slug: 'dog-walk',  price: '€15–€20',
    description: 'Collected from your door, walked on-lead, returned home safely.',
    sizeLabel: 'How long?', sizes: ['30 min', '1 hour'],
  },
  {
    emoji: '🌿', label: 'Garden',    slug: 'garden',    price: 'from €18/hr',
    description: 'Mowing, weeding, edging and tidying — all waste bagged.',
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', 'Half day'],
  },
  {
    emoji: '📦', label: 'Moving',    slug: 'moving',    price: 'from €18/hr',
    description: 'Loading, carrying, unloading — you arrange the van, we do the heavy lifting. Price for 1 helper; need more? Book via WhatsApp.',
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', '3 hours', '4+ hours'],
  },
  {
    emoji: '🧹', label: 'Cleaning',  slug: 'cleaning',  price: 'from €16/hr',
    description: 'Hoovering, mopping, surfaces, kitchen and bathroom.',
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', '3 hours'],
  },
  {
    emoji: '📚', label: 'Tutoring',  slug: 'tutoring',  price: 'from €15/hr',
    description: 'One-to-one at your home. Any subject — Maths, science, languages.',
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', '3 hours'],
  },
];

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

function getPriceCents(slug: string, size: string): number | null {
  if (slug === 'shopping') return 1500;
  if (slug === 'dog-walk') return size === '30 min' ? 1500 : 2000;
  const key = `${slug}|${size}`;
  const map: Record<string, number> = {
    'garden|1 hour': 1800,   'garden|2 hours': 3600,   'garden|Half day': 7200,
    'moving|1 hour': 1800,   'moving|2 hours': 3600,   'moving|3 hours': 5400,  'moving|4+ hours': 7200,
    'cleaning|1 hour': 1600, 'cleaning|2 hours': 3200,  'cleaning|3 hours': 4800,
    'tutoring|1 hour': 1500, 'tutoring|2 hours': 3000,  'tutoring|3 hours': 4500,
  };
  return map[key] ?? null;
}

function buildWhatsAppMsg(cat: Category, when: string, size: string, note: string): string {
  const lines = [`Hi VANO! I need ${cat.label.toLowerCase()} help.`];
  if (when) lines.push(`When: ${when === 'Now' ? 'ASAP / right now' : `today at ${when}`}`);
  if (size) lines.push(`${cat.sizeLabel || 'Duration'}: ${size}`);
  if (note.trim()) lines.push(note.trim());
  lines.push('Can you let me know who is available?');
  return lines.join('\n');
}

const chip = (active: boolean, now?: boolean) => cn(
  'px-3.5 py-1.5 rounded-full text-sm font-medium border flex-shrink-0',
  'transition-[background-color,color,border-color] duration-150',
  active
    ? now ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-primary text-primary-foreground border-primary'
    : now ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800'
          : 'bg-background text-foreground border-border hover:border-primary/40',
);

// Slide direction: 1 = forward (left), -1 = back (right)
const slideVariants = {
  enter:  (d: number) => ({ x: d * 32, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   (d: number) => ({ x: d * -32, opacity: 0 }),
};
const slideTransition = { duration: 0.22, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] };

type View = 'grid' | 'options' | 'contact';

export const CategoryGrid: React.FC = () => {
  const [view, setView]           = useState<View>('grid');
  const [dir, setDir]             = useState(1);
  const [selected, setSelected]   = useState<Category | null>(null);
  const [when, setWhen]           = useState('');
  const [size, setSize]           = useState('');
  const [note, setNote]           = useState('');
  const [name, setName]           = useState('');
  const [phone, setPhone]         = useState('');
  const [email, setEmail]         = useState('');
  const [city, setCity]           = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const timeSlots = useMemo(() => getTimeSlots(), []);

  React.useEffect(() => {
    function handle(e: Event) {
      const slug = (e as CustomEvent<{ slug: string }>).detail.slug;
      const cat = CATEGORIES.find(c => c.slug === slug);
      if (cat) { goTo('options', 1, cat); }
    }
    window.addEventListener('vano:select-category', handle);
    return () => window.removeEventListener('vano:select-category', handle);
  }, []);

  function goTo(v: View, d: number, cat?: Category) {
    setDir(d);
    setView(v);
    if (cat) { setSelected(cat); setWhen(''); setSize(''); setNote(''); }
    if (v === 'grid') { setSelected(null); setWhen(''); setSize(''); setNote(''); setName(''); setPhone(''); setEmail(''); setCity(''); setError(null); }
    if (v !== 'grid' && v !== 'contact') { setError(null); }
  }

  const priceCents    = selected ? getPriceCents(selected.slug, size) : null;
  const canPayByCard  = priceCents !== null && !!when;
  const canWhatsApp   = !!when;

  function sendWhatsApp() {
    if (!selected) return;
    const url = `${teamWhatsAppHref}?text=${encodeURIComponent(buildWhatsAppMsg(selected, when, size, note))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !priceCents) return;
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!phone.trim()) { setError('Please enter your phone number.'); return; }
    if (!city) { setError('Please select your city.'); return; }
    setLoading(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        'create-household-payment-checkout',
        { body: { category: selected.slug, when_label: when, size_label: size, note: note.trim(), customer_name: name.trim(), customer_phone: phone.trim(), customer_email: email.trim() || null, city } },
      );
      if (fnErr || !data?.checkout_url) throw new Error((data as { error?: string } | null)?.error || fnErr?.message || 'Something went wrong.');
      window.location.href = data.checkout_url as string;
    } catch (err: unknown) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <section id="category-grid" aria-label="What do you need help with?">
      <div className="overflow-hidden">
        <AnimatePresence mode="wait" custom={dir}>

          {/* ── SCREEN 1: Category grid ── */}
          {view === 'grid' && (
            <motion.div key="grid" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={slideTransition}>
              <div className="grid grid-cols-3 gap-2.5 lg:gap-3">
                {CATEGORIES.map((cat, idx) => (
                  <motion.button
                    key={cat.slug}
                    onClick={() => goTo('options', 1, cat)}
                    whileHover={{ y: -3, scale: 1.04 }}
                    whileTap={{ scale: 0.93 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                    className={cn(
                      'relative flex flex-col items-center justify-center gap-2',
                      'min-h-[90px] lg:min-h-[120px] rounded-2xl px-2 py-3 lg:py-4 border',
                      'bg-secondary/60 text-foreground hover:bg-secondary border-border/50 hover:border-primary/40 hover:shadow-sm',
                      'transition-[background-color,border-color,box-shadow] duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    )}
                  >
                    {/* Subtle pulse ring — draws the eye to tap */}
                    <span
                      className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-primary/20 animate-pulse"
                      style={{ animationDelay: `${idx * 180}ms`, animationDuration: '2.8s' }}
                    />
                    <span className="text-2xl lg:text-[2rem] leading-none select-none">{cat.emoji}</span>
                    <span className="text-[13px] lg:text-[14px] font-semibold leading-tight text-center">{cat.label}</span>
                    <span className="text-[11px] lg:text-[12px] text-muted-foreground leading-tight">{cat.price}</span>
                  </motion.button>
                ))}
              </div>

              {!selected && (
                <button
                  onClick={() => window.open(`${teamWhatsAppHref}?text=${encodeURIComponent('Hi VANO! I need help with something — ')}`, '_blank', 'noopener,noreferrer')}
                  className="mt-3 w-full rounded-2xl bg-sage-light/70 border border-sage/20 px-4 py-3 flex items-center gap-3 hover:bg-sage-light transition-colors duration-150 group"
                >
                  <MessageCircle className="w-4 h-4 text-sage flex-shrink-0" aria-hidden="true" />
                  <span className="flex-1 text-left">
                    <span className="block text-xs font-semibold text-foreground">Something else?</span>
                    <span className="block text-xs text-muted-foreground">Chat to us on WhatsApp</span>
                  </span>
                  <span className="text-xs text-sage font-medium opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </button>
              )}
            </motion.div>
          )}

          {/* ── SCREEN 2: When + size ── */}
          {view === 'options' && selected && (
            <motion.div key="options" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={slideTransition}
              className="space-y-5">

              {/* Back + category identity */}
              <div className="flex items-center gap-3">
                <button onClick={() => goTo('grid', -1)}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-lg leading-none">{selected.emoji}</span>
                  <span className="text-sm font-semibold text-foreground">{selected.label}</span>
                  <span className="text-xs text-muted-foreground">· {selected.price}</span>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-muted-foreground leading-relaxed">{selected.description}</p>

              {/* When? */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">When?</p>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                  {timeSlots.map(opt => (
                    <motion.button key={opt} onClick={() => setWhen(when === opt ? '' : opt)}
                      whileTap={{ scale: 0.91 }} transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                      className={chip(when === opt, opt === 'Now')}>
                      {opt}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Size */}
              {selected.sizes && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">{selected.sizeLabel}</p>
                  <div className="flex flex-wrap gap-2">
                    {selected.sizes.map(opt => (
                      <motion.button key={opt} onClick={() => setSize(size === opt ? '' : opt)}
                        whileTap={{ scale: 0.91 }} transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                        className={chip(size === opt)}>
                        {opt}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {/* Note */}
              <input type="text" value={note} onChange={e => setNote(e.target.value)}
                placeholder="Anything to add? (optional)"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-[border-color,box-shadow] duration-150" />

              {/* CTAs */}
              <div className="space-y-2.5">
                {canPayByCard && (
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                    <Button onClick={() => goTo('contact', 1)} className="w-full rounded-full gap-2 font-semibold">
                      <CreditCard className="w-4 h-4" />
                      Book for €{(priceCents! / 100).toFixed(0)} — pay by card
                    </Button>
                  </motion.div>
                )}
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                  <Button onClick={sendWhatsApp} disabled={!canWhatsApp}
                    variant={canPayByCard ? 'outline' : 'default'}
                    className={cn('w-full rounded-full gap-2 font-semibold',
                      !canPayByCard && when ? 'bg-[#25D366] hover:bg-[#1ebe5d] text-white border-transparent' : '')}>
                    <MessageCircle className="w-4 h-4" />
                    {canPayByCard ? 'Or book via WhatsApp' : 'Book via WhatsApp'}
                  </Button>
                </motion.div>
                {!when && selected.slug !== 'tutoring' && (
                  <p className="text-center text-xs text-muted-foreground">Pick a time above to continue</p>
                )}
              </div>
            </motion.div>
          )}

          {/* ── SCREEN 3: Contact + pay ── */}
          {view === 'contact' && selected && (
            <motion.div key="contact" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={slideTransition}>
              <button onClick={() => goTo('options', -1)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <p className="text-base font-semibold text-foreground mb-4">Your details</p>

              <form onSubmit={handlePay} className="space-y-3">
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" required
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-[border-color,box-shadow] duration-150" />
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Your phone number" required
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-[border-color,box-shadow] duration-150" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (for your receipt)"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-[border-color,box-shadow] duration-150" />
                <Select value={city} onValueChange={setCity}>
                  <SelectTrigger className="rounded-xl h-10"><SelectValue placeholder="Your city" /></SelectTrigger>
                  <SelectContent>{SUPPORTED_CITIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>

                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                  <Button type="submit" disabled={loading} className="w-full rounded-full gap-2 font-semibold mt-1">
                    {loading
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Opening secure checkout…</>
                      : <><CreditCard className="w-4 h-4" />Pay €{(priceCents! / 100).toFixed(0)} securely</>}
                  </Button>
                </motion.div>

                {error && <p className="text-center text-xs text-destructive">{error}</p>}
                <p className="text-center text-xs text-muted-foreground">Stripe secure checkout · paid upfront, confirmed instantly</p>
              </form>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </section>
  );
};
