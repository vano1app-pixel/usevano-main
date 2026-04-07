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
      const { data: existing } = await supabase.from('profiles').select('user_id').eq('user_id', uid).maybeSingle();
      const display =
        (session.user.user_metadata?.full_name as string | undefined) ||
        session.user.email?.split('@')[0] ||
        'User';
      if (!existing) {
        const { error: insErr } = await supabase.from('profiles').insert({
          user_id: uid,
          display_name: display,
          user_type: selected,
        });
        if (insErr) throw insErr;
      } else {
        const { error: upErr } = await supabase.from('profiles').update({ user_type: selected }).eq('user_id', uid);
        if (upErr) throw upErr;
      }
      if (selected === 'student') {
        const { error: spErr } = await supabase.from('student_profiles').upsert({ user_id: uid }, { onConflict: 'user_id' });
        if (spErr) throw spErr;
      }
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
              onClick={() => setSelected('student')}
              disabled={saving}
              className={cn(
                'rounded-xl border-2 px-4 py-4 text-left transition-all min-h-[96px] flex flex-col gap-1',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected === 'student'
                  ? 'border-emerald-500/70 bg-emerald-500/[0.07] shadow-sm'
                  : 'border-border bg-muted/30 hover:border-emerald-500/25',
              )}
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <GraduationCap className="text-emerald-600 shrink-0" size={18} />
                Freelancer
              </span>
              <span className="text-xs text-muted-foreground leading-snug">Find gigs &amp; build your portfolio</span>
            </button>
            <button
              type="button"
              onClick={() => setSelected('business')}
              disabled={saving}
              className={cn(
                'rounded-xl border-2 px-4 py-4 text-left transition-all min-h-[96px] flex flex-col gap-1',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected === 'business'
                  ? 'border-sky-500/70 bg-sky-500/[0.07] shadow-sm'
                  : 'border-border bg-muted/30 hover:border-sky-500/25',
              )}
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <Building2 className="text-sky-600 shrink-0" size={18} />
                Business
              </span>
              <span className="text-xs text-muted-foreground leading-snug">Post jobs &amp; hire students</span>
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
