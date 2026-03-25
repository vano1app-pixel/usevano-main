import React, { useState, useEffect } from 'react';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { Navbar } from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { TagBadge } from '@/components/TagBadge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Sparkles, Loader2, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

const COMMON_TAGS = ['Web Design', 'Marketing', 'Graphic Design', 'Writing', 'Tutoring', 'Gardening', 'Cleaning', 'Delivery', 'Photography', 'Video Editing', 'Social Media', 'Admin', 'Odd Jobs'];

const PostJob = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const rehireStudentId = searchParams.get('rehire');
  const [loading, setLoading] = useState(false);
  const [rehireStudentName, setRehireStudentName] = useState('');
  const [form, setForm] = useState({
    title: '', description: '', location: '', hourly_rate: '', fixed_price: '',
    shift_date: '', shift_start: '', shift_end: '', work_type: 'on-site',
    is_urgent: false, payment_type: 'hourly' as 'hourly' | 'fixed',
  });
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [pricingAdvice, setPricingAdvice] = useState<{ suggestedMin: number; suggestedMax: number; reasoning: string } | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/auth'); return; }

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
          const pt = lastJob.payment_type || 'hourly';
          setForm({
            title: lastJob.title || '',
            description: lastJob.description || '',
            location: lastJob.location || '',
            hourly_rate: lastJob.hourly_rate?.toString() || '',
            fixed_price: lastJob.fixed_price?.toString() || '',
            shift_date: '',
            shift_start: lastJob.shift_start ? lastJob.shift_start.slice(0, 5) : '',
            shift_end: lastJob.shift_end ? lastJob.shift_end.slice(0, 5) : '',
            work_type: lastJob.work_type || 'on-site',
            is_urgent: false,
            payment_type: pt === 'fixed' ? 'fixed' : 'hourly',
          });
          setTags(lastJob.tags || []);
        }
      }
    };
    init();
  }, []);

  const setPaymentType = (payment_type: 'hourly' | 'fixed') => {
    setForm((f) => ({
      ...f,
      payment_type,
      ...(payment_type === 'fixed' ? { shift_start: '', shift_end: '' } : {}),
    }));
    if (payment_type === 'fixed') setPricingAdvice(null);
  };

  const toggleTag = (tag: string) => {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  const addCustomTag = () => {
    if (customTag.trim() && !tags.includes(customTag.trim())) {
      setTags([...tags, customTag.trim()]);
      setCustomTag('');
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
      console.warn('Geocoding failed:', err);
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.payment_type === 'hourly') {
      if (!form.shift_start || !form.shift_end) {
        toast({ title: 'Add shift times', description: 'Start and end times are required for hourly gigs.', variant: 'destructive' });
        return;
      }
    }

    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast({ title: 'Please sign in', variant: 'destructive' }); setLoading(false); return; }

    const coords = form.work_type !== 'remote' ? await geocodeLocation(form.location) : null;

    const shift_start = form.payment_type === 'hourly' ? form.shift_start : null;
    const shift_end = form.payment_type === 'hourly' ? form.shift_end : null;

    const { data: jobData, error } = await supabase.from('jobs').insert({
      posted_by: session.user.id,
      title: form.title,
      description: form.description,
      location: form.location,
      hourly_rate: form.payment_type === 'hourly' ? (parseFloat(form.hourly_rate) || 0) : 0,
      fixed_price: form.payment_type === 'fixed' ? (parseFloat(form.fixed_price) || 0) : null,
      payment_type: form.payment_type,
      tags,
      shift_date: form.shift_date,
      shift_start,
      shift_end,
      work_type: form.work_type,
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
      <SEOHead title="Post a Gig – VANO" description="Post a gig and find freelancers in Galway." />
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 pt-20 sm:px-6 sm:pt-24 md:px-8">
        <header className="mb-8 border-l-[3px] border-foreground pl-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Hiring</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {rehireStudentId ? 'Rehire a freelancer' : 'Post a gig'}
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            {rehireStudentId
              ? `New gig for ${rehireStudentName} — adjust the deadline or budget, then publish.`
              : 'Short fields, clear budget: freelancers see exactly what you need and when.'}
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
          <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-foreground">What do you need?</h2>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className={inputClass} placeholder="e.g. Logo pack, 2-day shoot, lawn tidy-up" />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <button
                  type="button"
                  onClick={async () => {
                    if (!form.title.trim()) { toast({ title: 'Enter a title first', variant: 'destructive' }); return; }
                    setGeneratingDesc(true);
                    try {
                      const { data, error } = await supabase.functions.invoke('ai-job-description', {
                        body: { title: form.title, tags, location: form.location, workType: form.work_type },
                      });
                      if (error) throw error;
                      if (data?.description) setForm(f => ({ ...f, description: data.description }));
                      if (data?.suggestedRate && !form.hourly_rate) setForm(f => ({ ...f, hourly_rate: data.suggestedRate.toString() }));
                      if (data?.suggestedTags?.length) {
                        setTags(prev => [...new Set([...prev, ...data.suggestedTags])]);
                      }
                      toast({ title: 'Draft ready', description: 'Edit anything that does not match your scope.' });
                    } catch (err: any) {
                      toast({ title: 'Error', description: err?.message || 'Failed to generate', variant: 'destructive' });
                    } finally {
                      setGeneratingDesc(false);
                    }
                  }}
                  disabled={generatingDesc}
                  className="flex items-center gap-1 text-xs font-medium text-foreground/80 underline-offset-4 hover:underline disabled:opacity-50"
                >
                  {generatingDesc ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {generatingDesc ? '…' : 'Draft with AI'}
                </button>
              </div>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={cn(inputClass, 'min-h-[120px] resize-y')} placeholder="Deliverables, materials you provide, access, expectations…" />
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-foreground">Where &amp; how</h2>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Location</label>
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required={form.work_type !== 'remote'} className={inputClass} placeholder="Neighbourhood, city, or Remote" />
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium text-muted-foreground">Work type</label>
              <div className="flex flex-wrap gap-2">
                {(['on-site', 'remote', 'hybrid'] as const).map((type) => (
                  <Button
                    key={type}
                    type="button"
                    variant={form.work_type === type ? 'default' : 'outline'}
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setForm({ ...form, work_type: type })}
                  >
                    {type === 'on-site' ? 'On-site' : type === 'remote' ? 'Remote' : 'Hybrid'}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-foreground">Budget</h2>
            <p className="-mt-1 text-xs text-muted-foreground leading-relaxed">
              Hourly is for timed shifts. One-time project is a fixed total — you only set a deadline, not clock times (similar to marketplace briefs).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={form.payment_type === 'hourly' ? 'default' : 'outline'}
                size="sm"
                className="rounded-xl"
                onClick={() => setPaymentType('hourly')}
              >
                Hourly
              </Button>
              <Button
                type="button"
                variant={form.payment_type === 'fixed' ? 'default' : 'outline'}
                size="sm"
                className="rounded-xl"
                onClick={() => setPaymentType('fixed')}
              >
                One-time project
              </Button>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-muted-foreground">
                  {form.payment_type === 'hourly' ? 'Rate (€ / hour)' : 'Total project budget (€)'}
                </label>
                {form.payment_type === 'hourly' && (
                  <button
                    type="button"
                    onClick={async () => {
                      setLoadingPrice(true);
                      setPricingAdvice(null);
                      try {
                        const { data, error } = await supabase.functions.invoke('ai-pricing-advisor', {
                          body: { title: form.title, tags, location: form.location, workType: form.work_type, context: 'job' },
                        });
                        if (error) throw error;
                        if (data?.suggestedMin) setPricingAdvice(data);
                      } catch (err: any) {
                        toast({ title: 'Error', description: err?.message || 'Failed to get suggestion', variant: 'destructive' });
                      } finally {
                        setLoadingPrice(false);
                      }
                    }}
                    disabled={loadingPrice}
                    className="flex items-center gap-1 text-[11px] font-medium text-foreground/80 underline-offset-4 hover:underline disabled:opacity-50"
                  >
                    {loadingPrice ? <Loader2 size={10} className="animate-spin" /> : <Lightbulb size={10} />}
                    Suggest range
                  </button>
                )}
              </div>
              {form.payment_type === 'hourly' ? (
                <input type="number" min="0" step="0.5" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} required className={inputClass} placeholder="e.g. 18" />
              ) : (
                <input type="number" min="0" step="1" value={form.fixed_price} onChange={(e) => setForm({ ...form, fixed_price: e.target.value })} required className={inputClass} placeholder="e.g. 350" />
              )}
              {pricingAdvice && form.payment_type === 'hourly' && (
                <div className="mt-2 rounded-xl border border-foreground/10 bg-muted/40 p-3 text-xs">
                  <p className="font-medium text-foreground">Rough range: €{pricingAdvice.suggestedMin} – €{pricingAdvice.suggestedMax}/hr</p>
                  <p className="mt-1 text-muted-foreground leading-relaxed">{pricingAdvice.reasoning}</p>
                </div>
              )}
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-foreground">
              {form.payment_type === 'fixed' ? 'Deadline' : 'Schedule'}
            </h2>
            {form.payment_type === 'fixed' ? (
              <p className="-mt-1 text-xs text-muted-foreground leading-relaxed">
                When you need the work completed. No start/end clock times for fixed projects.
              </p>
            ) : (
              <p className="-mt-1 text-xs text-muted-foreground leading-relaxed">
                The calendar date and shift window for this gig.
              </p>
            )}
            <div className={cn('grid gap-4', form.payment_type === 'fixed' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3')}>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  {form.payment_type === 'fixed' ? 'Due date' : 'Date'}
                </label>
                <input type="date" value={form.shift_date} onChange={(e) => setForm({ ...form, shift_date: e.target.value })} required className={inputClass} />
              </div>
              {form.payment_type === 'hourly' && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Start</label>
                    <input type="time" value={form.shift_start} onChange={(e) => setForm({ ...form, shift_start: e.target.value })} required className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">End</label>
                    <input type="time" value={form.shift_end} onChange={(e) => setForm({ ...form, shift_end: e.target.value })} required className={inputClass} />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-foreground">Skills &amp; tags</h2>
            <div className="flex flex-wrap gap-2">
              {COMMON_TAGS.map((tag) => (
                <TagBadge key={tag} tag={tag} selected={tags.includes(tag)} onClick={() => toggleTag(tag)} />
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
                className={inputClass}
                placeholder="Add a tag…"
              />
              <Button type="button" variant="secondary" className="shrink-0 rounded-xl" onClick={addCustomTag}>Add</Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {tags.map((tag) => <TagBadge key={tag} tag={tag} selected removable onRemove={() => setTags(tags.filter((t) => t !== tag))} />)}
              </div>
            )}
          </div>

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
              <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', form.is_urgent ? 'left-5' : 'left-0.5')} />
            </button>
            <div>
              <p className="text-sm font-medium text-foreground">Mark urgent</p>
              <p className="text-xs text-muted-foreground">Surfaced to freelancers who filter for ASAP work.</p>
            </div>
          </div>

          <Button type="submit" disabled={loading} size="lg" className="h-12 w-full rounded-xl text-base font-semibold">
            {loading ? 'Posting…' : 'Publish gig'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default PostJob;
