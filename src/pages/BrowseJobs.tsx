import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { JobCard, JobPosterPreview } from '@/components/JobCard';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { Search, Map, List, Plus } from 'lucide-react';
import { JobsMap } from '@/components/JobsMap';
import { useToast } from '@/hooks/use-toast';
import { useNavigate, Link } from 'react-router-dom';

const BrowseJobs = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [user, setUser] = useState<any>(null);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [togglingJobIds, setTogglingJobIds] = useState<Set<string>>(new Set());
  const [postersByUserId, setPostersByUserId] = useState<Record<string, JobPosterPreview>>({});

  useEffect(() => {
    fetchJobs();
    loadUser();
  }, []);

  const loadUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      const { data } = await supabase.from('saved_jobs').select('job_id').eq('user_id', session.user.id);
      setSavedJobIds(new Set((data || []).map((d: any) => d.job_id)));
    }
  };

  const fetchJobs = async () => {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    if (error) {
      setFetchError(true);
      setLoading(false);
      return;
    }
    setJobs(data || []);
    if (data?.length) {
      const ids = [...new Set(data.map((j: any) => j.posted_by))];
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', ids);
      const map: Record<string, JobPosterPreview> = {};
      (profs || []).forEach((p: any) => {
        map[p.user_id] = { display_name: p.display_name, avatar_url: p.avatar_url };
      });
      setPostersByUserId(map);
    }
    setLoading(false);
  };

  const toggleSave = async (jobId: string): Promise<void> => {
    if (!user || togglingJobIds.has(jobId)) return;
    setTogglingJobIds((prev) => new Set(prev).add(jobId));
    const wasSaved = savedJobIds.has(jobId);
    // optimistic update
    setSavedJobIds((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(jobId); else next.add(jobId);
      return next;
    });
    try {
      const { error } = wasSaved
        ? await supabase.from('saved_jobs').delete().eq('user_id', user.id).eq('job_id', jobId)
        : await supabase.from('saved_jobs').insert({ user_id: user.id, job_id: jobId } as any);
      if (error) {
        // rollback
        setSavedJobIds((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(jobId); else next.delete(jobId);
          return next;
        });
        toast({ title: 'Could not save', description: 'Please try again.', variant: 'destructive' });
      }
    } finally {
      setTogglingJobIds((prev) => { const next = new Set(prev); next.delete(jobId); return next; });
    }
  };

  const filtered = jobs.filter((job) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      job.title.toLowerCase().includes(q) ||
      (job.location && job.location.toLowerCase().includes(q)) ||
      (job.description && job.description.toLowerCase().includes(q));
    return matchesSearch;
  });

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead title="Browse Gigs – VANO" description="Find freelance gigs in Galway." />
      <Navbar />
      <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-8 pt-20 sm:pt-24 pb-12 sm:pb-16">
        <header className="mb-6 border-l-[3px] border-foreground pl-4 sm:mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Gigs</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Browse work near you</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-[15px]">
            Each gig is a fixed-price project with a due date — see budget and deadline on every card.
          </p>
        </header>

        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Hiring for something?</p>
            <p className="text-xs text-muted-foreground sm:text-sm">Post a gig in minutes — set a total budget and deadline.</p>
          </div>
          {user ? (
            <Button size="lg" className="h-11 w-full shrink-0 rounded-xl font-semibold sm:w-auto sm:min-w-[11rem]" asChild>
              <Link to="/post-job" className="inline-flex items-center justify-center gap-2">
                <Plus size={18} strokeWidth={2.5} className="opacity-90" />
                Post a gig
              </Link>
            </Button>
          ) : (
            <Button size="lg" variant="secondary" className="h-11 w-full shrink-0 rounded-xl font-semibold sm:w-auto" onClick={() => navigate('/auth')}>
              Sign in to post
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, location, or keywords in the description…"
            className="w-full pl-10 pr-4 py-3 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 mb-6 sm:mb-8">
          <div className="flex gap-1 border border-input rounded-lg p-0.5 self-end sm:self-auto">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              title="List view"
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'map' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              title="Map view"
            >
              <Map size={16} />
            </button>
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading gigs...</p>
        ) : fetchError ? (
          <p className="text-center text-muted-foreground py-12">Could not load gigs — please refresh and try again.</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            {search ? 'No gigs match that search.' : 'No gigs posted yet — check back soon.'}
          </p>
        ) : viewMode === 'map' ? (
          <JobsMap jobs={filtered} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                poster={postersByUserId[job.posted_by] || null}
                showSave={!!user}
                isSaved={savedJobIds.has(job.id)}
                onToggleSave={toggleSave}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BrowseJobs;
