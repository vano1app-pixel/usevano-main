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
import { SKILL_GROUPS, defaultSelectedGroups, toggleGroup, toggleSub } from '@/lib/helperSkills';
import { haptic } from '@/lib/haptics';
import { prepareJoinPhoto } from '@/lib/safeImage';
import { assessPhotoQuality } from '@/lib/photoQuality';
import { getVisitorId } from '@/lib/visitorId';

// The jobs customers actually book, shared with the account page via
// helperSkills (groups gate dispatch matching; sub-skills are profile
// detail). 'other' is a legacy slug existing helpers hold — hidden here.
const CATEGORY_OPTIONS = SKILL_GROUPS.filter(g => g.id !== 'other');

const STATS = [
  { value: '€15–€65', label: 'per job' },
  { value: 'Flexible', label: 'your hours' },
  // Hourly anchor — the clearest student value prop. Direct-pay: customers
  // pay helpers the full job price (€18/hr on hourly jobs), Vano's fee is
  // charged to the customer — so 100% is honest, not marketing.
  { value: '€18/hr', label: 'you keep 100%' },
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

// How a helper gets around — the highest-value dispatch signal we weren't
// capturing. Car access is the money one (moving, tip runs, grocery runs, a
// wider radius); the rest colour how far we can reasonably send them.
const TRANSPORT_MODES = [
  { id: 'car',    emoji: '🚗', label: 'Car' },
  { id: 'bike',   emoji: '🚲', label: 'Bike' },
  { id: 'public', emoji: '🚌', label: 'Public transport' },
  { id: 'foot',   emoji: '🚶', label: 'On foot' },
];

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

// Referral-open codes already tracked in THIS page session — a synchronous
// guard so a dev/StrictMode double-mount can't fire the tracker twice (the
// localStorage guard covers across-visit repeats, the server dedupes per
// device regardless).
const openTrackedCodes = new Set<string>();
const PHONE_RE = /^\+?[\d\s\-().]{7,15}$/;

// Personal-provider domains that can never verify as a college address. A
// SOFT warning only (never a block): the email OTP is the real enforcement,
// and hard-blocking would need a college-domain database we'd get wrong.
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.ie', 'yahoo.co.uk',
  'hotmail.com', 'hotmail.ie', 'hotmail.co.uk', 'outlook.com', 'outlook.ie',
  'live.com', 'live.ie', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com',
  'aol.com', 'msn.com',
]);
const isPersonalEmail = (v: string) =>
  PERSONAL_EMAIL_DOMAINS.has(v.trim().toLowerCase().split('@')[1] ?? '');

// ── Draft persistence ────────────────────────────────────────────────────────
// Mobile signups get interrupted constantly (app-switch to find a photo, a
// message, a reload) — losing the half-filled form was the biggest smoothness
// hole. Every field autosaves to localStorage and restores on return, photo
// included (the cropped JPEG is small enough to stash as a data URL). Cleared
// on successful submit; drafts older than 7 days are ignored.
const DRAFT_KEY = 'vano_join_draft_v1';
const DRAFT_PHOTO_KEY = 'vano_join_photo_v1';
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface JoinDraft {
  savedAt: number; step: number;
  name: string; dob: string; college: string; finishYear: string; email: string; phone: string;
  city: string; area: string; transport: string[]; categories: string[];
  tutorSubjects: string[]; tutorLevels: string[]; referralCode: string;
}

function readJoinDraft(): JoinDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as JoinDraft;
    if (!d || typeof d.savedAt !== 'number' || Date.now() - d.savedAt > DRAFT_TTL_MS) return null;
    const arr = (v: unknown) => Array.isArray(v) ? (v as string[]).filter(x => typeof x === 'string') : [];
    return {
      savedAt: d.savedAt,
      step: typeof d.step === 'number' ? Math.min(Math.max(d.step, 0), STEPS.length - 1) : 0,
      name: typeof d.name === 'string' ? d.name : '',
      dob: typeof d.dob === 'string' ? d.dob : '',
      college: typeof d.college === 'string' ? d.college : '',
      finishYear: typeof d.finishYear === 'string' ? d.finishYear : '',
      email: typeof d.email === 'string' ? d.email : '',
      phone: typeof d.phone === 'string' ? d.phone : '',
      city: typeof d.city === 'string' ? d.city : '',
      area: typeof d.area === 'string' ? d.area : '',
      transport: arr(d.transport),
      categories: arr(d.categories),
      tutorSubjects: arr(d.tutorSubjects),
      tutorLevels: arr(d.tutorLevels),
      referralCode: typeof d.referralCode === 'string' ? d.referralCode : '',
    };
  } catch { return null; }
}

function readDraftPhoto(): string | null {
  try {
    const v = localStorage.getItem(DRAFT_PHOTO_KEY);
    return v && v.startsWith('data:image/') ? v : null;
  } catch { return null; }
}

function clearJoinDraft() {
  try { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(DRAFT_PHOTO_KEY); } catch { /* best effort */ }
}

/** Whole years between a YYYY-MM-DD date of birth and today, or null if unparseable. */
function ageFromDob(dob: string): number | null {
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/** `<input type="date">` bounds so the picker itself steers to a plausible 18–100. */
function dobBounds(): { min: string; max: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    max: fmt(new Date(now.getFullYear() - 18,  now.getMonth(), now.getDate())),
    min: fmt(new Date(now.getFullYear() - 100, now.getMonth(), now.getDate())),
  };
}
// Computed once per load — a bound that's a few hours stale never lets an
// under-18 through (validateStep re-checks the exact age on submit anyway).
const DOB_BOUNDS = dobBounds();

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
  // Saved draft from an interrupted signup, read once. `resumed` shows the
  // "picked up where you left off" note.
  const [draft] = useState<JoinDraft | null>(() => readJoinDraft());
  const [draftPhoto] = useState<string | null>(() => readDraftPhoto());
  const resumed = draft !== null;

  // Wizard — resume at the saved step only when the photo survived too
  // (validateStep(0) needs it, and submit uploads it).
  const [step, setStep] = useState(() => (draft && draftPhoto ? draft.step : 0));

  // Step 1 — you
  const [name, setName] = useState(draft?.name ?? '');
  const [dob, setDob] = useState(draft?.dob ?? ''); // YYYY-MM-DD — proves 18+ and fills the profile age badge
  const [college, setCollege] = useState(draft?.college ?? '');
  // Expected final year of study — VANO is student-only, so this is how the
  // graduation sweep knows when to check in (it never cuts anyone off silently).
  const [finishYear, setFinishYear] = useState(draft?.finishYear ?? '');
  const [email, setEmail] = useState(draft?.email ?? ''); // college email — also the verification address
  const [phone, setPhone] = useState(draft?.phone ?? '');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(draftPhoto);
  // Soft quality note — the photo IS set; this just nudges toward a better one.
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  // (The move-and-scale cropper was removed from this form on 2026-07-16 —
  // its full-screen overlay black-screened iPhone Safari mid-signup. Photos
  // are direct-set on pick; the account page still offers cropping later.)

  // Rebuild the File from the stashed data URL so a restored draft can submit
  // without re-picking the photo.
  useEffect(() => {
    if (!draftPhoto) return;
    let alive = true;
    fetch(draftPhoto)
      .then(r => r.blob())
      .then(b => { if (alive) setPhoto(new File([b], 'photo.jpg', { type: b.type || 'image/jpeg' })); })
      .catch(() => { /* they can re-pick — preview still shows */ });
    return () => { alive = false; };
  }, [draftPhoto]);

  // Step 2 — work. The picker is opt-OUT: the no-skill-needed groups start
  // ticked (students untick far more readily than they tick, so an empty
  // grid under-fills supply in the commodity categories); gear/skill-gated
  // groups stay opt-in. See defaultOn in helperSkills.
  const [city, setCity] = useState(draft?.city ?? '');
  const [area, setArea] = useState(draft?.area ?? '');            // rough neighbourhood/Eircode → areas_served (nearest-job matching)
  const [transport, setTransport] = useState<string[]>(draft?.transport ?? []); // how they get around → dispatch reach (car = moving/tip runs)
  const [categories, setCategories] = useState<string[]>(() =>
    // An EMPTY categories array in a draft is a real saved choice (the user
    // unticked all five pre-ticked defaults, intending to pick only, say,
    // tutoring, then got interrupted). The old `.length > 0` check silently
    // re-ticked the defaults under the "welcome back" note — so they could
    // submit and get dispatched jobs they explicitly declined. Only fall back
    // to defaults when there is NO draft at all.
    draft ? draft.categories : defaultSelectedGroups());
  // Sub-skill panels only open for groups the student TAPPED — if the five
  // pre-ticked defaults all expanded their optional chips, step 2 would lose
  // its 30-second feel. (Sub detail is optional garnish; the dashboard's
  // "Finish your profile" nudge collects it later anyway.)
  const [touchedGroups, setTouchedGroups] = useState<ReadonlySet<string>>(new Set());
  const [tutorSubjects, setTutorSubjects] = useState<string[]>(draft?.tutorSubjects ?? []);
  const [tutorLevels, setTutorLevels] = useState<string[]>(draft?.tutorLevels ?? []);

  // Step 3 — one consent, one tap. It bundles 18+/right-to-work/ID-check
  // consent AND the terms (they were two boxes; both were required anyway, so
  // the split only cost a tap). Never restored from a draft — consent is the
  // one thing they must actively give this session.
  const [agreeAll, setAgreeAll] = useState(false);

  // Optional partner / referral code — prefilled from a ?ref=CODE link (e.g. a
  // student union's recruitment link) and editable by hand. URL wins over a
  // saved draft (a fresh partner link should always take effect).
  const [referralCode, setReferralCode] = useState(() => {
    try {
      const fromUrl = (new URLSearchParams(window.location.search).get('ref') ?? '').trim().toUpperCase();
      return fromUrl || draft?.referralCode || '';
    } catch { return draft?.referralCode ?? ''; }
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Count this OPEN of a partner's link (top of the referral funnel), once per
  // device per code. Fires on page load whenever a ?ref is present — even if
  // they never finish signing up, the partner should see they got a click.
  // Best-effort: the localStorage guard stops refresh spam across visits, the
  // module-level set stops a StrictMode/dev double-mount firing twice in one
  // session, the server dedupes per device regardless, and any failure is
  // swallowed (a signup never depends on it).
  useEffect(() => {
    let code = '';
    try { code = (new URLSearchParams(window.location.search).get('ref') ?? '').trim().toUpperCase(); } catch { code = ''; }
    if (!/^[A-Z0-9]{4,12}$/.test(code)) return;
    if (openTrackedCodes.has(code)) return;
    const firedKey = `vano_ref_open_${code}`;
    try { if (localStorage.getItem(firedKey)) return; } catch { /* ignore */ }
    openTrackedCodes.add(code); // synchronous guard — before the async fire
    void supabase.functions
      .invoke('track-referral-open', { body: { code, visitor_key: getVisitorId() } })
      .then(() => { try { localStorage.setItem(firedKey, '1'); } catch { /* ignore */ } })
      .catch(() => { /* tracking is non-critical */ });
  }, []);

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

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked after a cancel
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { setError('Photo must be under 15 MB.'); return; }
    setError(null);
    // Quality gate (fail-soft — null means "couldn't measure", proceed):
    // positively-junk photos (microscopic / blank frame) are refused with the
    // picker left open; poor-but-usable shots are ACCEPTED with a gentle note.
    // A quality check must never cost a signup, so only 'reject' stops the set.
    const quality = await assessPhotoQuality(file).catch(() => null);
    if (quality?.verdict === 'reject') {
      setPhotoNote(null);
      setError(quality.message);
      return;
    }
    setPhotoNote(quality?.verdict === 'warn' ? quality.message : null);
    // DIRECT-SET, the pre-#324 flow every early signup used: the picked photo
    // IS the photo, immediately — no full-screen cropper on this form (the
    // cropper overlay black-screened iPhone 16 Safari mid-signup; it now
    // lives only on the account page). prepareJoinPhoto shrinks big shots
    // off-DOM as an invisible optimisation; if it can't, the ORIGINAL file
    // uploads exactly like the old code — a photo pick can never dead-end.
    const prepared = await prepareJoinPhoto(file).catch(() => null);
    setPhoto(prepared?.file ?? file);
    setPreview(prepared?.previewUrl ?? URL.createObjectURL(file));
    haptic(8);
    try {
      if (prepared?.stashDataUrl) {
        localStorage.setItem(DRAFT_PHOTO_KEY, prepared.stashDataUrl);
      } else {
        // No stash copy — drop any OLD stashed photo so a resumed draft can't
        // silently show a different photo than the one being submitted.
        localStorage.removeItem(DRAFT_PHOTO_KEY);
      }
    } catch { /* quota — best effort */ }
  }

  // Autosave the draft whenever anything meaningful changes. Gated on an
  // identity field so an untouched visit never writes (and never triggers the
  // "picked up where you left off" note on the next one).
  useEffect(() => {
    if (submitting) return;
    if (!name && !dob && !email && !phone && !college && !city && !area) return;
    try {
      const d: JoinDraft = {
        savedAt: Date.now(), step,
        name, dob, college, finishYear, email, phone, city, area,
        transport, categories, tutorSubjects, tutorLevels, referralCode,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch { /* quota/private mode — signup still works, just no resume */ }
  }, [submitting, step, name, dob, college, finishYear, email, phone, city, area, transport, categories, tutorSubjects, tutorLevels, referralCode]);

  // Per-step validity is enforced in goNext() (validateStep), which surfaces the
  // specific missing field — so the Continue button stays tappable instead of
  // sitting greyed-out with no explanation.
  const step3Valid = agreeAll;

  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!photo) return 'Please add a clear face photo.';
      if (!name.trim()) return 'Please enter your name.';
      if (!dob) return 'Please enter your date of birth.';
      {
        const yrs = ageFromDob(dob);
        if (yrs === null) return 'Please enter a valid date of birth.';
        if (yrs < 18) return 'You must be 18 or over to work through VANO.';
        if (yrs > 100) return 'Please check your date of birth.';
      }
      if (!college) return 'Please choose where you study.';
      if (!finishYear) return 'When do you expect to finish college? A best guess is fine.';
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
    if (!step3Valid) { setError('Please tick the box to continue.'); return; }
    // The photo can be null when resuming a draft to step 2/3 if the async
    // data-URL→File rebuild failed or hasn't resolved (goNext only re-validates
    // the current step, so step 0's photo check never re-runs). Submitting then
    // appends "null" to FormData, which passes the server's `if (!photo)` and
    // crashes on photo.name → an unbreakable 500 loop. Catch it here and send
    // them back to re-pick.
    if (!(photo instanceof File)) {
      setError('Please add a clear photo of yourself — it looks like it didn\'t save.');
      setStep(0);
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
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
      fd.append('dob', dob);
      fd.append('city', city);
      // Rough area → areas_served (nearest-job matching); mobility → dispatch reach.
      fd.append('areas', JSON.stringify(area.trim() ? [area.trim()] : []));
      fd.append('transport', transport.join(','));
      fd.append('categories', JSON.stringify(categories));
      fd.append('tutor_subjects', JSON.stringify(tutorSubjects));
      fd.append('tutor_levels', JSON.stringify(tutorLevels));
      fd.append('college', college);
      fd.append('finish_year', finishYear);
      fd.append('right_to_work', String(agreeAll));
      fd.append('consent_verify', String(agreeAll));
      fd.append('agree_terms', String(agreeAll));
      // Partner/referral code rides IN the application payload so the server
      // stores it (and the DB trigger credits the partner) atomically with the
      // signup — the separate attach call below is only a backstop.
      const partnerCode = referralCode.trim().toUpperCase();
      if (/^[A-Z0-9]{4,12}$/.test(partnerCode)) fd.append('referred_by_code', partnerCode);
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

      // Backstop attach of the partner/referral code (the payload above already
      // carried it — this only matters against an older deployed function).
      // AWAITED with a hard cap: the redirect below aborts in-flight requests,
      // so the old fire-and-forget could silently lose the attribution. The cap
      // means a slow network delays the redirect by ≤2s, never blocks it.
      if (/^[A-Z0-9]{4,12}$/.test(partnerCode) && json.helper_id) {
        await Promise.race([
          supabase.functions
            .invoke('attach-referral-code', { body: { helper_id: json.helper_id, code: partnerCode } })
            .catch(() => { /* referral attach is non-critical */ }),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
      }

      // Application saved — the draft has done its job.
      clearJoinDraft();

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
      // Surface the server's ACTUAL reason ("Photo upload failed", "You must be
      // 18 or over…", "Missing required fields"). The old code collapsed
      // everything except "already"/"whatsapp" messages to a generic string, so
      // an applicant hit by a photo-upload hiccup retried forever against a
      // message that never told them what was wrong. Guard against a raw
      // network error leaking an ugly string.
      const raw = err instanceof Error ? err.message : String(err);
      const looksLikeNetwork = /failed to fetch|networkerror|load failed/i.test(raw);
      setError(looksLikeNetwork || !raw
        ? 'Something went wrong — please try again or text us on WhatsApp.'
        : raw);
      setSubmitting(false);
    }
  }

  return (
    <>
      <SEOHead
        title="Earn money as a student helper in Ireland — VANO"
        description="Pick up same-day home help jobs near you. Earn €15–€65 per job and keep 100% — laundry, dog walks, cleaning, gardening, tutoring & more. Flexible hours, paid directly after each job. Apply in minutes."
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
              <p className="text-sm text-muted-foreground mt-2">
                {STEPS[step]}
                {step === 0 && <span className="text-muted-foreground/70"> · takes about a minute</span>}
              </p>
              {resumed && (
                <p className="text-xs text-sage-dark font-medium mt-1.5">
                  Welcome back — we saved where you left off.
                </p>
              )}
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
                          {preview ? (
                            <img
                              src={preview}
                              alt="Your photo"
                              className="w-full h-full object-cover"
                              onError={() => {
                                // Unreadable file (or a dead draft stash) — recover
                                // visibly instead of dead-ending the signup.
                                setPreview(null);
                                setPhoto(null);
                                try { localStorage.removeItem(DRAFT_PHOTO_KEY); } catch { /* noop */ }
                                setError("We couldn't read that photo — please pick a different one.");
                              }}
                            />
                          ) : <Camera className="w-6 h-6 text-muted-foreground" />}
                        </button>
                        <div>
                          <button type="button" onClick={() => fileRef.current?.click()} className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                            {preview ? 'Change photo' : 'Add a clear face photo'}
                          </button>
                          <p className="text-xs text-muted-foreground mt-0.5">Shown to customers · used for your ID check</p>
                        </div>
                      </div>
                      <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="sr-only" aria-label="Face photo upload" />
                      {photoNote && preview && (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
                          {photoNote}
                        </p>
                      )}
                    </div>

                    <div>
                      <span className={labelClass}>Your name</span>
                      <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="First and last name" autoComplete="name" autoCapitalize="words" className={inputClass} />
                    </div>

                    <div>
                      <span className={labelClass}>Date of birth</span>
                      <input
                        type="date"
                        value={dob}
                        onChange={e => setDob(e.target.value)}
                        max={DOB_BOUNDS.max}
                        min={DOB_BOUNDS.min}
                        autoComplete="bday"
                        className={cn(inputClass, !dob && 'text-muted-foreground')}
                        aria-label="Date of birth"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1.5">You must be 18 or over. We show your age — never your birthday — on your profile.</p>
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
                      <span className={labelClass}>When do you finish college?</span>
                      <Select value={finishYear} onValueChange={setFinishYear}>
                        <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Your expected final year" /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() + i)).map(y => (
                            <SelectItem key={y} value={y}>{y}</SelectItem>
                          ))}
                          <SelectItem value="not-sure">Not sure yet</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground mt-1.5">VANO is student-only — around then we'll check in about your plans, never cut you off without asking.</p>
                    </div>

                    <div>
                      <span className={labelClass}>College email</span>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@universityofgalway.ie" autoComplete="email" inputMode="email" autoCapitalize="off" autoCorrect="off" className={inputClass} />
                      {/* Soft catch for gmail/hotmail etc. — a personal address
                          sails through signup but can never pass the student
                          check, so flag it NOW instead of at verification. */}
                      {isPersonalEmail(email) ? (
                        <p className="text-[11px] text-express-orange font-medium mt-1.5">
                          That looks like a personal address — use your college email, it's how we confirm you're a student.
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1.5">We email a code here to confirm you're a student. Use your official college address.</p>
                      )}
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
                      <span className={labelClass}>Your area <span className="font-normal normal-case tracking-normal text-muted-foreground/70">(optional)</span></span>
                      <input
                        type="text"
                        value={area}
                        onChange={e => setArea(e.target.value)}
                        placeholder={city ? `e.g. Salthill or your Eircode` : 'Neighbourhood or Eircode'}
                        autoCapitalize="words"
                        className={inputClass}
                      />
                      <p className="text-[11px] text-muted-foreground mt-1.5">Helps us send you the jobs closest to you first.</p>
                    </div>

                    <div>
                      <span className={labelClass}>What jobs do you want to do?</span>
                      <p className="text-xs text-muted-foreground mb-3 -mt-1.5">We've ticked the jobs most students take — untick any you wouldn't do, and add the rest.</p>
                      <div className="grid grid-cols-2 gap-2">
                        {CATEGORY_OPTIONS.map(({ emoji, label, id }) => {
                          const active = categories.includes(id);
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => {
                                setCategories(prev => toggleGroup(prev, id));
                                setTouchedGroups(prev => new Set(prev).add(id));
                              }}
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
                        {CATEGORY_OPTIONS.filter(g => g.subs.length > 0 && categories.includes(g.id) && touchedGroups.has(g.id)).map(group => (
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
                                💻 Tutoring on Vano is <span className="font-semibold">online and adults-only (18+)</span>. We don't offer school grinds for under-18s.
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
                    </div>

                    <div>
                      <span className={labelClass}>How do you get around?</span>
                      <p className="text-xs text-muted-foreground mb-3 -mt-1.5">A car means we can send you moving jobs and tip runs — pick all that apply.</p>
                      <div className="grid grid-cols-2 gap-2">
                        {TRANSPORT_MODES.map(({ id, emoji, label }) => {
                          const active = transport.includes(id);
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => toggleIn(transport, setTransport, id)}
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
                      <p className="text-[11px] text-muted-foreground mt-3">When you're free — you'll set that in your dashboard after you're in.</p>
                    </div>
                  </>
                )}

                {/* ── Step 3 — Agree ── */}
                {step === 2 && (
                  <>
                    <div className="rounded-2xl border border-sage/30 bg-sage-light p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <BadgeCheck className="w-5 h-5 text-sage flex-shrink-0" />
                        <p className="text-sm font-bold text-foreground">Submit this, verify your ID, and you're earning — free</p>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        One quick step after you submit: a free 2-minute ID check. That's all you need to
                        start getting jobs — every VANO helper verifies before their first job. The ✓ Verified
                        blue tick is a separate, optional €2/month badge; you never pay to get work.
                      </p>
                    </div>

                    {/* One box, one tap — it was two required boxes, and the
                        split only cost a tap. All three consent flags are
                        stored from it. */}
                    <Consent checked={agreeAll} onChange={setAgreeAll}>
                      I'm 18 or over, have the right to work in Ireland, consent to photo-ID + selfie
                      verification, and agree to VANO's{' '}
                      <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-sage-dark underline underline-offset-2">terms</a>{' '}
                      and{' '}
                      <a href="/helper-terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-sage-dark underline underline-offset-2">helper code of conduct</a>.
                    </Consent>

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
              Joining is free — one free 2-minute ID check after you submit and you can take your first job.{' '}
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
            <h2 className="text-2xl font-semibold text-foreground mb-6">What you need to join</h2>
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
              'You keep 100% — customers pay you directly after each job (Revolut or cash), and unpaid jobs get their number blocked.',
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
              { n: '1', title: 'Join free & verify your ID', body: "Your details, a photo, and a free 2-minute ID check — then jobs can reach you. Confirming your college email unlocks the ✓ tick (€2/month, cancel anytime)." },
              { n: '2', title: 'Get matched to jobs', body: "When a job near you comes in, we'll text you first. Accept or pass — totally your call." },
              { n: '3', title: 'Do the job, get paid', body: 'Show up, do great work, and the customer pays you directly — Revolut or cash. You keep 100% of the job price.' },
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
