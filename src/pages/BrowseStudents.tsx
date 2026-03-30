import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { StudentCard } from '@/components/StudentCard';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { Search, Plus } from 'lucide-react';
import { useTopStudents } from '@/hooks/useTopStudents';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Link, useNavigate } from 'react-router-dom';

const BrowseStudents = () => {
  const { toast } = useToast();
  const [students, setStudents] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [search, setSearch] = useState('');
  const [user, setUser] = useState<any>(null);
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(new Set());
  const [togglingFavIds, setTogglingFavIds] = useState<Set<string>>(new Set());
  const { topStudents } = useTopStudents();

  useEffect(() => {
    fetchStudents();
    loadUser();
  }, []);

  const loadUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      const { data } = await supabase.from('favourite_students').select('student_user_id').eq('business_user_id', session.user.id);
      setFavouriteIds(new Set((data || []).map((d: any) => d.student_user_id)));
    }
  };

  const fetchStudents = async () => {
    const { data: studentData, error: studentErr } = await supabase.from('student_profiles').select('*').eq('is_available', true);
    const { data: profileData, error: profileErr } = await supabase.from('profiles').select('user_id, display_name');
    if (studentErr || profileErr) {
      setFetchError(true);
      setLoading(false);
      return;
    }
    setStudents(studentData || []);
    setProfiles(profileData || []);
    setLoading(false);
  };

  const toggleFavourite = async (studentUserId: string) => {
    if (!user || togglingFavIds.has(studentUserId)) return;
    setTogglingFavIds((prev) => new Set(prev).add(studentUserId));
    const wasFav = favouriteIds.has(studentUserId);
    // optimistic update
    setFavouriteIds((prev) => {
      const next = new Set(prev);
      if (wasFav) next.delete(studentUserId); else next.add(studentUserId);
      return next;
    });
    try {
      const { error } = wasFav
        ? await supabase.from('favourite_students').delete().eq('business_user_id', user.id).eq('student_user_id', studentUserId)
        : await supabase.from('favourite_students').insert({ business_user_id: user.id, student_user_id: studentUserId } as any);
      if (error) {
        // rollback
        setFavouriteIds((prev) => {
          const next = new Set(prev);
          if (wasFav) next.add(studentUserId); else next.delete(studentUserId);
          return next;
        });
        toast({ title: 'Could not save', description: 'Please try again.', variant: 'destructive' });
      }
    } finally {
      setTogglingFavIds((prev) => { const next = new Set(prev); next.delete(studentUserId); return next; });
    }
  };

  const getDisplayName = (userId: string) => {
    return profiles.find((p) => p.user_id === userId)?.display_name || 'Student';
  };

  const filtered = students.filter((s) => {
    const name = getDisplayName(s.user_id).toLowerCase();
    const skillText = (s.skills || []).join(' ').toLowerCase();
    const q = search.toLowerCase();
    return (
      !search ||
      name.includes(q) ||
      s.bio?.toLowerCase().includes(q) ||
      skillText.includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead title="Find talent – VANO" description="Browse freelancers and students with the skills you need in Galway." />
      <Navbar />

      {/* Editorial hero header */}
      <div className="bg-primary pt-20 sm:pt-24 pb-8 px-4 md:px-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary-foreground/50 mb-3">
            VANO — Talent Board
          </p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-primary-foreground leading-[1.05] mb-3">
            Hire local.<br className="sm:hidden" /> Hire smart.
          </h1>
          <p className="text-sm sm:text-base text-primary-foreground/60 max-w-lg">
            Galway's top student freelancers — available now, verified, and ready to work.
          </p>
          {/* Stats strip */}
          {!loading && (
            <div className="mt-5 flex gap-6">
              <div>
                <span className="text-xl font-bold text-primary-foreground">{students.length}</span>
                <span className="ml-1.5 text-xs text-primary-foreground/50 uppercase tracking-wide">Available</span>
              </div>
              <div className="w-px bg-background/15" />
              <div>
                <span className="text-xl font-bold text-primary-foreground">{[...new Set(students.flatMap((s) => s.skills || []))].length}</span>
                <span className="ml-1.5 text-xs text-primary-foreground/50 uppercase tracking-wide">Skills</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-8 pt-6 pb-12 sm:pb-16">

        {/* Post a gig CTA */}
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Have a project in mind?</p>
            <p className="text-xs text-muted-foreground sm:text-sm">Post a gig — freelancers apply directly with their rates.</p>
          </div>
          {user ? (
            <Button size="lg" className="h-11 w-full shrink-0 rounded-xl font-semibold sm:w-auto sm:min-w-[10rem]" asChild>
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, skill, or keyword…"
            className="w-full pl-10 pr-4 py-3.5 border border-input rounded-2xl bg-card text-sm shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy aria-label="Loading freelancers">
            {[1,2,3,4].map((i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm animate-pulse">
                <div className="h-16 w-full bg-muted sm:h-[4.5rem]" />
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 shrink-0 rounded-full bg-muted ring-2 ring-background -mt-8" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-4 w-32 rounded-md bg-muted" />
                      <div className="h-3 w-24 rounded-md bg-muted" />
                    </div>
                  </div>
                  <div className="h-3 w-full rounded-md bg-muted" />
                  <div className="h-3 w-4/5 rounded-md bg-muted" />
                  <div className="flex gap-2 pt-1">
                    <div className="h-6 w-14 rounded-md bg-muted" />
                    <div className="h-6 w-18 rounded-md bg-muted" />
                    <div className="h-6 w-16 rounded-md bg-muted" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : fetchError ? (
          <p className="text-center text-muted-foreground py-12">Could not load freelancers — please refresh and try again.</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            {search ? 'No freelancers match that search.' : 'No freelancers available yet — check back soon.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((student) => (
              <StudentCard
                key={student.id}
                student={student}
                displayName={getDisplayName(student.user_id)}
                showFavourite={!!user}
                isFavourite={favouriteIds.has(student.user_id)}
                onToggleFavourite={toggleFavourite}
                topInfo={topStudents[student.user_id]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BrowseStudents;
