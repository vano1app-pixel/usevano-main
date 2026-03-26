import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { getUserFriendlyError } from '@/lib/errorMessages';
import logo from '@/assets/logo.png';
import { KeyRound } from 'lucide-react';

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Recovery links (PKCE / hash) can populate session shortly after load
      for (let i = 0; i < 12; i++) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          if (!cancelled) setReady(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      if (!cancelled) {
        toast({
          title: 'Link expired or invalid',
          description: 'Request a new reset link from the log in page.',
          variant: 'destructive',
        });
        navigate('/auth');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, toast]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: 'Passwords don\'t match', variant: 'destructive' });
      return;
    }
    if (password.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: 'Password updated!', description: 'You can now sign in with your new password.' });
      navigate('/profile');
    } catch (error: any) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring";

  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <SEOHead title="Reset Password – VANO" description="Reset your VANO password" />
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">Verifying session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <SEOHead title="Reset Password – VANO" description="Set a new password for your VANO account" />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src={logo} alt="VANO" className="h-10 w-10 rounded-xl" />
            <span className="text-2xl font-bold text-primary">VANO</span>
          </div>
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <KeyRound className="text-primary" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Set new password</h1>
          <p className="text-sm text-muted-foreground mt-1">Choose a strong password for your account</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 md:p-8">
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">New Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className={inputClass} placeholder="••••••••" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Confirm Password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} className={inputClass} placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading} className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
