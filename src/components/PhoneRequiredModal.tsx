import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getUserFriendlyError } from '@/lib/errorMessages';
import logo from '@/assets/logo.png';
import { Phone } from 'lucide-react';

/**
 * Global modal that appears once for any logged-in student missing a phone number.
 * Once they submit, the phone is saved and the modal never appears again.
 */
export const PhoneRequiredModal = () => {
  const [show, setShow] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const checkPhone = async (uid: string) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type, display_name, avatar_url')
        .eq('user_id', uid)
        .maybeSingle();

      // Only prompt students with a complete profile (name + avatar) who are missing phone
      if (profile?.user_type !== 'student') return;
      if (!profile?.display_name?.trim() || !profile?.avatar_url?.trim()) return;

      const { data: sp } = await supabase
        .from('student_profiles')
        .select('phone')
        .eq('user_id', uid)
        .maybeSingle();

      if (!sp?.phone?.trim()) {
        setUserId(uid);
        setShow(true);
      }
    };

    // Check on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) checkPhone(session.user.id);
    });

    // Also check whenever auth state changes (i.e. on login)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        checkPhone(session.user.id);
      } else {
        setShow(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      toast({ title: 'Phone number is required', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await supabase
        .from('student_profiles')
        .update({ phone: phone.trim() })
        .eq('user_id', userId!);
      setShow(false);
    } catch (error: any) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-center gap-2 mb-4">
          <img src={logo} alt="VANO" className="h-8 w-8 rounded-xl" />
          <span className="text-lg font-bold text-primary">VANO</span>
        </div>
        <div className="mb-5 text-center">
          <h2 className="text-lg font-bold text-foreground">One more thing</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Add your phone number so the VANO team can reach you
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
              <Phone size={14} className="text-muted-foreground" />
              Phone number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoFocus
              className="w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. 089 123 4567"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Only shared with VANO team, not displayed publicly
            </p>
          </div>
          <button
            type="submit"
            disabled={loading || !phone.trim()}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save & continue →'}
          </button>
        </form>
      </div>
    </div>
  );
};
