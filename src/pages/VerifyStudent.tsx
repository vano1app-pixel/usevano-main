import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { getUserFriendlyError } from '@/lib/errorMessages';
import {
  isStrictInstitutionVerificationEmail,
  STRICT_INSTITUTION_EMAIL_HINT,
} from '@/lib/studentEmailValidator';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/logo.png';
import { GraduationCap, Loader2 } from 'lucide-react';

/**
 * Freelancers enter a college email on an allowed domain; we store it and mark them verified (no OTP).
 */
const VerifyStudent = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [studentEmail, setStudentEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast({ title: 'Sign in required', description: 'Please sign in again.', variant: 'destructive' });
        navigate('/auth', { replace: true });
        return;
      }

      const { error: spErr } = await supabase.from('student_profiles').upsert(
        {
          user_id: session.user.id,
          student_verified: true,
          verified_email: trimmed,
        },
        { onConflict: 'user_id' },
      );
      if (spErr) throw spErr;

      const { error: profErr } = await supabase
        .from('profiles')
        .update({ student_email: trimmed })
        .eq('user_id', session.user.id);
      if (profErr) throw profErr;

      toast({
        title: 'Student email saved',
        description: 'Next, finish your profile.',
      });
      navigate('/complete-profile', { replace: true });
    } catch (err: unknown) {
      toast({
        title: 'Could not save',
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
          <h1 className="text-2xl font-bold text-foreground">Your student email</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Enter your college address ({STRICT_INSTITUTION_EMAIL_HINT})
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
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
                Saving…
              </>
            ) : (
              'Continue'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default VerifyStudent;
