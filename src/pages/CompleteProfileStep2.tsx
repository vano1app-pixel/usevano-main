import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { getUserFriendlyError } from '@/lib/errorMessages';
import logo from '@/assets/logo.png';
import { Phone, Video, Camera, Monitor, Megaphone, Check, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { id: 'videography', label: 'Videography', icon: Video, skills: ['Video Editing', 'Filming', 'Reels', 'Drone', 'Motion Graphics'] },
  { id: 'photography', label: 'Photography', icon: Camera, skills: ['Photography', 'Portrait', 'Product Photo', 'Event Photography', 'Lightroom'] },
  { id: 'websites', label: 'Web Design', icon: Monitor, skills: ['Web Design', 'WordPress', 'Shopify', 'HTML/CSS', 'Frontend Development'] },
  { id: 'social_media', label: 'Social Media', icon: Megaphone, skills: ['Social Media', 'Content Creation', 'TikTok', 'Instagram', 'Marketing Strategy'] },
];

/**
 * Step 2 of profile completion for freelancers.
 * New signups: collects phone + category/skills via tappable tags.
 * Existing users missing phone only: collects just the phone number.
 */
const CompleteProfileStep2 = () => {
  const [phone, setPhone] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [phoneOnly, setPhoneOnly] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/auth'); return; }

      const uid = session.user.id;
      setUserId(uid);

      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('user_id', uid)
        .maybeSingle();

      if (profile?.user_type !== 'student') {
        navigate('/profile', { replace: true });
        return;
      }

      const { data: sp } = await supabase
        .from('student_profiles')
        .select('phone, bio, skills')
        .eq('user_id', uid)
        .maybeSingle();

      if (sp?.phone?.trim()) {
        navigate('/profile', { replace: true });
        return;
      }

      const hasBio = sp?.bio?.trim();
      const hasSkills = Array.isArray(sp?.skills) && sp!.skills.length > 0;
      if (hasBio && hasSkills) {
        setPhoneOnly(true);
      }

      setChecking(false);
    };
    check();
  }, [navigate]);

  const toggleCategory = (catId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId]
    );
  };

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : prev.length < 10 ? [...prev, skill] : prev
    );
  };

  // Get all skills from selected categories
  const availableSkills = CATEGORIES
    .filter((c) => selectedCategories.includes(c.id))
    .flatMap((c) => c.skills);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone.trim()) {
      toast({ title: 'Phone number is required', variant: 'destructive' });
      return;
    }
    if (!phoneOnly && selectedCategories.length === 0) {
      toast({ title: 'Pick at least one category', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const updates: any = { phone: phone.trim() };
      if (!phoneOnly) {
        // Build skills from selected categories + specific skills
        const allSkills = [...new Set([
          ...selectedCategories.map((id) => CATEGORIES.find((c) => c.id === id)!.label),
          ...selectedSkills,
        ])];
        updates.skills = allSkills;
        // Auto-generate a bio from their categories
        const catLabels = selectedCategories.map((id) => CATEGORIES.find((c) => c.id === id)!.label);
        updates.bio = catLabels.join(', ') + ' freelancer based in Galway';
      }

      const { error } = await supabase
        .from('student_profiles')
        .update(updates)
        .eq('user_id', userId!);

      if (error) throw error;

      toast({ title: phoneOnly ? 'Phone saved!' : 'Profile complete!' });
      navigate('/profile', { replace: true });
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

  const inputClass = 'w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary/50 transition-colors';

  return (
    <div className="relative min-h-[100dvh] bg-background flex items-center justify-center px-4 overflow-hidden">
      {/* Gradient orb */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] sm:w-[500px] sm:h-[500px] rounded-full bg-gradient-to-br from-primary/[0.06] via-transparent to-emerald-500/[0.04] blur-2xl" />

      <SEOHead title="Complete Your Profile – VANO" description="Add your details to get started" />
      <div className="relative w-full max-w-md animate-fade-in">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <img src={logo} alt="VANO" className="h-10 w-10 rounded-xl" />
            <span className="text-2xl font-bold text-primary">VANO</span>
          </div>

          {/* Step dots */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="h-2 w-2 rounded-full bg-border" />
          </div>

          <h1 className="text-2xl font-bold text-foreground">
            {phoneOnly ? 'One more thing' : 'What do you do?'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {phoneOnly
              ? 'Add your phone number so businesses can reach you'
              : 'Pick your categories and we\'ll set up your profile'}
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 md:p-7">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Phone number — always shown */}
            <div>
              <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                <Phone size={14} className="text-primary/70" />
                Phone number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className={inputClass}
                placeholder="089 XXX XXXX"
                autoFocus
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Only shared with VANO team, not displayed publicly</p>
            </div>

            {/* Category selection — tap to select */}
            {!phoneOnly && (
              <div>
                <label className="mb-2 block text-sm font-medium">What do you offer?</label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => {
                    const selected = selectedCategories.includes(cat.id);
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleCategory(cat.id)}
                        className={cn(
                          'group relative flex items-center gap-2.5 rounded-xl border-2 p-3 text-left transition-all active:scale-[0.97]',
                          selected
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-border bg-background hover:border-foreground/20'
                        )}
                      >
                        <div className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                          selected ? 'bg-primary/15' : 'bg-muted'
                        )}>
                          <Icon size={16} className={cn(selected ? 'text-primary' : 'text-foreground/60')} />
                        </div>
                        <span className={cn(
                          'text-sm font-semibold',
                          selected ? 'text-primary' : 'text-foreground'
                        )}>
                          {cat.label}
                        </span>
                        {selected && (
                          <Check size={14} className="absolute right-2.5 top-2.5 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Skill tags — shown after selecting categories */}
            {!phoneOnly && availableSkills.length > 0 && (
              <div className="animate-fade-in">
                <label className="mb-2 block text-sm font-medium">Tap your skills</label>
                <div className="flex flex-wrap gap-2">
                  {availableSkills.map((skill) => {
                    const selected = selectedSkills.includes(skill);
                    return (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => toggleSkill(skill)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.95]',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-foreground/70 hover:border-foreground/25'
                        )}
                      >
                        {selected && <Check size={10} className="inline mr-1" />}
                        {skill}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !phone.trim() || (!phoneOnly && selectedCategories.length === 0)}
              className="group w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:brightness-110 shadow-md shadow-primary/20 transition-all disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? 'Saving...' : (
                <>Finish <ArrowRight size={14} className="inline ml-1 transition-transform group-hover:translate-x-1" /></>
              )}
            </button>

            {phoneOnly && (
              <p className="text-center text-[11px] text-muted-foreground">
                This is a one-time ask — we won't show this again.
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default CompleteProfileStep2;
