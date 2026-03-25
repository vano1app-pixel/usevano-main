import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { AvatarUpload } from '@/components/AvatarUpload';
import { getUserFriendlyError } from '@/lib/errorMessages';
import logo from '@/assets/logo.png';
import { UserCircle } from 'lucide-react';

const CompleteProfile = () => {
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userType, setUserType] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/auth'); return; }

      setUserId(session.user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, user_type')
        .eq('user_id', session.user.id)
        .maybeSingle();

      // If profile is already complete, redirect away
      if (profile?.display_name && profile.display_name.trim() && profile?.avatar_url && profile.avatar_url.trim()) {
        navigate('/dashboard', { replace: true });
        return;
      }

      setUserType(profile?.user_type || null);
      setDisplayName(profile?.display_name || '');
      setAvatarUrl(profile?.avatar_url || '');
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
    if (!avatarUrl.trim()) {
      toast({ title: 'Please upload a profile photo', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const updates: any = { display_name: displayName.trim(), avatar_url: avatarUrl };
      await supabase.from('profiles').update(updates).eq('user_id', userId!);

      // Also update student_profiles avatar if student
      if (userType === 'student') {
        await supabase.from('student_profiles').update({ avatar_url: avatarUrl }).eq('user_id', userId!);
      }

      toast({ title: 'Profile complete! 🎉' });
      navigate('/dashboard', { replace: true });
    } catch (error: any) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const inputClass = "w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <SEOHead title="Complete Your Profile – VANO" description="Add your name and photo to get started" />
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
          <p className="text-sm text-muted-foreground mt-1">Add your name and a photo so people know who you are</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 md:p-8">
          <form onSubmit={handleComplete} className="space-y-6">
            <div className="flex justify-center">
              <AvatarUpload
                userId={userId!}
                currentUrl={avatarUrl}
                table={userType === 'student' ? 'student_profiles' : 'profiles'}
                onUploaded={(url) => setAvatarUrl(url)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                {userType === 'business' ? 'Business Name' : 'Your Name'}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className={inputClass}
                placeholder={userType === 'business' ? 'Acme Ltd' : 'John Doe'}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading || !displayName.trim() || !avatarUrl.trim()}
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
