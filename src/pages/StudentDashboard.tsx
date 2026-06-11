import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Clock, CheckCircle2, MapPin, Loader2, Star, Zap, ShoppingCart, PawPrint, Leaf, Package, Sparkles, GraduationCap, Camera, ImagePlus, AlertTriangle, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/logo.png';

// ── Profile sheet data ─────────────────────────────────────────────────────────
const PROFILE_CATEGORIES = [
  { id: 'shopping',  label: 'Shopping'  },
  { id: 'dog-walk',  label: 'Dog walk'  },
  { id: 'garden',    label: 'Garden'    },
  { id: 'moving',    label: 'Moving'    },
  { id: 'cleaning',  label: 'Cleaning'  },
  { id: 'tutoring',  label: 'Tutoring'  },
  { id: 'other',     label: 'Other'     },
];

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
  shopping: 'Shopping run',
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

  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<'available' | 'mine' | 'earnings'>('available');
  const [availableJobs, setAvailableJobs] = useState<Booking[]>([]);
  const [myJobs, setMyJobs] = useState<Booking[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  // Availability toggle — only shown when the user has a linked household_helpers row
  const [helperId, setHelperId] = useState<string | null>(null);
  const [helperAvailable, setHelperAvailable] = useState<boolean | null>(null);
  const [helperCity, setHelperCity] = useState<string | null>(null);
  const [helperCategories, setHelperCategories] = useState<string[]>([]);
  const [togglingAvailable, setTogglingAvailable] = useState(false);
  const [helperName, setHelperName] = useState<string | null>(null);
  const [helperPhoto, setHelperPhoto] = useState<string | null>(null);
  const [helperBio,   setHelperBio]   = useState<string | null>(null);
  const [helperAvailability, setHelperAvailability] = useState<string[]>([]);
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
      if (!session?.user) { navigate('/auth', { replace: true, state: { from: '/student-dashboard' } }); return; }
      if (cancelled) return;
      const uid = session.user.id;
      setUserId(uid);

      // Load helper profile first so we can filter jobs by city + categories
      const { data: helperRow } = await hdb
        .from('household_helpers')
        .select('id, name, photo_url, is_available, city, categories, availability, bio, average_rating, rating_count')
        .eq('user_id', uid)
        .maybeSingle();

      const city = (helperRow?.city as string | null) ?? null;
      const categories = (helperRow?.categories as string[] | null) ?? [];
      if (!cancelled && helperRow) {
        setHelperId(helperRow.id as string);
        setHelperAvailable(helperRow.is_available as boolean);
        setHelperCity(city);
        setHelperCategories(categories);
        setHelperName((helperRow.name as string | null) ?? null);
        setHelperPhoto((helperRow.photo_url as string | null) ?? null);
        setHelperBio((helperRow.bio as string | null) ?? null);
        setHelperAvailability((helperRow.availability as string[] | null) ?? []);
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

  const toggleAvailable = async () => {
    if (!helperId || helperAvailable === null || togglingAvailable) return;
    setTogglingAvailable(true);
    const next = !helperAvailable;
    const { error } = await hdb
      .from('household_helpers')
      .update({ is_available: next })
      .eq('id', helperId);
    if (!error) setHelperAvailable(next);
    setTogglingAvailable(false);
  };

  const acceptJob = async (jobId: string) => {
    if (!userId) return;
    setAccepting(jobId);
    // Use .select('id') so we can detect a race — if data is empty, someone else got there first
    const { data: claimed, error } = await hdb
      .from('household_bookings')
      .update({ student_id: userId, status: 'accepted' })
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
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const anonKey     = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        const { data: { session: s } } = await supabase.auth.getSession();
        const fd = new FormData();
        fd.append('photo', photoFile);
        fd.append('bio', profileBio.trim());
        fd.append('availability', JSON.stringify(profileAvail));
        const res = await fetch(`${supabaseUrl}/functions/v1/update-helper-profile`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${s?.access_token ?? anonKey}`, apikey: anonKey },
          body: fd,
        });
        const json = await res.json() as { photo_url?: string };
        if (json.photo_url) {
          newPhotoUrl = json.photo_url;
          setHelperPhoto(newPhotoUrl);
          setPhotoPreview(newPhotoUrl);
        }
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
      const { error } = await supabase.functions.invoke('cancel-helper-subscription');
      if (error) throw error;
      await supabase.auth.signOut();
      navigate('/', { replace: true });
    } catch {
      toast({ title: 'Could not cancel automatically', description: 'WhatsApp us on +353 89 981 7111 and we\'ll remove you straight away.', variant: 'destructive' });
      setLeaving(false);
      setShowLeave(false);
    }
  };

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

      <main className="pt-16 max-w-sm mx-auto px-4">
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
                  'mt-1 flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold border transition-all duration-200 flex-shrink-0',
                  helperAvailable
                    ? 'bg-sage/10 text-sage border-sage/30'
                    : 'bg-secondary text-muted-foreground border-border',
                )}
              >
                {togglingAvailable ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <span className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    helperAvailable ? 'bg-sage animate-pulse' : 'bg-muted-foreground/40',
                  )} />
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
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-secondary rounded-2xl mb-5">
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
                  <EmptyState message="No open jobs right now. Check back soon." />
                ) : (
                  <div className="flex flex-col gap-3">
                    {availableJobs.map((job, i) => (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="rounded-2xl border border-border/60 bg-background p-4"
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
                            <span className="text-lg font-bold text-foreground tabular-nums flex-shrink-0">
                              €{(job.price_estimate_cents / 100).toFixed(0)}
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
                          className="w-full h-11 rounded-xl bg-sage text-white font-semibold text-sm transition-[background-color,opacity] duration-150 hover:bg-sage-dark disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2"
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
                  <EmptyState message="No active jobs. Accept one from the available tab." />
                ) : (
                  <div className="flex flex-col gap-3">
                    {myJobs.map((job, i) => (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <button
                          onClick={() => navigate(`/student-job/${job.id}`)}
                          className="w-full rounded-2xl border border-border/60 bg-background p-4 text-left transition-colors hover:bg-secondary/40 active:scale-[0.99]"
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
              <div className="pb-10">
                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="rounded-2xl bg-sage-light border border-sage/20 p-4">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Paid out</p>
                    <p className="text-2xl font-bold text-foreground tabular-nums">
                      €{(totalEarned / 100).toFixed(0)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-secondary border border-border/40 p-4">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Pending</p>
                    <p className="text-2xl font-bold text-foreground tabular-nums">
                      €{(pendingEarned / 100).toFixed(0)}
                    </p>
                  </div>
                </div>

                {/* Payout list */}
                {payouts.length === 0 ? (
                  <EmptyState message="No earnings yet. Complete jobs to get paid." />
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
                  <p className="text-base font-bold text-foreground mt-3">{helperName}</p>
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

                  {/* Categories */}
                  <section>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Jobs I do</p>
                    <div className="flex flex-wrap gap-2">
                      {PROFILE_CATEGORIES.map(({ id, label }) => {
                        const active = profileCats.includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setProfileCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])}
                            className={cn(
                              'px-3.5 py-1.5 rounded-full text-sm font-medium border transition-[background-color,border-color,color] duration-150',
                              active
                                ? 'bg-sage text-white border-sage'
                                : 'bg-background text-foreground border-border hover:border-sage/60',
                            )}
                          >
                            {label}
                          </button>
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

                  {/* Subscription */}
                  <section>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Subscription</p>
                    <div className="rounded-2xl border border-border/60 px-4 py-3.5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">VANO membership</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Active plan</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowLeave(true)}
                        className="text-xs text-destructive font-semibold px-3 py-1.5 rounded-lg border border-destructive/30 bg-destructive/5 active:scale-95 transition-transform"
                      >
                        Cancel
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
                This will cancel your monthly subscription and remove you from the platform. Any pending payouts will still be transferred.
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

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mb-3">
      <CheckCircle2 size={22} className="text-muted-foreground/40" strokeWidth={1.5} />
    </div>
    <p className="text-sm text-muted-foreground max-w-[200px] leading-relaxed">{message}</p>
  </div>
);

export default StudentDashboard;
