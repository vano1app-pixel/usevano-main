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

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

const CATEGORY_OPTIONS = [
  { emoji: '🛒', label: 'Shopping & errands',    slug: 'shopping'           },
  { emoji: '🐕', label: 'Dog walking',            slug: 'dog-walk'           },
  { emoji: '🌿', label: 'Garden work',            slug: 'garden'             },
  { emoji: '📦', label: 'Moving help',            slug: 'moving'             },
  { emoji: '🧹', label: 'Cleaning',               slug: 'cleaning'           },
  { emoji: '📚', label: 'Tutoring',               slug: 'tutoring'           },
  { emoji: '📬', label: 'Post office runs',       slug: 'post-office'        },
  { emoji: '🔧', label: 'Furniture assembly',     slug: 'furniture-assembly' },
  { emoji: '📱', label: 'Tech help',              slug: 'tech-help'          },
  { emoji: '🚪', label: 'Wait for deliveries',    slug: 'wait-delivery'      },
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
  { emoji: '🛒', label: 'Shopping runs' },
  { emoji: '🐕', label: 'Dog walks' },
  { emoji: '🌿', label: 'Garden work' },
  { emoji: '📦', label: 'Moving help' },
  { emoji: '🧹', label: 'Cleaning' },
  { emoji: '✨', label: 'Errands & more' },
];

export const JoinAsHelper: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [password, setPassword] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [tutorSubjects, setTutorSubjects] = useState<string[]>([]);
  const [tutorLevels, setTutorLevels] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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
    if (!name.trim() || !email.trim() || !phone.trim() || !city || !photo || !password) return;
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (categories.length === 0) {
      setError('Please select at least one job type.');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      // 1. Create auth account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { display_name: name.trim() } },
      });
      if (authError) throw authError;
      // identities === [] means the email is already registered (Supabase silent repeated-signup)
      if ((authData.user?.identities?.length ?? 1) === 0) {
        throw new Error('User already registered');
      }
      const userId = authData.user?.id;
      if (!userId) throw new Error('Account creation failed — please try again.');

      // 2. Upload photo
      const ext = photo.name.split('.').pop() ?? 'jpg';
      const path = `${userId}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('helper-photos')
        .upload(path, photo, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('helper-photos')
        .getPublicUrl(path);

      // 3. Insert helper row linked to the new auth account
      const { error: insertError } = await db
        .from('household_helpers')
        .insert({
          user_id: userId,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          city,
          photo_url: publicUrl,
          categories,
          ...(categories.includes('tutoring') && (tutorSubjects.length > 0 || tutorLevels.length > 0)
            ? { tutor_subjects: tutorSubjects, tutor_levels: tutorLevels }
            : {}),
        });
      if (insertError) throw insertError;

      // Notify admin via WhatsApp — fire and forget
      supabase.functions.invoke('notify-admin-whatsapp', {
        body: {
          type: 'new_student',
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          city,
          categories,
          tutor_subjects: tutorSubjects,
          tutor_levels: tutorLevels,
          photo_url: publicUrl,
        },
      }).catch(() => {/* non-critical */});

      setSubmitted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already registered') || msg.includes('User already registered')) {
        setError('That email is already registered. Try logging in, or use a different email.');
      } else {
        setError("Something went wrong — please try again or text us on WhatsApp.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SEOHead
        title="Earn money as a student helper — VANO"
        description="Students across Ireland earn €12–€25 per job helping households. Flexible hours, paid same day by Revolut."
      />
      <HouseholdNav />

      <main className="-mt-14 lg:-mt-16">
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
                Pick up flexible household jobs in your city. Shopping runs, dog walks, cleaning, garden work — you choose what you take on.
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
          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
              className="bg-sage-light rounded-2xl p-8 text-center"
            >
              <CheckCircle className="w-12 h-12 text-sage mx-auto mb-4" />
              <h2 className="font-bold text-foreground text-xl mb-2">Almost done!</h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                One last step — tap the button below to send us your details on WhatsApp so we can add you to the team group.
              </p>
              <a
                href={`https://wa.me/353899817111?text=${encodeURIComponent(
                  `Hi VANO! 👋 I just signed up as a helper.\n\nName: ${name}\nPhone: ${phone}\nCity: ${city}\nJobs: ${categories.join(', ')}${tutorSubjects.length ? `\nSubjects: ${tutorSubjects.join(', ')}` : ''}${tutorLevels.length ? `\nLevels: ${tutorLevels.join(', ')}` : ''}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-[#25D366] text-white font-bold rounded-full py-4 text-base shadow-md active:scale-[0.97] transition-transform"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current flex-shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Send us a WhatsApp
              </a>
              <p className="text-muted-foreground text-xs mt-4">
                We'll review and add you to the group within 24 hours.
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

              {/* Password */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                  Create a password
                </p>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className={cn(
                    'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm',
                    'placeholder:text-muted-foreground/50',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                    'transition-[border-color,box-shadow] duration-150',
                  )}
                />
                <p className="text-xs text-muted-foreground mt-1.5">You'll use this to log in to your worker dashboard.</p>
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
                disabled={submitting || !name.trim() || !email.trim() || !phone.trim() || !city || !photo || !password || categories.length === 0}
                className="w-full rounded-full font-semibold gap-2 hover:-translate-y-px hover:shadow-primary-glow transition-[transform,box-shadow] duration-150"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  'Apply now'
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
