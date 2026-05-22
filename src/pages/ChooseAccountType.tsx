import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { resolvePostGoogleAuthDestination } from '@/lib/authSession';
import { GraduationCap, Building2, Home, Loader2 } from 'lucide-react';
import logo from '@/assets/logo.png';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getUserFriendlyError } from '@/lib/errorMessages';

type AccountType = 'student' | 'business' | 'customer';

interface AccountOption {
  id: AccountType;
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;
  label: string;
  sub: string;
  selectedClass: string;
  iconClass: string;
  iconBg: string;
}

const OPTIONS: AccountOption[] = [
  {
    id: 'customer',
    icon: Home,
    label: 'I need help around the house',
    sub: 'Book vetted ATU students for everyday tasks in Galway',
    selectedClass: 'border-sage/50 bg-sage/[0.06] shadow-[0_0_0_1px_hsl(var(--sage)/0.12)]',
    iconClass: 'text-sage',
    iconBg: 'bg-sage/10',
  },
  {
    id: 'student',
    icon: GraduationCap,
    label: 'I\'m an ATU student',
    sub: 'Earn money helping households in Galway',
    selectedClass: 'border-emerald-500/50 bg-emerald-500/[0.06] shadow-[0_0_0_1px_rgba(16,185,129,0.1)]',
    iconClass: 'text-emerald-600',
    iconBg: 'bg-emerald-500/10',
  },
  {
    id: 'business',
    icon: Building2,
    label: 'I\'m hiring for a business',
    sub: 'Find creative freelancers for your company',
    selectedClass: 'border-sky-500/50 bg-sky-500/[0.06] shadow-[0_0_0_1px_rgba(14,165,233,0.1)]',
    iconClass: 'text-sky-600',
    iconBg: 'bg-sky-500/10',
  },
];

/**
 * Shown after sign-in when profiles.user_type is not yet set.
 * Customer option is first and largest — it's the pivot direction.
 */
const ChooseAccountType = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<AccountType>('customer');

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
    return () => { cancelled = true; };
  }, [navigate]);

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { navigate('/auth', { replace: true }); return; }

      const uid = session.user.id;
      const display =
        (session.user.user_metadata?.full_name as string | undefined) ||
        session.user.email?.split('@')?.[0] ||
        'User';

      const profileWrite = await supabase
        .from('profiles')
        .upsert(
          { user_id: uid, display_name: display, user_type: selected },
          { onConflict: 'user_id', ignoreDuplicates: false },
        );

      // Seed the type-specific profile row in parallel
      const secondWrite =
        selected === 'student'
          ? await supabase.from('student_profiles').upsert({ user_id: uid }, { onConflict: 'user_id' })
          : null;

      const err = profileWrite.error ?? secondWrite?.error ?? null;
      if (err) throw err;

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
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-4 py-12">
      <SEOHead
        title="How will you use VANO?"
        description="Choose how you'll use VANO — household help, student work, or business hiring."
        noindex
      />

      <div className="w-full max-w-sm space-y-8">
        {/* Logo + heading */}
        <div className="text-center space-y-3">
          <img src={logo} alt="VANO" className="h-9 w-auto mx-auto" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            How will you use VANO?
          </h1>
        </div>

        <form onSubmit={handleContinue} className="space-y-6">
          <div className="flex flex-col gap-3">
            {OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = selected === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelected(opt.id)}
                  disabled={saving}
                  className={cn(
                    'relative flex items-center gap-4 rounded-2xl border p-4 text-left',
                    'transition-[border-color,background-color,box-shadow] duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    'active:scale-[0.98]',
                    isSelected
                      ? opt.selectedClass
                      : 'border-border/60 bg-transparent hover:border-border hover:bg-secondary/40',
                  )}
                >
                  <span className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl', opt.iconBg)}>
                    <Icon size={20} strokeWidth={1.8} className={opt.iconClass} />
                  </span>
                  <div className="min-w-0">
                    <span className="block text-[14px] font-semibold text-foreground leading-snug">
                      {opt.label}
                    </span>
                    <span className="block text-[12px] leading-relaxed text-muted-foreground mt-0.5">
                      {opt.sub}
                    </span>
                  </div>
                  {/* Selection indicator ring */}
                  {isSelected && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-primary flex items-center justify-center flex-shrink-0">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Phone auth placeholder — UI space reserved for future phone OTP flow */}
          <p className="text-center text-xs text-muted-foreground">
            No Google account?{' '}
            <button
              type="button"
              className="text-foreground/60 underline underline-offset-2 cursor-not-allowed"
              title="Coming soon"
            >
              Sign in with phone
            </button>
          </p>

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[52px] rounded-2xl bg-primary text-primary-foreground font-semibold text-[15px] hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
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
