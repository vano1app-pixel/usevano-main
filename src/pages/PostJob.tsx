import React, { useState, useEffect, useRef } from 'react';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { Navbar } from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  RefreshCw, Loader2, X,
  Briefcase, MapPin, Euro, Calendar, Tag,
  Phone, MessageCircle, Sparkles, PenLine, ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isEmailVerified } from '@/lib/authSession';
import { TEAM_PHONE_DISPLAY, teamTelHref, teamWhatsAppHref } from '@/lib/contact';

type Mode = 'choose' | 'vano' | 'self';

const PostJob = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const rehireStudentId = searchParams.get('rehire');
  const modeParam = searchParams.get('mode');
  const initialMode = (modeParam === 'vano' || modeParam === 'self') ? modeParam : 'choose';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [rehireStudentName, setRehireStudentName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    location: '',
    fixed_price: '',
    shift_date: '',
    is_urgent: false,
  });

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }

      if (rehireStudentId) {
        const { data: prof } = await supabase.from('profiles').select('display_name').eq('user_id', rehireStudentId).maybeSingle();
        setRehireStudentName(prof?.display_name || 'Student');

        const { data: apps } = await supabase
          .from('job_applications')
          .select('job_id, jobs(*)')
          .eq('student_id', rehireStudentId)
          .eq('status', 'accepted')
          .order('applied_at', { ascending: false })
          .limit(10);

        const myApps = (apps || []).filter((a: any) => a.jobs?.posted_by === session.user.id);
        if (myApps.length > 0) {
          const lastJob = (myApps[0] as any).jobs;
          setForm({
            title: lastJob.title || '',
            description: lastJob.description || '',
            location: lastJob.location || '',
            fixed_price:
              lastJob.payment_type === 'fixed' && lastJob.fixed_price != null
                ? String(lastJob.fixed_price)
                : '',
            shift_date: '',
            is_urgent: false,
          });
          setMode('self');
        }
      }
    };
    init();
  }, [rehireStudentId, navigate]);

  const addTag = (raw: string) => {
    const val = raw.trim().replace(/,+$/, '').trim();
    if (!val) return;
    const formatted = val.charAt(0).toUpperCase() + val.slice(1);
    if (!tags.includes(formatted) && tags.length < 10) {
      setTags((prev) => [...prev, formatted]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); }
    if (e.key === ',') { e.preventDefault(); addTag(tagInput); }
    if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  const geocodeLocation = async (location: string): Promise<{ lat: number; lon: number } | null> => {
    if (!location.trim()) return null;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`,
        { headers: { 'User-Agent': 'VANO-App/1.0' } }
      );
      const data = await res.json();
      if (data.length > 0) {
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Geocoding failed:', err);
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !isEmailVerified(session)) {
      toast({ title: 'Please sign in', description: 'You need to be signed in to post a gig.', variant: 'destructive' });
      setLoading(false);
      navigate('/auth');
      return;
    }

    const coords = await geocodeLocation(form.location);
    if (form.location.trim() && !coords) {
      toast({ title: 'Location not found', description: 'We could not map that location — the gig will still be posted but won\'t appear on the map.', variant: 'destructive' });
    }

    const { data: jobData, error } = await supabase.from('jobs').insert({
      posted_by: session.user.id,
      title: form.title,
      description: form.description,
      location: form.location,
      hourly_rate: 0,
      fixed_price: parseFloat(form.fixed_price) || 0,
      payment_type: 'fixed',
      tags,
      shift_date: form.shift_date,
      shift_start: null,
      shift_end: null,
      work_type: 'remote',
      is_urgent: form.is_urgent,
      latitude: coords?.lat ?? null,
      longitude: coords?.lon ?? null,
    }).select('id').single();

    if (error) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } else {
      if (jobData?.id) {
        supabase.functions.invoke('notify-matched-students', { body: { job_id: jobData.id } }).catch(() => {});
      }
      toast({ title: 'Gig posted!' });
      navigate('/jobs');
    }
    setLoading(false);
  };

  const inputClass = 'w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring';
  const sectionClass = 'rounded-2xl border border-foreground/10 bg-card p-4 sm:p-5 space-y-4 shadow-sm';

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <SEOHead title="Post a Gig – VANO" description="Post a project gig with a fixed budget and deadline." />
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 pt-20 sm:px-6 sm:pt-24 md:px-8">

        {/* ── Choice Screen ── */}
        {mode === 'choose' && (
          <div>
            <header className="mb-8">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Hiring</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                {rehireStudentId ? `Rehire ${rehireStudentName}` : 'How would you like to hire?'}
              </h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                Choose how you want to find your freelancer.
              </p>
            </header>

            {rehireStudentId && rehireStudentName && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-foreground/10 bg-muted/30 p-4">
                <RefreshCw size={18} className="mt-0.5 shrink-0 text-foreground/70" />
                <p className="text-sm text-muted-foreground">
                  Rehiring <span className="font-medium text-foreground">{rehireStudentName}</span>. Set a fresh deadline before posting.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Card 1 — VANO matches */}
              <button
                onClick={() => setMode('vano')}
                className="group flex flex-col gap-3 rounded-2xl border-2 border-primary bg-primary/5 p-5 text-left transition hover:bg-primary/10 active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
                  <Sparkles size={18} />
                </div>
                <div>
                  <p className="font-semibold text-foreground">VANO matches for you</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    We personally find and vet the right freelancer for your project.
                  </p>
                </div>
                <span className="mt-auto inline-block rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                  Recommended
                </span>
              </button>

              {/* Card 2 — Post yourself */}
              <button
                onClick={() => setMode('self')}
                className="group flex flex-col gap-3 rounded-2xl border border-foreground/15 bg-card p-5 text-left transition hover:bg-muted active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <PenLine size={18} className="text-foreground/70" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Post it yourself</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Write your brief and receive applications from freelancers directly.
                  </p>
                </div>
                <span className="mt-auto inline-block rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Self-serve
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── VANO Contact Screen ── */}
        {mode === 'vano' && (
          <div className="space-y-5">
            <button
              onClick={() => initialMode !== 'choose' ? navigate('/jobs') : setMode('choose')}
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <ChevronLeft size={14} /> Back
            </button>

            <header>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Hiring</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">VANO matches for you</h1>
            </header>

            <div className="overflow-hidden rounded-2xl border border-primary/30 shadow-md">
              <div className="bg-primary px-5 py-5">
                <h2 className="text-xl font-bold text-white">Let us find the right person</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-white/75">
                  Tell us what you need — we personally match you with the best freelancer for your project.
                </p>
              </div>
              <div className="space-y-3 bg-primary/90 px-5 pb-5 pt-4">
                {/* 12% commission note */}
                <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/60">Our fee</p>
                  <p className="mt-0.5 text-base font-bold text-white">0% commission</p>
                  <p className="mt-0.5 text-xs text-white/60">Only charged when we find your freelancer — no upfront cost.</p>
                </div>
                <a
                  href={teamTelHref}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-primary shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
                >
                  <Phone size={15} /> Call us — {TEAM_PHONE_DISPLAY}
                </a>
                <a
                  href={teamWhatsAppHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/20 active:scale-[0.98]"
                >
                  <MessageCircle size={15} /> Message on WhatsApp
                </a>
                <p className="pt-0.5 text-center text-[11px] text-white/50">Free consultation · No commitment</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Self-Serve Form ── */}
        {mode === 'self' && (
          <div>
            <button
              onClick={() => initialMode !== 'choose' ? navigate('/jobs') : setMode('choose')}
              className="mb-5 flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <ChevronLeft size={14} /> Back
            </button>

            <header className="mb-8">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Hiring</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                {rehireStudentId ? 'Rehire a freelancer' : 'Post a gig'}
              </h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                {rehireStudentId
                  ? `New gig for ${rehireStudentName} — set budget and deadline, then publish.`
                  : 'Fixed price and a clear due date. Describe the deliverables so freelancers know exactly what to quote against.'}
              </p>
            </header>

            {rehireStudentId && rehireStudentName && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-foreground/10 bg-muted/30 p-4">
                <RefreshCw size={18} className="mt-0.5 shrink-0 text-foreground/70" />
                <p className="text-sm text-muted-foreground">
                  Rehiring <span className="font-medium text-foreground">{rehireStudentName}</span>. Set a fresh deadline before posting.
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* What do you need? */}
              <div className={sectionClass}>
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10">
                    <Briefcase size={14} className="text-violet-400" />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">What do you need?</h2>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Title</label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    required
                    className={inputClass}
                    placeholder="e.g. Logo pack, short promo video, website refresh"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className={cn(inputClass, 'min-h-[120px] resize-y')}
                    placeholder="What needs to be delivered, any files or assets you will share, and what done looks like."
                  />
                </div>
              </div>

              {/* Location */}
              <div className={sectionClass}>
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
                    <MapPin size={14} className="text-blue-400" />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">Location</h2>
                </div>
                <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">
                  City or area (used for search and map). Remote-friendly work is still fine — say so in the description.
                </p>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">City or area</label>
                  <input
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    required
                    className={inputClass}
                    placeholder="e.g. Galway, or Ireland"
                  />
                </div>
              </div>

              {/* Budget */}
              <div className={sectionClass}>
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10">
                    <Euro size={14} className="text-emerald-400" />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">Project budget</h2>
                </div>
                <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">One fixed total for the whole project (EUR).</p>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Total budget</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">€</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={form.fixed_price}
                      onChange={(e) => setForm({ ...form, fixed_price: e.target.value })}
                      required
                      className={cn(inputClass, 'pl-8')}
                      placeholder="350"
                    />
                  </div>
                </div>
              </div>

              {/* Deadline */}
              <div className={sectionClass}>
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10">
                    <Calendar size={14} className="text-orange-400" />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">Deadline</h2>
                </div>
                <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">When you need the work completed.</p>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Due date</label>
                  <input
                    type="date"
                    value={form.shift_date}
                    onChange={(e) => setForm({ ...form, shift_date: e.target.value })}
                    required
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Tags */}
              <div className={sectionClass}>
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-500/10">
                    <Tag size={14} className="text-slate-400" />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Tags <span className="font-normal text-muted-foreground">(optional)</span>
                  </h2>
                </div>
                <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">
                  Type a skill or keyword and press Enter or comma to add. Up to 8 tags.
                </p>
                <div
                  className="flex min-h-[44px] cursor-text flex-wrap gap-1.5 rounded-xl border border-input bg-background px-3 py-2"
                  onClick={() => tagInputRef.current?.focus()}
                >
                  {tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-foreground/8 px-2 py-0.5 text-[12px] font-medium text-foreground">
                      {tag}
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeTag(tag); }} className="text-muted-foreground hover:text-foreground">
                        <X size={11} strokeWidth={2.5} />
                      </button>
                    </span>
                  ))}
                  {tags.length < 10 && (
                    <input
                      ref={tagInputRef}
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      onBlur={() => addTag(tagInput)}
                      placeholder={tags.length === 0 ? 'e.g. Logo Design, Video, React…' : ''}
                      className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                    />
                  )}
                </div>
              </div>

              {/* Urgent toggle */}
              <div className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/[0.06] p-4">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_urgent: !form.is_urgent })}
                  className={cn(
                    'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
                    form.is_urgent ? 'bg-destructive' : 'bg-muted'
                  )}
                  aria-pressed={form.is_urgent}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                      form.is_urgent ? 'left-5' : 'left-0.5'
                    )}
                  />
                </button>
                <div>
                  <p className="text-sm font-medium text-foreground">Mark urgent</p>
                  <p className="text-xs text-muted-foreground">Surfaced to freelancers who filter for ASAP work.</p>
                </div>
              </div>

              <Button type="submit" disabled={loading} size="lg" className="h-12 w-full rounded-xl text-base font-semibold">
                {loading ? <><Loader2 size={16} className="animate-spin" /> Posting…</> : 'Publish gig'}
              </Button>

              <p className="text-center text-[11px] text-muted-foreground">
                Your gig goes live instantly · Matching freelancers get notified
              </p>
            </form>
          </div>
        )}

      </div>
    </div>
  );
};

export default PostJob;
