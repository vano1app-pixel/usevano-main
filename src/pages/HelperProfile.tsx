import React, { useRef, useState } from 'react';
import { Camera, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

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
  id:           string;
  name:         string;
  photo_url:    string;
  bio:          string | null;
  availability: string[] | null;
}

export const HelperProfile: React.FC = () => {
  const [phone,     setPhone]     = useState('');
  const [helper,    setHelper]    = useState<HelperRow | null>(null);
  const [looking,   setLooking]   = useState(false);
  const [notFound,  setNotFound]  = useState(false);

  const [preview,   setPreview]   = useState<string | null>(null);
  const [newPhoto,  setNewPhoto]  = useState<File | null>(null);
  const [avail,     setAvail]     = useState<string[]>([]);
  const [bio,       setBio]       = useState('');

  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setLooking(true); setNotFound(false);
    const { data } = await (supabase as any)
      .from('household_helpers')
      .select('id, name, photo_url, bio, availability')
      .eq('phone', phone.trim())
      .neq('status', 'suspended')
      .maybeSingle();
    setLooking(false);
    if (!data) { setNotFound(true); return; }
    setHelper(data as HelperRow);
    setAvail(data.availability ?? []);
    setBio(data.bio ?? '');
    setPreview(data.photo_url);
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewPhoto(file);
    setPreview(URL.createObjectURL(file));
  }

  function toggleSlot(id: string) {
    setAvail(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!helper) return;
    setSaving(true); setError(null); setSaved(false);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey     = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const { data: { session } } = await supabase.auth.getSession();

      const fd = new FormData();
      fd.append('phone', phone.trim());
      fd.append('bio', bio.trim());
      fd.append('availability', JSON.stringify(avail));
      if (newPhoto) fd.append('photo', newPhoto);

      const res = await fetch(`${supabaseUrl}/functions/v1/update-helper-profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token ?? anonKey}`,
          apikey: anonKey,
        },
        body: fd,
      });

      const json = await res.json() as { success?: boolean; error?: string; photo_url?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Update failed');

      const newPhotoUrl = json.photo_url ?? helper.photo_url;
      setHelper(h => h ? { ...h, photo_url: newPhotoUrl, bio: bio.trim() || null, availability: avail } : h);
      setPreview(newPhotoUrl);
      setNewPhoto(null);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <HouseholdNav />
      <main className="pt-24 pb-16 px-4 max-w-sm mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-1">Your helper profile</h1>
        <p className="text-sm text-muted-foreground mb-8">Update your photo and availability.</p>

        {!helper ? (
          <form onSubmit={lookup} className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground block mb-2">
                Your phone number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="08x xxx xxxx"
                required
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {notFound && <p className="text-xs text-destructive">No helper found with that number.</p>}
            <Button type="submit" disabled={looking} className="w-full rounded-full font-semibold">
              {looking ? <><Loader2 className="w-4 h-4 animate-spin" />Looking up…</> : 'Find my profile →'}
            </Button>
          </form>
        ) : (
          <form onSubmit={save} className="space-y-6">
            {/* Photo */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Profile photo</p>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="relative w-20 h-20 rounded-full border-2 border-dashed border-border overflow-hidden flex-shrink-0 hover:border-primary/50 transition-colors"
                >
                  {preview
                    ? <img src={preview} alt="Profile" className="w-full h-full object-cover" />
                    : <Camera className="w-6 h-6 text-muted-foreground m-auto" />}
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                >
                  {newPhoto ? 'Change photo' : 'Upload new photo'}
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="sr-only" />
            </div>

            {/* Bio */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">What are you studying?</p>
              <input
                type="text"
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="e.g. 2nd year Engineering at UCD"
                maxLength={80}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Availability */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">When are you available?</p>
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
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-secondary/60 border-border/50 text-foreground hover:bg-secondary',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
            {saved && (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle className="w-4 h-4" /> Profile updated!
              </div>
            )}

            <Button type="submit" disabled={saving} className="w-full rounded-full font-semibold">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : 'Save changes'}
            </Button>
          </form>
        )}
      </main>
      <HouseholdFooter />
    </>
  );
};

export default HelperProfile;
