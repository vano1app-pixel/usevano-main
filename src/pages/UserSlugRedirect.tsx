import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { nameToSlug } from '@/lib/slugify';
import { Navbar } from '@/components/Navbar';
import { EmptyState } from '@/components/ui/EmptyState';
import { UserX, Sparkles } from 'lucide-react';

/**
 * Resolves a vanity URL like /u/cian-murphy to /students/:uuid.
 * Fetches all student profiles and matches by slugified display_name.
 */
const UserSlugRedirect = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) { navigate('/students', { replace: true }); return; }

    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .eq('user_type', 'student');

      const match = (data || []).find(
        (p) => p.display_name && nameToSlug(p.display_name) === slug
      );

      if (match) {
        navigate(`/students/${match.user_id}`, { replace: true });
      } else {
        setNotFound(true);
      }
    })();
  }, [slug, navigate]);

  if (notFound) {
    // Freelancer-shared links are a real share surface on launch day —
    // anyone who clicks a stale URL deserves a proper dead-end page,
    // not a bare "Profile not found" line. Uses Navbar + EmptyState so
    // the chrome matches the rest of the app, and offers two real
    // paths forward (AI Find for hirers, talent board to browse).
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="mx-auto max-w-md px-4 pt-28 sm:pt-32">
          <EmptyState
            icon={UserX}
            title="Profile not found"
            description="This freelancer may have removed their listing — or the link's gone stale. Plenty more where they came from."
            action={{
              label: 'Find a freelancer',
              onClick: () => navigate('/hire'),
            }}
            secondaryAction={{
              label: 'Browse all',
              variant: 'outline',
              onClick: () => navigate('/students'),
            }}
          />
          <p className="mt-6 flex items-center justify-center gap-1.5 text-[11.5px] text-muted-foreground">
            <Sparkles size={11} className="text-primary" />
            Vano — hand-picked freelancers, paid safely
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs font-medium">Finding their profile…</p>
      </div>
    </div>
  );
};

export default UserSlugRedirect;
