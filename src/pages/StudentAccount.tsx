import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertTriangle, BadgeCheck, Camera, Check, CheckCircle2, ChevronLeft, ChevronRight,
  ImagePlus, Loader2, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { HouseholdHelperVanoPayCard } from '@/components/HouseholdHelperVanoPayCard';
import { ReferralEntryCard } from '@/components/household/ReferralEntryCard';
import { adoptHelperSession, type MintedSession } from '@/lib/helperSession';
import { isNativeApp } from '@/lib/platform';
import { setMode } from '@/lib/mode';
import { useToast } from '@/hooks/use-toast';
import { SKILL_GROUPS, skillLabel, toggleGroup, toggleSub } from '@/lib/helperSkills';
import { HELPER_KIT_OPTIONS, KIT_HIRE_CENTS } from '@/lib/kit';
import { COLLEGES, STUDY_YEARS } from '@/lib/colleges';
import { prepareJoinPhoto } from '@/lib/safeImage';
import { assessPhotoQuality } from '@/lib/photoQuality';
import { extractFnError } from '@/lib/fnError';
import logo from '@/assets/logo.png';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hdb = supabase as any;

// "Jobs I do" — groups + sub-skills shared with the join form (helperSkills).

const SLOTS = [
  { id: 'mon-fri-morning',   label: 'Mon–Fri mornings'   },
  { id: 'mon-fri-afternoon', label: 'Mon–Fri afternoons' },
  { id: 'mon-fri-evening',   label: 'Mon–Fri evenings'   },
  { id: 'sat-morning',       label: 'Sat mornings'       },
  { id: 'sat-afternoon',     label: 'Sat afternoons'     },
  { id: 'sat-evening',       label: 'Sat evenings'       },
  { id: 'sun-morning',       label: 'Sun mornings'       },
  { id: 'sun-afternoon',     label: 'Sun afternoons'     },
  { id: 'sun-evening',       label: 'Sun evenings'       },
];

interface HelperRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  photo_url: string | null;
  city: string;
  bio: string | null;
  college: string | null;
  course: string | null;
  study_year: string | null;
  categories: string[] | null;
  availability: string[] | null;
  status: string;
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean | null;
  /** How customers pay the helper directly (Revolut tag etc — direct-pay model). */
  payment_handle?: string | null;
  own_kit?: string[] | null;
  /** Optional — only present once find-helper-by-phone returns them. */
  student_email_verified?: boolean | null;
  id_verified?: boolean | null;
  /** €2/month ✓ Verified plan (the paid leg of the blue tick). */
  verified_plan_active?: boolean | null;
  /** email + ID + plan, computed by the DB (generated column). */
  vano_verified?: boolean | null;
}

const normalizePhone = (p: string) => p.replace(/[\s\-().+]/g, '').replace(/^0/, '353');
const phonesMatch = (stored: string, entered: string) => {
  const s = normalizePhone(stored);
  const e = normalizePhone(entered);
  return s === e || s.endsWith(e) || e.endsWith(s);
};

// ── Account gate session ──────────────────────────────────────────────────────
// Since the phone-gate hardening (July 2026), entering the number only STARTS
// the gate: a 6-digit code is texted to the number on the helper's own row,
// and verifying it mints a 30-minute signed account_token
// (student-account-otp) that every phone-authed function on this page
// requires. Since 2026-07-21 the verify response ALSO carries a month-long
// device_token ("remember this device" — owner call: one code per device, not
// per visit), so the session now lives in localStorage: when the 30-minute
// token lapses the device token takes over silently, and only a server 401
// (or the explicit log-out link) sends the helper back to the code step.
const GATE_KEY = 'vano_account_gate_v2';
const LEGACY_GATE_KEY = 'vano_account_gate_v1';
interface GateSession {
  phone: string;
  token: string;       // 30-minute session token
  exp: number;         // its expiry (ms)
  deviceToken?: string; // month-long remember-this-device token
  deviceExp?: number;
}
/** The token to use right now: fresh session token, else live device token. */
function readGateSession(): { phone: string; token: string } | null {
  try {
    const raw = localStorage.getItem(GATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GateSession;
    if (!s?.phone) return null;
    // 30s slack so a request never leaves with a token that dies in flight.
    if (s.token && typeof s.exp === 'number' && Date.now() < s.exp - 30_000) {
      return { phone: s.phone, token: s.token };
    }
    if (s.deviceToken && typeof s.deviceExp === 'number' && Date.now() < s.deviceExp - 30_000) {
      return { phone: s.phone, token: s.deviceToken };
    }
    return null;
  } catch { return null; }
}
function saveGateSession(s: GateSession) {
  try { localStorage.setItem(GATE_KEY, JSON.stringify(s)); } catch { /* best effort */ }
}
function clearGateSession() {
  try { localStorage.removeItem(GATE_KEY); } catch { /* best effort */ }
  try { sessionStorage.removeItem(LEGACY_GATE_KEY); } catch { /* best effort */ }
}

const StudentAccount = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // File inputs
  const fileRef   = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [helper,  setHelper]  = useState<HelperRow | null>(null);
  const [loading, setLoading] = useState(false); // no initial load needed — wait for phone gate
  // Auth user id, if this helper is signed in. The payout card needs an
  // authenticated session (its DB reads are RLS-gated on auth.uid()), so
  // we only show it when one exists. Phone-gated-only helpers (no auth
  // session) simply don't see the card here.
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setAuthUserId(data.session?.user?.id ?? null);
    });
    return () => { cancelled = true; };
  }, []);

  // Verification flags come straight from the DB by helper id (same anon read
  // VerifyHelper uses) — not from find-helper-by-phone, so the badge and the
  // get-verified card work regardless of which function version is deployed.
  const helperId = helper?.id;
  useEffect(() => {
    if (!helperId) return;
    let cancelled = false;
    (async () => {
      const { data } = await hdb
        .from('household_helpers')
        .select('student_email_verified, id_verified, verified_plan_active, vano_verified')
        .eq('id', helperId)
        .maybeSingle();
      if (cancelled || !data) return;
      setHelper(h => h && h.id === helperId
        ? {
            ...h,
            student_email_verified: data.student_email_verified,
            id_verified: data.id_verified,
            verified_plan_active: data.verified_plan_active,
            vano_verified: data.vano_verified,
          }
        : h);
    })();
    return () => { cancelled = true; };
  }, [helperId]);

  const [bio,          setBio]          = useState('');
  const [payHandle,    setPayHandle]    = useState('');
  // Study fields — customer-visible ("2nd year Nursing at ATU").
  const [college,      setCollege]      = useState('');
  const [course,       setCourse]       = useState('');
  const [studyYear,    setStudyYear]    = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [avail,        setAvail]        = useState<string[]>([]);
  const [ownKit,       setOwnKit]       = useState<string[]>([]);
  const [photoFile,    setPhotoFile]    = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  // Soft quality note — the photo IS staged; this just nudges toward a better one.
  const [photoNote,    setPhotoNote]    = useState<string | null>(null);

  // Phone gate — two steps since the July 2026 hardening: number → texted
  // 6-digit code → account_token (see the module comment on GATE_KEY).
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [gateStep,      setGateStep]      = useState<'phone' | 'code'>('phone');
  const [gateInput,     setGateInput]     = useState('');
  const [gateCode,      setGateCode]      = useState('');
  const [gateChannel,   setGateChannel]   = useState<'sms' | 'whatsapp'>('sms');
  const [gateError,     setGateError]     = useState('');
  const [gateLoading,   setGateLoading]   = useState(false);
  // Resend cooldown (mirrors the server's 30s gap) — `nowTick` only ticks
  // while the code step is showing.
  const [resendAt, setResendAt] = useState(0);
  const [nowTick,  setNowTick]  = useState(() => Date.now());
  const accountTokenRef = useRef('');
  useEffect(() => {
    if (gateStep !== 'code' || phoneVerified) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [gateStep, phoneVerified]);

  // "?add=<group>" deep link from the dispatch gap-recruit nudge ("a paying
  // job skipped you — add the category"): pre-ticks that job once the phone
  // gate opens, so opting in is enter-number → Save. Only known group slugs
  // count; anything else is ignored.
  const [pendingAdd] = useState<string | null>(() => {
    try {
      const v = new URLSearchParams(window.location.search).get('add');
      return v && v !== 'other' && SKILL_GROUPS.some(g => g.id === v) ? v : null;
    } catch { return null; }
  });

  // "?kit=<slug>" deep link from the dispatch kit gap-nudge ("a mowing job
  // paying €10 extra skipped you"): pre-ticks that piece of gear once the
  // phone gate opens. Same rule as ?add= — pre-tick only, never a silent
  // write, and only slugs we actually recognise.
  const [pendingKit] = useState<string | null>(() => {
    try {
      const v = new URLSearchParams(window.location.search).get('kit');
      return v && HELPER_KIT_OPTIONS.some((k) => k.slug === v) ? v : null;
    } catch { return null; }
  });

  // Phone inline edit
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput,   setPhoneInput]   = useState('');
  const [phoneSaving,  setPhoneSaving]  = useState(false);

  // Email inline edit (add or change)
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailInput,   setEmailInput]   = useState('');
  const [emailSaving,  setEmailSaving]  = useState(false);

  // Sheets
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [showConfirm,    setShowConfirm]    = useState(false);

  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Payout disconnect + account deletion (danger zone)
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDelete,    setShowDelete]    = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting,      setDeleting]      = useState(false);

  // ✓ Verified €2/month plan + phone-gated payout setup
  const [planCancelling, setPlanCancelling] = useState(false);
  const [payoutStarting, setPayoutStarting] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  // ── Phone gate (number → texted code → account_token → profile) ──────────
  // Loads the profile with a live account token. Returns false (and clears
  // the stale session) when the server says the token's dead.
  async function fetchProfile(phoneStr: string, token: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('find-helper-by-phone', {
        body: { phone: phoneStr, account_token: token },
      });
      const match = (data as { helper?: HelperRow | null } | null)?.helper ?? null;
      if (error || !match || !phonesMatch(match.phone, phoneStr)) {
        clearGateSession();
        accountTokenRef.current = '';
        return false;
      }
      loadHelper(match);
      return true;
    } catch {
      return false;
    }
  }

  // A still-live session from this tab (reload, Stripe round-trip) skips the
  // code — the helper isn't re-texted every time the page remounts.
  useEffect(() => {
    const s = readGateSession();
    if (!s) return;
    accountTokenRef.current = s.token;
    setGateInput(s.phone);
    setLoading(true);
    void fetchProfile(s.phone, s.token).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendGateCode() {
    const entered = gateInput.trim();
    if (!entered) return;
    setGateLoading(true);
    setGateError('');
    try {
      const { data, error } = await supabase.functions.invoke('student-account-otp', {
        body: { action: 'send', phone: entered },
      });
      if (error || !(data as { success?: boolean } | null)?.success) {
        setGateError(await extractFnError(data, error, "That number doesn't match any account. Try again or WhatsApp +353 89 981 7111."));
        return;
      }
      setGateChannel((data as { channel?: string } | null)?.channel === 'whatsapp' ? 'whatsapp' : 'sms');
      setGateStep('code');
      setGateCode('');
      // Refresh the tick together with the deadline — nowTick is lazy (only
      // ticks on the code step), so a stale value would flash a wrong count.
      setNowTick(Date.now());
      setResendAt(Date.now() + 30_000);
    } catch {
      setGateError('Something went wrong. Please try again.');
    } finally {
      setGateLoading(false);
    }
  }

  const handlePhoneVerify = (e: React.FormEvent) => {
    e.preventDefault();
    void sendGateCode();
  };

  const gateVerifying = useRef(false);
  async function verifyGateCode() {
    const entered = gateInput.trim();
    const codeClean = gateCode.trim();
    if (codeClean.length !== 6 || gateVerifying.current) return;
    gateVerifying.current = true;
    setGateLoading(true);
    setGateError('');
    try {
      const { data, error } = await supabase.functions.invoke('student-account-otp', {
        body: { action: 'verify', phone: entered, code: codeClean },
      });
      const payload = data as {
        account_token?: string; expires_at_ms?: number;
        device_token?: string; device_expires_at_ms?: number;
        session?: MintedSession;
      } | null;
      const token = payload?.account_token;
      if (error || !token) {
        setGateError(await extractFnError(data, error, 'That code is incorrect. Try again.'));
        return;
      }
      // The same code now also signs the helper into Supabase, so Find /
      // claim / the job screen work with no second login. Fail-soft.
      setMode('helper');
      const adopted = await adoptHelperSession(payload?.session);
      const next = new URLSearchParams(window.location.search).get('next');
      if (adopted && next && next.startsWith('/')) { navigate(next, { replace: true }); return; }
      const exp = payload?.expires_at_ms ?? Date.now() + 25 * 60_000;
      accountTokenRef.current = token;
      saveGateSession({
        phone: entered, token, exp,
        deviceToken: payload?.device_token,
        deviceExp: payload?.device_expires_at_ms,
      });
      if (!await fetchProfile(entered, token)) {
        setGateError('Verified — but we could not load your profile. Try again.');
      }
    } catch {
      setGateError('Something went wrong. Please try again.');
    } finally {
      gateVerifying.current = false;
      setGateLoading(false);
    }
  }

  // Auto-verify the moment the 6th digit lands (same pattern as VerifyHelper —
  // guarded so a failed code isn't retried in a loop).
  const lastAutoTried = useRef('');
  useEffect(() => {
    if (gateStep === 'code' && !phoneVerified && gateCode.length === 6 && lastAutoTried.current !== gateCode) {
      lastAutoTried.current = gateCode;
      void verifyGateCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateCode, gateStep, phoneVerified]);

  // A 401 from any phone-authed function = the 30-min session lapsed mid-edit.
  // Drop back to the gate with an explanation instead of a dead-end toast.
  function authExpired(status: number): boolean {
    if (status !== 401) return false;
    clearGateSession();
    accountTokenRef.current = '';
    setHelper(null);
    setPhoneVerified(false);
    setGateStep('phone');
    setGateCode('');
    setGateError('Your secure session expired — enter your number again.');
    return true;
  }

  function loadHelper(data: HelperRow) {
    setHelper(data);
    setBio(data.bio ?? '');
    setPayHandle(data.payment_handle ?? '');
    setCollege(data.college ?? '');
    setCourse(data.course ?? '');
    setStudyYear(data.study_year ?? '');
    const cats = data.categories ?? [];
    // Apply the ?add= deep link — pre-tick only, the helper still taps Save
    // (nothing is ever written silently from a URL param).
    if (pendingAdd && !cats.includes(pendingAdd)) {
      setSelectedCats([...cats, pendingAdd]);
      toast({
        title: `${skillLabel(pendingAdd) ?? pendingAdd} ticked for you`,
        description: 'Tap Save changes below and you’ll get these job offers from now on.',
      });
    } else {
      setSelectedCats(cats);
    }
    setAvail(data.availability ?? []);
    const kitNow = data.own_kit ?? [];
    if (pendingKit && !kitNow.includes(pendingKit)) {
      setOwnKit([...kitNow, pendingKit]);
      toast({
        title: `${HELPER_KIT_OPTIONS.find((k) => k.slug === pendingKit)?.label ?? 'Kit'} ticked for you`,
        description: 'Tap Save changes below and jobs needing it will start reaching you.',
      });
    } else {
      setOwnKit(kitNow);
    }
    setPhotoPreview(data.photo_url);
    setPhoneInput(data.phone ?? '');
    setPhoneVerified(true);
  }

  // ── Photo selection ────────────────────────────────────────────────────────
  // DIRECT-SET, exactly like /join: the picked photo IS the photo, staged
  // instantly for the next Save. The move-and-scale PhotoCropper used to sit
  // here and kept silently dead-ending on real phones (21 Jul: a helper's
  // account-page photo change produced a photo-less save while his signup
  // photo — the cropper-free path — uploaded fine minutes earlier; same class
  // as the 16 Jul join-form black screen). prepareJoinPhoto shrinks big shots
  // off-DOM as a fail-soft optimisation; if it can't, the ORIGINAL file is
  // staged exactly as picked — a photo pick can never dead-end.
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked after a cancel
    if (!file) return;
    setShowPhotoSheet(false);
    if (file.size > 15 * 1024 * 1024) {
      toast({ title: 'Photo must be under 15 MB', variant: 'destructive' });
      return;
    }
    // Quality gate (fail-soft — null = "couldn't measure", proceed): only
    // positively-junk photos (microscopic / blank frame) are refused; a poor
    // shot is still staged with a gentle note. Never dead-ends a change.
    const quality = await assessPhotoQuality(file).catch(() => null);
    if (quality?.verdict === 'reject') {
      setPhotoNote(null);
      toast({ title: "That photo won't work", description: quality.message, variant: 'destructive' });
      return;
    }
    setPhotoNote(quality?.verdict === 'warn' ? quality.message : null);
    const prepared = await prepareJoinPhoto(file).catch(() => null);
    setPhotoFile(prepared?.file ?? file);
    setPhotoPreview(prepared?.previewUrl ?? URL.createObjectURL(file));
  };

  // ── Phone inline save ──────────────────────────────────────────────────────
  // Goes through the service-role edge function: the anon key has no UPDATE
  // access to household_helpers, so a direct .update() silently changes nothing.
  const savePhone = async () => {
    if (!helper || !phoneInput.trim()) return;
    setPhoneSaving(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey     = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const fd = new FormData();
      fd.append('phone',         helper.phone);
      fd.append('new_phone',     phoneInput.trim());
      fd.append('account_token', accountTokenRef.current);
      const res = await fetch(`${supabaseUrl}/functions/v1/update-helper-profile`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
        body: fd,
      });
      if (authExpired(res.status)) return;
      const json = await res.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || 'Update failed');
      setHelper(h => h ? { ...h, phone: phoneInput.trim() } : h);
      setEditingPhone(false);
    } catch (e) {
      toast({ title: 'Could not save phone number', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setPhoneSaving(false);
    }
  };

  // Email inline save — same service-role path as savePhone. Changing the
  // email un-verifies it server-side, so the badge can't ride on an
  // unconfirmed address; the get-verified card re-earns it.
  const saveEmail = async () => {
    if (!helper) return;
    const clean = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      toast({ title: 'Enter a valid email address', variant: 'destructive' });
      return;
    }
    setEmailSaving(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey     = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const fd = new FormData();
      fd.append('phone',         helper.phone);
      fd.append('new_email',     clean);
      fd.append('account_token', accountTokenRef.current);
      const res = await fetch(`${supabaseUrl}/functions/v1/update-helper-profile`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
        body: fd,
      });
      if (authExpired(res.status)) return;
      const json = await res.json().catch(() => ({})) as { success?: boolean; error?: string; email_unverified?: boolean };
      if (!res.ok || !json.success) throw new Error(json.error || 'Update failed');
      // Only blank the verified flag if the server actually cleared it (i.e.
      // the address changed). Re-saving the SAME address keeps the blue tick —
      // flipping it false unconditionally made a verified helper's tick vanish
      // until reload on a no-op re-save.
      const nowUnverified = json.email_unverified === true;
      setHelper(h => h ? { ...h, email: clean, ...(nowUnverified ? { student_email_verified: false } : {}) } : h);
      setEditingEmail(false);
      toast({
        title: 'Email saved',
        description: nowUnverified ? 'Confirm it via Get VANO Verified to earn your badge.' : undefined,
      });
    } catch (e) {
      toast({ title: 'Could not save email', description: e instanceof Error ? e.message : 'Try again or WhatsApp +353 89 981 7111.', variant: 'destructive' });
    } finally {
      setEmailSaving(false);
    }
  };

  const toggleSlot = (id: string) =>
    setAvail(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  // ── Main save ──────────────────────────────────────────────────────────────
  // Everything goes through the service-role edge function: the anon key has
  // no UPDATE access to household_helpers, so a direct .update() silently
  // changes nothing for phone-gated (unauthenticated) helpers.
  const handleSave = async () => {
    if (!helper) return;
    setSaving(true); setSaved(false);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey     = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const fd = new FormData();
      fd.append('phone',          helper.phone);
      fd.append('bio',            bio.trim());
      fd.append('payment_handle', payHandle.trim());
      fd.append('college',        college.trim());
      fd.append('course',         course.trim());
      fd.append('study_year',     studyYear.trim());
      fd.append('availability',   JSON.stringify(avail));
      fd.append('categories',     JSON.stringify(selectedCats));
      fd.append('extras',         JSON.stringify({ own_kit: ownKit }));
      fd.append('account_token',  accountTokenRef.current);
      if (photoFile) fd.append('photo', photoFile);

      const res = await fetch(`${supabaseUrl}/functions/v1/update-helper-profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: fd,
      });
      if (authExpired(res.status)) return;
      const json = await res.json() as { success?: boolean; photo_url?: string; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Save failed');

      const photoUrl = json.photo_url ?? helper.photo_url;
      setPhotoFile(null);
      setHelper(h => h
        ? { ...h, bio: bio.trim() || null, payment_handle: payHandle.trim() || null, categories: selectedCats, availability: avail, own_kit: ownKit, photo_url: photoUrl }
        : h,
      );
      setSaved(true);
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : 'Try again or contact support.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = async () => {
    if (!helper) return;
    setCancelling(true);
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/cancel-helper-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ helper_id: helper.id, phone: helper.phone, account_token: accountTokenRef.current }),
      });
      if (authExpired(res.status)) return;
      const json = await res.json() as { cancelled?: boolean; error?: string };
      if (!json.cancelled) throw new Error(json.error ?? 'Unknown error');
      navigate('/', { replace: true });
    } catch {
      toast({
        title: 'Could not cancel automatically',
        description: "WhatsApp us on +353 89 981 7111 and we'll remove you straight away.",
        variant: 'destructive',
      });
      setCancelling(false);
      setShowConfirm(false);
    }
  };

  // fetch() (not functions.invoke) so guard messages in a non-2xx body still
  // surface to the helper — mirrors handleLeave above.
  const fnUrl = (name: string) => `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/${name}`;
  const fnHeaders = () => {
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey };
  };

  // ── Disconnect Stripe payouts ───────────────────────────────────────────────
  const handleDisconnectPayouts = async () => {
    if (!helper) return;
    setDisconnecting(true);
    try {
      const res = await fetch(fnUrl('disconnect-helper-payouts'), {
        method: 'POST',
        headers: fnHeaders(),
        body: JSON.stringify({ helper_id: helper.id, phone: helper.phone, account_token: accountTokenRef.current }),
      });
      if (authExpired(res.status)) return;
      const json = await res.json() as { disconnected?: boolean; error?: string };
      if (!res.ok || !json.disconnected) throw new Error(json.error ?? 'Failed');
      setHelper(h => h ? { ...h, stripe_account_id: null, stripe_payouts_enabled: false } : h);
      toast({ title: 'Payout account disconnected', description: 'Any earnings still owed wait safely until you reconnect.' });
    } catch {
      toast({ title: 'Could not disconnect', description: 'Try again or WhatsApp +353 89 981 7111.', variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  // ── ✓ Verified plan cancel ──────────────────────────────────────────────────
  // Cancel-anytime is part of the €2/month deal. Stripe cancels at period end
  // (they keep the tick for the month they paid for); the webhook flips
  // verified_plan_active off when the period actually ends.
  const handleCancelPlan = async () => {
    if (!helper || planCancelling) return;
    setPlanCancelling(true);
    try {
      const res = await fetch(fnUrl('cancel-verified-plan'), {
        method: 'POST',
        headers: fnHeaders(),
        body: JSON.stringify({ helper_id: helper.id, phone: helper.phone, account_token: accountTokenRef.current }),
      });
      if (authExpired(res.status)) return;
      const json = await res.json() as { cancelled?: boolean; immediate?: boolean; ends_at_period_end?: boolean; error?: string };
      if (!res.ok || !json.cancelled) throw new Error(json.error ?? 'Failed');
      if (json.immediate) {
        setHelper(h => h ? { ...h, verified_plan_active: false, vano_verified: false } : h);
        toast({ title: 'Verified plan cancelled', description: 'Your blue tick is off. You can turn it back on anytime.' });
      } else {
        toast({ title: 'Verified plan cancelled', description: "You keep the tick until the month you've paid for ends — then it switches off. Turn it back on anytime." });
      }
    } catch {
      toast({ title: 'Could not cancel', description: 'Try again or WhatsApp +353 89 981 7111.', variant: 'destructive' });
    } finally {
      setPlanCancelling(false);
    }
  };

  // ── Payout setup (phone-gated) ──────────────────────────────────────────────
  // Opens Stripe Connect Express onboarding via household-helper-connect-link's
  // phone-auth branch — no sign-in needed, matching the rest of this page.
  const handleSetupPayouts = async () => {
    if (!helper || payoutStarting) return;
    setPayoutStarting(true);
    try {
      const res = await fetch(fnUrl('household-helper-connect-link'), {
        method: 'POST',
        headers: fnHeaders(),
        body: JSON.stringify({ helper_id: helper.id, phone: helper.phone, account_token: accountTokenRef.current }),
      });
      if (authExpired(res.status)) return;
      const json = await res.json() as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? 'Failed');
      window.location.href = json.url;
      return;
    } catch (e) {
      toast({
        title: 'Could not start payout setup',
        description: e instanceof Error && e.message !== 'Failed' ? e.message : 'Try again or WhatsApp +353 89 981 7111.',
        variant: 'destructive',
      });
      setPayoutStarting(false);
    }
  };

  // Back from Stripe onboarding (?payout=done|refresh): confirm readiness
  // directly with Stripe (webhook-independent), toast, and strip the param.
  useEffect(() => {
    if (!helper?.id) return;
    const params = new URLSearchParams(window.location.search);
    const payout = params.get('payout');
    if (!payout) return;
    params.delete('payout');
    const qs = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    (async () => {
      try {
        const res = await fetch(fnUrl('household-helper-connect-link'), {
          method: 'POST',
          headers: fnHeaders(),
          body: JSON.stringify({ check_only: true, helper_id: helper.id, phone: helper.phone, account_token: accountTokenRef.current }),
        });
        if (authExpired(res.status)) return;
        const json = await res.json() as { stripe_account_id?: string | null; stripe_payouts_enabled?: boolean };
        setHelper(h => h ? {
          ...h,
          stripe_account_id: json.stripe_account_id ?? h.stripe_account_id,
          stripe_payouts_enabled: !!json.stripe_payouts_enabled,
        } : h);
        if (payout === 'done') {
          toast(json.stripe_payouts_enabled
            ? { title: '💶 Payouts ready', description: 'Your earnings will land automatically after each job.' }
            : { title: 'Almost there', description: "Stripe is finishing your payout setup — it usually confirms within a minute or two." });
        }
      } catch { /* non-blocking — the card just shows its cached state */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helper?.id]);

  // ── Delete account (GDPR erasure) ───────────────────────────────────────────
  const handleDeleteAccount = async () => {
    if (!helper) return;
    setDeleting(true);
    try {
      const res = await fetch(fnUrl('delete-helper-account'), {
        method: 'POST',
        headers: fnHeaders(),
        body: JSON.stringify({ helper_id: helper.id, phone: helper.phone, confirm: 'DELETE', account_token: accountTokenRef.current }),
      });
      if (authExpired(res.status)) return;
      const json = await res.json() as { deleted?: boolean; error?: string };
      if (!res.ok || !json.deleted) {
        // Guard messages ("you're owed €X", "finish your active job") arrive here.
        throw new Error(json.error || 'We could not delete your account. Try again or contact support.');
      }
      toast({ title: 'Account deleted', description: 'Your personal details have been removed. Take care!' });
      navigate('/', { replace: true });
    } catch (e) {
      toast({
        title: 'Could not delete account',
        description: e instanceof Error ? e.message : 'Try again or WhatsApp +353 89 981 7111.',
        variant: 'destructive',
      });
      setDeleting(false);
    }
  };

  // VANO Verified (the blue tick) = confirmed student email + Stripe ID check
  // + the €2/month plan. The flags only arrive once find-helper-by-phone
  // returns them, so treat "unknown" (undefined) as: show nothing rather than
  // nag a helper who may already be verified.
  const verificationKnown = helper != null
    && helper.id_verified !== undefined
    && helper.student_email_verified !== undefined;
  const vanoVerified = verificationKnown
    && !!helper?.id_verified && !!helper?.student_email_verified && !!helper?.verified_plan_active;

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Phone gate — enter phone to load your account
  if (!phoneVerified) {
    return (
      <div className="min-h-dvh bg-background">
        <SEOHead title="My account — VANO" description="Manage your VANO helper account." noindex />
        <header className="fixed top-0 inset-x-0 z-50 h-14 flex items-center justify-between px-4 bg-background/95 backdrop-blur-xl border-b border-border/50">
          <button
            onClick={() => navigate('/')}
            className="flex items-center justify-center w-8 h-8 -ml-1 rounded-full hover:bg-secondary transition-colors"
            aria-label="Back"
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </button>
          <span className="text-sm font-semibold text-foreground">My account</span>
          <img src={logo} alt="VANO" className="h-6 w-auto" />
        </header>
        <div className="min-h-dvh flex flex-col items-center justify-center px-6 pt-14 pb-10">
          <div className="w-full max-w-sm">
            {gateStep === 'phone' ? (
              <>
                <h1 className="text-2xl font-bold text-foreground mb-2">Enter your number</h1>
                <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
                  {pendingAdd ? (
                    <>Enter the phone number you signed up with and we&rsquo;ll tick{' '}
                    <span className="font-semibold text-foreground">{skillLabel(pendingAdd)}</span> onto your jobs.
                    We&rsquo;ll text you a 6-digit code to keep your account safe.</>
                  ) : (
                    "Enter the phone number you signed up with — we'll text you a 6-digit code to keep your account safe."
                  )}
                </p>
                <form onSubmit={handlePhoneVerify} className="space-y-3">
                  <input
                    type="tel"
                    value={gateInput}
                    onChange={e => { setGateInput(e.target.value); setGateError(''); }}
                    placeholder="+353 87 123 4567"
                    autoFocus
                    autoComplete="tel"
                    className="w-full h-14 rounded-2xl border border-border bg-background px-4 text-base focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/40"
                  />
                  {gateError && <p className="text-sm text-destructive">{gateError}</p>}
                  <button
                    type="submit"
                    disabled={gateLoading || !gateInput.trim()}
                    className="w-full h-14 rounded-full bg-primary text-primary-foreground font-semibold text-base active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {gateLoading ? <><Loader2 size={17} className="animate-spin" />Texting you a code…</> : 'Text me a code →'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-foreground mb-2">Enter the code</h1>
                <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
                  We {gateChannel === 'whatsapp' ? 'sent a 6-digit code to your WhatsApp' : 'texted a 6-digit code to'}{' '}
                  <span className="font-semibold text-foreground">{gateInput.trim()}</span>.
                  {gateChannel === 'sms' && ' It can take a few seconds.'}
                </p>
                <form onSubmit={(e) => { e.preventDefault(); void verifyGateCode(); }} className="space-y-3">
                  <input
                    type="text"
                    value={gateCode}
                    onChange={e => { setGateCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setGateError(''); }}
                    placeholder="6-digit code"
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="w-full h-14 rounded-2xl border border-border bg-background px-4 text-base tracking-[0.4em] text-center font-semibold focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/40 placeholder:tracking-normal placeholder:font-normal"
                  />
                  {gateError && <p className="text-sm text-destructive">{gateError}</p>}
                  <button
                    type="submit"
                    disabled={gateLoading || gateCode.length !== 6}
                    className="w-full h-14 rounded-full bg-primary text-primary-foreground font-semibold text-base active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {gateLoading ? <><Loader2 size={17} className="animate-spin" />Checking…</> : 'Open my account →'}
                  </button>
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => { setGateStep('phone'); setGateCode(''); setGateError(''); }}
                      className="text-xs font-medium text-muted-foreground underline underline-offset-2 py-2"
                    >
                      Wrong number?
                    </button>
                    {(() => {
                      const wait = Math.max(0, Math.ceil((resendAt - nowTick) / 1000));
                      return (
                        <button
                          type="button"
                          disabled={gateLoading || wait > 0}
                          onClick={() => void sendGateCode()}
                          className="text-xs font-medium text-muted-foreground underline underline-offset-2 py-2 disabled:opacity-50 disabled:no-underline"
                        >
                          {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
                        </button>
                      );
                    })()}
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!helper) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-base font-semibold text-foreground">No helper account found</p>
        <p className="text-sm text-muted-foreground">
          <a href="/join" className="underline underline-offset-2 text-primary">Apply to join VANO →</a>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <SEOHead title="My account — VANO" description="Manage your VANO helper account." noindex />

      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 h-14 flex items-center justify-between px-4 bg-background/95 backdrop-blur-xl border-b border-border/50">
        <button
          // The dashboard needs an auth session and bounces to the sign-in
          // page without one — phone-gated helpers go home instead.
          onClick={() => navigate(authUserId ? '/student-dashboard' : '/')}
          className="flex items-center justify-center w-8 h-8 -ml-1 rounded-full hover:bg-secondary transition-colors"
          aria-label="Back"
        >
          <ChevronLeft size={20} strokeWidth={2} />
        </button>
        <span className="text-sm font-semibold text-foreground">My account</span>
        <img src={logo} alt="VANO" className="h-6 w-auto" />
      </header>

      {/* Hidden file inputs */}
      <input ref={fileRef}   type="file" accept="image/*"                    className="sr-only" onChange={handleFileSelected} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleFileSelected} />

      <main className="pt-14 pb-32 max-w-sm mx-auto px-4">
        {/* Avatar */}
        <div className="flex flex-col items-center pt-8 pb-6">
          <button
            type="button"
            onClick={() => setShowPhotoSheet(true)}
            className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-border flex-shrink-0 group"
            aria-label="Change profile photo"
          >
            {photoPreview ? (
              <img src={photoPreview} alt={helper.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-sage/20 flex items-center justify-center">
                <span className="text-3xl font-bold text-sage">{helper.name[0]?.toUpperCase()}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity">
              <Camera size={20} className="text-white" />
            </div>
          </button>
          {photoFile && (
            <p className="text-xs text-primary mt-2 font-medium">New photo ready — tap Save to apply</p>
          )}
          {photoNote && photoFile && (
            <p className="mt-2 max-w-[260px] rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-center text-[11px] leading-snug text-amber-800">
              {photoNote}
            </p>
          )}
          <h1 className="text-xl font-bold text-foreground mt-3 flex items-center gap-1.5">
            {helper.name}
            {vanoVerified && (
              <BadgeCheck
                size={22}
                className="fill-sky-500 text-white flex-shrink-0"
                aria-label="VANO Verified"
              />
            )}
          </h1>
          {vanoVerified && (
            <span className="mt-1 text-xs font-semibold text-sky-600">VANO Verified</span>
          )}
          <span className={cn(
            'mt-1.5 text-xs px-2.5 py-1 rounded-full border font-medium',
            helper.status === 'approved'
              ? 'bg-sage/10 text-sage border-sage/20'
              : 'bg-secondary text-muted-foreground border-border/40',
          )}>
            {helper.status === 'approved' ? '✓ Active' : helper.status}
          </span>
        </div>

        <div className="space-y-7">
          {/* Jobs open right now — the missed-the-ping recovery board, FIRST
              on purpose: jobs are why a helper opens this page. The claim
              button is the same signed accept link dispatch texts, so the
              whole hardened accept flow is reused untouched. Unverified
              helpers see the money but get the verify CTA. */}
          {/* The open board moved to /find (2026-09-06): map + search + one-tap
              claim on the helper's own session. This is the door to it. */}
          <button
            type="button"
            onClick={() => navigate('/find')}
            className="w-full rounded-2xl bg-sage px-5 py-4 text-left text-white shadow-[0_12px_28px_-14px_hsl(var(--sage)/0.7)] active:scale-[0.99] transition-transform flex items-center justify-between gap-3"
          >
            <span>
              <span className="block text-[15px] font-bold">Find jobs near you</span>
              <span className="block text-[13px] text-white/80 mt-0.5">Open orders on a map · claim with one tap · you keep 100%</span>
            </span>
            <ChevronRight size={18} className="flex-shrink-0 text-white/80" />
          </button>

          {/* Refer & earn — helpers recruiting friends is the network-effect
              loop. They're phone-verified here, so pass their email through and
              /refer loads their code + earnings with zero typing. */}
          <ReferralEntryCard prefillEmail={helper.email ?? undefined} />

          {/* Get VANO Verified — finish the missing checks to earn the blue
              tick. Hidden until the flags are known (see verificationKnown). */}
          {verificationKnown && !vanoVerified && (
            <section>
              <button
                type="button"
                onClick={() => navigate(`/verify-helper?id=${helper.id}&name=${encodeURIComponent(helper.name)}`)}
                className="w-full rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white">
                  <ShieldCheck size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
                    {!helper.id_verified ? 'Verify your ID to get jobs' : isNativeApp() ? 'Your verification' : 'Add your blue tick'}
                    <BadgeCheck size={16} className="fill-sky-500 text-white flex-shrink-0" aria-hidden="true" />
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {!helper.id_verified
                      ? "Free 2-minute ID check — every helper verifies before their first job, and you won't get offers until it's done. Tap to verify now."
                      : isNativeApp()
                      ? "You're verified and getting jobs. Manage your badge and profile here."
                      : 'You\'re verified and getting jobs. The blue tick is an optional €2/month badge (customers see it, and it bumps you up the list). Cancel anytime.'}
                  </span>
                </span>
                <ChevronRight size={16} className="text-muted-foreground/50 flex-shrink-0" />
              </button>
            </section>
          )}

          {/* Account info */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Account info</p>
            <div className="rounded-2xl border border-border/60 overflow-hidden divide-y divide-border/40">
              {/* Phone */}
              <div className="px-4 py-3.5 flex items-center gap-3 min-h-[52px]">
                <span className="text-xs text-muted-foreground w-14 flex-shrink-0">Phone</span>
                {editingPhone ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={e => setPhoneInput(e.target.value)}
                      autoFocus
                      className="flex-1 bg-transparent text-sm text-foreground focus:outline-none border-b border-primary pb-0.5"
                    />
                    <button
                      onClick={() => void savePhone()}
                      disabled={phoneSaving}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-sage text-white disabled:opacity-50 flex-shrink-0"
                    >
                      {phoneSaving
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Check size={13} strokeWidth={2.5} />}
                    </button>
                    <button
                      onClick={() => { setEditingPhone(false); setPhoneInput(helper.phone); }}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-secondary text-muted-foreground flex-shrink-0"
                    >
                      <X size={13} strokeWidth={2.5} />
                    </button>
                  </div>
                ) : (
                  <>
                    {/* ph-mask: the helper's own phone number. */}
                    <span className="ph-mask flex-1 text-sm text-foreground">{helper.phone}</span>
                    <button
                      onClick={() => { setPhoneInput(helper.phone); setEditingPhone(true); }}
                      className="text-xs text-primary font-medium"
                    >
                      Edit
                    </button>
                  </>
                )}
              </div>

              {/* Email — add it here or change it; the get-verified flow
                  confirms it. helper.email is only populated locally after a
                  save (the phone lookup deliberately doesn't return it). */}
              <div className="px-4 py-3.5 flex items-center gap-3 min-h-[52px]">
                <span className="text-xs text-muted-foreground w-14 flex-shrink-0">Email</span>
                {editingEmail ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={e => setEmailInput(e.target.value)}
                      placeholder="you@universityofgalway.ie"
                      inputMode="email"
                      autoCapitalize="off"
                      autoCorrect="off"
                      autoFocus
                      className="flex-1 min-w-0 bg-transparent text-sm text-foreground focus:outline-none border-b border-primary pb-0.5 placeholder:text-muted-foreground/40"
                    />
                    <button
                      onClick={() => void saveEmail()}
                      disabled={emailSaving}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-sage text-white disabled:opacity-50 flex-shrink-0"
                      aria-label="Save email"
                    >
                      {emailSaving
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Check size={13} strokeWidth={2.5} />}
                    </button>
                    <button
                      onClick={() => { setEditingEmail(false); setEmailInput(helper.email ?? ''); }}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-secondary text-muted-foreground flex-shrink-0"
                      aria-label="Cancel"
                    >
                      <X size={13} strokeWidth={2.5} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-foreground truncate">{helper.email ?? '—'}</span>
                    <button
                      onClick={() => { setEmailInput(helper.email ?? ''); setEditingEmail(true); }}
                      className="text-xs text-primary font-medium"
                    >
                      {helper.email ? 'Edit' : 'Add'}
                    </button>
                  </>
                )}
              </div>

              {/* City */}
              <div className="px-4 py-3.5 flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-14 flex-shrink-0">City</span>
                <span className="flex-1 text-sm text-foreground">{helper.city}</span>
              </div>

              {/* ✓ Verified plan — the €2/month that keeps the blue tick on.
                  Cancel-anytime lives right here, no digging. */}
              {helper.verified_plan_active && !isNativeApp() && (
                <div className="px-4 py-3.5 flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-14 flex-shrink-0">Plan</span>
                  <span className="flex-1 text-sm text-foreground flex items-center gap-1.5">
                    <BadgeCheck size={16} className="fill-sky-500 text-white flex-shrink-0" aria-hidden="true" />
                    Verified · €2/month
                  </span>
                  <button
                    onClick={() => void handleCancelPlan()}
                    disabled={planCancelling}
                    className="text-xs text-destructive font-medium disabled:opacity-50"
                  >
                    {planCancelling ? 'Cancelling…' : 'Cancel'}
                  </button>
                </div>
              )}

              {/* Account — the €2 sign-up is a one-off verification fee, NOT a
                  recurring subscription, so never call it a plan here */}
              <div className="px-4 py-3.5 flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-14 flex-shrink-0">Account</span>
                <span className="flex-1 text-sm text-foreground">Helper account</span>
                <button
                  onClick={() => setShowConfirm(true)}
                  className="text-xs text-destructive font-medium"
                >
                  Leave VANO
                </button>
              </div>
            </div>
          </section>

          {/* Automatic payouts. Signed-in helpers get the full VanoPay card;
              phone-gated helpers get a one-tap Stripe onboarding button (the
              connect-link function's phone-auth branch) so payout setup works
              right here with no sign-in. */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Payouts</p>
            {authUserId ? (
              <HouseholdHelperVanoPayCard userId={authUserId} />
            ) : helper.stripe_payouts_enabled ? (
              <div className="rounded-2xl border border-sage/30 bg-sage-light px-4 py-3.5 flex items-center gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-sage text-white">
                  <CheckCircle2 size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Payouts active</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Earnings from older bookings land automatically. New jobs are paid to you directly by the customer.</p>
                </div>
              </div>
            ) : helper.stripe_account_id ? (
              /* Legacy escrow helper mid-Stripe-setup — let them finish so held
                 earnings from OLD bookings can be released. Direct-pay helpers
                 (no stripe_account_id) never see this: customers pay them at
                 the door and VANO holds nothing. */
              <button
                type="button"
                onClick={() => void handleSetupPayouts()}
                disabled={payoutStarting}
                className="w-full rounded-2xl border border-sage/30 bg-sage-light px-4 py-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform disabled:opacity-60"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-sage text-white">
                  {payoutStarting ? <Loader2 size={18} className="animate-spin" /> : <span className="text-base leading-none" aria-hidden="true">💶</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">Finish payout setup</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Finish linking your bank so earnings from older bookings can be released.
                  </span>
                </span>
                <ChevronRight size={16} className="text-muted-foreground/50 flex-shrink-0" />
              </button>
            ) : (
              <div className="rounded-2xl border border-sage/30 bg-sage-light px-4 py-3.5 flex items-center gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-sage text-white">
                  <span className="text-base leading-none" aria-hidden="true">💶</span>
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Customers pay you directly</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Revolut or cash when the job's done — you keep 100%. No bank setup needed.</p>
                </div>
              </div>
            )}
            {helper.stripe_account_id && (
              <div className="mt-3 rounded-2xl border border-border/60 px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Payout account linked</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Disconnect to remove your bank/Revolut details. Earnings still owed wait until you reconnect.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDisconnectPayouts()}
                    disabled={disconnecting}
                    className="text-xs text-destructive font-semibold flex-shrink-0 disabled:opacity-50"
                  >
                    {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Jobs — top-level groups, each opening its sub-skills when picked
              so a helper can say exactly what they do (e.g. Cleaning → Deep
              clean, Oven & kitchen). Sub picks keep the parent selected —
              dispatch matches on the parent slug. */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Jobs I do</p>
            <p className="text-xs text-muted-foreground mb-3">Pick a job type, then tap the specifics you're good at — they show on your profile.</p>
            <div className="space-y-2">
              {SKILL_GROUPS.map(group => {
                const active = selectedCats.includes(group.id);
                return (
                  <div
                    key={group.id}
                    className={cn(
                      'rounded-2xl border transition-colors duration-150',
                      active ? 'border-sage/40 bg-sage/5' : 'border-border/60 bg-background',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedCats(prev => toggleGroup(prev, group.id))}
                      aria-pressed={active}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left"
                    >
                      <span aria-hidden="true">{group.emoji}</span>
                      <span className={cn('flex-1 text-sm font-medium', active ? 'text-foreground' : 'text-foreground/80')}>
                        {group.label}
                      </span>
                      <span
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-full border transition-colors duration-150 flex-shrink-0',
                          active ? 'bg-sage border-sage text-white' : 'border-border text-transparent',
                        )}
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                    </button>
                    {active && group.subs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 px-3.5 pb-3">
                        {group.subs.map(sub => {
                          const subActive = selectedCats.includes(sub.id);
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => setSelectedCats(prev => toggleSub(prev, group.id, sub.id))}
                              aria-pressed={subActive}
                              className={cn(
                                'px-2.5 py-1 rounded-full text-xs font-medium border transition-[background-color,border-color,color] duration-150 active:scale-[0.96]',
                                subActive
                                  ? 'bg-sage text-white border-sage'
                                  : 'bg-background text-foreground/70 border-border hover:border-sage/60',
                              )}
                            >
                              {sub.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Bio */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">About me</p>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="e.g. 2nd year Engineering at UCD, love being outdoors"
              maxLength={120}
              rows={2}
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <p className="text-right text-xs text-muted-foreground mt-1">{bio.length}/120</p>
          </section>

          {/* Studies — the customer-facing proof of "student": "2nd year
              Nursing at ATU" on the public profile, the homepage cards and
              the customer's tracking page. */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">My studies</p>
            <p className="text-xs text-muted-foreground mb-3">Customers see this — a real course and college is the fastest way to look bookable.</p>
            <select
              value={college}
              onChange={e => setCollege(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Choose your college…</option>
              {/* A stored value outside the list must stay selectable —
                  otherwise this controlled select silently clears it. */}
              {college && !COLLEGES.includes(college) && (
                <option value={college}>{college}</option>
              )}
              {COLLEGES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <input
                type="text"
                value={course}
                onChange={e => setCourse(e.target.value)}
                placeholder="Course, e.g. Nursing"
                maxLength={60}
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <select
                value={studyYear}
                onChange={e => setStudyYear(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Year</option>
                {studyYear && !STUDY_YEARS.includes(studyYear) && (
                  <option value={studyYear}>{studyYear}</option>
                )}
                {STUDY_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </section>

          {/* How customers pay you — direct-pay model: customers pay the helper
              directly after the job (Revolut or cash) and keep 100%; this handle
              is shown on their pay screen and in the accept messages. */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">How customers pay you</p>
            <input
              type="text"
              value={payHandle}
              onChange={e => setPayHandle(e.target.value)}
              placeholder="Revolut tag, e.g. @seanog1"
              maxLength={60}
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Customers pay you directly when the job's done — you keep 100%. Add your Revolut tag so they can send it in one tap (cash works too).
            </p>
          </section>

          {/* Kit I own — the supply half of the "we'll bring the mower" loop
              (2026-07-30). Households with no mower pay a hire fee for a
              helper who has one, and dispatch matches on THIS list, so the
              chargeable items lead and say what they're worth. Until now
              own_kit could only ever be set once, on the optional post-verify
              screen: a helper who bought a mower afterwards had no way to
              tell us, and no way to earn from it. */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Kit I can bring</p>
            <p className="text-xs text-muted-foreground mb-3">
              Jobs where the customer has none of their own pay extra — and only helpers who tick these get offered them.
            </p>
            <div className="space-y-2">
              {HELPER_KIT_OPTIONS.map(({ slug, emoji, label, hint }) => {
                const active = ownKit.includes(slug);
                const worth = KIT_HIRE_CENTS[slug];
                return (
                  <button
                    key={slug}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setOwnKit(prev => prev.includes(slug) ? prev.filter(k => k !== slug) : [...prev, slug])}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
                      active ? 'border-sage bg-sage-light' : 'border-border bg-background hover:border-sage/60',
                    )}
                  >
                    <span aria-hidden="true" className="text-xl leading-none flex-shrink-0">{emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{label}</span>
                      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
                    </span>
                    {worth > 0 && (
                      <span className="flex-shrink-0 text-xs font-bold text-sage-dark whitespace-nowrap">+€{(worth / 100).toFixed(0)}/job</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Availability */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">When I'm available</p>
            <div className="grid grid-cols-2 gap-2">
              {SLOTS.map(({ id, label }) => {
                const active = avail.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleSlot(id)}
                    className={cn(
                      'rounded-xl px-3 py-2 text-xs font-medium border text-left transition-[background-color,border-color,color] duration-150',
                      active
                        ? 'bg-sage text-white border-sage'
                        : 'bg-secondary/60 border-border/50 text-foreground hover:bg-secondary',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Danger zone — permanent account deletion (GDPR erasure) */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Danger zone</p>
            <button
              type="button"
              onClick={() => { setDeleteConfirm(''); setShowDelete(true); }}
              className="w-full rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
            >
              <Trash2 size={18} className="text-destructive flex-shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-destructive">Delete my account</span>
                <span className="block text-xs text-muted-foreground mt-0.5">Permanently removes your profile, photo and details.</span>
              </span>
            </button>
          </section>

          {/* This device is remembered for a month after one code — give
              shared/borrowed phones an explicit way out. */}
          <button
            type="button"
            onClick={() => {
              clearGateSession();
              accountTokenRef.current = '';
              setHelper(null);
              setPhoneVerified(false);
              setGateStep('phone');
              setGateCode('');
              setGateError('');
              window.scrollTo({ top: 0 });
            }}
            className="mx-auto block pb-2 text-xs font-medium text-muted-foreground/70 underline underline-offset-2 hover:text-foreground/70"
          >
            Log out on this device
          </button>
        </div>
      </main>

      {/* EVERY fixed-position element below is PORTALED TO <body>. The page
          wrapper (.animate-page-enter, fill-mode: both) retains an identity
          transform after the enter animation, which makes it the containing
          block for position:fixed children — unportaled, the save bar and
          the sheets anchor to the bottom of the ~2300px PAGE, not the
          viewport (proven 21 Jul: a real photo change showed only the dimmed
          backdrop — the "little black screen" — with the sheet 1200px below
          the fold, and the save bar was never pinned). Same escape the
          booking sheet, search takeover and old cropper use. */}

      {/* Fixed save button */}
      {createPortal(
        <div className="fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border/50 px-4 py-3">
          <div className="max-w-sm mx-auto">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className={cn(
                'w-full h-14 rounded-full font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-50 transition-all duration-200 active:scale-[0.98]',
                saved ? 'bg-sage text-white' : 'bg-primary text-primary-foreground',
              )}
            >
              {saving ? (
                <><Loader2 size={17} className="animate-spin" />Saving…</>
              ) : saved ? (
                <><CheckCircle2 size={17} />Saved!</>
              ) : (
                'Save changes'
              )}
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* Photo source sheet */}
      {createPortal(
      <AnimatePresence>
        {showPhotoSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-navy/45"
              onClick={() => setShowPhotoSheet(false)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              className="fixed bottom-0 inset-x-0 z-50 bg-background rounded-t-3xl px-5 pt-4 pb-10 max-w-sm mx-auto"
            >
              <div className="w-10 h-1 rounded-full bg-border mx-auto mb-5" />
              <p className="text-center text-sm font-semibold text-foreground mb-4">Update photo</p>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="w-full h-14 rounded-2xl bg-secondary text-foreground text-sm font-medium flex items-center justify-center gap-2.5"
                >
                  <Camera size={17} />
                  Take a photo
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-14 rounded-2xl bg-secondary text-foreground text-sm font-medium flex items-center justify-center gap-2.5"
                >
                  <ImagePlus size={17} />
                  Choose from library
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body,
      )}

      {/* Leave VANO confirmation sheet */}
      {createPortal(
      <AnimatePresence>
        {showConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-navy/45"
              onClick={() => { if (!cancelling) setShowConfirm(false); }}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              className="fixed bottom-0 inset-x-0 z-50 bg-background rounded-t-3xl px-5 pt-5 pb-10 max-w-sm mx-auto"
            >
              <div className="w-10 h-1 rounded-full bg-border mx-auto mb-6" />
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-destructive/10 mb-4">
                <AlertTriangle size={22} className="text-destructive" />
              </div>
              <h2 className="text-lg font-bold text-foreground mb-2">Leave VANO?</h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                This removes your helper profile from the platform — you'll stop receiving job offers. Any pending payouts will still be transferred to you.
              </p>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => void handleLeave()}
                  disabled={cancelling}
                  className="w-full h-14 rounded-full bg-destructive text-white font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {cancelling
                    ? <><Loader2 size={17} className="animate-spin" />Removing…</>
                    : 'Yes, leave VANO'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  disabled={cancelling}
                  className="w-full h-14 rounded-full bg-secondary text-foreground font-semibold text-base disabled:opacity-50"
                >
                  Keep my account
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body,
      )}

      {/* Delete account confirmation — requires typing DELETE */}
      {createPortal(
      <AnimatePresence>
        {showDelete && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-navy/45"
              onClick={() => { if (!deleting) setShowDelete(false); }}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              className="fixed bottom-0 inset-x-0 z-50 bg-background rounded-t-3xl px-5 pt-5 pb-10 max-w-sm mx-auto"
            >
              <div className="w-10 h-1 rounded-full bg-border mx-auto mb-6" />
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-destructive/10 mb-4">
                <Trash2 size={22} className="text-destructive" />
              </div>
              <h2 className="text-lg font-bold text-foreground mb-2">Delete your account?</h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                This permanently removes your profile, photo, bio and personal details, disconnects payouts, and takes you off the platform. It can't be undone. Type <span className="font-semibold text-foreground">DELETE</span> to confirm.
              </p>
              <input
                type="text"
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                autoCapitalize="characters"
                autoCorrect="off"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base mb-5 focus:outline-none focus:ring-2 focus:ring-destructive/40 placeholder:text-muted-foreground/40"
              />
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => void handleDeleteAccount()}
                  disabled={deleting || deleteConfirm.trim().toUpperCase() !== 'DELETE'}
                  className="w-full h-14 rounded-full bg-destructive text-white font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {deleting
                    ? <><Loader2 size={17} className="animate-spin" />Deleting…</>
                    : 'Delete my account'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDelete(false)}
                  disabled={deleting}
                  className="w-full h-14 rounded-full bg-secondary text-foreground font-semibold text-base disabled:opacity-50"
                >
                  Keep my account
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body,
      )}
    </div>
  );
};

export default StudentAccount;
