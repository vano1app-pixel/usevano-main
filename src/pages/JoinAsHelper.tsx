import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Camera, Loader2, CheckCircle, ArrowLeft, ArrowRight, ShieldCheck, GraduationCap, BadgeCheck, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { teamWhatsAppHref } from '@/lib/contact';
import { SUPPORTED_CITIES } from '@/lib/cities';
import { haptic } from '@/lib/haptics';

// Exactly the six services customers can book (CategoryGrid). Slug 'shopping'
// is the laundry slug customer-side; label matches so helpers see what
// customers see.
const CATEGORY_OPTIONS = [
  { emoji: '🧺', label: 'Laundry',  slug: 'shopping'  },
  { emoji: '🐕', label: 'Dog walk', slug: 'dog-walk'  },
  { emoji: '🌿', label: 'Garden',   slug: 'garden'    },
  { emoji: '📦', label: 'Moving',   slug: 'moving'    },
  { emoji: '🧹', label: 'Cleaning', slug: 'cleaning'  },
  { emoji: '📚', label: 'Tutoring', slug: 'tutoring'  },
];

const STATS = [
  { value: '€12–€65', label: 'per job' },
  { value: 'Flexible', label: 'your hours' },
  { value: 'Per job', label: 'paid to your account' },
];

const REQUIREMENTS = [
  'Third-level student — verified by your college email',
  '18 or over, with a valid photo ID',
  'Living in a city we serve',
  'Friendly, reliable and up for it',
];

const TUTOR_SUBJECTS = [
  'Maths', 'English', 'Irish', 'Science', 'Biology', 'Chemistry', 'Physics',
  'History', 'Geography', 'French', 'Spanish', 'Engineering', 'Business', 'Accounting',
];

const TUTOR_LEVELS = ['Primary', 'Junior Cert', 'Leaving Cert', 'Third Level'];

const JOBS = [
  { emoji: '🧺', label: 'Laundry' },
  { emoji: '🐕', label: 'Dog walks' },
  { emoji: '🌿', label: 'Garden work' },
  { emoji: '📦', label: 'Moving help' },
  { emoji: '🧹', label: 'Cleaning' },
  { emoji: '📚', label: 'Tutoring' },
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

const YEARS = ['1st year', '2nd year', '3rd year', '4th year', '5th year', 'Postgrad', 'Recent graduate'];

const TRANSPORT = [
  { id: 'walk',   emoji: '🚲', label: 'Walk / cycle' },
  { id: 'car',    emoji: '🚗', label: 'Own car' },
  { id: 'public', emoji: '🚌', label: 'Public transport' },
];

// Reuses the exact slot ids the dashboard profile sheet uses, so availability
// set at signup flows straight into the helper's profile.
const AVAILABILITY_SLOTS = [
  { id: 'mon-fri-morning',   label: 'Weekday mornings'   },
  { id: 'mon-fri-afternoon', label: 'Weekday afternoons' },
  { id: 'mon-fri-evening',   label: 'Weekday evenings'   },
  { id: 'sat-morning',       label: 'Sat mornings'       },
  { id: 'sat-afternoon',     label: 'Sat afternoons'     },
  { id: 'sat-evening',       label: 'Sat evenings'       },
  { id: 'sun-morning',       label: 'Sun mornings'       },
  { id: 'sun-afternoon',     label: 'Sun afternoons'     },
  { id: 'sun-evening',       label: 'Sun evenings'       },
];

const STEPS = ['You', 'Your study', 'Your work', 'Verify & agree'];

const inputClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-[border-color,box-shadow] duration-150';
const labelClass = 'text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5 block';

function ageFromDob(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

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
  const params = new URLSearchParams(window.location.search);
  const welcomeBack = params.get('welcome') === '1';
  const welcomeName = params.get('name') ?? '';

  // Wizard
  const [step, setStep] = useState(0);

  // Step 1 — you
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Step 2 — study
  const [college, setCollege] = useState('');
  const [course, setCourse] = useState('');
  const [year, setYear] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [bio, setBio] = useState('');

  // Step 3 — work
  const [city, setCity] = useState('');
  const [areas, setAreas] = useState('');
  const [transport, setTransport] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [tutorSubjects, setTutorSubjects] = useState<string[]>([]);
  const [tutorLevels, setTutorLevels] = useState<string[]>([]);
  const [availability, setAvailability] = useState<string[]>([]);

  // Step 4 — consent
  const [rightToWork, setRightToWork] = useState(false);
  const [consentVerify, setConsentVerify] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const age = ageFromDob(dob);

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

  const step1Valid = !!photo && !!name.trim() && age !== null && age >= 18 && age <= 100 && EMAIL_RE.test(email.trim()) && PHONE_RE.test(phone.trim());
  const step2Valid = !!college && EMAIL_RE.test(studentEmail.trim());
  const step3Valid = !!city && categories.length > 0;
  const step4Valid = rightToWork && consentVerify && agreeTerms;

  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!photo) return 'Please add a clear face photo.';
      if (!name.trim()) return 'Please enter your name.';
      if (age === null) return 'Please enter your date of birth.';
      if (age < 18) return 'You must be 18 or older to join VANO.';
      if (!EMAIL_RE.test(email.trim())) return 'Please enter a valid email.';
      if (!PHONE_RE.test(phone.trim())) return 'Please enter a valid phone number.';
    }
    if (s === 1) {
      if (!college) return 'Please choose where you study.';
      if (!EMAIL_RE.test(studentEmail.trim())) return 'Please add your college email — we verify it at sign-up.';
    }
    if (s === 2) {
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
    if (!step4Valid) { setError('Please tick the three boxes to continue.'); return; }
    setSubmitting(true);
    setError(null);
    haptic(12);

    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      // Send computed age (the live function reads this today) AND the dob /
      // new fields (stored once the updated function is deployed).
      if (age !== null) fd.append('age', String(age));
      fd.append('dob', dob);
      if (bio.trim()) fd.append('bio', bio.trim());
      fd.append('email', email.trim().toLowerCase());
      fd.append('phone', phone.trim());
      fd.append('city', city);
      fd.append('categories', JSON.stringify(categories));
      fd.append('tutor_subjects', JSON.stringify(tutorSubjects));
      fd.append('tutor_levels', JSON.stringify(tutorLevels));
      fd.append('college', college);
      if (course.trim()) fd.append('course', course.trim());
      if (year) fd.append('year', year);
      if (studentEmail.trim()) fd.append('student_email', studentEmail.trim().toLowerCase());
      if (transport) fd.append('transport', transport);
      fd.append('areas', JSON.stringify(areas.split(',').map(a => a.trim()).filter(Boolean)));
      fd.append('availability', JSON.stringify(availability));
      fd.append('right_to_work', String(rightToWork));
      fd.append('consent_verify', String(consentVerify));
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

      // Persist for the verification step (id + student-email prefill), then
      // move to /verify-helper — the three gates (email, ID, €2) live there.
      try {
        if (json.helper_id) localStorage.setItem('vano_helper_id', json.helper_id);
        localStorage.setItem('vano_helper_name', name.trim());
        if (studentEmail.trim()) localStorage.setItem('vano_student_email', studentEmail.trim().toLowerCase());
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
                  <div key={label} className="bg-background border border-border/60 rounded-2xl px-4 py-3 text-center shadow-tinted-sm">
                    <p className="font-bold text-foreground text-lg leading-tight">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Application */}
        <section ref={topRef} className="px-4 pb-16 max-w-sm mx-auto scroll-mt-24">
          {welcomeBack ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
              className="bg-sage-light rounded-2xl p-8 text-center"
            >
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.1 }}
                className="mb-4"
              >
                <CheckCircle className="w-12 h-12 text-sage mx-auto" />
              </motion.div>
              <h2 className="font-bold text-foreground text-xl mb-2">
                Application in{welcomeName ? `, ${welcomeName.split(' ')[0]}` : ''}! 🎉
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">
                Two quick steps finish your sign-up and get you live faster:
              </p>

              {/* Next steps — verification (scaffolded backend) */}
              <div className="space-y-2.5 text-left mb-6">
                <div className="rounded-2xl border border-sage/30 bg-background p-3.5 flex items-start gap-3">
                  <Mail className="w-4 h-4 text-sage mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Confirm your student email</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">We've sent a code to your college address to verify you're a student.</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-sage/30 bg-background p-3.5 flex items-start gap-3">
                  <ShieldCheck className="w-4 h-4 text-sage mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Verify your ID</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">A 2-minute photo-ID + selfie check (secured by Stripe). We'll text you a link before your first job.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-sage/30 bg-background p-4 text-left mb-6">
                <p className="text-sm font-semibold text-foreground mb-1">Set up payouts to get paid</p>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  Add your bank account or Revolut (any IBAN works) and you'll be paid automatically after each job. You can do this later — your earnings are held safely until you do.
                </p>
                <div className="flex items-center gap-2">
                  <a href="/student-dashboard?tab=earnings" className="flex-1 h-10 rounded-full bg-sage text-white text-xs font-semibold flex items-center justify-center">Set up payouts</a>
                  <a href="/student-dashboard" className="flex-1 h-10 rounded-full bg-secondary text-foreground text-xs font-semibold flex items-center justify-center">Skip for now</a>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Questions? WhatsApp us at{' '}
                <a href="https://wa.me/353899817111" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">+353 89 981 7111</a>
              </p>
            </motion.div>
          ) : (
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
                        <span className={labelClass}>Date of birth <span className="normal-case font-normal text-muted-foreground">(must be 18+)</span></span>
                        <input type="date" value={dob} onChange={e => setDob(e.target.value)} className={inputClass} />
                        {age !== null && age < 18 && <p className="text-[11px] text-destructive mt-1.5">You must be 18 or older to join.</p>}
                      </div>

                      <div>
                        <span className={labelClass}>Email</span>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" autoComplete="email" inputMode="email" autoCapitalize="off" autoCorrect="off" className={inputClass} />
                      </div>

                      <div>
                        <span className={labelClass}>Phone number</span>
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="08x xxx xxxx" autoComplete="tel" inputMode="tel" autoCapitalize="off" autoCorrect="off" className={inputClass} />
                        <p className="text-[11px] text-muted-foreground mt-1.5">This is how we send you jobs — keep it handy.</p>
                      </div>
                    </>
                  )}

                  {/* ── Step 2 — Your study ── */}
                  {step === 1 && (
                    <>
                      <div className="flex items-start gap-3 rounded-xl bg-sage/8 border border-sage/25 px-3.5 py-2.5">
                        <GraduationCap className="w-4 h-4 text-sage-dark mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-foreground/70 leading-relaxed">VANO is student-powered. We verify your college email so customers know every helper is a real student.</p>
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

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className={labelClass}>Course <span className="normal-case font-normal">(optional)</span></span>
                          <input type="text" value={course} onChange={e => setCourse(e.target.value)} placeholder="e.g. Engineering" className={inputClass} />
                        </div>
                        <div>
                          <span className={labelClass}>Year <span className="normal-case font-normal">(optional)</span></span>
                          <Select value={year} onValueChange={setYear}>
                            <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Year" /></SelectTrigger>
                            <SelectContent>
                              {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <span className={labelClass}>College email</span>
                        <input type="email" value={studentEmail} onChange={e => setStudentEmail(e.target.value)} placeholder="you@universityofgalway.ie" inputMode="email" autoCapitalize="off" autoCorrect="off" required className={inputClass} />
                        <p className="text-[11px] text-muted-foreground mt-1.5">We email a code to confirm you're a student — please use your official college address.</p>
                      </div>

                      <div>
                        <span className={labelClass}>Short intro <span className="normal-case font-normal">(optional)</span></span>
                        <input type="text" value={bio} onChange={e => setBio(e.target.value)} placeholder="e.g. Love being outdoors, happy to help" maxLength={80} className={inputClass} />
                        <p className="text-[11px] text-muted-foreground mt-1.5">Shows on your public helper card.</p>
                      </div>
                    </>
                  )}

                  {/* ── Step 3 — Your work ── */}
                  {step === 2 && (
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
                        <span className={labelClass}>Areas you'll cover <span className="normal-case font-normal">(optional)</span></span>
                        <input type="text" value={areas} onChange={e => setAreas(e.target.value)} placeholder="e.g. Salthill, Knocknacarra, Renmore" className={inputClass} />
                        <p className="text-[11px] text-muted-foreground mt-1.5">Helps us send you jobs close to home.</p>
                      </div>

                      <div>
                        <span className={labelClass}>How will you get to jobs?</span>
                        <div className="grid grid-cols-3 gap-2">
                          {TRANSPORT.map(({ id, emoji, label }) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setTransport(transport === id ? '' : id)}
                              aria-pressed={transport === id}
                              className={cn(
                                'flex flex-col items-center gap-1 rounded-xl px-2 py-3 border text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]',
                                transport === id ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/60 border-border/50 text-foreground hover:bg-secondary',
                              )}
                            >
                              <span className="text-lg leading-none">{emoji}</span>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className={labelClass}>What jobs do you want to do?</span>
                        <p className="text-xs text-muted-foreground mb-3 -mt-1.5">Pick everything you're happy to take on.</p>
                        <div className="grid grid-cols-2 gap-2">
                          {CATEGORY_OPTIONS.map(({ emoji, label, slug }) => {
                            const active = categories.includes(slug);
                            return (
                              <button
                                key={slug}
                                type="button"
                                onClick={() => toggleIn(categories, setCategories, slug)}
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
                      </div>

                      <div>
                        <span className={labelClass}>When are you free? <span className="normal-case font-normal">(optional)</span></span>
                        <div className="grid grid-cols-3 gap-2">
                          {AVAILABILITY_SLOTS.map(({ id, label }) => {
                            const active = availability.includes(id);
                            return (
                              <button key={id} type="button" onClick={() => toggleIn(availability, setAvailability, id)} aria-pressed={active}
                                className={cn('rounded-xl px-2 py-2 text-[11px] font-medium border text-center leading-tight transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96]', active ? 'bg-sage text-white border-sage' : 'bg-secondary/60 border-border/50 text-foreground hover:bg-secondary')}>
                                {label}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-2">You can fine-tune this anytime in your dashboard.</p>
                      </div>
                    </>
                  )}

                  {/* ── Step 4 — Verify & agree ── */}
                  {step === 3 && (
                    <>
                      <div className="rounded-2xl border border-sage/30 bg-sage-light p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <BadgeCheck className="w-5 h-5 text-sage flex-shrink-0" />
                          <p className="text-sm font-bold text-foreground">One quick check after you apply</p>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          To keep customers safe, every helper verifies their ID — a 2-minute photo of your ID plus a selfie, secured by Stripe. We'll text you a link. Customers only ever see verified helpers, which is why they trust us.
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        <Consent checked={rightToWork} onChange={setRightToWork}>
                          I'm 18+ and have the right to work in Ireland.
                        </Consent>
                        <Consent checked={consentVerify} onChange={setConsentVerify}>
                          I agree to verify my identity and to a background check.
                        </Consent>
                        <Consent checked={agreeTerms} onChange={setAgreeTerms}>
                          I agree to VANO's <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-sage-dark underline underline-offset-2">terms</a> and helper code of conduct.
                        </Consent>
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
                    disabled={(step === 0 && !step1Valid) || (step === 1 && !step2Valid) || (step === 2 && !step3Valid)}
                    className="flex-1 rounded-full font-semibold gap-1.5 hover:-translate-y-px hover:shadow-primary-glow transition-[transform,box-shadow] duration-150"
                  >
                    Continue<ArrowRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={submitting || !step4Valid}
                    className="flex-1 rounded-full font-semibold gap-2 hover:-translate-y-px hover:shadow-primary-glow transition-[transform,box-shadow] duration-150"
                  >
                    {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting…</> : 'Submit application →'}
                  </Button>
                )}
              </div>

              <p className="text-center text-xs text-muted-foreground">
                We'll WhatsApp you within 24 hours.{' '}
                <a href={`${teamWhatsAppHref}?text=${encodeURIComponent("Hi VANO, I'm a student and I'd like to start doing household jobs.")}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
                  Prefer to text us?
                </a>
              </p>
            </form>
          )}
        </section>

        {/* Job types */}
        <section className="px-4 py-12 max-w-lg mx-auto">
          <p className="eyebrow mb-3">What you'll do</p>
          <h2 className="text-2xl font-semibold text-foreground mb-6">Jobs available right now</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {JOBS.map(({ emoji, label }) => (
              <div key={label} className="bg-secondary/60 rounded-2xl p-4 flex items-center gap-3">
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
              { n: '1', title: 'Apply & get verified', body: 'Your details, a photo, your student email and a quick ID check. About 3 minutes.' },
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
