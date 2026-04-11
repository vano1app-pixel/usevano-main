import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { AvatarUpload } from '@/components/AvatarUpload';
import { getUserFriendlyError } from '@/lib/errorMessages';
import logo from '@/assets/logo.png';
import { Phone, Tag, UserCircle } from 'lucide-react';
import { OnboardingJourney } from '@/components/OnboardingJourney';

const SKILL_OPTIONS = [
  'Video editing', 'Filming', 'Reels', 'Drone', 'Promo video', 'Wedding film', 'Corporate video',
  'Photography', 'Portrait', 'Headshots', 'Product photos', 'Event photos', 'Wedding photo',
  'Web design', 'WordPress', 'React', 'Shopify', 'Figma', 'Webflow', 'Framer',
  'Social media', 'Content creation', 'Instagram', 'TikTok', 'Canva', 'Copywriting', 'Marketing',
];

const CompleteProfile = () => {
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userType, setUserType] = useState<string | null>(null);
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
        .select('display_name, avatar_url, user_type')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!profile?.user_type?.trim()) {
        navigate('/choose-account-type', { replace: true });
        return;
      }

      const nameDone = !!profile?.display_name?.trim();
      const avatarDone = !!profile?.avatar_url?.trim();
      const isBiz = profile.user_type === 'business';
      if (isBiz ? nameDone : nameDone && avatarDone) {
        navigate(isBiz ? '/business-dashboard' : '/profile', { replace: true });
        return;
      }

      setUserType(profile?.user_type || null);
      setDisplayName(profile?.display_name || '');
      setAvatarUrl(profile?.avatar_url || '');
      setChecking(false);
    };
    check();
  }, [navigate]);

  const toggleSkill = (skill: string) => {
    setSkills(prev =>
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    );
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    if (userType !== 'business' && !avatarUrl.trim()) {
      toast({ title: 'Please upload a profile photo', variant: 'destructive' });
      return;
    }
    if (userType === 'business' && !phone.trim()) {
      toast({ title: 'Phone number is required', variant: 'destructive' });
      return;
    }
    // Phone is optional here — collected later in the listing wizard

    setLoading(true);
    try {
      const profileUpdate: Record<string, string> = { display_name: displayName.trim() };
      if (avatarUrl) profileUpdate.avatar_url = avatarUrl;
      // Business: store phone in work_description (profiles has no phone column)
      if (userType === 'business' && phone.trim()) profileUpdate.work_description = phone.trim();

      await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('user_id', userId!);

      if (userType === 'student') {
        await supabase
          .from('student_profiles')
          .update({
            avatar_url: avatarUrl,
            phone: phone.trim(),
            skills: skills.length > 0 ? skills : null,
          })
          .eq('user_id', userId!);
      }

      toast({ title: 'Profile complete' });
      navigate(userType === 'student' ? '/profile' : '/business-dashboard', { replace: true });
    } catch (error: any) {
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

  const isStudent = userType === 'student';
  const inputClass = "w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4 py-8">
      <SEOHead title="Almost there – VANO" description="Tell us what you do so businesses can find you" />
      <div className="w-full max-w-md">
        <OnboardingJourney currentPage={3} className="mb-4" />
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src={logo} alt="VANO" className="h-10 w-10 rounded-xl" />
            <span className="text-2xl font-bold text-primary">VANO</span>
          </div>
          {isStudent ? (
            <>
              <h1 className="text-2xl font-bold text-foreground">Almost there</h1>
              <p className="text-sm text-muted-foreground mt-1">Tell us what you do so businesses can find you</p>
            </>
          ) : (
            <>
              <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <UserCircle className="text-primary" size={32} />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Complete your profile</h1>
              <p className="text-sm text-muted-foreground mt-1">Add your name and phone number so we can reach you</p>
            </>
          )}
        </div>

        <div className="bg-card border border-foreground/6 rounded-2xl p-6 md:p-8 shadow-tinted">
          <form onSubmit={handleComplete} className="space-y-6">
            {isStudent && (
              <div className="flex justify-center">
                <AvatarUpload
                  userId={userId!}
                  currentUrl={avatarUrl}
                  table="student_profiles"
                  onUploaded={(url) => setAvatarUrl(url)}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5">
                {userType === 'business' ? 'Name' : 'Your Name'}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className={inputClass}
                placeholder={userType === 'business' ? "How you'd like to appear" : 'John Doe'}
                autoFocus
              />
            </div>

            {/* Phone field — optional for students, required for business */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                <Phone size={14} className="text-muted-foreground" />
                Phone number
                {isStudent && <span className="text-xs text-muted-foreground font-normal ml-1">(optional)</span>}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                placeholder="e.g. 089 123 4567"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {isStudent ? 'Only shared with VANO team, not displayed publicly' : 'So we can reach you quickly'}
              </p>
            </div>

            {isStudent && (
              <>

                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium mb-3">
                    <Tag size={14} className="text-muted-foreground" />
                    Skills
                    <span className="text-xs text-muted-foreground font-normal ml-1">(select any that apply)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {SKILL_OPTIONS.map(skill => (
                      <button
                        type="button"
                        key={skill}
                        onClick={() => toggleSkill(skill)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          skills.includes(skill)
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-foreground hover:border-primary/60'
                        }`}
                      >
                        {skill}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading || !displayName.trim() || (isStudent ? !avatarUrl.trim() : !phone.trim())}
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
