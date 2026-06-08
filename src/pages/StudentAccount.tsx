import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Camera, Loader2, ChevronLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
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
  { id: 'tutoring',  label: 'Tutoring'   },
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

const StudentAccount = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [helper, setHelper] = useState<HelperRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Phone gate
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const [bio, setBio] = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [avail, setAvail] = useState<string[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { navigate('/auth', { replace: true }); return; }
      setUserId(session.user.id);

      const { data } = await hdb
        .from('household_helpers')
        .select('id, name, phone, email, photo_url, city, bio, categories, availability, status')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (data) {
        setHelper(data as HelperRow);
        setBio(data.bio ?? '');
        setSelectedCats(data.categories ?? []);
        setAvail(data.availability ?? []);
        setPhotoPreview(data.photo_url);
      }
      setLoading(false);
    };
    void run();
  }, [navigate]);

  const handlePhoneVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!helper) return;
    if (phonesMatch(helper.phone, phoneInput.trim())) {
      setPhoneVerified(true);
      setPhoneError('');
    } else {
      setPhoneError("That number doesn't match your account. Try again or WhatsApp +353 89 981 7111.");
    }
  };

  // Reset "saved" tick after 3 seconds
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const toggleCat = (id: string) =>
    setSelectedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);

  const toggleSlot = (id: string) =>
    setAvail(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  const handleSave = async () => {
    if (!helper || !userId) return;
    setSaving(true); setSaved(false);
    try {
      let photoUrl = helper.photo_url;

      // Upload new photo via edge function (uses phone for lookup — safe since we verified user_id)
      if (photoFile) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        const { data: { session } } = await supabase.auth.getSession();
        const fd = new FormData();
        fd.append('phone', helper.phone);
        fd.append('bio', bio.trim());
        fd.append('availability', JSON.stringify(avail));
        fd.append('photo', photoFile);
        const res = await fetch(`${supabaseUrl}/functions/v1/update-helper-profile`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token ?? anonKey}`,
            apikey: anonKey,
          },
          body: fd,
        });
        const json = await res.json() as { success?: boolean; photo_url?: string };
        if (json.photo_url) photoUrl = json.photo_url;
        setPhotoFile(null);
      }

      // Save bio, categories, availability directly via RLS (helpers_update_own policy)
      const { error } = await hdb
        .from('household_helpers')
        .update({
          bio: bio.trim() || null,
          categories: selectedCats,
          availability: avail,
          ...(photoUrl !== helper.photo_url ? { photo_url: photoUrl } : {}),
        })
        .eq('user_id', userId);

      if (error) throw error;

      setHelper(h => h ? { ...h, bio: bio.trim() || null, categories: selectedCats, availability: avail, photo_url: photoUrl } : h);
      setSaved(true);
    } catch {
      toast({ title: 'Could not save', description: 'Try again or contact support.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = async () => {
    setCancelling(true);
    try {
      const { error } = await supabase.functions.invoke('cancel-helper-subscription');
      if (error) throw error;
      await supabase.auth.signOut();
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

  if (!helper) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-base font-semibold text-foreground">No helper account linked</p>
        <p className="text-sm text-muted-foreground">
          <a href="/join" className="underline underline-offset-2 text-primary">Apply to join VANO →</a>
        </p>
      </div>
    );
  }

  // Phone gate — shown until user proves they own this account
  if (!phoneVerified) {
    return (
      <div className="min-h-dvh bg-background">
        <SEOHead title="My account — VANO" description="Manage your VANO helper account." noindex />
        <header className="fixed top-0 inset-x-0 z-50 h-14 flex items-center justify-center px-4 bg-background/95 backdrop-blur-xl border-b border-border/50">
          <img src={logo} alt="VANO" className="h-6 w-auto" />
        </header>
        <div className="min-h-dvh flex flex-col items-center justify-center px-6 pt-14 pb-10">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold text-foreground mb-2">Your account</h1>
            <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
              Enter the phone number you used when you signed up to VANO.
            </p>
            <form onSubmit={handlePhoneVerify} className="space-y-3">
              <input
                type="tel"
                value={phoneInput}
                onChange={e => { setPhoneInput(e.target.value); setPhoneError(''); }}
                placeholder="+353 87 123 4567"
                autoFocus
                className="w-full h-14 rounded-2xl border border-border bg-background px-4 text-base focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/40"
              />
              {phoneError && (
                <p className="text-sm text-destructive">{phoneError}</p>
              )}
              <button
                type="submit"
                className="w-full h-14 rounded-full bg-primary text-primary-foreground font-semibold text-base active:scale-[0.98] transition-transform"
              >
                Continue →
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <SEOHead title="My account — VANO" description="Manage your VANO helper account." noindex />

      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 h-14 flex items-center px-4 bg-background/95 backdrop-blur-xl border-b border-border/50">
        <button
          onClick={() => navigate('/student-dashboard')}
          className="flex items-center justify-center w-8 h-8 -ml-1 rounded-full hover:bg-secondary transition-colors"
          aria-label="Back to dashboard"
        >
          <ChevronLeft size={20} strokeWidth={2} />
        </button>
        <img src={logo} alt="VANO" className="h-6 w-auto mx-auto" />
        <div className="w-8" />
      </header>

      <main className="pt-14 pb-32 max-w-sm mx-auto px-4">
        {/* Profile header */}
        <div className="flex flex-col items-center pt-8 pb-6">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-border flex-shrink-0 group"
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
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={handlePhotoChange} />
          {photoFile && (
            <p className="text-xs text-primary mt-2 font-medium">New photo ready — tap Save to apply</p>
          )}
          <h1 className="text-xl font-bold text-foreground mt-3 mb-1.5">{helper.name}</h1>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="text-xs bg-secondary text-muted-foreground px-2.5 py-1 rounded-full border border-border/40">{helper.phone}</span>
            <span className="text-xs bg-secondary text-muted-foreground px-2.5 py-1 rounded-full border border-border/40">{helper.city}</span>
            <span className={cn(
              'text-xs px-2.5 py-1 rounded-full border font-medium',
              helper.status === 'approved' ? 'bg-sage/10 text-sage border-sage/20' : 'bg-secondary text-muted-foreground border-border/40',
            )}>
              {helper.status === 'approved' ? '✓ Active' : helper.status}
            </span>
          </div>
        </div>

        <div className="space-y-7">
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

          {/* Leave VANO */}
          <section className="pt-4 border-t border-border/40">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Account</p>
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-destructive/20 bg-destructive/5 text-destructive text-sm font-medium hover:bg-destructive/10 transition-colors"
            >
              <AlertTriangle size={15} className="flex-shrink-0" />
              Leave VANO — cancel subscription
            </button>
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
            ) : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Leave confirmation bottom sheet */}
      <AnimatePresence>
        {showConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40"
              onClick={() => { if (!cancelling) setShowConfirm(false); }}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              className="fixed bottom-0 inset-x-0 z-50 bg-background rounded-t-3xl px-5 pt-5 pb-10 max-w-sm mx-auto"
            >
              <div className="w-10 h-1 rounded-full bg-border mx-auto mb-6" />
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-destructive/10 mb-4">
                <AlertTriangle size={22} className="text-destructive" />
              </div>
              <h2 className="text-lg font-bold text-foreground mb-2">Leave VANO?</h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                This will cancel your €2/month subscription and remove you from the platform. Any pending payouts will still be transferred.
              </p>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => void handleLeave()}
                  disabled={cancelling}
                  className="w-full h-14 rounded-full bg-destructive text-white font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {cancelling ? <><Loader2 size={17} className="animate-spin" />Removing…</> : 'Yes, leave VANO'}
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
