import React, { useState, useEffect } from 'react';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { createPortal } from 'react-dom';
import { X, GraduationCap, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate, Link } from 'react-router-dom';
import { isEmailVerified, resolvePostAuthDestination } from '@/lib/authSession';
import {
  clearGoogleOAuthIntent,
  hasGoogleOAuthPending,
  setGoogleOAuthIntent,
} from '@/lib/googleOAuth';
import { getGoogleOAuthRedirectUrl } from '@/lib/siteUrl';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { cn } from '@/lib/utils';

interface AuthSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthSheet: React.FC<AuthSheetProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [userType, setUserType] = useState<'student' | 'business'>('student');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (hasGoogleOAuthPending()) return;
      if (!session || !isEmailVerified(session)) return;
      void resolvePostAuthDestination(session.user.id).then((path) => {
        onClose();
        navigate(path, { replace: true });
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isOpen, navigate, onClose]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      setGoogleOAuthIntent(isSignUp ? userType : null);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getGoogleOAuthRedirectUrl(),
          queryParams: { access_type: 'offline', prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (error: unknown) {
      clearGoogleOAuthIntent();
      setLoading(false);
      toast({
        title: 'Google sign-in failed',
        description: getUserFriendlyError(error),
        variant: 'destructive',
      });
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[1000] backdrop-blur-[2px]"
        onClick={loading ? undefined : onClose}
        aria-hidden
      />
      <div className="fixed inset-0 z-[1001] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
        <div
          className={cn(
            'pointer-events-auto w-full sm:max-w-[420px] overflow-y-auto',
            'bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-xl',
            'safe-area-bottom',
          )}
        >
          <div className="sticky top-0 flex items-center justify-between px-4 pt-4 pb-2 sm:px-6 sm:pt-5 bg-card/95 backdrop-blur-sm border-b border-border/60 z-10">
            <p className="text-sm font-semibold tracking-tight text-foreground">VANO</p>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
              aria-label="Close"
            >
              <X size={22} />
            </button>
          </div>

          <div className="px-4 pb-8 pt-4 sm:px-6 sm:pb-8 sm:pt-5 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {isSignUp ? 'Join VANO' : 'Welcome back'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {isSignUp
                  ? 'Pick your role then continue with Google.'
                  : 'Sign in to your account with Google.'}
              </p>
            </div>

            {isSignUp && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Account type</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setUserType('student')}
                    disabled={loading}
                    className={cn(
                      'rounded-xl border-2 px-4 py-4 text-left transition-all flex flex-col gap-1',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      userType === 'student'
                        ? 'border-emerald-500/70 bg-emerald-500/[0.07] shadow-sm'
                        : 'border-border bg-muted/30 hover:border-emerald-500/25',
                    )}
                  >
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                      <GraduationCap className="text-emerald-600 shrink-0" size={18} />
                      Freelancer
                    </span>
                    <span className="text-xs text-muted-foreground leading-snug">
                      Offer services &amp; join the community
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserType('business')}
                    disabled={loading}
                    className={cn(
                      'rounded-xl border-2 px-4 py-4 text-left transition-all flex flex-col gap-1',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      userType === 'business'
                        ? 'border-sky-500/70 bg-sky-500/[0.07] shadow-sm'
                        : 'border-border bg-muted/30 hover:border-sky-500/25',
                    )}
                  >
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Building2 className="text-sky-600 shrink-0" size={18} />
                      Business
                    </span>
                    <span className="text-xs text-muted-foreground leading-snug">
                      Post gigs &amp; hire students
                    </span>
                  </button>
                </div>
              </div>
            )}

            {isSignUp && (
              <label className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border text-primary accent-primary cursor-pointer"
                />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  I agree to the{' '}
                  <Link to="/terms" onClick={onClose} className="text-primary hover:underline underline-offset-2">Terms of Service</Link>
                  {' '}and{' '}
                  <Link to="/privacy" onClick={onClose} className="text-primary hover:underline underline-offset-2">Privacy Policy</Link>
                </span>
              </label>
            )}

            <GoogleSignInButton onClick={handleGoogleSignIn} disabled={loading || (isSignUp && !agreedToTerms)} />

            <p className="text-center text-sm text-muted-foreground">
              {isSignUp ? (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setIsSignUp(false)}
                    className="font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  New to VANO?{' '}
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setIsSignUp(true)}
                    className="font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    Create an account
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
};
