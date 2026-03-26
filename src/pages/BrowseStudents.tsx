import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { StudentCard } from '@/components/StudentCard';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { Search, Plus } from 'lucide-react';
import { useTopStudents } from '@/hooks/useTopStudents';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';

const BrowseStudents = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [user, setUser] = useState<any>(null);
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(new Set());
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
    const { data: studentData } = await supabase.from('student_profiles').select('*').eq('is_available', true);
    const { data: profileData } = await supabase.from('profiles').select('user_id, display_name');
    setStudents(studentData || []);
    setProfiles(profileData || []);
    setLoading(false);
  };

  const toggleFavourite = async (studentUserId: string) => {
    if (!user) return;
    if (favouriteIds.has(studentUserId)) {
      await supabase.from('favourite_students').delete().eq('business_user_id', user.id).eq('student_user_id', studentUserId);
      setFavouriteIds((prev) => { const next = new Set(prev); next.delete(studentUserId); return next; });
    } else {
      await supabase.from('favourite_students').insert({ business_user_id: user.id, student_user_id: studentUserId } as any);
      setFavouriteIds((prev) => new Set(prev).add(studentUserId));
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
      <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-8 pt-20 sm:pt-24 pb-12 sm:pb-16">
        <header className="mb-6 border-l-[3px] border-foreground pl-4 sm:mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Talent</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Find the right freelancer</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-[15px]">
            Search by name, bio, or any skill keyword — open profiles to see portfolios and how to connect.
          </p>
        </header>

        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Have a project in mind?</p>
            <p className="text-xs text-muted-foreground sm:text-sm">Post a gig with a fixed budget and deadline — freelancers apply from here.</p>
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

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, bio, or keywords…"
            className="w-full pl-10 pr-4 py-3.5 border border-input rounded-2xl bg-card text-sm shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading students...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No students found.</p>
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
