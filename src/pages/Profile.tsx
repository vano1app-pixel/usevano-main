import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { useToast } from '@/hooks/use-toast';
import { TagBadge } from '@/components/TagBadge';
import { AvatarUpload } from '@/components/AvatarUpload';
import { BannerUpload } from '@/components/BannerUpload';
import { GigPreferences } from '@/components/GigPreferences';
import { NotificationPreferences } from '@/components/NotificationPreferences';
import { AIProfileCoach } from '@/components/AIProfileCoach';
import { PortfolioManager } from '@/components/PortfolioManager';
import { useNavigate } from 'react-router-dom';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import { Phone, Euro, CheckCircle, ExternalLink, Briefcase, GraduationCap, Trash2, CreditCard, Eye, EyeOff, Lightbulb, Loader2, Plus } from 'lucide-react';
import { ModBadge } from '@/components/ModBadge';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { format } from 'date-fns';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { normalizeTikTokUrl, parseWorkLinksJson, workLinksToJson, type WorkLinkEntry } from '@/lib/socialLinks';

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
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [workLinks, setWorkLinks] = useState<WorkLinkEntry[]>([{ url: '', label: '' }]);
  const [bannerUrl, setBannerUrl] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [typicalBudgetMin, setTypicalBudgetMin] = useState('');
  const [typicalBudgetMax, setTypicalBudgetMax] = useState('');

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
      setWorkDescription('');
      const { data: gigs } = await supabase.from('jobs').select('*').eq('posted_by', session.user.id).order('created_at', { ascending: false });
      setMyGigs(gigs || []);
    }

    if (prof?.user_type === 'student') {
      setWorkDescription(prof?.work_description || '');
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
        setTiktokUrl(sp.tiktok_url || '');
        setBannerUrl((sp as any).banner_url || '');
        setServiceArea((sp as any).service_area || '');
        setTypicalBudgetMin(
          (sp as any).typical_budget_min != null && (sp as any).typical_budget_min > 0
            ? String((sp as any).typical_budget_min)
            : '',
        );
        setTypicalBudgetMax(
          (sp as any).typical_budget_max != null && (sp as any).typical_budget_max > 0
            ? String((sp as any).typical_budget_max)
            : '',
        );
        const parsed = parseWorkLinksJson(sp.work_links);
        setWorkLinks(
          parsed.length > 0
            ? parsed.map((p) => ({ url: p.url, label: p.label }))
            : [{ url: '', label: '' }]
        );
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
      profileUpdate.work_description = '';
    } else if (profile?.user_type === 'student') {
      profileUpdate.work_description = workDescription;
    }

    await supabase.from('profiles').update(profileUpdate).eq('user_id', user.id);

    if (profile?.user_type === 'student') {
      const studentData = {
        bio,
        skills,
        hourly_rate: parseFloat(hourlyRate) || 0,
        phone,
        is_available: isAvailable,
        avatar_url: avatarUrl,
        banner_url: bannerUrl || null,
        service_area: serviceArea.trim() || null,
        typical_budget_min: parseInt(typicalBudgetMin, 10) > 0 ? parseInt(typicalBudgetMin, 10) : null,
        typical_budget_max: parseInt(typicalBudgetMax, 10) > 0 ? parseInt(typicalBudgetMax, 10) : null,
        payment_details: paymentDetails,
        university,
        tiktok_url: normalizeTikTokUrl(tiktokUrl),
        work_links: workLinksToJson(workLinks) as any,
      };
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

  const addWorkLinkRow = () => {
    if (workLinks.length >= 12) return;
    setWorkLinks((prev) => [...prev, { url: '', label: '' }]);
  };

  const updateWorkLink = (index: number, field: 'url' | 'label', value: string) => {
    setWorkLinks((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const removeWorkLink = (index: number) => {
    setWorkLinks((prev) => (prev.length <= 1 ? [{ url: '', label: '' }] : prev.filter((_, i) => i !== index)));
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
              <h3 className="font-semibold text-lg mb-1">Account</h3>
              <p className="text-sm text-muted-foreground">Hire freelancers — add location and details when you post each gig</p>
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
            {profile?.user_type === 'student'
              ? 'Your freelancer profile — visible to people hiring on VANO'
              : 'Your account — a short intro is enough; set location when you post a gig'}
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
                {profile?.user_type === 'business' ? 'Name' : 'Display Name'}
              </label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} placeholder={profile?.user_type === 'business' ? 'How you’d like to appear' : 'Your name'} />
            </div>
          </div>

          {profile?.user_type === 'student' && user && (
            <BannerUpload
              userId={user.id}
              currentUrl={bannerUrl}
              onUploaded={(url) => {
                setBannerUrl(url);
                setStudentProfile((prev: any) => (prev ? { ...prev, banner_url: url } : prev));
              }}
            />
          )}

          {/* About me / bio */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              {profile?.user_type === 'business' ? 'About me' : 'Bio'}
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className={`${inputClass} min-h-[120px] resize-none`}
              placeholder={profile?.user_type === 'business'
                ? 'A quick intro is enough — who you are and what you usually hire help for. You’ll add the exact location on each gig when you post it.'
                : 'Tell people hiring on VANO about yourself, your experience, and what makes you a great hire...'}
            />
            {profile?.user_type === 'business' && (
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                No need to add your address here. When you post a gig, you can set city or area (and any other details) for that specific job.
              </p>
            )}
          </div>

          {/* Work experience — freelancers only (saved on your profile record) */}
          {profile?.user_type === 'student' && (
            <div>
              <label className="block text-sm font-medium mb-1.5">Work experience</label>
              <textarea
                value={workDescription}
                onChange={(e) => setWorkDescription(e.target.value)}
                className={`${inputClass} min-h-[120px] resize-none`}
                placeholder="Past projects, clients, or relevant experience…"
              />
            </div>
          )}

          {/* Student-specific fields */}
          {profile?.user_type === 'student' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1.5">Service area</label>
                <p className="text-xs text-muted-foreground mb-2">
                  Where you&apos;re based or willing to work — e.g. <span className="font-medium text-foreground/80">Galway city</span>,{' '}
                  <span className="font-medium text-foreground/80">Within 30km of Galway</span>, or{' '}
                  <span className="font-medium text-foreground/80">Remote</span>.
                </p>
                <input
                  value={serviceArea}
                  onChange={(e) => setServiceArea(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Galway city · Remote OK"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Typical project budget (€)</label>
                  <p className="text-xs text-muted-foreground mb-2">
                    For fixed-price work like sites or one-off deliverables — e.g. 200–500. Leave blank if you only use hourly.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={0}
                      value={typicalBudgetMin}
                      onChange={(e) => setTypicalBudgetMin(e.target.value)}
                      className={inputClass}
                      placeholder="Min"
                    />
                    <input
                      type="number"
                      min={0}
                      value={typicalBudgetMax}
                      onChange={(e) => setTypicalBudgetMax(e.target.value)}
                      className={inputClass}
                      placeholder="Max"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium flex items-center gap-1.5">
                        <Euro size={14} className="text-primary" /> Hourly rate (€)
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
                    <input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className={inputClass} placeholder="25" />
                    <p className="mt-1.5 text-[11px] text-muted-foreground">Strong for video, social, shoots, or ongoing support.</p>
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

              <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">TikTok</label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Optional. Paste your profile link or @username — shown on Community and your public profile.
                  </p>
                  <input
                    value={tiktokUrl}
                    onChange={(e) => setTiktokUrl(e.target.value)}
                    className={inputClass}
                    placeholder="https://www.tiktok.com/@you or @you"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Links to past work</label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Websites, Behance, case studies, Google Drive — add a short label and URL (up to 12).
                  </p>
                  <div className="space-y-2">
                    {workLinks.map((row, i) => (
                      <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          value={row.label}
                          onChange={(e) => updateWorkLink(i, 'label', e.target.value)}
                          className={inputClass}
                          placeholder="Label (e.g. Agency site)"
                        />
                        <input
                          value={row.url}
                          onChange={(e) => updateWorkLink(i, 'url', e.target.value)}
                          className={inputClass}
                          placeholder="https://…"
                        />
                        <button
                          type="button"
                          onClick={() => removeWorkLink(i)}
                          className="shrink-0 rounded-xl border border-border px-3 py-2.5 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:py-2"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addWorkLinkRow}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  >
                    <Plus size={14} /> Add link
                  </button>
                </div>
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
                    <p className="text-xs text-muted-foreground">Show up when clients browse freelancers</p>
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
                  Your Revolut tag or IBAN — only shared with clients after you both confirm a gig agreement.
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
