import React, { useState, useEffect, useMemo } from 'react';
import { Navbar } from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { breadcrumbSchema } from '@/lib/structuredData';
import { Monitor, Video, Megaphone, TrendingUp, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { type CommunityCategoryId } from '@/lib/communityCategories';

const TALENT_HUB_CATEGORIES: {
  cat: CommunityCategoryId;
  label: string;
  sub: string;
  icon: typeof Monitor;
  image?: string;
}[] = [
  { cat: 'digital_sales', label: 'Digital Sales',   sub: 'Outbound, lead gen & closing', icon: TrendingUp, image: '/cat-photography.png' },
  { cat: 'videography',  label: 'Videography',    sub: 'Filming, reels & promos',     icon: Video,     image: '/cat-videography.png' },
  { cat: 'websites',     label: 'Website Design',  sub: 'Get a site built or fixed',   icon: Monitor,   image: '/cat-websites.png' },
  { cat: 'social_media', label: 'Social Media',    sub: 'Content, strategy & growth',  icon: Megaphone, image: '/cat-social_media.png' },
];

const CAT_KEYWORDS: Record<CommunityCategoryId, string[]> = {
  websites:     ['web', 'website', 'wordpress', 'html', 'css', 'developer', 'coding', 'design', 'frontend', 'shopify', 'react', 'next', 'figma', 'typescript', 'tailwind', 'supabase', 'webflow', 'framer'],
  videography:  ['video', 'film', 'filming', 'videography', 'reel', 'drone', 'premiere', 'davinci', 'motion', 'promo', 'colour grading', 'wedding film', 'corporate video'],
  digital_sales: ['sales', 'sdr', 'bdr', 'cold call', 'cold email', 'outbound', 'lead gen', 'lead generation', 'prospect', 'closing', 'saas sales', 'b2b', 'appointment setting', 'linkedin prospecting', 'crm', 'hubspot', 'salesforce', 'negotiation'],
  social_media: ['social', 'marketing', 'content', 'instagram', 'tiktok', 'facebook', 'twitter', 'media', 'canva', 'strategy', 'linkedin', 'copywriting'],
};

function primaryCategoryForStudent(student: any, displayName: string): CommunityCategoryId {
  const text = `${displayName} ${student.bio || ''} ${(student.skills || []).join(' ')}`.toLowerCase();
  const order: CommunityCategoryId[] = ['websites', 'videography', 'digital_sales', 'social_media'];
  let best: CommunityCategoryId = 'websites';
  let bestScore = 0;
  for (const cat of order) {
    const score = CAT_KEYWORDS[cat].filter((kw) => text.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return best;
}

const BrowseStudents = () => {
  const navigate = useNavigate();

  const [students, setStudents] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStudents(); }, []);

  const fetchStudents = async () => {
    const [{ data: studentData }, { data: profileData }] = await Promise.all([
      supabase.from('student_profiles').select('user_id, is_available, hourly_rate, avatar_url, skills, bio').eq('is_available', true).eq('community_board_status', 'approved').not('bio', 'is', null).not('skills', 'eq', '{}'),
      supabase.from('profiles').select('user_id, display_name, avatar_url'),
    ]);
    setStudents(studentData || []);
    setProfiles(profileData || []);
    setLoading(false);
  };

  const getDisplayName = (uid: string) => profiles.find((p: any) => p.user_id === uid)?.display_name || 'Student';
  const getAvatarUrl = (uid: string) => profiles.find((p: any) => p.user_id === uid)?.avatar_url || '';

  const countsByCategory = useMemo(() => {
    const out: Record<CommunityCategoryId, number> = { videography: 0, digital_sales: 0, websites: 0, social_media: 0 };
    for (const s of students) {
      out[primaryCategoryForStudent(s, getDisplayName(s.user_id))]++;
    }
    return out;
  }, [students, profiles]);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead
        title="Browse Galway Freelancers — Digital Sales, Video, Web & Social"
        description="Browse local freelancers and students in Galway by category. Hire trusted videographers, sales reps, web designers and social media creators on VANO."
        keywords="browse freelancers galway, find freelancer galway, galway sales reps, galway videographers, galway web designers, galway social media"
        jsonLd={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Freelancers', path: '/students' },
        ])}
      />
      <Navbar />

      <div
        className="mx-auto max-w-5xl bg-background px-3 sm:px-4 md:px-8 pb-12 sm:pb-16
        pt-[max(4.5rem,calc(env(safe-area-inset-top,0px)+3.25rem))]
        sm:pt-20 md:pt-24"
      >
        <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">What do you need?</p>
            <div className="grid grid-cols-2 gap-3">
              {TALENT_HUB_CATEGORIES.map((item, idx) => {
                const Icon = item.icon;
                const count = countsByCategory[item.cat];
                return (
                  <button
                    key={item.cat}
                    type="button"
                    data-mascot={idx === 0 ? "browse-cta" : undefined}
                    onClick={() => navigate(`/students/${item.cat}`)}
                    className="group relative overflow-hidden flex flex-col items-start gap-4 rounded-2xl border border-foreground/10 bg-card p-5 text-left shadow-sm min-h-[160px] transition-all duration-250 hover:border-primary/20 hover:shadow-lg hover:-translate-y-[2px] active:scale-[0.97] animate-fade-in opacity-0"
                    style={{ animationDelay: `${idx * 70}ms` }}
                  >
                    {item.image && (
                      <>
                        <picture className="absolute inset-0 h-full w-full pointer-events-none">
                          <source
                            type="image/webp"
                            srcSet={(() => {
                              // digital_sales reuses photography assets as a placeholder until a
                              // dedicated cat-digital_sales image set is uploaded.
                              const s = item.cat === 'digital_sales' ? 'photography' : item.cat;
                              return `/cat-${s}-400.webp 400w, /cat-${s}-800.webp 800w`;
                            })()}
                            sizes="(max-width: 640px) 50vw, 25vw"
                          />
                          <img
                            src={item.image}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            decoding="async"
                            width="400"
                            height="600"
                            className="absolute inset-0 h-full w-full object-cover opacity-40 pointer-events-none select-none transition-transform duration-500 group-hover:scale-110"
                          />
                        </picture>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10 pointer-events-none" />
                      </>
                    )}
                    <div className="relative z-10 flex flex-col gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                        <Icon size={22} strokeWidth={2} className="text-white" />
                      </div>
                      <div>
                        <p className="text-[15px] font-bold leading-snug text-white drop-shadow-sm">{item.label}</p>
                        <p className="mt-0.5 text-xs leading-snug text-white/90 font-medium drop-shadow-sm">{item.sub}</p>
                      </div>
                    </div>
                    {/* Freelancer count — bottom left pill */}
                    {!loading && count > 0 && (
                      <span className="absolute bottom-4 left-5 z-10 rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-bold text-foreground shadow-sm">
                        {count} freelancer{count !== 1 ? 's' : ''}
                      </span>
                    )}
                    <ArrowRight size={14} className="absolute bottom-4 right-4 z-10 text-white/70 transition-all duration-200 group-hover:text-white group-hover:translate-x-0.5" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Freelancer preview strip */}
        <div className="mt-6 flex flex-col gap-5">
          {loading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted/60" />
              ))}
            </div>
          ) : students.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">On VANO now</p>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-500/20">
                  {students.length} available
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {students.slice(0, 3).map((s, idx) => {
                  const name = getDisplayName(s.user_id);
                  return (
                    <div
                      key={s.user_id}
                      onClick={() => navigate(`/students/${primaryCategoryForStudent(s, name)}`)}
                      className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-foreground/10 bg-card p-3 shadow-sm transition-all hover:border-primary/30 hover:shadow-md animate-fade-in opacity-0"
                      style={{ animationDelay: `${idx * 100}ms` }}
                    >
                      {getAvatarUrl(s.user_id) ? (
                        <img src={getAvatarUrl(s.user_id)} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-card" loading="lazy" decoding="async" />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary ring-2 ring-card">
                          {name[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-foreground">{name}</p>
                        {s.hourly_rate > 0 && (
                          <p className="text-[11px] font-medium text-emerald-700">€{s.hourly_rate}/hr</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-center text-xs text-muted-foreground">Pick a category above to browse all freelancers</p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default BrowseStudents;
