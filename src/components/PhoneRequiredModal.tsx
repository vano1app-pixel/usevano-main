import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getUserFriendlyError } from '@/lib/errorMessages';
import logo from '@/assets/logo.png';
import { Phone, Tag, User } from 'lucide-react';

const SKILL_OPTIONS = ['Videography', 'Photography', 'Web design', 'Social media'];

export const PhoneRequiredModal = () => {
  const [show, setShow] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const checkNeeded = async (uid: string) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type, display_name')
        .eq('user_id', uid)
        .maybeSingle();

      if (profile?.user_type !== 'student') return;

      // New user — missing name
      if (!profile?.display_name?.trim()) {
        setUserId(uid);
        setIsNewUser(true);
        setShow(true);
        return;
      }

      // Existing user — check phone
      const { data: sp } = await supabase
        .from('student_profiles')
        .select('phone')
        .eq('user_id', uid)
        .maybeSingle();

      if (!sp?.phone?.trim()) {
        setUserId(uid);
        setIsNewUser(false);
        setShow(true);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) checkNeeded(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        checkNeeded(session.user.id);
      } else {
        setShow(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const toggleSkill = (skill: string) =>
    setSkills(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNewUser && !displayName.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    if (!phone.trim()) {
      toast({ title: 'Phone number is required', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      if (isNewUser) {
        await supabase
          .from('profiles')
          .update({ display_name: displayName.trim() })
          .eq('user_id', userId!);
      }
      await supabase
        .from('student_profiles')
        .update({
          phone: phone.trim(),
          ...(isNewUser && skills.length > 0 ? { skills } : {}),
        })
        .eq('user_id', userId!);
      setShow(false);
      navigate('/profile');
    } catch (error: any) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-center gap-2 mb-4">
          <img src={logo} alt="VANO" className="h-8 w-8 rounded-xl" />
          <span className="text-lg font-bold text-primary">VANO</span>
        </div>
        <div className="mb-5 text-center">
          <h2 className="text-lg font-bold text-foreground">
            {isNewUser ? 'Almost there' : 'One more thing'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isNewUser
              ? 'Tell us about yourself so businesses can find you'
              : 'Add your phone number so the VANO team can reach you'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {isNewUser && (
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                <User size={14} className="text-muted-foreground" />
                Your name <span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                autoFocus
                className="w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="John Doe"
              />
            </div>
          )}

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
              <Phone size={14} className="text-muted-foreground" />
              Phone number <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoFocus={!isNewUser}
              className="w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. 089 123 4567"
            />
            <p className="mt-1 text-xs text-muted-foreground">Only shared with VANO team, not displayed publicly</p>
          </div>

          {isNewUser && (
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium mb-3">
                <Tag size={14} className="text-muted-foreground" />
                What do you do?
                <span className="text-xs text-muted-foreground font-normal ml-1">(select any that apply)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {SKILL_OPTIONS.map(skill => (
                  <button
                    type="button"
                    key={skill}
                    onClick={() => toggleSkill(skill)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
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
          )}

          <button
            type="submit"
            disabled={loading || (isNewUser && !displayName.trim()) || !phone.trim()}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : "Let's go →"}
          </button>
        </form>
      </div>
    </div>
  );
};
