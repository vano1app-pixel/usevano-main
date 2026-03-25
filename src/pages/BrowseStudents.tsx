import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { StudentCard } from '@/components/StudentCard';
import { TagBadge } from '@/components/TagBadge';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { Search } from 'lucide-react';
import { useTopStudents } from '@/hooks/useTopStudents';

const SKILL_TAGS = ['Barista', 'Retail', 'Events', 'Hospitality', 'Cleaning', 'Delivery', 'Admin', 'Kitchen'];

const BrowseStudents = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
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

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  const filtered = students.filter((s) => {
    const name = getDisplayName(s.user_id).toLowerCase();
    const matchesSearch = !search || name.includes(search.toLowerCase()) || s.bio?.toLowerCase().includes(search.toLowerCase());
    const matchesTags = selectedTags.length === 0 || selectedTags.some((t) => s.skills?.map((sk: string) => sk.toLowerCase()).includes(t.toLowerCase()));
    return matchesSearch && matchesTags;
  });

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead title="Browse Students – VANO" description="Find students with the skills you need in Galway." />
      <Navbar />
      <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-8 pt-20 sm:pt-24 pb-12 sm:pb-16">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">Browse Students</h1>
        <p className="text-muted-foreground mb-8">Find students with the skills you need</p>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or bio..."
            className="w-full pl-10 pr-4 py-3 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {SKILL_TAGS.map((tag) => (
            <TagBadge key={tag} tag={tag} selected={selectedTags.includes(tag)} onClick={() => toggleTag(tag)} />
          ))}
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
