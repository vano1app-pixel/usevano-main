import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { JobCard, JobPosterPreview } from '@/components/JobCard';
import { TagBadge } from '@/components/TagBadge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { Search, Wifi, Building2, Layers, Map, List, Plus } from 'lucide-react';
import { JobsMap } from '@/components/JobsMap';
import { useNavigate, Link } from 'react-router-dom';

const POPULAR_TAGS = ['Web Design', 'Marketing', 'Graphic Design', 'Writing', 'Gardening', 'Cleaning', 'Photography', 'Odd Jobs'];

const BrowseJobs = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [workTypeFilter, setWorkTypeFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [user, setUser] = useState<any>(null);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
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
    if (!error && data?.length) {
      setJobs(data);
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
    } else {
      setJobs(data || []);
      setPostersByUserId({});
    }
    setLoading(false);
  };

  const toggleSave = async (jobId: string) => {
    if (!user) return;
    if (savedJobIds.has(jobId)) {
      await supabase.from('saved_jobs').delete().eq('user_id', user.id).eq('job_id', jobId);
      setSavedJobIds((prev) => { const next = new Set(prev); next.delete(jobId); return next; });
    } else {
      await supabase.from('saved_jobs').insert({ user_id: user.id, job_id: jobId } as any);
      setSavedJobIds((prev) => new Set(prev).add(jobId));
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const filtered = jobs.filter((job) => {
    const matchesSearch = !search || job.title.toLowerCase().includes(search.toLowerCase()) || job.location.toLowerCase().includes(search.toLowerCase());
    const matchesTags = selectedTags.length === 0 || selectedTags.some((t) => job.tags?.map((jt: string) => jt.toLowerCase()).includes(t.toLowerCase()));
    const matchesWorkType = workTypeFilter === 'all' || job.work_type === workTypeFilter;
    return matchesSearch && matchesTags && matchesWorkType;
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
            Each card shows who posted, pay style, and deadline or shift time so you can decide fast.
          </p>
        </header>

        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Hiring for something?</p>
            <p className="text-xs text-muted-foreground sm:text-sm">Post a gig in minutes — hourly shift or one-time project with a deadline.</p>
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
            placeholder="Search gigs by title or location..."
            className="w-full pl-10 pr-4 py-3 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Tag filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {POPULAR_TAGS.map((tag) => (
            <TagBadge key={tag} tag={tag} selected={selectedTags.includes(tag)} onClick={() => toggleTag(tag)} />
          ))}
        </div>

        {/* Work type filter + view toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 sm:mb-8">
          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {[
              { value: 'all', label: 'All', icon: Layers },
              { value: 'on-site', label: 'On-site', icon: Building2 },
              { value: 'remote', label: 'Remote', icon: Wifi },
              { value: 'hybrid', label: 'Hybrid', icon: Layers },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setWorkTypeFilter(value)}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  workTypeFilter === value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-input text-muted-foreground hover:border-primary/30'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
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
          <p className="text-center text-muted-foreground py-12">Loading jobs...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No gigs found. Try different filters.</p>
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
