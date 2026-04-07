import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getUserFriendlyError } from '@/lib/errorMessages';
import logo from '@/assets/logo.png';
import { Phone, Tag } from 'lucide-react';

const SKILL_OPTIONS = [
  'Video editing', 'Filming', 'Reels', 'Drone', 'Promo video', 'Wedding film', 'Corporate video',
  'Photography', 'Portrait', 'Headshots', 'Product photos', 'Event photos', 'Wedding photo',
  'Web design', 'WordPress', 'React', 'Shopify', 'Figma', 'Webflow', 'Framer',
  'Social media', 'Content creation', 'Instagram', 'TikTok', 'Canva', 'Copywriting', 'Marketing',
];

export const PhoneRequiredModal = () => {
  const [show, setShow] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const checkNeeded = async (uid: string) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type, display_name, avatar_url')
        .eq('user_id', uid)
        .maybeSingle();

      if (profile?.user_type !== 'student') return;
      if (!profile?.display_name?.trim() || !profile?.avatar_url?.trim()) return;

      const { data: sp } = await supabase
        .from('student_profiles')
        .select('phone, skills')
        .eq('user_id', uid)
        .maybeSingle();

      if (!sp?.phone?.trim() || !sp?.skills?.length) {
        setUserId(uid);
        setPhone(sp?.phone || '');
        setSkills(sp?.skills || []);
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
    if (!phone.trim()) {
      toast({ title: 'Phone number is required', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await supabase
        .from('student_profiles')
        .update({ phone: phone.trim(), skills: skills.length > 0 ? skills : null })
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
          <h2 className="text-lg font-bold text-foreground">One more thing</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Add your details so businesses can find and contact you
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
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
              autoFocus
              className="w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. 089 123 4567"
            />
            <p className="mt-1 text-xs text-muted-foreground">Only shared with VANO team, not displayed publicly</p>
          </div>

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
