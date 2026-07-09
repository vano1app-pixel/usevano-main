import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Clock, CheckCircle2, MapPin, Loader2, Star, Zap, ShoppingCart, PawPrint, Leaf, Package, Sparkles, GraduationCap, Camera, ImagePlus, AlertTriangle, X, Check, Inbox, Wallet, MessageCircle, Phone, BadgeCheck, ShieldCheck, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { HouseholdHelperVanoPayCard } from '@/components/HouseholdHelperVanoPayCard';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useCountUp } from '@/hooks/useCountUp';
import { haptic } from '@/lib/haptics';
import { teamWhatsAppHref, teamTelHref } from '@/lib/contact';
import { SKILL_GROUPS, toggleGroup, toggleSub } from '@/lib/helperSkills';
import logo from '@/assets/logo.png';

// ── Profile sheet data ─────────────────────────────────────────────────────────
// "Jobs I do" uses the shared SKILL_GROUPS model (groups + sub-skills), the
// same picker as the join form and /student-account — the old flat list here
// mislabelled `shopping` ("Shopping" vs the Laundry customers book), missed
// handyman/errands entirely, and left sub-skills orphaned when a group was
// deselected (dispatch matches on the parent slug, so an orphan is invisible).

const PROFILE_SLOTS = [
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

// ── Crop constants ─────────────────────────────────────────────────────────────
const CROP_D = 260;
const CROP_R = CROP_D / 2;
const OUTPUT_SIZE = 400;

// Household tables not yet in generated types — remove once migration is applied and types are regenerated
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hdb = supabase as any;

interface Booking {
  id: string;
  category: string;
  scheduled_date: string;
  time_slot: string;
  is_express: boolean;
  status: string;
  customer_name: string;
  customer_address: string;
  price_estimate_cents: number | null;
  student_id: string | null;
  created_at: string;
}

interface Payout {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Laundry',
  'dog-walk': 'Dog walk',
  garden: 'Garden help',
  moving: 'Moving help',
  cleaning: 'Cleaning',
  tutoring: 'Tutoring',
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  shopping:  <ShoppingCart size={13} />,
  'dog-walk': <PawPrint size={13} />,
  garden:    <Leaf size={13} />,
  moving:    <Package size={13} />,
  cleaning:  <Sparkles size={13} />,
  tutoring:  <GraduationCap size={13} />,
  other:     <Zap size={13} />,
};

const SLOT_LABELS: Record<string, string> = {
  morning: 'Morning · 8am–12pm',
  afternoon: 'Afternoon · 12–5pm',
  evening: 'Evening · 5–8pm',
};

function formatDate(d: string): string {
  const lower = d.toLowerCase();
  if (lower === 'today') return 'Today';
  if (lower === 'tomorrow') return 'Tomorrow';
  if (lower === 'flexible' || lower === 'this weekend' || lower === 'next week') return d;
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString('en-IE', { weekday: 'short', month: 'short', day: 'numeric' });
}

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  // Job alerts — jobs go to the fastest helper, and email is too slow.
  // Dispatch sends web push to subscribed helpers the second a job lands.
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, permission: pushPermission, loading: pushLoading, subscribe: pushSubscribe } = usePushNotifications();

  const [userId, setUserId] = useState<string | null>(null);
  // Honor ?tab=earnings (e.g. the post-signup "set up payouts" link) and
  // ?payout=done|refresh (Stripe Connect onboarding return) by opening
  // straight on the Earnings tab where the payout card lives.
  const initialTab = (() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'earnings' || params.get('payout')) return 'earnings' as const;
    return 'available' as const;
  })();
  const [tab, setTab] = useState<'available' | 'mine' | 'earnings'>(initialTab);
  const [availableJobs, setAvailableJobs] = useState<Booking[]>([]);
  const [myJobs, setMyJobs] = useState<Booking[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  // Availability toggle — only shown when the user has a linked household_helpers row
  const [helperId, setHelperId] = useState<string | null>(null);
  // Needed by cancel-helper-subscription, which verifies phone against helper_id
  const [helperPhone, setHelperPhone] = useState<string | null>(null);
  const [helperAvailable, setHelperAvailable] = useState<boolean | null>(null);
  const [helperCity, setHelperCity] = useState<string | null>(null);
  const [helperCategories, setHelperCategories] = useState<string[]>([]);
  const [togglingAvailable, setTogglingAvailable] = useState(false);
  const [autopilotOptIn, setAutopilotOptIn] = useState<boolean | null>(null);
  const [togglingAutopilot, setTogglingAutopilot] = useState(false);
  const [helperName, setHelperName] = useState<string | null>(null);
  const [helperPhoto, setHelperPhoto] = useState<string | null>(null);
  const [helperBio,   setHelperBio]   = useState<string | null>(null);
  const [helperAvailability, setHelperAvailability] = useState<string[]>([]);
  // ✓ Verified badge state — null until the row loads, so no nudge flashes
  // at someone who's already verified.
  const [helperEmailVerified, setHelperEmailVerified] = useState<boolean | null>(null);
  const [helperIdVerified,    setHelperIdVerified]    = useState<boolean | null>(null);
  const [helperPlanActive,    setHelperPlanActive]    = useState<boolean | null>(null);
  const [helperAvgRating, setHelperAvgRating] = useState<number | null>(null);
  const [helperRatingCount, setHelperRatingCount] = useState(0);

  const loadData = useCallback(async (uid: string, city?: string | null, categories?: string[]) => {
    let availableQuery = hdb
      .from('household_bookings')
      .select('id, category, scheduled_date, time_slot, is_express, status, customer_address, city, price_estimate_cents, student_id, created_at')
      .eq('status', 'pending')
      .is('student_id', null)
      .order('created_at', { ascending: false })
      .limit(30);
    if (city) availableQuery = availableQuery.eq('city', city);
    if (categories && categories.length > 0) availableQuery = availableQuery.in('category', categories);

    const [available, mine, earnedPayouts] = await Promise.all([
      availableQuery,
      hdb.from('household_bookings')
        .select('*')
        .eq('student_id', uid)
        .not('status', 'in', '(pending,cancelled)')
        .order('created_at', { ascending: false })
        .limit(20),
      hdb.from('household_payouts')
        .select('*')
        .eq('student_id', uid)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (available.data) setAvailableJobs(available.data as Booking[]);
    if (mine.data) setMyJobs(mine.data as Booking[]);
    if (earnedPayouts.data) setPayouts(earnedPayouts.data as Payout[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      // No auth session → this is a phone-gated helper (the free-to-join
      // default: most helpers never create a Supabase auth account). The
      // dashboard is auth-only, so send them to their real home — the
      // phone-gated /student-account — NOT the legacy /auth marketplace page
      // (old "Continue with Google" freelancer sign-in), which is a dead end
      // for a helper who never had a Google-linked account. `replace` so a
      // back-tap doesn't bounce them straight back here.
      if (!session?.user) { navigate('/student-account', { replace: true }); return; }
      if (cancelled) return;
      const uid = session.user.id;
      setUserId(uid);

      // Load helper profile first so we can filter jobs by city + categories
      const HELPER_SELECT = 'id, name, phone, photo_url, is_available, city, categories, availability, bio, average_rating, rating_count, autopilot_opt_in, student_email_verified, id_verified, verified_plan_active';
      let { data: helperRow } = await hdb
        .from('household_helpers')
        .select(HELPER_SELECT)
        .eq('user_id', uid)
        .maybeSingle();

      // First sign-in after approval: this account isn't linked to a helper row
      // yet. Link it by the verified email, then re-read. Non-blocking.
      if (!helperRow && !cancelled) {
        try {
          const { data: linkRes } = await supabase.functions.invoke('link-helper-account');
          if ((linkRes as { linked?: boolean } | null)?.linked) {
            const retry = await hdb.from('household_helpers').select(HELPER_SELECT).eq('user_id', uid).maybeSingle();
            helperRow = retry.data;
          }
        } catch { /* non-blocking — dashboard still loads available jobs */ }
      }

      const city = (helperRow?.city as string | null) ?? null;
      const categories = (helperRow?.categories as string[] | null) ?? [];
      if (!cancelled && helperRow) {
        setHelperId(helperRow.id as string);
        setHelperPhone((helperRow.phone as string | null) ?? null);
        setHelperAvailable(helperRow.is_available as boolean);
        setHelperCity(city);
        setHelperCategories(categories);
        setHelperName((helperRow.name as string | null) ?? null);
        setHelperPhoto((helperRow.photo_url as string | null) ?? null);
        setHelperBio((helperRow.bio as string | null) ?? null);
        setHelperAvailability((helperRow.availability as string[] | null) ?? []);
        setHelperEmailVerified(!!helperRow.student_email_verified);
        setHelperIdVerified(!!helperRow.id_verified);
        setHelperPlanActive(!!helperRow.verified_plan_active);
        setAutopilotOptIn((helperRow.autopilot_opt_in as boolean | null) ?? false);
        const avgRating = (helperRow.average_rating as number | null) ?? null;
        const ratingCount = (helperRow.rating_count as number) ?? 0;
        if (avgRating !== null && ratingCount > 0) {
          setHelperAvgRating(avgRating);
          setHelperRatingCount(ratingCount);
        }
      }

      await loadData(uid, city, categories);
    };
    void run();
    return () => { cancelled = true; };
  }, [navigate, loadData]);

  // Autopilot claim result — accept-autopilot-plan redirects here with
  // ?autopilot=claimed|mine|taken|expired|gone. Toast it once, then strip it
  // so it doesn't re-fire on refresh.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const a = params.get('autopilot');
    if (!a) return;
    const messages: Record<string, { title: string; description?: string; variant?: 'destructive' }> = {
      claimed: { title: "🎉 You're their regular now!", description: "We'll be in touch to schedule your first visit." },
      mine:    { title: 'Already yours', description: 'You had already claimed this regular client.' },
      taken:   { title: 'Just missed it', description: 'Another helper claimed this one first.', variant: 'destructive' },
      expired: { title: 'That offer expired', description: 'The link is no longer valid.', variant: 'destructive' },
      gone:    { title: 'No longer available', description: 'That plan is no longer active.', variant: 'destructive' },
    };
    const m = messages[a];
    if (m) toast(m);
    params.delete('autopilot');
    const qs = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [toast]);

  const toggleAvailable = async () => {
    if (!helperId || helperAvailable === null || togglingAvailable) return;
    setTogglingAvailable(true);
    const next = !helperAvailable;
    const { error } = await hdb
      .from('household_helpers')
      .update({ is_available: next })
      .eq('id', helperId);
    if (!error) {
      setHelperAvailable(next);
      // Going on-duty is the helper's most important action — confirm it with
      // a haptic tap (firmer when going live) and a short reassurance toast.
      haptic(next ? 16 : 8);
      if (next) toast({ title: "You're live", description: 'New jobs near you will reach you first.' });
    }
    setTogglingAvailable(false);
  };

  const toggleAutopilot = async () => {
    if (!helperId || autopilotOptIn === null || togglingAutopilot) return;
    setTogglingAutopilot(true);
    const next = !autopilotOptIn;
    const { error } = await hdb
      .from('household_helpers')
      .update({ autopilot_opt_in: next })
      .eq('id', helperId);
    if (!error) {
      setAutopilotOptIn(next);
      haptic(next ? 16 : 8);
      toast(next
        ? { title: "You're in for regulars 🔁", description: "We'll offer you weekly/monthly House Autopilot clients — first to claim keeps them." }
        : { title: 'Opted out of regulars', description: "You won't be offered new House Autopilot clients." });
    } else {
      toast({ title: 'Could not update', description: 'Please try again.', variant: 'destructive' });
    }
    setTogglingAutopilot(false);
  };

  const acceptJob = async (jobId: string) => {
    if (!userId) return;
    setAccepting(jobId);
    // Use .select('id') so we can detect a race — if data is empty, someone else got there first
    const { data: claimed, error } = await hdb
      .from('household_bookings')
      // Stamp accepted_at like accept-job does, so sweep-stalled-jobs (which
      // clocks a ghosting helper from accepted_at) can still catch a job
      // claimed here in-app rather than via the one-tap link.
      .update({ student_id: userId, status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('status', 'pending')
      .is('student_id', null)
      .select('id');

    if (error || !claimed?.length) {
      toast({ title: 'Job just taken', description: 'Someone else got there first — try another job.', variant: 'destructive' });
      setAccepting(null);
      void loadData(userId, helperCity, helperCategories);
      return;
    }

    // Log accepted update so TrackBooking stepper shows "Booking confirmed" immediately
    void hdb.from('household_job_updates').insert({ booking_id: jobId, status: 'accepted' });
    // Email the customer + admin fire-and-forget, then go to the job detail
    void supabase.functions.invoke('notify-household-accepted', { body: { booking_id: jobId } });
    navigate(`/student-job/${jobId}?claimed=1`);
  };

  // ── Profile sheet state ─────────────────────────────────────────────────────
  const [showProfile,    setShowProfile]    = useState(false);
  const [profileBio,     setProfileBio]     = useState('');
  const [profileCats,    setProfileCats]    = useState<string[]>([]);
  const [profileAvail,   setProfileAvail]   = useState<string[]>([]);
  const [profileSaving,  setProfileSaving]  = useState(false);
  const [profileSaved,   setProfileSaved]   = useState(false);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [showLeave,      setShowLeave]      = useState(false);
  const [leaving,        setLeaving]        = useState(false);

  // Photo / crop state
  const fileRef    = useRef<HTMLInputElement>(null);
  const cameraRef  = useRef<HTMLInputElement>(null);
  const imgRef     = useRef<HTMLImageElement>(null);
  const cropAreaRef = useRef<HTMLDivElement>(null);
  const naturalSize = useRef({ w: 0, h: 0 });
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDist  = useRef<number | null>(null);
  const [photoFile,    setPhotoFile]    = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [cropSrc,      setCropSrc]      = useState<string | null>(null);
  const [cropScale,    setCropScale]    = useState(1);
  const [minCropScale, setMinCropScale] = useState(0.1);
  const [cropOffset,   setCropOffset]   = useState({ x: 0, y: 0 });

  // Sync profile sheet fields when helper data loads
  useEffect(() => {
    if (helperPhoto !== null) setPhotoPreview(helperPhoto);
  }, [helperPhoto]);

  const openProfile = () => {
    setProfileBio(helperBio ?? '');
    setProfileCats(helperCategories);
    setProfileAvail(helperAvailability);
    setPhotoPreview(helperPhoto);
    setPhotoFile(null);
    setProfileSaved(false);
    setShowProfile(true);
  };

  const clampOffset = useCallback((x: number, y: number, scale: number) => {
    const { w, h } = naturalSize.current;
    const maxX = Math.max(0, (w * scale) / 2 - CROP_R);
    const maxY = Math.max(0, (h * scale) / 2 - CROP_R);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setCropSrc(URL.createObjectURL(file));
    setShowPhotoSheet(false);
  };

  const onCropImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    naturalSize.current = { w: img.naturalWidth, h: img.naturalHeight };
    const s = Math.max(CROP_D / img.naturalWidth, CROP_D / img.naturalHeight);
    setMinCropScale(s);
    setCropScale(s * 1.1);
    setCropOffset({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastPinchDist.current = null;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const ptr = activePointers.current;
    if (!ptr.has(e.pointerId)) return;
    const prev = ptr.get(e.pointerId)!;
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptr.size === 1) {
      setCropOffset(o => clampOffset(o.x + (e.clientX - prev.x), o.y + (e.clientY - prev.y), cropScale));
    } else if (ptr.size === 2) {
      const pts = Array.from(ptr.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinchDist.current !== null) setCropScale(s => Math.max(minCropScale, s * (dist / lastPinchDist.current!)));
      lastPinchDist.current = dist;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) lastPinchDist.current = null;
  };

  const confirmCrop = () => {
    const img  = imgRef.current;
    const area = cropAreaRef.current;
    if (!img || !area) return;
    const imgRect  = img.getBoundingClientRect();
    const areaRect = area.getBoundingClientRect();
    const cx = areaRect.left + areaRect.width  / 2;
    const cy = areaRect.top  + areaRect.height / 2;
    const scaleX = img.naturalWidth  / imgRect.width;
    const scaleY = img.naturalHeight / imgRect.height;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE; canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img,
      (cx - CROP_R - imgRect.left) * scaleX, (cy - CROP_R - imgRect.top) * scaleY,
      CROP_D * scaleX, CROP_D * scaleY,
      0, 0, OUTPUT_SIZE, OUTPUT_SIZE,
    );
    canvas.toBlob(blob => {
      if (!blob) return;
      setPhotoFile(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
      setPhotoPreview(URL.createObjectURL(blob));
      setCropSrc(null);
    }, 'image/jpeg', 0.9);
  };

  const handleProfileSave = async () => {
    if (!userId || !helperId) return;
    setProfileSaving(true);
    try {
      let newPhotoUrl = helperPhoto;

      if (photoFile) {
        // update-helper-profile authenticates by the helper's phone number —
        // without it the function 400s and the photo silently never saved.
        if (!helperPhone) throw new Error('missing phone');
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const anonKey     = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        const { data: { session: s } } = await supabase.auth.getSession();
        const fd = new FormData();
        fd.append('phone', helperPhone);
        fd.append('photo', photoFile);
        fd.append('bio', profileBio.trim());
        fd.append('availability', JSON.stringify(profileAvail));
        const res = await fetch(`${supabaseUrl}/functions/v1/update-helper-profile`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${s?.access_token ?? anonKey}`, apikey: anonKey },
          body: fd,
        });
        const json = await res.json() as { success?: boolean; photo_url?: string };
        if (!res.ok || !json.success || !json.photo_url) throw new Error('photo upload failed');
        newPhotoUrl = json.photo_url;
        setHelperPhoto(newPhotoUrl);
        setPhotoPreview(newPhotoUrl);
        setPhotoFile(null);
      }

      const { error } = await hdb
        .from('household_helpers')
        .update({ bio: profileBio.trim() || null, categories: profileCats, availability: profileAvail, ...(newPhotoUrl !== helperPhoto ? { photo_url: newPhotoUrl } : {}) })
        .eq('user_id', userId);
      if (error) throw error;

      setHelperCategories(profileCats);
      setHelperBio(profileBio.trim() || null);
      setHelperAvailability(profileAvail);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch {
      toast({ title: 'Could not save', description: 'Try again or contact support.', variant: 'destructive' });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      // The function verifies the phone against the helper row — calling it
      // with no body 400s every time, which is why cancel used to "not work".
      if (!helperId || !helperPhone) throw new Error('missing helper identity');
      const { error } = await supabase.functions.invoke('cancel-helper-subscription', {
        body: { helper_id: helperId, phone: helperPhone },
      });
      if (error) throw error;
      await supabase.auth.signOut();
      navigate('/', { replace: true });
    } catch {
      toast({ title: 'Could not cancel automatically', description: 'WhatsApp us on +353 89 981 7111 and we\'ll remove you straight away.', variant: 'destructive' });
      setLeaving(false);
      setShowLeave(false);
    }
  };

  // ✓ Verified = confirmed student email + Stripe ID check + the €2/month
  // plan — mirrors /student-account. One nudge at a time: the badge first
  // (it's the one with a real perk — verified helpers are offered jobs
  // first), then profile completeness (bio + availability are skipped by
  // design at signup).
  const verificationKnown = helperEmailVerified !== null && helperIdVerified !== null;
  const vanoVerified = !!helperEmailVerified && !!helperIdVerified && !!helperPlanActive;
  const profileIncomplete = !helperBio || helperAvailability.length === 0;

  const totalEarned = payouts
    .filter((p) => p.status === 'transferred')
    .reduce((sum, p) => sum + p.amount_cents, 0);

  const pendingEarned = payouts
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + p.amount_cents, 0);

  const TABS = [
    { id: 'available' as const, label: 'Available', count: availableJobs.length },
    { id: 'mine' as const,      label: 'My jobs',   count: myJobs.filter((j) => j.status !== 'completed').length },
    { id: 'earnings' as const,  label: 'Earnings',  count: null },
  ];

  return (
    <div className="min-h-dvh bg-background">
      <SEOHead title="Student dashboard — VANO" description="Pick up household jobs near you." noindex />

      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 h-16 flex items-center justify-between px-4 bg-background/95 backdrop-blur-xl border-b border-border/50">
        <div className="w-16" />
        <button
          onClick={openProfile}
          className="flex flex-col items-center gap-0.5"
          aria-label="My profile"
        >
          <img src={logo} alt="VANO" className="h-6 w-auto" />
          {(helperName || helperPhoto) && (
            <div className="flex items-center gap-1">
              {helperPhoto ? (
                <img src={helperPhoto} className="w-3.5 h-3.5 rounded-full object-cover flex-shrink-0" alt="" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full bg-sage/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[7px] font-bold text-sage leading-none">{helperName?.[0]?.toUpperCase()}</span>
                </div>
              )}
              <span className="text-[10px] text-muted-foreground font-medium leading-none">{helperName?.split(' ')[0]}</span>
            </div>
          )}
        </button>
        <div className="w-16" />
      </header>

      {/* Phone-width on mobile (the app feel), widening into a real desktop
          dashboard on large screens so jobs tile instead of stacking in a
          thin ribbon. */}
      <main className="pt-16 max-w-sm lg:max-w-5xl mx-auto px-4 lg:px-8">
        {/* Page title */}
        <div className="pt-6 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Pick up jobs near you</p>
            </div>
            {helperAvailable !== null && (
              <button
                onClick={() => void toggleAvailable()}
                disabled={togglingAvailable}
                className={cn(
                  'mt-1 flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold border transition-all duration-200 flex-shrink-0 active:scale-95',
                  helperAvailable
                    ? 'bg-sage/10 text-sage border-sage/30'
                    : 'bg-secondary text-muted-foreground border-border',
                )}
              >
                {togglingAvailable ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : helperAvailable ? (
                  // Live: a "breathing" dot with a ping ring, springing in the
                  // moment the helper flips on (re-keyed so it pops on toggle).
                  <motion.span
                    key="on"
                    initial={{ scale: 0.3 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 16 }}
                    className="relative flex h-2 w-2 flex-shrink-0"
                    aria-hidden="true"
                  >
                    <span className="absolute inline-flex h-full w-full rounded-full bg-sage opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-sage" />
                  </motion.span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40 flex-shrink-0" aria-hidden="true" />
                )}
                {helperAvailable ? 'Available' : 'Off duty'}
              </button>
            )}
          </div>
          {helperAvailable === false && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
              <Zap size={11} className="text-amber-500 flex-shrink-0" />
              Go available so new jobs reach you faster
            </p>
          )}
          {autopilotOptIn !== null && (
            <button
              onClick={() => void toggleAutopilot()}
              disabled={togglingAutopilot}
              aria-pressed={autopilotOptIn}
              className={cn(
                'mt-3 w-full flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors duration-150',
                autopilotOptIn ? 'bg-sage/10 border-sage/30' : 'bg-secondary/60 border-border hover:border-border/80',
              )}
            >
              <span className={cn('flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border text-xs leading-none transition-colors', autopilotOptIn ? 'bg-sage border-sage text-white' : 'border-border bg-background text-transparent')}>
                {togglingAutopilot ? <Loader2 size={11} className="animate-spin text-foreground" /> : '✓'}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">🔁 Open to regular clients</span>
                <span className="block text-xs text-muted-foreground leading-snug">Get matched with weekly/monthly House Autopilot homes — first to claim keeps them.</span>
              </span>
            </button>
          )}
        </div>

        {/* Get VANO Verified — the blue tick customers look for. Links to the
            same /verify-helper checks the signup flow uses. */}
        {helperId && verificationKnown && !vanoVerified && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => navigate(`/verify-helper?id=${helperId}${helperName ? `&name=${encodeURIComponent(helperName)}` : ''}`)}
            className="mb-4 w-full rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform lg:max-w-2xl"
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white">
              <ShieldCheck size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
                Get VANO Verified
                <BadgeCheck size={16} className="fill-sky-500 text-white flex-shrink-0" aria-hidden="true" />
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {!helperEmailVerified || !helperIdVerified
                  ? 'Confirm your student email and verify your ID (both free), then €2/month keeps the blue tick on your name — verified helpers get offered jobs first.'
                  : 'Checks done ✓ — activate the €2/month plan to switch your blue tick on. Cancel anytime.'}
              </span>
            </span>
            <ChevronRight size={16} className="text-muted-foreground/50 flex-shrink-0" />
          </motion.button>
        )}

        {/* Finish your profile — bio + availability are deliberately skipped at
            signup ("set those in your dashboard"), so this is where they're
            asked for. Only once the badge is sorted, one nudge at a time. */}
        {helperId && verificationKnown && vanoVerified && profileIncomplete && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            onClick={openProfile}
            className="mb-4 w-full rounded-2xl border border-sage/30 bg-sage-light px-4 py-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform lg:max-w-2xl"
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-sage text-white">
              <Sparkles size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">Finish your profile</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {!helperBio && helperAvailability.length === 0
                  ? "Add a short bio and when you're free — customers see both before they book you."
                  : !helperBio
                    ? 'Add a short bio — customers see it before they book you.'
                    : "Set when you're free so we only offer you jobs that suit."}
              </span>
            </span>
            <ChevronRight size={16} className="text-muted-foreground/50 flex-shrink-0" />
          </motion.button>
        )}

        {/* Job alerts — jobs are first-come-first-served; push is the only
            channel fast enough to win them */}
        {pushSupported && !pushSubscribed && pushPermission !== 'denied' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-4 rounded-2xl border border-sage/30 bg-sage-light p-4 lg:max-w-2xl"
          >
            <div className="flex items-start gap-3">
              <span className="text-xl leading-none flex-shrink-0" aria-hidden="true">🔔</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">Turn on job alerts</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Jobs go to the fastest helper. Get a ping the second one comes in — before the email even lands.
                </p>
                <button
                  onClick={() => {
                    void pushSubscribe().then((ok) => {
                      if (ok) toast({ title: '🔔 Job alerts on', description: "You'll get a notification the moment a job near you comes in." });
                    });
                  }}
                  disabled={pushLoading}
                  className="mt-2.5 h-9 px-4 rounded-full bg-sage text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 transition-opacity"
                >
                  {pushLoading ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                  Enable alerts
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-secondary rounded-2xl mb-5 lg:max-w-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 h-9 rounded-xl text-xs font-semibold transition-[background-color,color] duration-150',
                tab === t.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              {t.count !== null && t.count > 0 && (
                <span className={cn(
                  'ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold',
                  tab === t.id ? 'bg-sage text-white' : 'bg-border text-muted-foreground',
                )}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] as const }}
            >
            {/* Available jobs tab */}
            {tab === 'available' && (
              <div className="pb-10">
                {availableJobs.length === 0 ? (
                  <EmptyState
                    icon={<Inbox size={24} strokeWidth={1.5} />}
                    title="All quiet for now"
                    message="New jobs near you land here the moment they're booked. Keep alerts on to be first."
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {availableJobs.map((job, i) => (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="flex flex-col h-full rounded-2xl border border-border/60 bg-background p-4"
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              {CATEGORY_ICONS[job.category] && (
                                <span className="text-muted-foreground flex-shrink-0">
                                  {CATEGORY_ICONS[job.category]}
                                </span>
                              )}
                              <span className="text-sm font-semibold text-foreground">
                                {CATEGORY_LABELS[job.category] ?? job.category}
                              </span>
                              {job.is_express && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-express-orange/10 text-express-orange border border-express-orange/20">
                                  Express
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(job.scheduled_date)}{job.time_slot ? ` · ${SLOT_LABELS[job.time_slot]}` : ''}
                            </p>
                          </div>
                          {job.price_estimate_cents && (
                            // 85% net — the real payout (job price minus the
                            // 15% platform cut), matching the dispatch offer
                            // and the job-detail earnings figure, so the app
                            // never shows more than what actually lands.
                            <span className="flex flex-col items-end flex-shrink-0">
                              <span className="text-lg font-bold text-foreground tabular-nums">
                                €{Math.floor((job.price_estimate_cents * 0.85) / 100)}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-medium">you keep</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
                          <MapPin size={11} className="flex-shrink-0" />
                          <span className="truncate">{job.customer_address}</span>
                        </div>
                        <button
                          onClick={() => void acceptJob(job.id)}
                          disabled={accepting === job.id}
                          className="mt-auto w-full h-11 rounded-xl bg-sage text-white font-semibold text-sm transition-[background-color,opacity] duration-150 hover:bg-sage-dark disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                          {accepting === job.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : 'Accept job'}
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* My jobs tab */}
            {tab === 'mine' && (
              <div className="pb-10">
                {myJobs.length === 0 ? (
                  <EmptyState
                    icon={<Sparkles size={24} strokeWidth={1.5} />}
                    title="No active jobs"
                    message="Jobs you accept show up here. Grab one from the Available tab to get started."
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {myJobs.map((job, i) => (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <button
                          onClick={() => navigate(`/student-job/${job.id}`)}
                          className="w-full h-full rounded-2xl border border-border/60 bg-background p-4 text-left transition-colors hover:bg-secondary/40 active:scale-[0.99]"
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {CATEGORY_LABELS[job.category] ?? job.category}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDate(job.scheduled_date)}{job.time_slot ? ` · ${SLOT_LABELS[job.time_slot]}` : ''}
                              </p>
                            </div>
                            <StatusPill status={job.status} />
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPin size={11} className="flex-shrink-0" />
                            <span className="truncate">{job.customer_address}</span>
                          </div>
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Earnings tab */}
            {tab === 'earnings' && (
              <div className="pb-10 lg:max-w-2xl">
                {/* Automatic payouts — Stripe Connect setup / status */}
                {userId && (
                  <div className="mb-6">
                    <HouseholdHelperVanoPayCard userId={userId} />
                  </div>
                )}

                {/* Summary cards — totals count up each time the tab opens */}
                <EarningsSummary paidCents={totalEarned} pendingCents={pendingEarned} />

                {/* Payout list */}
                {payouts.length === 0 ? (
                  <EmptyState
                    icon={<Wallet size={24} strokeWidth={1.5} />}
                    title="No earnings yet"
                    message="Finish your first job and your payouts will appear here."
                  />
                ) : (
                  <div className="rounded-2xl border border-border/60 overflow-hidden">
                    {payouts.map((p, i) => (
                      <div
                        key={p.id}
                        className={cn('flex items-center justify-between px-4 py-3.5', i !== payouts.length - 1 && 'border-b border-border/40')}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center',
                            p.status === 'transferred' ? 'bg-sage/10' : 'bg-secondary',
                          )}>
                            {p.status === 'transferred'
                              ? <CheckCircle2 size={15} className="text-sage" />
                              : <Clock size={15} className="text-muted-foreground" />
                            }
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground capitalize">{p.status}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(p.created_at).toLocaleDateString('en-IE', { month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <span className="font-semibold text-sm tabular-nums text-foreground">
                          +€{(p.amount_cents / 100).toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Rating */}
                <div className="mt-5 rounded-2xl border border-border/60 p-4 flex items-center gap-4">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        size={16}
                        className={cn(
                          helperAvgRating !== null && n <= Math.round(helperAvgRating)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-muted-foreground/25',
                        )}
                      />
                    ))}
                  </div>
                  <div>
                    {helperAvgRating !== null && helperRatingCount > 0 ? (
                      <>
                        <p className="text-sm font-semibold text-foreground">
                          {helperAvgRating.toFixed(1)} / 5.0
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {helperRatingCount} {helperRatingCount === 1 ? 'rating' : 'ratings'} from customers
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-foreground">No ratings yet</p>
                        <p className="text-xs text-muted-foreground">Customers rate you after each completed job.</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Need a hand? — straight to a real person, prefilled. */}
        <div className="mt-8 mb-6 rounded-2xl border border-border/60 bg-background p-4 lg:max-w-2xl">
          <p className="text-sm font-semibold text-foreground mb-0.5">Need a hand?</p>
          <p className="text-xs text-muted-foreground mb-3">We're real people in Galway — text or call and we'll help.</p>
          <div className="flex items-center gap-2">
            <a
              href={`${teamWhatsAppHref}?text=${encodeURIComponent(`Hi VANO, I'm a helper${helperName ? ` (${helperName})` : ''} and need a hand.`)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex-1 h-10 rounded-full border border-[#25D366]/40 text-[#25D366] text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-[#25D366]/8 transition-colors"
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp us
            </a>
            <a
              href={teamTelHref}
              className="flex-1 h-10 rounded-full border border-border text-foreground text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-secondary transition-colors"
            >
              <Phone className="w-4 h-4" /> Call us
            </a>
          </div>
        </div>
      </main>

      {/* Hidden file inputs for photo selection */}
      <input ref={fileRef}   type="file" accept="image/*"                     className="sr-only" onChange={handleFileSelected} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleFileSelected} />

      {/* ── Profile sheet ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showProfile && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40"
              onClick={() => setShowProfile(false)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 360 }}
              className="fixed bottom-0 inset-x-0 z-50 bg-background rounded-t-3xl max-w-sm mx-auto flex flex-col"
              style={{ maxHeight: '92dvh' }}
            >
              {/* Drag handle + close */}
              <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-border mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
                <div />
                <button
                  onClick={() => setShowProfile(false)}
                  className="ml-auto w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
                  aria-label="Close"
                >
                  <X size={15} strokeWidth={2.5} className="text-muted-foreground" />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto px-5 pb-6 flex-1">
                {/* Avatar */}
                <div className="flex flex-col items-center pt-2 pb-5">
                  <button
                    type="button"
                    onClick={() => setShowPhotoSheet(true)}
                    className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-border group flex-shrink-0"
                    aria-label="Change photo"
                  >
                    {photoPreview ? (
                      <img src={photoPreview} alt={helperName ?? ''} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-sage/20 flex items-center justify-center">
                        <span className="text-2xl font-bold text-sage">{helperName?.[0]?.toUpperCase()}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/35 flex items-center justify-center opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity">
                      <Camera size={18} className="text-white" />
                    </div>
                  </button>
                  {photoFile && (
                    <p className="text-xs text-primary mt-2 font-medium">New photo ready — tap Save</p>
                  )}
                  <p className="text-base font-bold text-foreground mt-3 flex items-center gap-1.5">
                    {helperName}
                    {vanoVerified && (
                      <BadgeCheck size={18} className="fill-sky-500 text-white flex-shrink-0" aria-label="VANO Verified" />
                    )}
                  </p>
                  {vanoVerified && (
                    <span className="mt-0.5 text-[11px] font-semibold text-sky-600">VANO Verified</span>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">{helperCity}</p>
                </div>

                <div className="space-y-6">
                  {/* Bio */}
                  <section>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">About me</p>
                    <textarea
                      value={profileBio}
                      onChange={e => setProfileBio(e.target.value)}
                      placeholder="e.g. 2nd year Engineering at UCD, love being outdoors"
                      maxLength={120}
                      rows={2}
                      className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                    <p className="text-right text-xs text-muted-foreground mt-1">{profileBio.length}/120</p>
                  </section>

                  {/* Categories — shared groups + sub-skills (see helperSkills) */}
                  <section>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Jobs I do</p>
                    <p className="text-xs text-muted-foreground mb-3">Pick a job type, then tap the specifics you're good at — they show on your profile.</p>
                    <div className="space-y-2">
                      {SKILL_GROUPS.map(group => {
                        const active = profileCats.includes(group.id);
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
                              onClick={() => setProfileCats(prev => toggleGroup(prev, group.id))}
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
                                  const subActive = profileCats.includes(sub.id);
                                  return (
                                    <button
                                      key={sub.id}
                                      type="button"
                                      onClick={() => setProfileCats(prev => toggleSub(prev, group.id, sub.id))}
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

                  {/* Availability */}
                  <section>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">When I'm available</p>
                    <div className="grid grid-cols-2 gap-2">
                      {PROFILE_SLOTS.map(({ id, label }) => {
                        const active = profileAvail.includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setProfileAvail(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])}
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

                  {/* Account — signup is a one-off €2 verification fee, NOT a
                      recurring subscription, so don't call it one here */}
                  <section>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Account</p>
                    <div className="rounded-2xl border border-border/60 px-4 py-3.5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">Helper account</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Approved & active</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowLeave(true)}
                        className="text-xs text-destructive font-semibold px-3 py-1.5 rounded-lg border border-destructive/30 bg-destructive/5 active:scale-95 transition-transform"
                      >
                        Leave VANO
                      </button>
                    </div>
                  </section>
                </div>
              </div>

              {/* Save button */}
              <div className="flex-shrink-0 px-5 pb-8 pt-3 border-t border-border/40 bg-background">
                <button
                  type="button"
                  onClick={() => void handleProfileSave()}
                  disabled={profileSaving}
                  className={cn(
                    'w-full h-14 rounded-full font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-50 transition-all duration-200 active:scale-[0.98]',
                    profileSaved ? 'bg-sage text-white' : 'bg-primary text-primary-foreground',
                  )}
                >
                  {profileSaving ? (
                    <><Loader2 size={17} className="animate-spin" />Saving…</>
                  ) : profileSaved ? (
                    <><Check size={17} />Saved!</>
                  ) : (
                    'Save changes'
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Photo source sheet ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPhotoSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/40"
              onClick={() => setShowPhotoSheet(false)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              className="fixed bottom-0 inset-x-0 z-[60] bg-background rounded-t-3xl px-5 pt-4 pb-10 max-w-sm mx-auto"
            >
              <div className="w-10 h-1 rounded-full bg-border mx-auto mb-5" />
              <p className="text-center text-sm font-semibold text-foreground mb-4">Update photo</p>
              <div className="space-y-2.5">
                <button type="button" onClick={() => cameraRef.current?.click()}
                  className="w-full h-14 rounded-2xl bg-secondary text-foreground text-sm font-medium flex items-center justify-center gap-2.5"
                >
                  <Camera size={17} />Take a photo
                </button>
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full h-14 rounded-2xl bg-secondary text-foreground text-sm font-medium flex items-center justify-center gap-2.5"
                >
                  <ImagePlus size={17} />Choose from library
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Crop modal ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {cropSrc && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
              <button onClick={() => setCropSrc(null)} className="text-sm text-white/70 font-medium">Cancel</button>
              <span className="text-sm font-semibold text-white">Move and scale</span>
              <button onClick={confirmCrop} className="text-sm text-white font-semibold">Use photo</button>
            </div>
            <div
              ref={cropAreaRef}
              className="flex-1 relative overflow-hidden flex items-center justify-center select-none"
              style={{ touchAction: 'none' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <img
                ref={imgRef} src={cropSrc} alt="crop" draggable={false}
                onLoad={onCropImageLoad}
                className="absolute pointer-events-none max-w-none"
                style={{ transform: `translate(${cropOffset.x}px,${cropOffset.y}px) scale(${cropScale})`, transformOrigin: 'center' }}
              />
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }}>
                <defs>
                  <mask id="crop-hole">
                    <rect width="100%" height="100%" fill="white" />
                    <circle cx="50%" cy="50%" r={CROP_R} fill="black" />
                  </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0,0,0,0.62)" mask="url(#crop-hole)" />
                <circle cx="50%" cy="50%" r={CROP_R} fill="none" stroke="white" strokeWidth="1.5" opacity="0.7" />
              </svg>
            </div>
            <div className="px-8 pb-8 pt-4 flex-shrink-0">
              <input type="range" min={minCropScale} max={minCropScale * 4} step={0.005} value={cropScale}
                onChange={e => { const s = parseFloat(e.target.value); setCropScale(s); setCropOffset(o => clampOffset(o.x, o.y, s)); }}
                className="w-full accent-white"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Leave VANO sheet ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showLeave && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/40"
              onClick={() => { if (!leaving) setShowLeave(false); }}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              className="fixed bottom-0 inset-x-0 z-[60] bg-background rounded-t-3xl px-5 pt-5 pb-10 max-w-sm mx-auto"
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
                  disabled={leaving}
                  className="w-full h-14 rounded-full bg-destructive text-white font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {leaving ? <><Loader2 size={17} className="animate-spin" />Removing…</> : 'Yes, leave VANO'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLeave(false)}
                  disabled={leaving}
                  className="w-full h-14 rounded-full bg-secondary text-foreground font-semibold text-base disabled:opacity-50"
                >
                  Keep my account
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const StatusPill = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; className: string }> = {
    accepted:    { label: 'Accepted',     className: 'bg-sage/10 text-sage border-sage/20' },
    on_way:      { label: 'On the way',   className: 'bg-sky-50 text-sky-600 border-sky-200' },
    arrived:     { label: 'Arrived',      className: 'bg-sky-50 text-sky-600 border-sky-200' },
    in_progress: { label: 'In progress',  className: 'bg-amber-50 text-amber-600 border-amber-200' },
    completed:   { label: 'Complete',     className: 'bg-sage/10 text-sage border-sage/20' },
    cancelled:   { label: 'Cancelled',    className: 'bg-destructive/10 text-destructive border-destructive/20' },
  };
  const s = map[status] ?? { label: status, className: 'bg-secondary text-muted-foreground border-border' };
  return (
    <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0', s.className)}>
      {s.label}
    </span>
  );
};

// Earnings totals that count up from zero. Mounted only while the Earnings
// tab is open, so the tick-up replays each time the helper visits it.
const EarningsSummary = ({ paidCents, pendingCents }: { paidCents: number; pendingCents: number }) => {
  const paid = useCountUp(Math.round(paidCents / 100));
  const pending = useCountUp(Math.round(pendingCents / 100));
  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      <div className="rounded-2xl bg-sage-light border border-sage/20 p-4">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Paid out</p>
        <p className="text-2xl font-bold text-foreground tabular-nums">€{paid}</p>
      </div>
      <div className="rounded-2xl bg-secondary border border-border/40 p-4">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Pending</p>
        <p className="text-2xl font-bold text-foreground tabular-nums">€{pending}</p>
      </div>
    </div>
  );
};

const EmptyState = ({ icon, title, message }: { icon?: React.ReactNode; title?: string; message: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-3.5 text-muted-foreground/45">
      {icon ?? <CheckCircle2 size={24} strokeWidth={1.5} />}
    </div>
    {title && <p className="text-sm font-semibold text-foreground mb-1">{title}</p>}
    <p className="text-sm text-muted-foreground max-w-[230px] leading-relaxed">{message}</p>
  </div>
);

export default StudentDashboard;
