import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { identifyUser, resetUser, setUser as setSentryUser } from '@/lib/observability';
import { supabase } from '@/integrations/supabase/client';
import { isEmailVerified } from '@/lib/authSession';

/**
 * Cached profile columns we want exposed globally so every floating component
 * doesn't fetch them independently. user_type is by far the hottest read —
 * Navbar, WhatsAppFloatingButton, MascotGuide, RedirectToAccountTypeIfNeeded
 * and HireRequestsInboxLink all used to query it separately on mount.
 *
 * `has_listing` is populated only for students. Cached here so the top-level
 * `RedirectUnlistedFreelancerToWizard` guard doesn't fire a fresh query on
 * every navigation — it would otherwise re-check community_posts on each
 * route change for any student, which is wasteful and adds latency.
 */
interface CachedProfile {
  user_type: string | null;
  has_listing: boolean | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isVerified: boolean;
  /** True until the first onAuthStateChange event has fired. */
  loading: boolean;
  /** Null when unauthenticated or while the profile row is still loading. */
  userType: string | null;
  /**
   * For students: true if they have a published or pending community listing.
   * False if they've signed up but never submitted the wizard. Null while
   * loading or when the user isn't a student.
   */
  hasListing: boolean | null;
  /** True until the profile fetch for the signed-in user has resolved. */
  profileLoading: boolean;
  /** Force a re-fetch (e.g. after ChooseAccountType saves, or wizard submit). */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CachedProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Track the last user id whose profile we fetched so we only re-query when
  // the signed-in user actually changes. Token refresh events fire
  // onAuthStateChange but shouldn't cause a new DB round-trip.
  const lastFetchedUserId = useRef<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('user_id', userId)
        .maybeSingle();
      const userType = (data?.user_type as string | null) ?? null;

      // Only students need the has_listing signal. Businesses and un-typed
      // users leave it null so the RedirectUnlistedFreelancerToWizard guard
      // short-circuits before even reading it.
      let hasListing: boolean | null = null;
      if (userType === 'student') {
        const { data: post } = await supabase
          .from('community_posts')
          .select('id')
          .eq('user_id', userId)
          .in('moderation_status', ['approved', 'pending'])
          .limit(1)
          .maybeSingle();
        hasListing = !!post?.id;
      }

      // Only apply if it's still the user we're tracking (no sign-out mid-flight).
      if (lastFetchedUserId.current === userId) {
        setProfile({ user_type: userType, has_listing: hasListing });
      }
    } finally {
      if (lastFetchedUserId.current === userId) setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Eager seed from whatever session is already in localStorage so the
    // provider's `loading` flag can resolve before the async
    // onAuthStateChange fires. Without this, a cold load where the
    // INITIAL_SESSION event is slow to dispatch leaves every
    // RequireVerifiedSession-wrapped route stuck on the "Loading…"
    // spinner indefinitely — the "login gets stuck" symptom freelancers
    // reported after recent deploys.
    void supabase.auth.getSession().then(({ data: { session: existing } }) => {
      if (cancelled) return;
      setSession(existing);
      setLoading(false);
      const uid = existing?.user?.id ?? null;
      if (uid && uid !== lastFetchedUserId.current) {
        lastFetchedUserId.current = uid;
        identifyUser(uid);
        setSentryUser({ id: uid });
        void fetchProfile(uid);
      }
    }).catch(() => { if (!cancelled) setLoading(false); });

    // Hard ceiling so loading cannot stay true forever even if both
    // getSession and onAuthStateChange hang (network partition, Supabase
    // outage, service worker weirdness). 8 seconds is generous; beyond
    // that the user is better off seeing the signed-out UI than a
    // frozen spinner.
    const failSafe = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (cancelled) return;
      setSession(s);
      setLoading(false);

      const uid = s?.user?.id ?? null;
      const prevUid = lastFetchedUserId.current;
      if (uid !== prevUid) {
        lastFetchedUserId.current = uid;
        // Clear the React Query cache whenever the signed-in user
        // changes — sign-out, sign-in-as-different-user, or session
        // expiry. Prevents the next user seeing the previous user's
        // cached profiles / messages / hire requests briefly before
        // the fresh fetches resolve. signOutCleanly() also does this
        // for call sites that go through the shared helper; this is
        // the belt-and-braces path for everything else (auto-expiry,
        // magic-link-on-top-of-stale-session, etc).
        if (prevUid !== null) queryClient.clear();
        if (uid) {
          // Tell PostHog + Sentry who this is so every event/error from
          // here on is attributed to the Supabase user id; the lazy
          // observability shim handles the case where the SDKs haven't
          // finished loading yet (calls are buffered until init resolves).
          identifyUser(uid);
          setSentryUser({ id: uid });
          void fetchProfile(uid);
        } else {
          // Sign-out: clear the distinct_id so the next anonymous
          // events don't get mis-attributed to the previous user.
          resetUser();
          setSentryUser(null);
          setProfile(null);
          setProfileLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(failSafe);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    const uid = lastFetchedUserId.current;
    if (!uid) return;
    await fetchProfile(uid);
  }, [fetchProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isVerified: session ? isEmailVerified(session) : false,
      loading,
      userType: profile?.user_type ?? null,
      hasListing: profile?.has_listing ?? null,
      profileLoading,
      refreshProfile,
    }),
    [session, loading, profile, profileLoading, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Read the shared auth + cached profile state. Returns a fallback shape when
 * the provider isn't mounted (e.g. unit tests) so callers don't need defensive
 * null checks everywhere.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx) return ctx;
  return {
    session: null,
    user: null,
    isVerified: false,
    loading: false,
    userType: null,
    hasListing: null,
    profileLoading: false,
    refreshProfile: async () => {},
  };
}
