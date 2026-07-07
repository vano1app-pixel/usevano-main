import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Camera, Loader2, ArrowLeft, ArrowRight, ShieldCheck, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { teamWhatsAppHref } from '@/lib/contact';
import { SUPPORTED_CITIES } from '@/lib/cities';
import { SKILL_GROUPS, toggleGroup, toggleSub } from '@/lib/helperSkills';
import { haptic } from '@/lib/haptics';

// The jobs customers actually book, shared with the account page via
// helperSkills (groups gate dispatch matching; sub-skills are profile
// detail). 'other' is a legacy slug existing helpers hold — hidden here.
const CATEGORY_OPTIONS = SKILL_GROUPS.filter(g => g.id !== 'other');

const STATS = [
  { value: '€12–€65', label: 'per job' },
  { value: 'Flexible', label: 'your hours' },
  // Hourly anchor — the clearest student value prop, and a direct counter to
  // "is €12 even worth my time?". Backed by the ≥min-wage floor (CLAUDE.md).
  { value: '~€15/hr', label: 'typical rate' },
];

const REQUIREMENTS = [
  'Third-level student — verified by your college email',
  '18 or over, with a valid photo ID',
  'Free to join — the optional ✓ Verified tick is €2/month',
  'Living in a city we serve',
  'Friendly, reliable and up for it',
];

// Online, adults-only tutoring — no school grinds for minors (that needs Garda
// vetting, which Vano doesn't broker). Subjects skew to adult upskilling.
const TUTOR_SUBJECTS = [
  'Languages', 'French', 'Spanish', 'Irish', 'German', 'Coding & IT', 'Excel & spreadsheets',
  'Music', 'Business', 'Accounting', 'Academic writing', 'Maths',
];

const TUTOR_LEVELS = ['Adult learners', 'Third level', 'Professional / upskilling'];

const JOBS = [
  { emoji: '🧺', label: 'Laundry' },
  { emoji: '🐕', label: 'Dog walks' },
  { emoji: '🌿', label: 'Garden work' },
  { emoji: '📦', label: 'Moving help' },
  { emoji: '🧹', label: 'Cleaning' },
  { emoji: '💻', label: 'Online tutoring' },
];

// Galway-first; ATU + University of Galway lead since dispatch is live there.
const COLLEGES = [
  'University of Galway',
  'Atlantic Technological University (ATU)',
  'University College Dublin (UCD)',
  'Trinity College Dublin (TCD)',
  'University College Cork (UCC)',
  'University of Limerick (UL)',
  'Dublin City University (DCU)',
  'Maynooth University',
  'TU Dublin',
  'Munster Technological University (MTU)',
  'South East Technological University (SETU)',
  'TUS (Technological University of the Shannon)',
  'RCSI',
  'Other / not listed',
];

// Three short steps — the bare minimum to start. Everything optional (bio,
// availability, areas, transport) is collected later in the dashboard profile,
// so signup stays fast.
const STEPS = ['You', 'Your work', 'Agree'];

const inputClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-[border-color,box-shadow] duration-150';
const labelClass = 'text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5 block';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s\-().]{7,15}$/;

// A small, accessible consent row used on the final step.
const Consent: React.FC<{ checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }> = ({ checked, onChange, children }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="flex w-full items-start gap-3 rounded-xl border border-border/70 bg-background px-3.5 py-3 text-left transition-colors duration-150 hover:border-border active:scale-[0.99]"
  >
    <span
      className={cn(
        'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors duration-150',
        checked ? 'bg-sage border-sage text-white' : 'border-border bg-background',
      )}
    >
      {checked && <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={3} />}
    </span>
    <span className="text-xs leading-relaxed text-foreground/80">{children}</span>
  </button>
);

export const JoinAsHelper: React.FC = () => {
  // Wizard
  const [step, setStep] = useState(0);

  // Step 1 — you
  const [name, setName] = useState('');
  const [college, setCollege] = useState('');
  const [email, setEmail] = useState(''); // college email — also the verification address
  const [phone, setPhone] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Step 2 — work
  const [city, setCity] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [tutorSubjects, setTutorSubjects] = useState<string[]>([]);
  const [tutorLevels, setTutorLevels] = useState<string[]>([]);

  // Step 3 — consent
  const [agreeChecks, setAgreeChecks] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Optional partner / referral code — prefilled from a ?ref=CODE link (e.g. a
  // student union's recruitment link) and editable by hand.
  const [referralCode, setReferralCode] = useState(() => {
    try { return (new URLSearchParams(window.location.search).get('ref') ?? '').trim().toUpperCase(); }
    catch { return ''; }
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Peer social proof: real approved-helper faces + a live count. Students are
  // deciding whether an unknown startup will actually pay them — seeing peers
  // already doing it is the strongest reassurance, and the recruiting page had
  // none. Renders nothing on an empty/failed fetch (never a fake).
  const [peerFaces, setPeerFaces] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from('household_helpers')
          .select('photo_url')
          .eq('status', 'approved')
          .eq('show_on_homepage', true)
          .not('photo_url', 'is', null)
          .neq('photo_url', '')
          .limit(5) as { data: Array<{ photo_url: string | null }> | null };
        if (!alive) return;
        setPeerFaces((data ?? []).map((r) => r.photo_url ?? '').filter(Boolean).slice(0, 5));
      } catch { /* leave empty — no fake proof */ }
    })();
    return () => { alive = false; };
  }, []);

  function toggleIn(list: string[], set: React.Dispatch<React.SetStateAction<string[]>>, v: string) {
    set(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError('Photo must be under 8 MB.'); return; }
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setError(null);
  }

  // Per-step validity is enforced in goNext() (validateStep), which surfaces the
  // specific missing field — so the Continue button stays tappable instead of
  // sitting greyed-out with no explanation.
  const step3Valid = agreeChecks && agreeTerms;

  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!photo) return 'Please add a clear face photo.';
      if (!name.trim()) return 'Please enter your name.';
      if (!college) return 'Please choose where you study.';
      if (!EMAIL_RE.test(email.trim())) return 'Please add your college email — we verify it at sign-up.';
      if (!PHONE_RE.test(phone.trim())) return 'Please enter a valid phone number.';
    }
    if (s === 1) {
      if (!city) return 'Please choose your city.';
      if (categories.length === 0) return 'Please pick at least one job type.';
    }
    return null;
  }

  function goNext() {
    const msg = validateStep(step);
    if (msg) { setError(msg); return; }
    setError(null);
    haptic(8);
    setStep(s => Math.min(s + 1, STEPS.length - 1));
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function goBack() {
    setError(null);
    setStep(s => Math.max(s - 1, 0));
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!step3Valid) { setError('Please tick both boxes to continue.'); return; }
    setSubmitting(true);
    setError(null);
    haptic(12);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const fd = new FormData();
      fd.append('name', name.trim());
      // One email serves as both the contact address and the verified student
      // email — no second field to fill in.
      fd.append('email', cleanEmail);
      fd.append('student_email', cleanEmail);
      fd.append('phone', phone.trim());
      fd.append('city', city);
      fd.append('categories', JSON.stringify(categories));
      fd.append('tutor_subjects', JSON.stringify(tutorSubjects));
      fd.append('tutor_levels', JSON.stringify(tutorLevels));
      fd.append('college', college);
      fd.append('right_to_work', String(agreeChecks));
      fd.append('consent_verify', String(agreeChecks));
      fd.append('agree_terms', String(agreeTerms));
      fd.append('photo', photo as File);

      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

      const res = await fetch(`${supabaseUrl}/functions/v1/create-helper-application`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? anonKey}`, apikey: anonKey },
        body: fd,
      });

      const json = await res.json() as { success?: boolean; error?: string; helper_id?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Unknown error');

      // Attach an optional partner/referral code — best-effort, never blocks the
      // signup. A DB trigger turns it into an attribution so the partner earns
      // commission on this helper's completed jobs.
      const code = referralCode.trim().toUpperCase();
      if (code && json.helper_id) {
        supabase.functions
          .invoke('attach-referral-code', { body: { helper_id: json.helper_id, code } })
          .catch(() => { /* referral attach is non-critical */ });
      }

      // Carry id + email to the verification page (and survive any reload).
      try {
        if (json.helper_id) localStorage.setItem('vano_helper_id', json.helper_id);
        localStorage.setItem('vano_helper_name', name.trim());
        localStorage.setItem('vano_student_email', cleanEmail);
      } catch { /* localStorage may be unavailable — query params still carry id + name */ }

      const q = new URLSearchParams();
      if (json.helper_id) q.set('id', json.helper_id);
      if (name.trim()) q.set('name', name.trim());
      window.location.href = `/verify-helper?${q.toString()}`;
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('whatsapp')) setError(msg);
      else setError('Something went wrong — please try again or text us on WhatsApp.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <SEOHead
        title="Earn money as a student helper in Ireland — VANO"
        description="Pick up same-day home help jobs near you. Earn €12–€65 per job — laundry, dog walks, cleaning, gardening, tutoring & more. Flexible hours, paid after each job. Apply in minutes."
        keywords="student jobs Ireland, earn money as a student Galway, part time student jobs Cork Dublin Limerick, flexible student work Ireland, student helper jobs, VANO helper, home help jobs Ireland"
        url="https://vanojobs.com/join"
      />
      <HouseholdNav />

      <main>
        {/* Hero */}
        <section className="pt-32 pb-12 px-4 bg-gradient-to-b from-sage-light via-background to-background">
          <div className="max-w-lg mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }}
            >
              <p className="eyebrow mb-4 justify-center">For students across Ireland</p>
              <h1 className="display-xl text-foreground mb-4">
                Earn money between lectures
              </h1>
              <p className="text-muted-foreground text-lg leading-relaxed mb-8 max-w-sm mx-auto">
                Pick up flexible household jobs in your city. Laundry, dog walks, cleaning, garden work — you choose what you take on.
              </p>

              <div className="flex justify-center gap-3 flex-wrap mb-2">
                {STATS.map(({ value, label }) => (
                  <div key={label} className="surface-float bg-white border border-black/5 rounded-2xl px-4 py-3 text-center">
                    <p className="font-bold text-foreground text-lg leading-tight">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

              {/* Peer proof — real faces of students already earning. Only shown
                  once there's genuine supply to show. */}
              {peerFaces.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }}
                  className="mt-6 inline-flex items-center gap-3 rounded-full bg-white border border-black/5 surface-float px-4 py-2"
                >
                  <div className="flex -space-x-2.5">
                    {peerFaces.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt=""
                        loading="lazy"
                        className="w-7 h-7 rounded-full object-cover object-[center_20%] border-2 border-white"
                      />
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-foreground">
                    Join the students already earning with VANO
                  </span>
                </motion.div>
              )}
            </motion.div>
          </div>
        </section>

        {/* Application — three short steps */}
        <section ref={topRef} className="px-4 pb-16 max-w-sm mx-auto scroll-mt-24">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Header + progress */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold text-foreground">Apply to join</h2>
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">Step {step + 1} of {STEPS.length}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-sage"
                  initial={false}
                  animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                  transition={{ type: 'spring', stiffness: 240, damping: 28 }}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2">{STEPS[step]}</p>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as const }}
                className="space-y-5"
              >
                {/* ── Step 1 — You ── */}
                {step === 0 && (
                  <>
                    <div>
                      <span className={labelClass}>Your face photo</span>
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          className={cn(
                            'relative w-20 h-20 rounded-full border-2 border-dashed flex-shrink-0 flex items-center justify-center overflow-hidden transition-colors duration-150',
                            preview ? 'border-transparent' : 'border-border hover:border-primary/50 bg-secondary/50',
                          )}
                          aria-label="Upload face photo"
                        >
                          {preview ? <img src={preview} alt="Your photo" className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-muted-foreground" />}
                        </button>
                        <div>
                          <button type="button" onClick={() => fileRef.current?.click()} className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                            {preview ? 'Change photo' : 'Add a clear face photo'}
                          </button>
                          <p className="text-xs text-muted-foreground mt-0.5">Shown to customers · used for your ID check</p>
                        </div>
                      </div>
                      <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="sr-only" aria-label="Face photo upload" />
                    </div>

                    <div>
                      <span className={labelClass}>Your name</span>
                      <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="First and last name" autoComplete="name" autoCapitalize="words" className={inputClass} />
                    </div>

                    <div>
                      <span className={labelClass}>Where do you study?</span>
                      <Select value={college} onValueChange={setCollege}>
                        <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Select your college" /></SelectTrigger>
                        <SelectContent>
                          {COLLEGES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <span className={labelClass}>College email</span>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@universityofgalway.ie" autoComplete="email" inputMode="email" autoCapitalize="off" autoCorrect="off" className={inputClass} />
                      <p className="text-[11px] text-muted-foreground mt-1.5">We email a code here to confirm you're a student. Use your official college address.</p>
                    </div>

                    <div>
                      <span className={labelClass}>Phone number</span>
                      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="08x xxx xxxx" autoComplete="tel" inputMode="tel" autoCapitalize="off" autoCorrect="off" className={inputClass} />
                      <p className="text-[11px] text-muted-foreground mt-1.5">This is how we send you jobs — keep it handy.</p>
                    </div>
                  </>
                )}

                {/* ── Step 2 — Your work ── */}
                {step === 1 && (
                  <>
                    <div>
                      <span className={labelClass}>Your city</span>
                      <Select value={city} onValueChange={setCity}>
                        <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Select your city" /></SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_CITIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <span className={labelClass}>What jobs do you want to do?</span>
                      <p className="text-xs text-muted-foreground mb-3 -mt-1.5">Pick everything you're happy to take on.</p>
                      <div className="grid grid-cols-2 gap-2">
                        {CATEGORY_OPTIONS.map(({ emoji, label, id }) => {
                          const active = categories.includes(id);
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setCategories(prev => toggleGroup(prev, id))}
                              aria-pressed={active}
                              className={cn(
                                'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left border text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]',
                                active ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/60 border-border/50 text-foreground hover:bg-secondary hover:border-border',
                              )}
                            >
                              <span className="text-base leading-none select-none">{emoji}</span>
                              <span className="leading-tight">{label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Sub-skills for each picked job type — optional detail
                          ("what kind?") that lands on the helper's profile. */}
                      <AnimatePresence initial={false}>
                        {CATEGORY_OPTIONS.filter(g => g.subs.length > 0 && categories.includes(g.id)).map(group => (
                          <motion.div
                            key={group.id}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 rounded-xl border border-border/50 bg-background/60 p-3">
                              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 block">
                                {group.emoji} {group.label} — what kind? <span className="normal-case font-normal tracking-normal">(optional)</span>
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {group.subs.map(sub => {
                                  const active = categories.includes(sub.id);
                                  return (
                                    <button key={sub.id} type="button" onClick={() => setCategories(prev => toggleSub(prev, group.id, sub.id))} aria-pressed={active}
                                      className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.95]', active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border/60 text-foreground hover:border-primary/40')}>
                                      {sub.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>

                      <AnimatePresence initial={false}>
                        {categories.includes('tutoring') && (
                          <motion.div
                            key="tutoring"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="mt-4 space-y-4 bg-background/60 rounded-xl border border-border/50 p-3">
                              <p className="text-[11px] font-medium text-foreground/70 leading-snug">
                                💻 Tutoring on Vano is <span className="font-semibold">online and adults-only (18+)</span>. We don't offer school grinds for under-18s — that requires Garda vetting.
                              </p>
                              <div>
                                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 block">Subjects</span>
                                <div className="flex flex-wrap gap-2">
                                  {TUTOR_SUBJECTS.map(subject => {
                                    const active = tutorSubjects.includes(subject);
                                    return (
                                      <button key={subject} type="button" onClick={() => toggleIn(tutorSubjects, setTutorSubjects, subject)} aria-pressed={active}
                                        className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.95]', active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border/60 text-foreground hover:border-primary/40')}>
                                        {subject}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div>
                                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 block">Levels</span>
                                <div className="flex flex-wrap gap-2">
                                  {TUTOR_LEVELS.map(level => {
                                    const active = tutorLevels.includes(level);
                                    return (
                                      <button key={level} type="button" onClick={() => toggleIn(tutorLevels, setTutorLevels, level)} aria-pressed={active}
                                        className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.95]', active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border/60 text-foreground hover:border-primary/40')}>
                                        {level}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <p className="text-[11px] text-muted-foreground mt-3">Areas you cover and when you're free — you'll set those in your dashboard after you're in.</p>
                    </div>
                  </>
                )}

                {/* ── Step 3 — Agree ── */}
                {step === 2 && (
                  <>
                    <div className="rounded-2xl border border-sage/30 bg-sage-light p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <BadgeCheck className="w-5 h-5 text-sage flex-shrink-0" />
                        <p className="text-sm font-bold text-foreground">Submit this and you're live — free</p>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Jobs can reach you straight away. Then earn the ✓ Verified blue tick: confirm your
                        college email and do a 2-minute ID check (both free) — €2/month keeps the tick on
                        your name, and verified helpers are offered jobs first. Cancel anytime.
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      <Consent checked={agreeChecks} onChange={setAgreeChecks}>
                        I'm 18 or over, have the right to work in Ireland, and consent to photo-ID + selfie verification.
                      </Consent>
                      <Consent checked={agreeTerms} onChange={setAgreeTerms}>
                        I agree to VANO's <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-sage-dark underline underline-offset-2">terms</a> and helper code of conduct.
                      </Consent>
                    </div>

                    {/* Optional referral / partner code (e.g. from a student union) */}
                    <div>
                      <label htmlFor="referral-code" className={labelClass}>Referral code <span className="font-normal normal-case tracking-normal text-muted-foreground/70">(optional)</span></label>
                      <input
                        id="referral-code"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                        placeholder="e.g. your union's code"
                        maxLength={12}
                        autoCapitalize="characters"
                        className={cn(inputClass, 'font-mono tracking-wider')}
                      />
                      {referralCode.trim() && (
                        <p className="mt-1.5 text-[11px] text-sage-dark font-medium">Code {referralCode.trim()} will be applied to your signup.</p>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            <AnimatePresence>
              {error && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-center text-xs text-destructive">
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Nav buttons */}
            <div className="flex items-center gap-3 pt-1">
              {step > 0 && (
                <Button type="button" variant="outline" onClick={goBack} disabled={submitting} className="rounded-full font-semibold gap-1.5 flex-shrink-0">
                  <ArrowLeft className="w-4 h-4" />Back
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button
                  type="button"
                  onClick={goNext}
                  className="flex-1 rounded-full font-semibold gap-1.5 hover:-translate-y-px hover:shadow-primary-glow transition-[transform,box-shadow] duration-150"
                >
                  Continue<ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={submitting || !step3Valid}
                  className="flex-1 rounded-full font-semibold gap-2 hover:-translate-y-px hover:shadow-primary-glow transition-[transform,box-shadow] duration-150"
                >
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting…</> : 'Submit application →'}
                </Button>
              )}
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Joining is free and you're live the moment you submit — the ✓ Verified tick customers look for comes after.{' '}
              <a href={`${teamWhatsAppHref}?text=${encodeURIComponent("Hi VANO, I'm a student and I'd like to start doing household jobs.")}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
                Prefer to text us?
              </a>
            </p>
          </form>
        </section>

        {/* Job types */}
        <section className="px-4 py-12 max-w-lg mx-auto">
          <p className="eyebrow mb-3">What you'll do</p>
          <h2 className="text-2xl font-semibold text-foreground mb-6">Jobs available right now</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {JOBS.map(({ emoji, label }) => (
              <div key={label} className="surface-float bg-white border border-black/5 rounded-2xl p-4 flex items-center gap-3">
                <span className="text-2xl leading-none">{emoji}</span>
                <span className="text-sm font-medium text-foreground">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Requirements */}
        <section className="px-4 py-12 bg-sage-light">
          <div className="max-w-lg mx-auto">
            <p className="eyebrow mb-3">What we need from you</p>
            <h2 className="text-2xl font-semibold text-foreground mb-6">Requirements</h2>
            <ul className="space-y-3">
              {REQUIREMENTS.map((req) => (
                <li key={req} className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-sage flex-shrink-0" />
                  <span className="text-foreground text-base">{req}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Your safety too — VANO protects the helper as well as the household */}
        <section className="px-4 py-12 max-w-lg mx-auto">
          <p className="eyebrow mb-3">Your safety comes first too</p>
          <h2 className="text-2xl font-semibold text-foreground mb-6">We look after you on every job</h2>
          <ul className="space-y-3">
            {[
              'You choose every job — see the customer and the task before you accept.',
              'Your live location is only shared while a job is on, never before or after.',
              'An arrival code confirms you’re at the right door before you start.',
              'Guaranteed pay — your earnings are held and released to you automatically.',
              'One tap to reach us if anything ever feels off.',
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-sage flex-shrink-0 mt-0.5" />
                <span className="text-foreground text-base leading-relaxed">{t}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section className="px-4 py-12 max-w-lg mx-auto">
          <p className="eyebrow mb-3">How it works</p>
          <h2 className="text-2xl font-semibold text-foreground mb-6">From sign-up to your first job</h2>
          <ol className="space-y-5">
            {[
              { n: '1', title: 'Join free & get verified', body: "Your details and a photo and you're live. Then confirm your college email and do a quick ID check to unlock the ✓ tick (€2/month, cancel anytime)." },
              { n: '2', title: 'Get matched to jobs', body: "When a job near you comes in, we'll text you first. Accept or pass — totally your call." },
              { n: '3', title: 'Do the job, get paid', body: 'Show up, do great work, and get paid straight to your account after each job.' },
            ].map(({ n, title, body }) => (
              <li key={n} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-sage text-white font-bold text-sm flex items-center justify-center flex-shrink-0 mt-0.5">{n}</div>
                <div>
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <HouseholdFooter />
    </>
  );
};

export default JoinAsHelper;
