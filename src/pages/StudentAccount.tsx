import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertTriangle, Camera, Check, CheckCircle2, ChevronLeft,
  ImagePlus, Loader2, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { HouseholdHelperVanoPayCard } from '@/components/HouseholdHelperVanoPayCard';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/logo.png';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hdb = supabase as any;

const CATEGORIES = [
  { id: 'shopping',  label: 'Shopping'   },
  { id: 'dog-walk',  label: 'Dog walk'   },
  { id: 'garden',    label: 'Garden'     },
  { id: 'moving',    label: 'Moving'     },
  { id: 'cleaning',  label: 'Cleaning'   },
  { id: 'tutoring',  label: 'Online tutoring' },
  { id: 'other',     label: 'Other'      },
];

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
  categories: string[] | null;
  availability: string[] | null;
  status: string;
}

const normalizePhone = (p: string) => p.replace(/[\s\-().+]/g, '').replace(/^0/, '353');
const phonesMatch = (stored: string, entered: string) => {
  const s = normalizePhone(stored);
  const e = normalizePhone(entered);
  return s === e || s.endsWith(e) || e.endsWith(s);
};

const CROP_D = 260;
const CROP_R = CROP_D / 2;
const OUTPUT_SIZE = 400;

const StudentAccount = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // File inputs
  const fileRef   = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Crop refs
  const imgRef         = useRef<HTMLImageElement>(null);
  const cropAreaRef    = useRef<HTMLDivElement>(null);
  const naturalSize    = useRef({ w: 0, h: 0 });
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDist  = useRef<number | null>(null);

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

  const [bio,          setBio]          = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [avail,        setAvail]        = useState<string[]>([]);
  const [photoFile,    setPhotoFile]    = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Phone gate
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [gateInput,     setGateInput]     = useState('');
  const [gateError,     setGateError]     = useState('');
  const [gateLoading,   setGateLoading]   = useState(false);

  // Phone inline edit
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput,   setPhoneInput]   = useState('');
  const [phoneSaving,  setPhoneSaving]  = useState(false);

  // Sheets
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [showConfirm,    setShowConfirm]    = useState(false);

  // Crop
  const [cropSrc,      setCropSrc]      = useState<string | null>(null);
  const [cropScale,    setCropScale]    = useState(1);
  const [minCropScale, setMinCropScale] = useState(0.1);
  const [cropOffset,   setCropOffset]   = useState({ x: 0, y: 0 });

  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  // ── Phone gate ────────────────────────────────────────────────────────────
  const handlePhoneVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const entered = gateInput.trim();
    if (!entered) return;
    setGateLoading(true);
    setGateError('');
    try {
      // Server-side lookup — phone/email aren't readable with the anon key
      const { data, error } = await supabase.functions.invoke('find-helper-by-phone', {
        body: { phone: entered },
      });
      const match = (data as { helper?: HelperRow | null } | null)?.helper ?? null;
      if (error || !match || !phonesMatch(match.phone, entered)) {
        setGateError("That number doesn't match any account. Try again or WhatsApp +353 89 981 7111.");
        setGateLoading(false);
        return;
      }
      loadHelper(match);
    } catch {
      setGateError('Something went wrong. Please try again.');
    } finally {
      setGateLoading(false);
    }
  };

  function loadHelper(data: HelperRow) {
    setHelper(data);
    setBio(data.bio ?? '');
    setSelectedCats(data.categories ?? []);
    setAvail(data.availability ?? []);
    setPhotoPreview(data.photo_url);
    setPhoneInput(data.phone ?? '');
    setPhoneVerified(true);
  }

  // ── Photo selection ────────────────────────────────────────────────────────
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setCropSrc(URL.createObjectURL(file));
    setShowPhotoSheet(false);
  };

  // ── Crop ───────────────────────────────────────────────────────────────────
  const onCropImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    naturalSize.current = { w: img.naturalWidth, h: img.naturalHeight };
    const s = Math.max(CROP_D / img.naturalWidth, CROP_D / img.naturalHeight);
    setMinCropScale(s);
    setCropScale(s * 1.1);
    setCropOffset({ x: 0, y: 0 });
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
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setCropOffset(o => clampOffset(o.x + dx, o.y + dy, cropScale));
    } else if (ptr.size === 2) {
      const pts = Array.from(ptr.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinchDist.current !== null) {
        const ratio = dist / lastPinchDist.current;
        setCropScale(s => Math.max(minCropScale, s * ratio));
      }
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
    const srcX = (cx - CROP_R - imgRect.left) * scaleX;
    const srcY = (cy - CROP_R - imgRect.top)  * scaleY;
    const srcW = CROP_D * scaleX;
    const srcH = CROP_D * scaleY;

    const canvas = document.createElement('canvas');
    canvas.width  = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    canvas.toBlob(blob => {
      if (!blob) return;
      setPhotoFile(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
      setPhotoPreview(URL.createObjectURL(blob));
      setCropSrc(null);
    }, 'image/jpeg', 0.9);
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
      fd.append('phone',     helper.phone);
      fd.append('new_phone', phoneInput.trim());
      const res = await fetch(`${supabaseUrl}/functions/v1/update-helper-profile`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
        body: fd,
      });
      const json = await res.json() as { success?: boolean };
      if (!res.ok || !json.success) throw new Error('Update failed');
      setHelper(h => h ? { ...h, phone: phoneInput.trim() } : h);
      setEditingPhone(false);
    } catch {
      toast({ title: 'Could not save phone number', variant: 'destructive' });
    } finally {
      setPhoneSaving(false);
    }
  };

  const toggleCat  = (id: string) =>
    setSelectedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
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
      fd.append('phone',        helper.phone);
      fd.append('bio',          bio.trim());
      fd.append('availability', JSON.stringify(avail));
      fd.append('categories',   JSON.stringify(selectedCats));
      if (photoFile) fd.append('photo', photoFile);

      const res = await fetch(`${supabaseUrl}/functions/v1/update-helper-profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: fd,
      });
      const json = await res.json() as { success?: boolean; photo_url?: string; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Save failed');

      const photoUrl = json.photo_url ?? helper.photo_url;
      setPhotoFile(null);
      setHelper(h => h
        ? { ...h, bio: bio.trim() || null, categories: selectedCats, availability: avail, photo_url: photoUrl }
        : h,
      );
      setSaved(true);
    } catch {
      toast({ title: 'Could not save', description: 'Try again or contact support.', variant: 'destructive' });
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
        body: JSON.stringify({ helper_id: helper.id, phone: helper.phone }),
      });
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
            <h1 className="text-2xl font-bold text-foreground mb-2">Enter your number</h1>
            <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
              Enter the phone number you signed up with to access your VANO account.
            </p>
            <form onSubmit={handlePhoneVerify} className="space-y-3">
              <input
                type="tel"
                value={gateInput}
                onChange={e => { setGateInput(e.target.value); setGateError(''); }}
                placeholder="+353 87 123 4567"
                autoFocus
                className="w-full h-14 rounded-2xl border border-border bg-background px-4 text-base focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/40"
              />
              {gateError && <p className="text-sm text-destructive">{gateError}</p>}
              <button
                type="submit"
                disabled={gateLoading || !gateInput.trim()}
                className="w-full h-14 rounded-full bg-primary text-primary-foreground font-semibold text-base active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {gateLoading ? <><Loader2 size={17} className="animate-spin" />Looking up…</> : 'Continue →'}
              </button>
            </form>
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
          onClick={() => navigate('/student-dashboard')}
          className="flex items-center justify-center w-8 h-8 -ml-1 rounded-full hover:bg-secondary transition-colors"
          aria-label="Back to dashboard"
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
          <h1 className="text-xl font-bold text-foreground mt-3">{helper.name}</h1>
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
                    <span className="flex-1 text-sm text-foreground">{helper.phone}</span>
                    <button
                      onClick={() => { setPhoneInput(helper.phone); setEditingPhone(true); }}
                      className="text-xs text-primary font-medium"
                    >
                      Edit
                    </button>
                  </>
                )}
              </div>

              {/* Email */}
              <div className="px-4 py-3.5 flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-14 flex-shrink-0">Email</span>
                <span className="flex-1 text-sm text-foreground truncate">{helper.email ?? '—'}</span>
              </div>

              {/* City */}
              <div className="px-4 py-3.5 flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-14 flex-shrink-0">City</span>
                <span className="flex-1 text-sm text-foreground">{helper.city}</span>
              </div>

              {/* Subscription */}
              <div className="px-4 py-3.5 flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-14 flex-shrink-0">Plan</span>
                <span className="flex-1 text-sm text-foreground">Monthly membership</span>
                <button
                  onClick={() => setShowConfirm(true)}
                  className="text-xs text-destructive font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </section>

          {/* Automatic payouts — only for signed-in helpers (RLS-gated reads) */}
          {authUserId && (
            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Payouts</p>
              <HouseholdHelperVanoPayCard userId={authUserId} />
            </section>
          )}

          {/* Jobs */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Jobs I do</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(({ id, label }) => {
                const active = selectedCats.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleCat(id)}
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
        </div>
      </main>

      {/* Fixed save button */}
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
      </div>

      {/* Photo source sheet */}
      <AnimatePresence>
        {showPhotoSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40"
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
      </AnimatePresence>

      {/* Crop modal */}
      <AnimatePresence>
        {cropSrc && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
              <button onClick={() => setCropSrc(null)} className="text-sm text-white/70 font-medium">
                Cancel
              </button>
              <span className="text-sm font-semibold text-white">Move and scale</span>
              <button onClick={confirmCrop} className="text-sm text-white font-semibold">
                Use photo
              </button>
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
                ref={imgRef}
                src={cropSrc}
                alt="crop"
                draggable={false}
                onLoad={onCropImageLoad}
                className="absolute pointer-events-none max-w-none"
                style={{
                  transform: `translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropScale})`,
                  transformOrigin: 'center',
                }}
              />

              {/* Dimmed overlay with circular hole */}
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

            {/* Zoom slider */}
            <div className="px-8 pb-8 pt-4 flex-shrink-0">
              <input
                type="range"
                min={minCropScale}
                max={minCropScale * 4}
                step={0.005}
                value={cropScale}
                onChange={e => {
                  const s = parseFloat(e.target.value);
                  setCropScale(s);
                  setCropOffset(o => clampOffset(o.x, o.y, s));
                }}
                className="w-full accent-white"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leave VANO confirmation sheet */}
      <AnimatePresence>
        {showConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40"
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
                This will cancel your monthly subscription and remove you from the platform. Any pending payouts will still be transferred.
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
      </AnimatePresence>
    </div>
  );
};

export default StudentAccount;
