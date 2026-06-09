import React, { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CreditCard, MessageCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { SUPPORTED_CITIES } from '@/lib/cities';
import { supabase } from '@/integrations/supabase/client';
import { teamWhatsAppHref } from '@/lib/contact';

interface TaskQuestion {
  label:   string;
  options: string[];
}

interface Task {
  emoji:        string;
  label:        string;
  slug:         string;
  price:        string;
  description:  string;
  q1?:          TaskQuestion;
  q2?:          TaskQuestion;
  noSchedule?:  boolean; // errands that are always same-day
  whatsappOnly?: boolean;
}

const ALL_TASKS: Task[] = [
  {
    emoji: '🛒', label: 'Grocery shopping', slug: 'grocery-shopping', price: 'from €12',
    description: 'We shop any store, follow your list, and deliver straight to your door.',
    q1: { label: 'How big is the shop?', options: ['Quick errand', 'Weekly shop', 'Big monthly shop'] },
    noSchedule: true,
  },
  {
    emoji: '🐕', label: 'Dog walking', slug: 'dog-walking', price: 'from €12',
    description: 'Collected from your door, walked on-lead, returned home safely.',
    q1: { label: 'Walk & dogs', options: ['30 min · 1 dog', '1 hr · 1 dog', '1 hr · 2 dogs', '2 hrs · 1 dog', '2 hrs · 2+ dogs'] },
  },
  {
    emoji: '🌿', label: 'Lawn mowing', slug: 'lawn-mowing', price: 'from €22',
    description: 'Grass cut, edges trimmed and clippings cleared — all in one visit.',
    q1: { label: 'Garden size', options: ['Small (terrace / apartment)', 'Medium (semi-detached)', 'Large (detached)', 'Extra large'] },
  },
  {
    emoji: '📦', label: 'Moving help', slug: 'moving-help', price: 'from €25',
    description: 'Loading, carrying, unloading — you arrange the van, we do the heavy lifting.',
    q1: { label: 'How much to move?', options: ['A few boxes / items', 'One room', '2–3 rooms', 'Full home'] },
  },
  {
    emoji: '🧹', label: 'Outdoor cleaning', slug: 'outdoor-cleaning', price: 'from €22',
    description: 'Patio, driveway, bins, windows or gutters — pick what needs doing.',
    q1: { label: 'Area to clean', options: ['Small area', 'Medium area', 'Large area'] },
  },
  {
    emoji: '📚', label: 'Tutoring & grinds', slug: 'tutoring-grinds', price: 'from €22/hr',
    description: 'One-to-one at your home. Any subject — Maths, science, languages.',
    q1: { label: 'What level?',  options: ['Primary school', 'Junior Cert', 'Leaving Cert', 'College / Uni'] },
    q2: { label: 'How long?',    options: ['1 hour', '2 hours', '3 hours'] },
  },
  {
    emoji: '💊', label: 'Pharmacy run', slug: 'pharmacy-run', price: '€12 flat',
    description: 'We collect your prescription or over-the-counter items from your local pharmacy.',
    noSchedule: true,
  },
  {
    emoji: '📬', label: 'Post office run', slug: 'post-office', price: '€10 flat',
    description: 'We drop off or collect parcels, letters and forms at your local post office.',
    noSchedule: true,
  },
  {
    emoji: '🔧', label: 'Furniture assembly', slug: 'furniture-assembly', price: 'from €22',
    description: 'IKEA or any flat-pack furniture assembled at your home — no tools needed on your end.',
    q1: { label: 'How many items?', options: ['1 item', '2–3 items', '4–6 items', '7+ items'] },
  },
  {
    emoji: '📱', label: 'Tech help', slug: 'tech-help', price: 'from €20',
    description: 'Device setup and troubleshooting at your home. Great for elderly family members.',
    q1: { label: 'What needs help?', options: ['Phone / tablet', 'Laptop / PC', 'TV / streaming', 'Wi-Fi / router', 'Smart home setup'] },
  },
  {
    emoji: '🚪', label: 'Wait for deliveries', slug: 'wait-delivery', price: '€10 flat',
    description: "We wait at your home for a delivery or tradesperson while you're out.",
    noSchedule: true,
  },
  {
    emoji: '🌙', label: 'Midnight Lift', slug: 'midnight-lift', price: 'from €10',
    description: 'Safe, reliable late-night lift home. No surge pricing, no apps — just a student with a car.',
    q1: { label: 'How far?', options: ['Nearby (under 3 km)', 'Mid-range (3–10 km)', 'Far (10 km+)'] },
    noSchedule: true,
  },
  {
    emoji: '✨', label: 'Anything else', slug: 'anything-else', price: 'Custom',
    description: "Not listed? Send us a WhatsApp and we'll sort it out.",
    whatsappOnly: true,
  },
];

const SCHEDULE_DISCOUNT = 0.10; // 10% off for booking ahead
const LOYALTY_DISCOUNT  = 0.50; // 50% off every 3rd booking

function getPriceCents(slug: string, q1: string, q2: string): number | null {
  const flat: Record<string, number> = {
    'pharmacy-run':  1200, // €12 — covers travel + time
    'post-office':   1000,
    'wait-delivery': 1000,
  };
  if (slug in flat) return flat[slug];

  if (slug === 'grocery-shopping') {
    return ({ 'Quick errand': 1200, 'Weekly shop': 1800, 'Big monthly shop': 2800 })[q1] ?? null;
  }

  if (slug === 'dog-walking' || slug === 'dog-walk') {
    return ({
      '30 min · 1 dog': 1200, '1 hr · 1 dog': 1600, '1 hr · 2 dogs': 2000,
      '2 hrs · 1 dog': 2200,  '2 hrs · 2+ dogs': 2800,
      // legacy fallback
      '30 min': 1200, '1 hour': 1600, '2 hours': 2200,
    })[q1] ?? null;
  }

  if (slug === 'lawn-mowing' || slug === 'garden') {
    return ({
      'Small (terrace / apartment)': 2200, 'Medium (semi-detached)': 3800,
      'Large (detached)': 6000,            'Extra large': 9000,
      // legacy
      '1 hour': 2000, '2 hours': 4000, 'Half day': 7200,
    })[q1] ?? null;
  }

  if (slug === 'moving-help' || slug === 'moving') {
    return ({
      'A few boxes / items': 2500, 'One room': 4000,
      '2–3 rooms': 7000,           'Full home': 10000,
      // legacy
      '1 hour': 2000, '2 hours': 4000, '3 hours': 6000, '4+ hours': 8000,
    })[q1] ?? null;
  }

  if (slug === 'outdoor-cleaning' || slug === 'cleaning') {
    return ({
      'Small area': 2200, 'Medium area': 3800, 'Large area': 5500,
      // legacy
      '1 hour': 1800, '2 hours': 3600, '3 hours': 5400,
    })[q1] ?? null;
  }

  if (slug === 'furniture-assembly') {
    return ({
      '1 item': 2200, '2–3 items': 3800, '4–6 items': 5800, '7+ items': 8000,
      // legacy
      '1 hour': 2000, '2 hours': 4000, '3 hours': 6000,
    })[q1] ?? null;
  }

  if (slug === 'tech-help') {
    return ({
      'Phone / tablet': 2000, 'Laptop / PC': 2800, 'TV / streaming': 2200,
      'Wi-Fi / router': 3000, 'Smart home setup': 4000,
      // legacy
      '1 hour': 2500, '2 hours': 5000,
    })[q1] ?? null;
  }

  if (slug === 'midnight-lift') {
    return ({
      'Nearby (under 3 km)':  1000,
      'Mid-range (3–10 km)':  1500,
      'Far (10 km+)':         2800,
    })[q1] ?? null;
  }

  if (slug === 'tutoring-grinds' || slug === 'tutoring') {
    const rate: Record<string, number> = {
      'Primary school': 2200, 'Junior Cert': 2800,
      'Leaving Cert': 3200,   'College / Uni': 3800,
    };
    const hrs: Record<string, number> = { '1 hour': 1, '2 hours': 2, '3 hours': 3 };
    const r = rate[q1];
    const h = hrs[q2];
    if (!r || !h) return null;
    return r * h;
  }

  return null;
}

function applyScheduleDiscount(cents: number): number {
  return Math.round(cents * (1 - SCHEDULE_DISCOUNT));
}
function applyLoyaltyDiscount(cents: number): number {
  return Math.round(cents * (1 - LOYALTY_DISCOUNT));
}

// One unified list of time options covering today + next 5 days.
// isToday = no schedule discount; isFuture = 10% off.
interface TimeOption { label: string; isToday: boolean; }

function getTimeOptions(): TimeOption[] {
  const now   = new Date();
  const h     = now.getHours();
  const days  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const opts: TimeOption[] = [];

  // Today slots (only show times still ahead)
  if (h < 12) opts.push({ label: 'This morning',   isToday: true });
  if (h < 17) opts.push({ label: 'This afternoon',  isToday: true });
  if (h < 20) opts.push({ label: 'This evening',    isToday: true });

  // Next 5 days × 3 slots
  for (let i = 1; i <= 5; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dayLabel = i === 1 ? 'Tomorrow' : days[d.getDay()];
    opts.push({ label: `${dayLabel} morning`,   isToday: false });
    opts.push({ label: `${dayLabel} afternoon`, isToday: false });
    opts.push({ label: `${dayLabel} evening`,   isToday: false });
  }
  return opts;
}

const chipBase = 'px-3 py-1.5 rounded-full text-sm font-medium border transition-[background-color,color,border-color] duration-150';

function chip(active: boolean, isNow = false) {
  if (active) return cn(chipBase, isNow ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-primary text-primary-foreground border-primary');
  if (isNow)  return cn(chipBase, 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800');
  return cn(chipBase, 'bg-background text-foreground border-border hover:border-primary/40');
}

const fadeSlide = {
  initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 },
  transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const },
};
const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const card = {
  hidden: { opacity: 0, y: 14, scale: 0.94 },
  show:   { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] as const } },
};

const LS_NAME    = 'vano_customer_name';
const LS_PHONE   = 'vano_customer_phone';
const LS_CITY    = 'vano_customer_city';
const LS_ADDRESS = 'vano_customer_address';

export const TaskShowcase: React.FC = () => {
  const [selected,    setSelected]    = useState<Task | null>(null);
  const [q1Val,       setQ1Val]       = useState('');
  const [q2Val,       setQ2Val]       = useState('');
  const [when,        setWhen]        = useState('');
  const [note,        setNote]        = useState(() => { try { return localStorage.getItem(LS_ADDRESS) ?? ''; } catch { return ''; } });
  const [name,        setName]        = useState(() => { try { return localStorage.getItem(LS_NAME)    ?? ''; } catch { return ''; } });
  const [phone,       setPhone]       = useState(() => { try { return localStorage.getItem(LS_PHONE)   ?? ''; } catch { return ''; } });
  const [city,        setCity]        = useState(() => { try { return localStorage.getItem(LS_CITY)    ?? 'Galway'; } catch { return 'Galway'; } });
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [isLoyalty,   setIsLoyalty]   = useState(false);
  const [loyaltyChecking, setLoyaltyChecking] = useState(false);
  const timeOptions  = useMemo(() => getTimeOptions(), []);

  async function checkLoyalty(phoneVal: string) {
    if (phoneVal.replace(/\D/g, '').length < 8) return;
    setLoyaltyChecking(true);
    try {
      const { data } = await supabase.functions.invoke('check-loyalty', {
        body: { customer_phone: phoneVal.trim() },
      });
      setIsLoyalty((data as { is_loyalty?: boolean } | null)?.is_loyalty ?? false);
    } catch {
      // silently fail — loyalty check is non-blocking
    } finally {
      setLoyaltyChecking(false);
    }
  }

  function open(task: Task, preQ1 = '') {
    setSelected(task);
    setQ1Val(preQ1); setQ2Val(''); setWhen(''); setNote('');
    setIsLoyalty(false);
    setError(null);
    setTapped(null);
    setTimeout(() => {
      document.getElementById('task-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }
  function handleCardTap(task: Task) {
    if (selected?.slug === task.slug) { setSelected(null); setTapped(null); setError(null); return; }
    if (tapped?.slug === task.slug)   { setTapped(null); return; }
    // Tasks with Q1 show inline sub-options first; others open panel directly
    if (task.q1 && !task.whatsappOnly) { setTapped(task); setSelected(null); }
    else open(task);
  }
  function close() { setSelected(null); setTapped(null); setError(null); }

  // tapped = card waiting for inline Q1 selection (if it has q1)
  const [tapped, setTapped] = useState<Task | null>(null);

  const baseCents      = selected ? getPriceCents(selected.slug, q1Val, q2Val) : null;
  const selectedOption = timeOptions.find(o => o.label === when);
  const isScheduled    = !!selectedOption && !selectedOption.isToday && !selected?.noSchedule;
  const afterSchedule  = baseCents !== null ? (isScheduled ? applyScheduleDiscount(baseCents) : baseCents) : null;
  const priceCents     = afterSchedule !== null ? (isLoyalty ? applyLoyaltyDiscount(afterSchedule) : afterSchedule) : null;
  const canShowTiming  = priceCents !== null || (!selected?.q1 && !selected?.whatsappOnly);
  const canBook        = priceCents !== null && !!when;
  const canWhatsApp    = selected?.whatsappOnly ?? false;

  function sendWhatsApp() {
    if (!selected) return;
    const lines = [`Hi VANO! I need help with: ${selected.label}.`];
    if (q1Val) lines.push(`${selected.q1?.label ?? 'Option'}: ${q1Val}`);
    if (q2Val) lines.push(`${selected.q2?.label ?? 'Duration'}: ${q2Val}`);
    if (when) lines.push(`When: ${when}`);
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
          category:       selected.slug,
          when_label:     when,
          size_label:     q1Val,
          extra_label:    q2Val,
          scheduled:      isScheduled,
          note:           note.trim(),
          customer_name:  name.trim(),
          customer_phone: phone.trim(),
          city,
          // loyalty is re-verified server-side; this is just a hint
          loyalty_hint:   isLoyalty,
        }},
      );
      if (fnErr || !data?.checkout_url) {
        throw new Error((data as { error?: string } | null)?.error || fnErr?.message || 'Something went wrong.');
      }
      try {
        localStorage.setItem(LS_NAME,    name.trim());
        localStorage.setItem(LS_PHONE,   phone.trim());
        localStorage.setItem(LS_CITY,    city);
        if (note.trim()) localStorage.setItem(LS_ADDRESS, note.trim());
      } catch { /* storage blocked */ }
      window.location.href = data.checkout_url as string;
    } catch (err: unknown) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <section className="px-4 py-12 max-w-5xl mx-auto">
      <p className="eyebrow mb-3">Full list</p>
      <h2 className="text-2xl font-semibold text-foreground mb-6" style={{ letterSpacing: '-0.02em' }}>
        What can your helper do?
      </h2>

      {/* ── Task list ── */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
        variants={container} initial="hidden" whileInView="show"
        viewport={{ once: true, margin: '-48px' }}
      >
        {ALL_TASKS.map((task) => {
          const isActive = selected?.slug === task.slug || tapped?.slug === task.slug;
          return (
            <motion.button
              key={task.slug} variants={card}
              onClick={() => handleCardTap(task)}
              aria-pressed={isActive}
              className={cn(
                'group flex items-start gap-3 rounded-xl p-3.5 text-left border',
                'transition-[background-color,border-color,box-shadow] duration-150',
                'active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                isActive
                  ? 'bg-primary/[0.07] border-primary/30 shadow-tinted-sm'
                  : 'bg-secondary/30 border-border/40 hover:bg-primary/[0.04] hover:border-primary/20 hover:shadow-tinted-sm',
              )}
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-background shadow-tinted-sm text-lg leading-none mt-0.5" aria-hidden="true">
                {task.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">{task.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{task.description}</p>
              </div>
              <span className={cn(
                'flex-shrink-0 self-center text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap',
                isActive ? 'bg-primary/15 text-primary' : 'bg-background/80 text-muted-foreground border border-border/60',
              )}>
                {task.price}
              </span>
            </motion.button>
          );
        })}
      </motion.div>

      {/* Inline Q1 sub-options — shown below the grid */}
      <AnimatePresence>
        {tapped?.q1 && (
          <motion.div
            key={`inline-${tapped.slug}`}
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mt-2 overflow-hidden"
          >
            <div className="rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                {tapped.q1.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {tapped.q1.options.map(opt => (
                  <motion.button
                    key={opt} type="button"
                    onClick={() => open(tapped, opt)}
                    whileTap={{ scale: 0.91 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                    className={chip(false)}
                  >{opt}</motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Booking panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            id="task-panel" key={selected.slug}
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
                <AnimatePresence mode="wait">
                  {priceCents !== null ? (
                    <motion.div key="price" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-primary">€{(priceCents / 100).toFixed(0)}</span>
                      {(isScheduled || isLoyalty) && baseCents !== null && (
                        <span className="text-[10px] text-muted-foreground line-through">€{(baseCents / 100).toFixed(0)}</span>
                      )}
                      {isLoyalty && (
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">🎉 50% off</span>
                      )}
                      {isScheduled && !isLoyalty && (
                        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">10% off</span>
                      )}
                    </motion.div>
                  ) : (
                    <motion.p key="from" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-muted-foreground">
                      {selected.price}
                    </motion.p>
                  )}
                </AnimatePresence>
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
                {/* WhatsApp-only services */}
                {selected.whatsappOnly ? (
                  <motion.div key="wa-only" {...fadeSlide} className="space-y-3">
                    <p className="text-xs text-muted-foreground">Describe what you need and we'll sort it out — most things are possible.</p>
                    <textarea
                      value={note} onChange={e => setNote(e.target.value)}
                      placeholder="e.g. I need someone to hang 3 pictures and assemble a wardrobe..."
                      rows={3}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none"
                    />
                    <Button onClick={sendWhatsApp} className="w-full rounded-full gap-2 font-semibold bg-[#25D366] hover:bg-[#1ebe5d] text-white border-transparent">
                      <MessageCircle className="w-4 h-4" />Send us a WhatsApp →
                    </Button>
                    <p className="text-center text-xs text-muted-foreground/60">We reply fast — usually within the hour</p>
                  </motion.div>
                ) : (
                  <motion.form key="book-form" {...fadeSlide} onSubmit={handlePay} className="space-y-5">

                    {/* Q1 — hidden when already chosen via inline card picker */}
                    {selected.q1 && !q1Val && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                          {selected.q1.label}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selected.q1.options.map(opt => (
                            <motion.button
                              key={opt} type="button"
                              onClick={() => { setQ1Val(q1Val === opt ? '' : opt); setQ2Val(''); }}
                              whileTap={{ scale: 0.91 }}
                              transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                              className={chip(q1Val === opt)}
                            >{opt}</motion.button>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Selected Q1 shown as a dismissible pill */}
                    {selected.q1 && q1Val && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{selected.q1.label}:</span>
                        <button
                          type="button"
                          onClick={() => { setQ1Val(''); setQ2Val(''); }}
                          className="flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-1 text-xs font-medium text-primary"
                        >
                          {q1Val} <X className="w-3 h-3 ml-0.5" />
                        </button>
                      </div>
                    )}

                    {/* Q2 — tutoring only, revealed after Q1 */}
                    {selected.q2 && q1Val && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                        transition={{ duration: 0.18 }} className="overflow-hidden"
                      >
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                          {selected.q2.label}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selected.q2.options.map(opt => (
                            <motion.button
                              key={opt} type="button"
                              onClick={() => setQ2Val(q2Val === opt ? '' : opt)}
                              whileTap={{ scale: 0.91 }}
                              transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                              className={chip(q2Val === opt)}
                            >{opt}</motion.button>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* When — revealed once price is known */}
                    <AnimatePresence>
                      {canShowTiming && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                          className="overflow-hidden space-y-3"
                        >
                          {/* Unified time picker */}
                          <div>
                              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">When?</p>
                              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                                {(selected.noSchedule
                                  ? timeOptions.filter(o => o.isToday)
                                  : timeOptions
                                ).map(opt => (
                                  <motion.button
                                    key={opt.label} type="button"
                                    onClick={() => setWhen(when === opt.label ? '' : opt.label)}
                                    whileTap={{ scale: 0.91 }}
                                    transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                                    className={cn(chip(when === opt.label), 'flex-shrink-0 relative')}
                                  >
                                    {opt.label}
                                    {!opt.isToday && baseCents !== null && (
                                      <span className="ml-1 text-[10px] font-semibold text-emerald-600">-10%</span>
                                    )}
                                  </motion.button>
                                ))}
                              </div>
                            </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Note */}
                    {canShowTiming && (
                      <input
                        type="text" value={note} onChange={e => setNote(e.target.value)}
                        placeholder="Address or anything to add (optional)"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                      />
                    )}

                    {/* Contact — revealed once time is picked */}
                    <AnimatePresence>
                      {when && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                          className="space-y-3 overflow-hidden"
                        >
                          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your details</p>
                          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" required
                            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent" />
                          <div className="relative">
                            <input
                              type="tel" value={phone}
                              onChange={e => { setPhone(e.target.value); setIsLoyalty(false); }}
                              onBlur={e => checkLoyalty(e.target.value)}
                              placeholder="Your phone number" required
                              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                            />
                            {loyaltyChecking && (
                              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground/50" />
                            )}
                          </div>
                          <Select value={city} onValueChange={setCity}>
                            <SelectTrigger className="rounded-xl h-10"><SelectValue placeholder="Your city" /></SelectTrigger>
                            <SelectContent>{SUPPORTED_CITIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                          </Select>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Schedule savings banner */}
                    <AnimatePresence>
                      {isScheduled && baseCents !== null && afterSchedule !== null && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                          transition={{ duration: 0.2 }}
                          className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3.5 py-3"
                        >
                          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                            📅 You're saving €{((baseCents - afterSchedule) / 100).toFixed(0)} by scheduling ahead
                          </p>
                          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                            10% off when you book in advance — your helper plans around you.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Loyalty reward banner */}
                    <AnimatePresence>
                      {isLoyalty && priceCents !== null && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                          transition={{ duration: 0.2 }}
                          className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3.5 py-3"
                        >
                          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">🎉 This is your loyalty booking!</p>
                          <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                            Every 3rd booking is 50% off — your price is automatically €{(priceCents / 100).toFixed(0)}.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Pay CTA — primary action */}
                    {canBook && (
                      <>
                        <Button type="submit" disabled={loading} className="w-full rounded-full gap-2 font-semibold">
                          {loading
                            ? <><Loader2 className="w-4 h-4 animate-spin" />Opening secure checkout…</>
                            : <><CreditCard className="w-4 h-4" />Book your helper — €{(priceCents! / 100).toFixed(0)}</>}
                        </Button>
                        <p className="text-center text-xs text-muted-foreground leading-relaxed">
                          🛡️ All students are screened · money back if the job isn't done right
                        </p>
                        <p className="text-center text-[11px] text-muted-foreground/60">
                          ⚡ Usually matched within 30 mins · Stripe secure checkout
                        </p>
                      </>
                    )}

                    {error && <p className="text-center text-xs text-destructive">{error}</p>}

                    {/* WhatsApp — secondary, only shown once a time is picked */}
                    {canBook && (
                      <p className="text-center text-xs text-muted-foreground/60">
                        Need to ask something first?{' '}
                        <button type="button" onClick={sendWhatsApp} className="underline underline-offset-2 hover:text-muted-foreground transition-colors">
                          WhatsApp us
                        </button>
                      </p>
                    )}
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
