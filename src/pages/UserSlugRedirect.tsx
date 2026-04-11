import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { nameToSlug } from '@/lib/slugify';

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
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-lg font-semibold">Profile not found</p>
          <button
            onClick={() => navigate('/students')}
            className="mt-3 text-sm text-primary hover:underline"
          >
            Browse freelancers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
};

export default UserSlugRedirect;
