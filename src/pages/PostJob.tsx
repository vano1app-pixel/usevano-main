import React, { useState, useEffect } from 'react';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { Navbar } from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { RefreshCw, PenLine, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isEmailVerified } from '@/lib/authSession';

const PostJob = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const rehireStudentId = searchParams.get('rehire');
  const [loading, setLoading] = useState(false);
  const [rehireStudentName, setRehireStudentName] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    location: '',
    fixed_price: '',
    shift_date: '',
    is_urgent: false,
  });
  const [generatingDesc, setGeneratingDesc] = useState(false);

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
        }
      }
    };
    init();
  }, [rehireStudentId, navigate]);

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

    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !isEmailVerified(session)) {
      toast({ title: 'Please sign in', description: 'Verify your email to post a gig.', variant: 'destructive' });
      setLoading(false);
      navigate('/auth');
      return;
    }

    const coords = await geocodeLocation(form.location);

    const { data: jobData, error } = await supabase.from('jobs').insert({
      posted_by: session.user.id,
      title: form.title,
      description: form.description,
      location: form.location,
      hourly_rate: 0,
      fixed_price: parseFloat(form.fixed_price) || 0,
      payment_type: 'fixed',
      tags: [],
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
        <header className="mb-8 border-l-[3px] border-foreground pl-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Hiring</p>
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
          <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-foreground">What do you need?</h2>
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
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <button
                  type="button"
                  onClick={async () => {
                    if (!form.title.trim()) {
                      toast({ title: 'Enter a title first', variant: 'destructive' });
                      return;
                    }
                    setGeneratingDesc(true);
                    try {
                      const { data, error } = await supabase.functions.invoke('ai-job-description', {
                        body: { title: form.title, location: form.location },
                      });
                      if (error) throw error;
                      if (data?.description) setForm((f) => ({ ...f, description: data.description }));
                      const budget = data?.suggestedTotalBudget ?? data?.suggestedRate;
                      if (typeof budget === 'number' && !form.fixed_price.trim()) {
                        setForm((f) => ({ ...f, fixed_price: String(Math.max(0, Math.round(budget))) }));
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
                  {generatingDesc ? <Loader2 size={12} className="animate-spin" /> : <PenLine size={12} />}
                  {generatingDesc ? '…' : 'Suggest description'}
                </button>
              </div>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={cn(inputClass, 'min-h-[120px] resize-y')}
                placeholder="Deliverables, files or access you will provide, and what “done” looks like."
              />
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-foreground">Location</h2>
            <p className="-mt-1 text-xs text-muted-foreground leading-relaxed">
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

          <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-foreground">Project budget</h2>
            <p className="-mt-1 text-xs text-muted-foreground leading-relaxed">One fixed total for the whole project (EUR).</p>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Total budget (€)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.fixed_price}
                onChange={(e) => setForm({ ...form, fixed_price: e.target.value })}
                required
                className={inputClass}
                placeholder="e.g. 350"
              />
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-foreground">Deadline</h2>
            <p className="-mt-1 text-xs text-muted-foreground leading-relaxed">When you need the work completed.</p>
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
            {loading ? 'Posting…' : 'Publish gig'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default PostJob;
