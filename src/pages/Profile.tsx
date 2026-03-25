import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { useToast } from '@/hooks/use-toast';
import { TagBadge } from '@/components/TagBadge';
import { AvatarUpload } from '@/components/AvatarUpload';
import { GigPreferences } from '@/components/GigPreferences';
import { NotificationPreferences } from '@/components/NotificationPreferences';
import { AIProfileCoach } from '@/components/AIProfileCoach';
import { PortfolioManager } from '@/components/PortfolioManager';
import { useNavigate } from 'react-router-dom';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import { Phone, Euro, CheckCircle, ExternalLink, Briefcase, GraduationCap, Trash2, CreditCard, Eye, EyeOff, Lightbulb, Loader2 } from 'lucide-react';
import { ModBadge } from '@/components/ModBadge';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { format } from 'date-fns';
import { getUserFriendlyError } from '@/lib/errorMessages';

const COMMON_SKILLS = ['Web Design', 'Marketing', 'Graphic Design', 'Writing', 'Tutoring', 'Gardening', 'Cleaning', 'Photography', 'Video Editing', 'Social Media', 'Odd Jobs', 'Events', 'Delivery', 'Admin'];

const ModBadgeIfAdmin = ({ userId }: { userId: string }) => {
  const isAdmin = useIsAdmin(userId);
  return isAdmin ? <ModBadge /> : null;
};

const Profile = () => {
  const navigate = useNavigate();
  useProfileCompletion();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [hourlyRate, setHourlyRate] = useState('');
  const [phone, setPhone] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [university, setUniversity] = useState('');
  const [customSkill, setCustomSkill] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [paymentDetails, setPaymentDetails] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [choosingType, setChoosingType] = useState(false);
  const [myGigs, setMyGigs] = useState<any[]>([]);
  const [deletingGig, setDeletingGig] = useState<string | null>(null);
  const [portfolioCount, setPortfolioCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [studentPricingAdvice, setStudentPricingAdvice] = useState<{ suggestedMin: number; suggestedMax: number; reasoning: string } | null>(null);
  const [loadingStudentPrice, setLoadingStudentPrice] = useState(false);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate('/auth'); return; }
    setUser(session.user);

    let { data: prof } = await supabase.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle();

    // Auto-create profile if missing
    if (!prof) {
      const { data: newProf } = await supabase.from('profiles').insert({
        user_id: session.user.id,
        display_name: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || '',
      }).select().single();
      prof = newProf;
    }

    setProfile(prof);
    setDisplayName(prof?.display_name || '');
    setAvatarUrl(prof?.avatar_url || '');

    // If no user_type set, show type chooser
    if (!prof?.user_type) {
      setChoosingType(true);
      setLoading(false);
      return;
    }

    if (prof?.user_type === 'business') {
      setBio(prof?.bio || '');
      setWorkDescription(prof?.work_description || '');
      const { data: gigs } = await supabase.from('jobs').select('*').eq('posted_by', session.user.id).order('created_at', { ascending: false });
      setMyGigs(gigs || []);
    }

    if (prof?.user_type === 'student') {
      const { data: sp } = await supabase.from('student_profiles').select('*').eq('user_id', session.user.id).maybeSingle();
      if (sp) {
        setStudentProfile(sp);
        setBio(sp.bio || '');
        setSkills(sp.skills || []);
        setHourlyRate(sp.hourly_rate?.toString() || '');
        setPhone(sp.phone || '');
        setIsAvailable(sp.is_available);
        setUniversity((sp as any).university || '');
        setPaymentDetails((sp as any).payment_details || '');
        if (sp.avatar_url) setAvatarUrl(sp.avatar_url);
      }
      const { data: gigs } = await supabase.from('jobs').select('*').eq('posted_by', session.user.id).order('created_at', { ascending: false });
      setMyGigs(gigs || []);
      // Load portfolio & review counts for AI coach
      const { count: pCount } = await supabase.from('portfolio_items').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id);
      setPortfolioCount(pCount || 0);
      const { count: rCount } = await supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('reviewee_id', session.user.id);
      setReviewCount(rCount || 0);
    }
    setLoading(false);
  };

  const selectUserType = async (type: 'student' | 'business') => {
    await supabase.from('profiles').update({ user_type: type }).eq('user_id', user.id);
    setProfile((prev: any) => ({ ...prev, user_type: type }));
    setChoosingType(false);

    if (type === 'student') {
      const { data: sp } = await supabase.from('student_profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (!sp) {
        await supabase.from('student_profiles').insert({ user_id: user.id });
        const { data: newSp } = await supabase.from('student_profiles').select('*').eq('user_id', user.id).maybeSingle();
        setStudentProfile(newSp);
      } else {
        setStudentProfile(sp);
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const profileUpdate: any = { display_name: displayName, avatar_url: avatarUrl };

    if (profile?.user_type === 'business') {
      profileUpdate.bio = bio;
      profileUpdate.work_description = workDescription;
    }

    await supabase.from('profiles').update(profileUpdate).eq('user_id', user.id);

    if (profile?.user_type === 'student') {
      const studentData = { bio, skills, hourly_rate: parseFloat(hourlyRate) || 0, phone, is_available: isAvailable, avatar_url: avatarUrl, payment_details: paymentDetails, university };
      if (studentProfile) {
        await supabase.from('student_profiles').update(studentData as any).eq('user_id', user.id);
      } else {
        await supabase.from('student_profiles').insert({ user_id: user.id, ...studentData } as any);
      }
    }
    toast({ title: 'Profile saved!' });
    setSaving(false);
  };

  const toggleSkill = (skill: string) => {
    setSkills((prev) => prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]);
  };

  const deleteGig = async (jobId: string) => {
    if (!window.confirm('Are you sure you want to delete this gig? This cannot be undone.')) return;
    setDeletingGig(jobId);
    await supabase.from('job_applications').delete().eq('job_id', jobId);
    await supabase.from('saved_jobs').delete().eq('job_id', jobId);
    await supabase.from('reviews').delete().eq('job_id', jobId);
    const { error } = await supabase.from('jobs').delete().eq('id', jobId);
    if (error) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } else {
      toast({ title: 'Gig deleted successfully' });
      setMyGigs((prev) => prev.filter((g) => g.id !== jobId));
    }
    setDeletingGig(null);
  };

  const addCustomSkill = () => {
    if (customSkill.trim() && !skills.includes(customSkill.trim())) {
      setSkills([...skills, customSkill.trim()]);
      setCustomSkill('');
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading profile...</p>
      </div>
    </div>
  );

  const inputClass = "w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring";

  // User type selection screen
  if (choosingType) {
    return (
      <div className="min-h-screen bg-background pb-16 md:pb-0">
        <SEOHead title="Choose Account Type – VANO" description="Select your account type on VANO." />
        <Navbar />
        <div className="max-w-lg mx-auto px-4 pt-24 pb-16">
          <h1 className="text-2xl font-bold mb-2 text-center">Welcome to VANO</h1>
          <p className="text-muted-foreground text-center mb-8">How will you use VANO?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => selectUserType('student')}
              className="bg-card border-2 border-border rounded-2xl p-6 text-center hover:border-primary transition-colors group"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                <GraduationCap className="text-primary" size={28} />
              </div>
              <h3 className="font-semibold text-lg mb-1">Freelancer</h3>
              <p className="text-sm text-muted-foreground">Find gigs, build your portfolio, and get hired</p>
            </button>
            <button
              onClick={() => selectUserType('business')}
              className="bg-card border-2 border-border rounded-2xl p-6 text-center hover:border-primary transition-colors group"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                <Briefcase className="text-primary" size={28} />
              </div>
              <h3 className="font-semibold text-lg mb-1">Business</h3>
              <p className="text-sm text-muted-foreground">Post gigs, find talent, and grow your business</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead title="My Profile – VANO" description="Manage your VANO profile." />
      <Navbar />
      <div className="max-w-2xl mx-auto px-3 sm:px-4 md:px-8 pt-20 sm:pt-24 pb-12 sm:pb-16">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-1 flex items-center gap-3">
            My Profile
            {user && <ModBadgeIfAdmin userId={user.id} />}
          </h1>
          <p className="text-muted-foreground">
            {profile?.user_type === 'student' ? 'Manage your freelancer profile — visible to businesses' : 'Manage your business profile — visible to freelancers'}
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6">
          {/* Avatar + Name — always visible */}
          <div className="flex items-start gap-5">
            <AvatarUpload
              userId={user.id}
              currentUrl={avatarUrl}
              table={profile?.user_type === 'student' ? 'student_profiles' : 'profiles'}
              onUploaded={(url) => {
                setAvatarUrl(url);
                if (profile?.user_type === 'student') {
                  setStudentProfile((prev: any) => prev ? { ...prev, avatar_url: url } : prev);
                }
              }}
            />
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1.5">
                {profile?.user_type === 'business' ? 'Business Name' : 'Display Name'}
              </label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} placeholder={profile?.user_type === 'business' ? 'Your business name' : 'Your name'} />
            </div>
          </div>

          {/* Bio — always visible */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              {profile?.user_type === 'business' ? 'About Your Business' : 'Bio'}
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className={`${inputClass} min-h-[100px] resize-none`}
              placeholder={profile?.user_type === 'business'
                ? 'Tell freelancers about your business, what you do, and what kind of work you typically need help with...'
                : 'Tell businesses about yourself, your experience, and what makes you a great hire...'}
            />
          </div>

          {/* Work Description — always visible */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              {profile?.user_type === 'business' ? 'Work Description / Services' : 'Work Experience'}
            </label>
            <textarea
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              className={`${inputClass} min-h-[120px] resize-none`}
              placeholder={profile?.user_type === 'business'
                ? 'Describe the kind of work you\'ve carried out, past projects, or services you offer...'
                : 'Describe your past work, projects completed, or relevant experience...'}
            />
          </div>

          {/* Student-specific fields */}
          {profile?.user_type === 'student' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium flex items-center gap-1.5">
                        <Euro size={14} className="text-primary" /> Hourly Rate (€)
                      </label>
                      <button
                        type="button"
                        onClick={async () => {
                          setLoadingStudentPrice(true);
                          setStudentPricingAdvice(null);
                          try {
                            const { data, error } = await supabase.functions.invoke('ai-pricing-advisor', {
                              body: { skills, context: 'student' },
                            });
                            if (error) throw error;
                            if (data?.suggestedMin) setStudentPricingAdvice(data);
                          } catch (err: any) {
                            toast({ title: 'Error', description: err?.message || 'Failed to get suggestion', variant: 'destructive' });
                          } finally {
                            setLoadingStudentPrice(false);
                          }
                        }}
                        disabled={loadingStudentPrice}
                        className="text-[11px] font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1 disabled:opacity-50"
                      >
                        {loadingStudentPrice ? <Loader2 size={10} className="animate-spin" /> : <Lightbulb size={10} />}
                        {loadingStudentPrice ? 'Thinking...' : '💡 Suggest rate'}
                      </button>
                    </div>
                    <input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className={inputClass} placeholder="12.50" />
                    {studentPricingAdvice && (
                      <div className="mt-2 p-2.5 bg-primary/5 border border-primary/15 rounded-lg">
                        <p className="text-xs font-medium text-primary">€{studentPricingAdvice.suggestedMin} – €{studentPricingAdvice.suggestedMax}/hr</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{studentPricingAdvice.reasoning}</p>
                      </div>
                    )}
                  </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5">
                    <Phone size={14} className="text-primary" /> Phone
                  </label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="086 123 4567" />
                </div>
              </div>

              {/* University */}
              <div>
                <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5">
                  <GraduationCap size={14} className="text-primary" /> University
                </label>
                <input value={university} onChange={(e) => setUniversity(e.target.value)} className={inputClass} placeholder="e.g. Trinity College Dublin" />
              </div>

              {/* Skills */}
              <div>
                <label className="block text-sm font-medium mb-2">Skills</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {COMMON_SKILLS.map((skill) => (
                    <TagBadge key={skill} tag={skill} selected={skills.includes(skill)} onClick={() => toggleSkill(skill)} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={customSkill} onChange={(e) => setCustomSkill(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomSkill(); } }} className={inputClass} placeholder="Add custom skill..." />
                  <button type="button" onClick={addCustomSkill} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-xl text-sm font-medium shrink-0 hover:bg-secondary/80 transition-colors">Add</button>
                </div>
                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {skills.map((s) => <TagBadge key={s} tag={s} selected removable onRemove={() => setSkills(skills.filter((sk) => sk !== s))} />)}
                  </div>
                )}
              </div>

              {/* Availability */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-secondary/30">
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className={isAvailable ? 'text-primary' : 'text-muted-foreground'} />
                  <div>
                    <p className="text-sm font-medium">Available for work</p>
                    <p className="text-xs text-muted-foreground">Show up in business search results</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAvailable(!isAvailable)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${isAvailable ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isAvailable ? 'left-6' : 'left-0.5'}`} />
                </button>
              </div>

              {/* Payment Details */}
              <div className="p-4 rounded-xl border border-border bg-secondary/30">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard size={16} className="text-primary" />
                  <p className="text-sm font-medium">Payment Details</p>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Your Revolut tag or IBAN — only shared with businesses after you both confirm a gig agreement.
                </p>
                <div className="relative">
                  <input
                    type={showPayment ? 'text' : 'password'}
                    value={paymentDetails}
                    onChange={(e) => setPaymentDetails(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. @yourtag or IE29AIBK..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowPayment(!showPayment)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPayment ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </>
          )}

          <button onClick={handleSave} disabled={saving} className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Profile'}
          </button>

          {/* View public portfolio link */}
          {profile?.user_type === 'student' && (
            <button
              onClick={() => navigate(`/portfolio/${user.id}`)}
              className="w-full py-2.5 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors flex items-center justify-center gap-2"
            >
              <ExternalLink size={14} /> View Public Portfolio
            </button>
          )}
        </div>

        {/* My Posted Gigs — all users */}
        {myGigs !== undefined && (
          <div className="mt-6">
            <h2 className="text-xl font-bold mb-4">My Posted Gigs</h2>
            {myGigs.length === 0 ? (
              <div className="text-center py-12 bg-card border border-border rounded-2xl">
                <Briefcase className="mx-auto text-muted-foreground mb-3" size={28} />
                <p className="text-muted-foreground text-sm">No gigs posted yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myGigs.map((gig) => (
                  <div key={gig.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between hover:border-primary/20 transition-colors">
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/jobs/${gig.id}`)}>
                      <h3 className="font-semibold text-sm truncate">{gig.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {gig.location}
                        {' · '}
                        {gig.payment_type === 'fixed' ? `€${gig.fixed_price ?? 0} total` : `€${gig.hourly_rate}/hr`}
                        {' · '}
                        {format(new Date(gig.shift_date), 'MMM d, yyyy')}
                      </p>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full mt-1 inline-block ${
                        gig.status === 'open' ? 'bg-primary/10 text-primary' :
                        gig.status === 'completed' ? 'bg-green-100 text-green-700' :
                        'bg-muted text-muted-foreground'
                      }`}>{gig.status}</span>
                    </div>
                    <button
                      onClick={() => deleteGig(gig.id)}
                      disabled={deletingGig === gig.id}
                      className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-colors ml-3 shrink-0 disabled:opacity-50"
                      title="Delete gig"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Portfolio & Preferences for freelancers */}
        {profile?.user_type === 'student' && user && (
          <div className="space-y-6 mt-6">
            <AIProfileCoach
              bio={bio}
              skills={skills}
              hourlyRate={hourlyRate}
              university={university}
              hasPortfolio={portfolioCount > 0}
              reviewCount={reviewCount}
            />
            <PortfolioManager userId={user.id} />
            <GigPreferences userId={user.id} />
            <NotificationPreferences />
          </div>
        )}

        {/* Email info */}
        <p className="text-xs text-muted-foreground mt-4 text-center">
          Signed in as {user?.email}
        </p>
      </div>
    </div>
  );
};

export default Profile;
