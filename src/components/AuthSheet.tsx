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
import { getAuthRedirectUrl } from '@/lib/siteUrl';
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
          redirectTo: getAuthRedirectUrl(),
          queryParams: { access_type: 'offline', prompt: 'consent select_account' },
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

          <div className="px-4 pb-8 pt-4 sm:px-6 sm:pb-8 sm:pt-5 space-y-5">
            <div>
              <h2 className="text-[20px] font-semibold leading-tight tracking-tight text-foreground">
                {isSignUp
                  ? (userType === 'business' ? 'A perfect freelancer, hand-picked.' : 'Get hired, get paid safely.')
                  : 'Welcome back'}
              </h2>
              <p className="text-[13.5px] text-muted-foreground mt-1.5 leading-relaxed">
                {isSignUp
                  ? (userType === 'business'
                      ? 'One from our pool, one scouted from the web. Paid safely through Vano.'
                      : 'List yourself in 30 seconds. Clients tap to pay — money held until they release.')
                  : 'Sign in to pick up where you left off.'}
              </p>
            </div>

            {isSignUp && (
              <div className="space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">I am a</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setUserType('student')}
                    disabled={loading}
                    className={cn(
                      'relative flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200 active:scale-[0.98]',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      userType === 'student'
                        ? 'border-emerald-500/55 bg-emerald-500/[0.08] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.15)]'
                        : 'border-border/60 hover:border-emerald-500/35 hover:bg-emerald-500/[0.03]',
                    )}
                  >
                    <span className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-200',
                      userType === 'student' ? 'bg-emerald-500/15' : 'bg-muted/70',
                    )}>
                      <GraduationCap className="text-emerald-600 dark:text-emerald-400" size={18} strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0">
                      <span className="block text-[13.5px] font-semibold text-foreground">Freelancer</span>
                      <span className="mt-0.5 block truncate text-[11.5px] leading-snug text-muted-foreground">
                        Get hired
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserType('business')}
                    disabled={loading}
                    className={cn(
                      'relative flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200 active:scale-[0.98]',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      userType === 'business'
                        ? 'border-primary/55 bg-primary/[0.07] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]'
                        : 'border-border/60 hover:border-primary/35 hover:bg-primary/[0.03]',
                    )}
                  >
                    <span className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-200',
                      userType === 'business' ? 'bg-primary/15' : 'bg-muted/70',
                    )}>
                      <Building2 className="text-primary" size={18} strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0">
                      <span className="block text-[13.5px] font-semibold text-foreground">Business</span>
                      <span className="mt-0.5 block truncate text-[11.5px] leading-snug text-muted-foreground">
                        Hire talent
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            )}

            <GoogleSignInButton onClick={handleGoogleSignIn} disabled={loading} />

            {isSignUp && (
              <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
                By signing up, you agree to our{' '}
                <Link to="/terms" onClick={onClose} className="text-primary hover:underline underline-offset-2">Terms of Service</Link>
                {' '}and{' '}
                <Link to="/privacy" onClick={onClose} className="text-primary hover:underline underline-offset-2">Privacy Policy</Link>.
              </p>
            )}

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
