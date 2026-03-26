import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { getUserFriendlyError } from '@/lib/errorMessages';
import {
  isStrictInstitutionVerificationEmail,
  STRICT_INSTITUTION_EMAIL_HINT,
} from '@/lib/studentEmailValidator';
import { verifyEmailChangeOtp } from '@/lib/verifyEmailOtp';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/logo.png';
import { GraduationCap, Loader2 } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

/**
 * Freelancers verify an institutional email with a 6-digit code.
 *
 * We use `updateUser({ email })` so the OTP is tied to the same Auth user as Google OAuth.
 * `signInWithOtp({ options: { shouldCreateUser: false } })` only sends mail if that address
 * already exists as a separate Auth user — it does not attach a new student email to an OAuth account.
 */
const VerifyStudent = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [studentEmail, setStudentEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = studentEmail.trim().toLowerCase();
    if (!isStrictInstitutionVerificationEmail(trimmed)) {
      toast({
        title: 'Use your college email',
        description: STRICT_INSTITUTION_EMAIL_HINT,
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      /**
       * Sends the 6-digit code via Supabase email-change confirmation. Same Auth user id as Google OAuth is preserved.
       * `signInWithOtp({ options: { shouldCreateUser: false } })` is not used here: it only sends if that address already
       * exists as a separate Auth user, so it does not attach a new student inbox to an existing OAuth account.
       */
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) throw error;
      setPendingEmail(trimmed);
      toast({
        title: 'Check your inbox',
        description: `We sent a 6-digit code to ${trimmed}.`,
      });
    } catch (err: unknown) {
      toast({ title: 'Could not send code', description: getUserFriendlyError(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEmail || otp.replace(/\D/g, '').length < 6) return;

    setLoading(true);
    try {
      const { error: verifyErr } = await verifyEmailChangeOtp(supabase, {
        email: pendingEmail,
        token: otp,
      });
      if (verifyErr) throw verifyErr;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Session missing after verification');

      const verified = pendingEmail;
      await supabase.from('student_profiles').upsert(
        {
          user_id: session.user.id,
          student_verified: true,
          verified_email: verified,
        },
        { onConflict: 'user_id' },
      );
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ student_email: verified })
        .eq('user_id', session.user.id);
      if (profErr) throw profErr;

      toast({ title: 'Student email verified', description: 'Next, finish your profile.' });
      navigate('/complete-profile', { replace: true });
    } catch (err: unknown) {
      toast({
        title: 'Verification failed',
        description: getUserFriendlyError(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <SEOHead
        title="Verify student email – VANO"
        description="Confirm your college email to continue as a freelancer on VANO."
      />
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <img src={logo} alt="" className="h-10 w-10 rounded-xl" />
            <span className="text-2xl font-bold text-primary">VANO</span>
          </div>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
            <GraduationCap className="h-7 w-7 text-emerald-600" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Verify your student email</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Freelancers need a verified college address ({STRICT_INSTITUTION_EMAIL_HINT})
          </p>
        </div>

        {!pendingEmail ? (
          <form onSubmit={handleSendCode} className="space-y-5">
            <div>
              <label htmlFor="student-email" className="block text-sm font-medium text-foreground mb-1.5">
                Student email
              </label>
              <input
                id="student-email"
                name="email"
                type="email"
                autoComplete="email"
                value={studentEmail}
                onChange={(e) => setStudentEmail(e.target.value)}
                className={inputClass}
                placeholder="you@college.ac.ie"
                required
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-[15px] hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 min-h-[48px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Sending…
                </>
              ) : (
                'Send verification code'
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <p className="text-sm text-center text-muted-foreground">
              Code sent to <span className="font-medium text-foreground">{pendingEmail}</span>
            </p>
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={otp}
                onChange={(v) => setOtp(v.replace(/\D/g, ''))}
                disabled={loading}
                containerClassName="gap-2"
                autoComplete="one-time-code"
              >
                <InputOTPGroup className="gap-1.5">
                  <InputOTPSlot index={0} className="h-12 w-10 text-lg rounded-lg" />
                  <InputOTPSlot index={1} className="h-12 w-10 text-lg rounded-lg" />
                  <InputOTPSlot index={2} className="h-12 w-10 text-lg rounded-lg" />
                  <InputOTPSlot index={3} className="h-12 w-10 text-lg rounded-lg" />
                  <InputOTPSlot index={4} className="h-12 w-10 text-lg rounded-lg" />
                  <InputOTPSlot index={5} className="h-12 w-10 text-lg rounded-lg" />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <button
              type="submit"
              disabled={loading || otp.replace(/\D/g, '').length < 6}
              className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-[15px] hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 min-h-[48px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Verifying…
                </>
              ) : (
                'Verify & continue'
              )}
            </button>
            <div className="text-center">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setPendingEmail(null);
                  setOtp('');
                }}
                className="text-sm text-muted-foreground hover:text-primary"
              >
                ← Use a different email
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default VerifyStudent;
