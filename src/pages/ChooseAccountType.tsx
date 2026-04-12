import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { resolvePostGoogleAuthDestination } from '@/lib/authSession';
import { GraduationCap, Building2, Loader2 } from 'lucide-react';
import logo from '@/assets/logo.png';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { OnboardingJourney } from '@/components/OnboardingJourney';

/**
 * Shown when a user signs in with Google (or otherwise) and `profiles.user_type` is not set yet.
 */
const ChooseAccountType = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<'student' | 'business'>('student');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate('/auth', { replace: true });
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (profile?.user_type?.trim()) {
        const path = await resolvePostGoogleAuthDestination(session.user.id);
        navigate(path, { replace: true });
        return;
      }
      setChecking(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate('/auth', { replace: true });
        return;
      }
      const uid = session.user.id;
      const display =
        (session.user.user_metadata?.full_name as string | undefined) ||
        session.user.email?.split('@')[0] ||
        'User';

      // One upsert on profiles replaces the old SELECT → (INSERT or UPDATE) pair.
      // `onConflict: 'user_id'` + `ignoreDuplicates: false` means existing rows
      // get their `user_type` updated; new rows get seeded with display_name.
      // Run student_profiles upsert in parallel when relevant — previously it
      // waited for the profile write to finish even though they don't depend on
      // each other.
      const writes: Promise<{ error: unknown }>[] = [
        supabase
          .from('profiles')
          .upsert(
            { user_id: uid, display_name: display, user_type: selected },
            { onConflict: 'user_id', ignoreDuplicates: false },
          ),
      ];
      if (selected === 'student') {
        writes.push(
          supabase
            .from('student_profiles')
            .upsert({ user_id: uid }, { onConflict: 'user_id' }),
        );
      }
      const results = await Promise.all(writes);
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;

      const path = await resolvePostGoogleAuthDestination(uid);
      navigate(path, { replace: true });
    } catch (err: unknown) {
      toast({ title: 'Could not save', description: getUserFriendlyError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <SEOHead
        title="Choose account type – VANO"
        description="Select whether you are joining as a freelancer or a business."
      />
      <div className="w-full max-w-md space-y-8">
        <OnboardingJourney currentPage={2} />
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <img src={logo} alt="" className="h-10 w-10 rounded-xl" />
            <span className="text-2xl font-bold text-primary">VANO</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">How will you use VANO?</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Choose Freelancer if you are a student looking for gigs, or Business if you are hiring.
          </p>
        </div>

        <form onSubmit={handleContinue} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              data-mascot="choose-student"
              onClick={() => setSelected('student')}
              disabled={saving}
              className={cn(
                'group relative flex flex-col items-start gap-2.5 overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected === 'student'
                  ? 'border-emerald-500/50 bg-emerald-500/[0.06] shadow-[0_0_0_1px_rgba(16,185,129,0.1)]'
                  : 'border-foreground/[0.06] bg-muted/30 hover:border-emerald-500/30 hover:bg-emerald-500/[0.03]',
              )}
            >
              <div className={cn(
                'pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 transition-opacity duration-500',
                selected === 'student' ? 'opacity-100' : 'group-hover:opacity-60',
              )} />
              <span className={cn(
                'relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-300',
                selected === 'student' ? 'bg-emerald-500/15' : 'bg-muted/60',
              )}>
                <GraduationCap className="text-emerald-600" size={20} strokeWidth={1.8} />
              </span>
              <div className="relative">
                <span className="block text-[14px] font-semibold text-foreground">Freelancer</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                  Offer services &amp; build your portfolio
                </span>
              </div>
            </button>
            <button
              type="button"
              data-mascot="choose-business"
              onClick={() => setSelected('business')}
              disabled={saving}
              className={cn(
                'group relative flex flex-col items-start gap-2.5 overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected === 'business'
                  ? 'border-sky-500/50 bg-sky-500/[0.06] shadow-[0_0_0_1px_rgba(14,165,233,0.1)]'
                  : 'border-foreground/[0.06] bg-muted/30 hover:border-sky-500/30 hover:bg-sky-500/[0.03]',
              )}
            >
              <div className={cn(
                'pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/10 to-transparent opacity-0 transition-opacity duration-500',
                selected === 'business' ? 'opacity-100' : 'group-hover:opacity-60',
              )} />
              <span className={cn(
                'relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-300',
                selected === 'business' ? 'bg-sky-500/15' : 'bg-muted/60',
              )}>
                <Building2 className="text-sky-600" size={20} strokeWidth={1.8} />
              </span>
              <div className="relative">
                <span className="block text-[14px] font-semibold text-foreground">Business</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                  Find creative talent for your business
                </span>
              </div>
            </button>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-[15px] hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 min-h-[48px]"
          >
            {saving ? (
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

export default ChooseAccountType;
