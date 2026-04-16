import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuthContext';

/**
 * Freelancers (user_type: 'student') who have not yet submitted the listing
 * wizard are bounced back to /list-on-community if they try to visit any
 * in-app route. The goal is the same as the post-auth router already gives:
 * a brand-new freelancer must set up their listing before they can use the
 * product. The post-auth router handles the initial landing; this guard
 * handles every subsequent navigation, including "Skip for now", browser
 * back, bookmarks, and manual URL edits.
 *
 * Reads hasListing from the AuthContext cache so it doesn't fire a fresh
 * community_posts query on every navigation. The cache flips to true as
 * soon as refreshProfile() runs after the wizard's submit callback.
 */
const SKIP_PREFIXES = [
  '/list-on-community',
  '/auth',
  '/choose-account-type',
  '/reset-password',
  '/complete-profile',
  '/privacy',
  '/terms',
  '/blog',
];

export function RedirectUnlistedFreelancerToWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, isVerified, loading, profileLoading, userType, hasListing } = useAuth();

  useEffect(() => {
    if (loading || profileLoading) return;
    if (!session || !isVerified) return;
    if (userType !== 'student') return;
    if (hasListing !== false) return; // null (loading or not applicable) or true (all set) → do nothing
    const path = location.pathname;
    if (SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return;
    navigate('/list-on-community', { replace: true });
  }, [loading, profileLoading, session, isVerified, userType, hasListing, location.pathname, navigate]);

  return null;
}
