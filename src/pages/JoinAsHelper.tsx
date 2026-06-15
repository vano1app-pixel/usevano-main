import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Camera, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { teamWhatsAppHref } from '@/lib/contact';
import { SUPPORTED_CITIES } from '@/lib/cities';


const CATEGORY_OPTIONS = [
  { emoji: '🛒', label: 'Shopping & errands',   slug: 'shopping'           },
  { emoji: '🐕', label: 'Dog walking',           slug: 'dog-walk'           },
  { emoji: '🌿', label: 'Garden work',           slug: 'garden'             },
  { emoji: '📦', label: 'Moving help',           slug: 'moving'             },
  { emoji: '🧹', label: 'Cleaning',              slug: 'cleaning'           },
  { emoji: '📚', label: 'Tutoring',              slug: 'tutoring'           },
  { emoji: '🔨', label: 'Handyman',              slug: 'handyman'           },
  { emoji: '🔧', label: 'Plumbing help',         slug: 'plumbing'           },
  { emoji: '🪑', label: 'Furniture assembly',    slug: 'furniture-assembly' },
  { emoji: '💻', label: 'Tech help',             slug: 'tech-help'          },
  { emoji: '📦', label: 'Wait for delivery',     slug: 'wait-delivery'      },
];

const STATS = [
  { value: '€12–€25', label: 'per job' },
  { value: 'Flexible', label: 'your schedule' },
  { value: 'Same day', label: 'pay by Revolut' },
];

const REQUIREMENTS = [
  'Third-level student (any course)',
  'Based in a supported city',
  'Friendly and trustworthy',
];

const TUTOR_SUBJECTS = [
  'Maths', 'English', 'Irish', 'Science', 'Biology', 'Chemistry', 'Physics',
  'History', 'Geography', 'French', 'Spanish', 'Engineering', 'Business', 'Accounting',
];

const TUTOR_LEVELS = ['Primary', 'Junior Cert', 'Leaving Cert', 'Third Level'];

const JOBS = [
  { emoji: '🛒', label: 'Laundrys' },
  { emoji: '🐕', label: 'Dog walks' },
  { emoji: '🌿', label: 'Garden work' },
  { emoji: '📦', label: 'Moving help' },
  { emoji: '🧹', label: 'Cleaning' },
  { emoji: '📚', label: 'Tutoring' },
];

export const JoinAsHelper: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const welcomeBack = params.get('welcome') === '1';
  const welcomeName = params.get('name') ?? '';

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [tutorSubjects, setTutorSubjects] = useState<string[]>([]);
  const [tutorLevels, setTutorLevels] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function toggleCategory(slug: string) {
    setCategories(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError('Photo must be under 8 MB.');
      return;
    }
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !phone.trim() || !city || !photo || !age.trim()) return;
    const ageNum = parseInt(age.trim(), 10);
    if (isNaN(ageNum) || ageNum < 18) {
      setError('You must be 18 or older to join VANO.');
      return;
    }
    if (categories.length === 0) {
      setError('Please select at least one job type.');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('age', age.trim());
      if (bio.trim()) fd.append('bio', bio.trim());
      fd.append('email', email.trim().toLowerCase());
      fd.append('phone', phone.trim());
      fd.append('city', city);
      fd.append('categories', JSON.stringify(categories));
      fd.append('tutor_subjects', JSON.stringify(tutorSubjects));
      fd.append('tutor_levels', JSON.stringify(tutorLevels));
      fd.append('photo', photo);

      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

      const res = await fetch(`${supabaseUrl}/functions/v1/create-helper-application`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token ?? anonKey}`,
          apikey: anonKey,
        },
        body: fd,
      });

      const json = await res.json() as { success?: boolean; error?: string; checkout_url?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Unknown error');

      // Legacy: a checkout_url means an older paid flow — still honour it.
      if (json.checkout_url) {
        window.location.href = json.checkout_url;
        return;
      }

      // Joining is free — no payment. Show the welcome state.
      window.location.href = `/join?welcome=1&name=${encodeURIComponent(name)}`;
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // The signup function returns specific, user-friendly messages for
      // duplicate applications — show them as-is.
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('whatsapp')) {
        setError(msg);
      } else {
        setError('Something went wrong — please try again or text us on WhatsApp.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SEOHead
        title="Earn money as a student helper in Ireland — VANO"
        description="Pick up same-day home help jobs near you. Earn €12–€65 per job — grocery runs, dog walks, cleaning, gardening, tutoring & more. Flexible hours, paid same day. Apply in 2 minutes."
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
              <p className="eyebrow mb-4">For students across Ireland</p>
              <h1 className="display-xl text-foreground mb-4">
                Earn money between lectures
              </h1>
              <p className="text-muted-foreground text-lg leading-relaxed mb-8 max-w-sm mx-auto">
                Pick up flexible household jobs in your city. Laundrys, dog walks, cleaning, garden work — you choose what you take on.
              </p>

              {/* Stat chips */}
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

        {/* Application form */}
        <section className="px-4 pb-16 max-w-sm mx-auto">
          {welcomeBack ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
              className="bg-sage-light rounded-2xl p-8 text-center"
            >
              <CheckCircle className="w-12 h-12 text-sage mx-auto mb-4" />
              <h2 className="font-bold text-foreground text-xl mb-2">
                You're in{welcomeName ? `, ${welcomeName.split(' ')[0]}` : ''}! 🎉
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-2">
                Joining VANO is completely free — there's nothing to pay. We're reviewing your application and you're now part of the helper team.
              </p>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                We'll text you when a job near you comes in. Keep an eye on your phone.
              </p>
              <p className="text-xs text-muted-foreground">
                Questions? WhatsApp us at{' '}
                <a href="https://wa.me/353899817111" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  +353 89 981 7111
                </a>
              </p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="mb-2">
                <h2 className="text-xl font-semibold text-foreground mb-1">Apply in 60 seconds</h2>
                <p className="text-muted-foreground text-sm">Creates your worker account — you'll log in here to accept jobs.</p>
              </div>

              {/* Photo */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Your face photo
                </p>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className={cn(
                      'relative w-20 h-20 rounded-full border-2 border-dashed flex-shrink-0',
                      'flex items-center justify-center overflow-hidden transition-colors duration-150',
                      preview
                        ? 'border-transparent'
                        : 'border-border hover:border-primary/50 bg-secondary/50',
                    )}
                    aria-label="Upload face photo"
                  >
                    {preview ? (
                      <img src={preview} alt="Your photo" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-6 h-6 text-muted-foreground" />
                    )}
                  </button>
                  <div>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {preview ? 'Change photo' : 'Add a clear face photo'}
                    </button>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Helps customers feel at ease
                    </p>
                  </div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhoto}
                  className="sr-only"
                  aria-label="Face photo upload"
                />
              </div>

              {/* Name */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                  Your name
                </p>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="First and last name"
                  required
                  className={cn(
                    'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm',
                    'placeholder:text-muted-foreground/50',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                    'transition-[border-color,box-shadow] duration-150',
                  )}
                />
              </div>

              {/* Age */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                  Your age <span className="normal-case font-normal text-muted-foreground">(must be 18+)</span>
                </p>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g. 20"
                  min={18} max={35}
                  required
                  className={cn(
                    'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm',
                    'placeholder:text-muted-foreground/50',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                    'transition-[border-color,box-shadow] duration-150',
                  )}
                />
              </div>

              {/* Bio */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                  What are you studying / doing? <span className="normal-case font-normal">(optional)</span>
                </p>
                <input
                  type="text"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="e.g. 2nd year Engineering at UCD"
                  maxLength={80}
                  className={cn(
                    'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm',
                    'placeholder:text-muted-foreground/50',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                    'transition-[border-color,box-shadow] duration-150',
                  )}
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">Shows on your public helper card</p>
              </div>

              {/* Email */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                  Email
                </p>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className={cn(
                    'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm',
                    'placeholder:text-muted-foreground/50',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                    'transition-[border-color,box-shadow] duration-150',
                  )}
                />
              </div>

              {/* Phone */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                  Phone number
                </p>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08x xxx xxxx"
                  required
                  className={cn(
                    'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm',
                    'placeholder:text-muted-foreground/50',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                    'transition-[border-color,box-shadow] duration-150',
                  )}
                />
              </div>

              {/* City */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                  Your city
                </p>
                <Select value={city} onValueChange={setCity}>
                  <SelectTrigger className="rounded-xl h-11">
                    <SelectValue placeholder="Select your city" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CITIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Job categories */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                  What jobs do you want to do?
                </p>
                <p className="text-xs text-muted-foreground mb-3">Pick everything you're happy to take on.</p>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORY_OPTIONS.map(({ emoji, label, slug }) => {
                    const active = categories.includes(slug);
                    return (
                      <button
                        key={slug}
                        type="button"
                        onClick={() => toggleCategory(slug)}
                        aria-pressed={active}
                        className={cn(
                          'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left border text-sm font-medium',
                          'transition-[background-color,border-color,color] duration-150',
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-secondary/60 border-border/50 text-foreground hover:bg-secondary hover:border-border',
                        )}
                      >
                        <span className="text-base leading-none select-none">{emoji}</span>
                        <span className="leading-tight">{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Tutoring sub-fields */}
                {categories.includes('tutoring') && (
                  <div className="mt-4 space-y-4 bg-background/60 rounded-xl border border-border/50 p-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                        Subjects
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {TUTOR_SUBJECTS.map(subject => {
                          const active = tutorSubjects.includes(subject);
                          return (
                            <button
                              key={subject}
                              type="button"
                              onClick={() => setTutorSubjects(prev =>
                                prev.includes(subject) ? prev.filter(s => s !== subject) : [...prev, subject]
                              )}
                              aria-pressed={active}
                              className={cn(
                                'px-3 py-1 rounded-full text-xs font-medium border transition-[background-color,border-color,color] duration-150',
                                active
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background border-border/60 text-foreground hover:border-primary/40',
                              )}
                            >
                              {subject}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                        Levels
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {TUTOR_LEVELS.map(level => {
                          const active = tutorLevels.includes(level);
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() => setTutorLevels(prev =>
                                prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
                              )}
                              aria-pressed={active}
                              className={cn(
                                'px-3 py-1 rounded-full text-xs font-medium border transition-[background-color,border-color,color] duration-150',
                                active
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background border-border/60 text-foreground hover:border-primary/40',
                              )}
                            >
                              {level}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                disabled={submitting || !name.trim() || !age.trim() || parseInt(age.trim(), 10) < 18 || !email.trim() || !phone.trim() || !city || !photo || categories.length === 0}
                className="w-full rounded-full font-semibold gap-2 hover:-translate-y-px hover:shadow-primary-glow transition-[transform,box-shadow] duration-150"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Setting up…</>
                ) : (
                  'Apply now →'
                )}
              </Button>

              {error && (
                <p className="text-center text-xs text-destructive">{error}</p>
              )}

              <p className="text-center text-xs text-muted-foreground">
                We'll WhatsApp you within 24 hours.{' '}
                <a
                  href={`${teamWhatsAppHref}?text=${encodeURIComponent("Hi VANO, I'm an ATU student and I'd like to start doing household jobs.")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                >
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
              <div
                key={label}
                className="bg-secondary/60 rounded-2xl p-4 flex items-center gap-3"
              >
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

        {/* How it works */}
        <section className="px-4 py-12 max-w-lg mx-auto">
          <p className="eyebrow mb-3">How it works</p>
          <h2 className="text-2xl font-semibold text-foreground mb-6">Three steps to your first job</h2>
          <ol className="space-y-5">
            {[
              { n: '1', title: 'Apply above', body: 'Fill in your name, number, and a face photo. Takes 30 seconds.' },
              { n: '2', title: 'Get matched to jobs', body: "When a job near you comes in, we'll text you first. Accept or pass — totally your call." },
              { n: '3', title: 'Do the job, get paid', body: 'Show up, do great work, get paid by Revolut the same day. Easy.' },
            ].map(({ n, title, body }) => (
              <li key={n} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-sage text-white font-bold text-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                  {n}
                </div>
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
