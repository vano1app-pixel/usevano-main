import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { getUserFriendlyError } from '@/lib/errorMessages';
import logo from '@/assets/logo.png';
import { Phone, Briefcase, Tag, X } from 'lucide-react';

/**
 * Step 2 of profile completion for freelancers.
 * New signups: collects phone, bio, and at least 1 skill.
 * Existing users missing phone only: collects just the phone number.
 */
const CompleteProfileStep2 = () => {
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [phoneOnly, setPhoneOnly] = useState(false);
  const skillInputRef = useRef<HTMLInputElement>(null);
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

      // Only for students
      if (profile?.user_type !== 'student') {
        navigate('/profile', { replace: true });
        return;
      }

      const { data: sp } = await supabase
        .from('student_profiles')
        .select('phone, bio, skills')
        .eq('user_id', uid)
        .maybeSingle();

      // If they already have a phone, they're done
      if (sp?.phone?.trim()) {
        navigate('/profile', { replace: true });
        return;
      }

      // Check if they have bio + skills already (existing user, just need phone)
      const hasBio = sp?.bio?.trim();
      const hasSkills = Array.isArray(sp?.skills) && sp!.skills.length > 0;
      if (hasBio && hasSkills) {
        setPhoneOnly(true);
      } else {
        // Pre-fill what they have
        if (hasBio) setBio(sp!.bio!);
        if (hasSkills) setSkills(sp!.skills as string[]);
      }

      setChecking(false);
    };
    check();
  }, [navigate]);

  const addSkill = (raw: string) => {
    const val = raw.trim().replace(/,+$/, '').trim();
    if (!val) return;
    const formatted = val.charAt(0).toUpperCase() + val.slice(1);
    if (!skills.includes(formatted) && skills.length < 10) {
      setSkills((prev) => [...prev, formatted]);
    }
    setSkillInput('');
  };

  const removeSkill = (skill: string) => setSkills((prev) => prev.filter((s) => s !== skill));

  const handleSkillKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addSkill(skillInput); }
    if (e.key === ',') { e.preventDefault(); addSkill(skillInput); }
    if (e.key === 'Backspace' && !skillInput && skills.length > 0) {
      setSkills((prev) => prev.slice(0, -1));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone.trim()) {
      toast({ title: 'Phone number is required', variant: 'destructive' });
      return;
    }
    if (!phoneOnly && !bio.trim()) {
      toast({ title: 'Please add a short bio', variant: 'destructive' });
      return;
    }
    if (!phoneOnly && skills.length === 0) {
      toast({ title: 'Add at least one skill', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const updates: any = { phone: phone.trim() };
      if (!phoneOnly) {
        updates.bio = bio.trim();
        updates.skills = skills;
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

  const inputClass = 'w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <SEOHead title="Complete Your Profile – VANO" description="Add your details to get started" />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src={logo} alt="VANO" className="h-10 w-10 rounded-xl" />
            <span className="text-2xl font-bold text-primary">VANO</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {phoneOnly ? 'One more thing' : 'Almost there'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {phoneOnly
              ? 'Add your phone number so businesses can reach you'
              : 'Tell us what you do so businesses can find you'}
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 md:p-8">
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

            {/* Bio — only for new signups */}
            {!phoneOnly && (
              <div>
                <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                  <Briefcase size={14} className="text-primary/70" />
                  What do you do?
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  required
                  className={`${inputClass} min-h-[80px] resize-y`}
                  placeholder="e.g. I shoot short-form video content for brands and events in Galway"
                />
              </div>
            )}

            {/* Skills — only for new signups */}
            {!phoneOnly && (
              <div>
                <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                  <Tag size={14} className="text-primary/70" />
                  Skills (at least 1)
                </label>
                <div
                  className="flex min-h-[44px] cursor-text flex-wrap gap-1.5 rounded-xl border border-input bg-background px-3 py-2"
                  onClick={() => skillInputRef.current?.focus()}
                >
                  {skills.map((skill) => (
                    <span key={skill} className="inline-flex items-center gap-1 rounded-md bg-foreground/8 px-2 py-0.5 text-[12px] font-medium text-foreground">
                      {skill}
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeSkill(skill); }} className="text-muted-foreground hover:text-foreground">
                        <X size={11} strokeWidth={2.5} />
                      </button>
                    </span>
                  ))}
                  {skills.length < 10 && (
                    <input
                      ref={skillInputRef}
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={handleSkillKeyDown}
                      onBlur={() => addSkill(skillInput)}
                      placeholder={skills.length === 0 ? 'e.g. Video Editing, Photography…' : ''}
                      className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                    />
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !phone.trim() || (!phoneOnly && (!bio.trim() || skills.length === 0))}
              className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Finish →'}
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
