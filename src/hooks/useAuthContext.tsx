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
import { supabase } from '@/integrations/supabase/client';
import { isEmailVerified } from '@/lib/authSession';

/**
 * Cached profile columns we want exposed globally so every floating component
 * doesn't fetch them independently. user_type is by far the hottest read —
 * Navbar, WhatsAppFloatingButton, MascotGuide, RedirectToAccountTypeIfNeeded
 * and HireRequestsInboxLink all used to query it separately on mount.
 */
interface CachedProfile {
  user_type: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isVerified: boolean;
  /** True until the first onAuthStateChange event has fired. */
  loading: boolean;
  /** Null when unauthenticated or while the profile row is still loading. */
  userType: string | null;
  /** True until the profile fetch for the signed-in user has resolved. */
  profileLoading: boolean;
  /** Force a re-fetch (e.g. after ChooseAccountType saves). */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
      // Only apply if it's still the user we're tracking (no sign-out mid-flight).
      if (lastFetchedUserId.current === userId) {
        setProfile({ user_type: (data?.user_type as string | null) ?? null });
      }
    } finally {
      if (lastFetchedUserId.current === userId) setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (cancelled) return;
      setSession(s);
      setLoading(false);

      const uid = s?.user?.id ?? null;
      if (uid !== lastFetchedUserId.current) {
        lastFetchedUserId.current = uid;
        if (uid) {
          void fetchProfile(uid);
        } else {
          setProfile(null);
          setProfileLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
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
    profileLoading: false,
    refreshProfile: async () => {},
  };
}
