import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { getUserFriendlyError } from '@/lib/errorMessages';
import logo from '@/assets/logo.png';
import { Phone, UserCircle } from 'lucide-react';

// Businesses only. Freelancers are routed straight to /list-on-community by
// getPostAuthPath — the wizard captures bio, phone, skills, banner, etc., and
// display_name is seeded from OAuth metadata by the handle_new_user trigger.

const CompleteProfile = () => {
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }

      setUserId(session.user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, phone, user_type')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!profile?.user_type?.trim()) {
        navigate('/choose-account-type', { replace: true });
        return;
      }
      // Students have their own onboarding path; never land here.
      if (profile.user_type === 'student') {
        navigate('/list-on-community', { replace: true });
        return;
      }

      const nameDone = !!profile?.display_name?.trim();
      const phoneDone = !!profile?.phone?.trim();
      if (nameDone && phoneDone) {
        navigate('/business-dashboard', { replace: true });
        return;
      }

      setDisplayName(profile?.display_name || '');
      setPhone(profile?.phone || '');
      setChecking(false);
    };
    check();
  }, [navigate]);

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    if (!phone.trim()) {
      toast({ title: 'Phone number is required', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      await supabase
        .from('profiles')
        .update({ display_name: displayName.trim(), phone: phone.trim() })
        .eq('user_id', userId!);

      toast({ title: 'Profile complete' });
      navigate('/business-dashboard', { replace: true });
    } catch (error: unknown) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const inputClass = "w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4 py-8">
      <SEOHead title="Almost there – VANO" description="Tell us a bit about your business" noindex />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src={logo} alt="VANO" className="h-10 w-10 rounded-xl" />
            <span className="text-2xl font-bold text-primary">VANO</span>
          </div>
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <UserCircle className="text-primary" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Complete your profile</h1>
          <p className="text-sm text-muted-foreground mt-1">Add your name and phone number so we can reach you</p>
        </div>

        <div className="bg-card border border-foreground/6 rounded-2xl p-6 md:p-8 shadow-tinted">
          <form onSubmit={handleComplete} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-1.5">Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className={inputClass}
                placeholder="How you'd like to appear"
                autoFocus
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                <Phone size={14} className="text-muted-foreground" />
                Phone number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                placeholder="e.g. 089 123 4567"
                autoComplete="tel"
                inputMode="tel"
                required
                aria-required="true"
              />
              <p className="mt-1 text-xs text-muted-foreground">So we can reach you quickly</p>
            </div>

            <button
              type="submit"
              disabled={loading || !displayName.trim() || !phone.trim()}
              className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Continue →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CompleteProfile;
