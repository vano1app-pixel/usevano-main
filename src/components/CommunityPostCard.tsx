import React, { useMemo, useState, useRef } from 'react';
import { Heart, MessageCircle, Trash2, ExternalLink, Images, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCommunityBudget } from '@/lib/communityBudget';
import { parseWorkLinksJson } from '@/lib/socialLinks';
import { cn } from '@/lib/utils';

const UNI_COLORS: Record<string, string> = {
  ATU: '#F47920',
  UGalway: '#6D0026',
  UCD: '#003B71',
  TCD: '#006272',
  DCU: '#CD1927',
  UCC: '#C8102E',
  UL: '#003087',
  TUDublin: '#EA1D24',
  SETU: '#003478',
  MTU: '#C8102E',
  MU: '#CC0000',
};

const UNI_LABELS: Record<string, string> = {
  ATU: 'ATU',
  UGalway: 'University of Galway',
  UCD: 'UCD',
  TCD: 'Trinity',
  DCU: 'DCU',
  UCC: 'UCC',
  UL: 'UL',
  TUDublin: 'TU Dublin',
  SETU: 'SETU',
  MTU: 'MTU',
  MU: 'Maynooth',
  Other: 'Other',
};

interface PostProfile {
  display_name: string | null;
  avatar_url: string | null;
  user_type: string | null;
}

interface StudentProfileLite {
  skills: string[] | null;
  hourly_rate: number | null;
  is_available: boolean | null;
  university: string | null;
  tiktok_url?: string | null;
  work_links?: unknown;
}

export type PortfolioPreviewItem = { id: string; image_url: string | null; title: string };

export interface SimilarPost {
  post: { id: string; user_id: string; title: string; rate_min?: number | null; rate_max?: number | null; rate_unit?: string | null };
  profile: PostProfile | null;
  studentProfile: StudentProfileLite | null;
}

interface CommunityPostCardProps {
  post: {
    id: string;
    user_id: string;
    title: string;
    description: string;
    image_url: string | null;
    likes_count: number;
    created_at: string;
    rate_min?: number | null;
    rate_max?: number | null;
    rate_unit?: string | null;
  };
  profile: PostProfile | null;
  studentProfile: StudentProfileLite | null;
  currentUserId: string | null;
  currentUserType: string | null;
  isLiked: boolean;
  isAdmin: boolean;
  onLikeToggle: (postId: string, liked: boolean) => void;
  onDelete: (postId: string) => void;
  portfolioPreview?: PortfolioPreviewItem[];
  similarPosts?: SimilarPost[];
}

function bannerGradient(userId: string): string {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  const hubs = [
    [22, 45],
    [200, 48],
    [268, 42],
    [152, 38],
    [32, 44],
  ];
  const [baseH, sat] = hubs[u % hubs.length];
  const hue2 = (baseH + 18 + (u % 12)) % 360;
  return `linear-gradient(145deg, hsl(${baseH} ${sat}% 34%) 0%, hsl(${hue2} ${Math.min(sat + 8, 52)}% 22%) 100%)`;
}

export const CommunityPostCard = ({
  post,
  profile,
  studentProfile,
  currentUserId,
  currentUserType,
  isLiked,
  isAdmin,
  onLikeToggle,
  onDelete,
  portfolioPreview = [],
  similarPosts = [],
}: CommunityPostCardProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [likeLoading, setLikeLoading] = useState(false);
  const [freelancerOpen, setFreelancerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);
  const avatar = profile?.avatar_url;
  const name = profile?.display_name || 'Freelancer';
  const skills = (studentProfile?.skills || []).filter(Boolean).slice(0, 10);
  const uniColor = studentProfile?.university ? (UNI_COLORS[studentProfile.university] ?? null) : null;

  const budget = formatCommunityBudget(
    post.rate_min,
    post.rate_max,
    post.rate_unit,
    studentProfile?.hourly_rate
  );

  const bannerBg = useMemo(() => bannerGradient(post.user_id), [post.user_id]);
  const hasListingImage = !!post.image_url;

  const handleLike = async () => {
    if (!currentUserId) { navigate('/auth'); return; }
    setLikeLoading(true);
    try {
      if (isLiked) {
        await supabase.from('community_post_likes').delete().eq('post_id', post.id).eq('user_id', currentUserId);
        onLikeToggle(post.id, false);
      } else {
        await supabase.from('community_post_likes').insert({ post_id: post.id, user_id: currentUserId });
        onLikeToggle(post.id, true);
      }
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setLikeLoading(false);
    }
  };

  const openChat = () => {
    if (!currentUserId) { navigate('/auth'); return; }
    if (currentUserId === post.user_id) return;
    if (currentUserType === 'student' && profile?.user_type === 'business') {
      toast({ title: 'Not allowed', description: 'Message businesses through their gig listings.', variant: 'destructive' });
      return;
    }
    const snippet = post.title.length > 72 ? `${post.title.slice(0, 72)}…` : post.title;
    const draft = `Hi! I saw your listing on Community — "${snippet}". I'd like to chat.`;
    navigate(`/messages?with=${post.user_id}&draft=${encodeURIComponent(draft)}`);
  };

  const workLinks = useMemo(() => parseWorkLinksJson(studentProfile?.work_links), [studentProfile?.work_links]);
  const tiktokUrl = studentProfile?.tiktok_url?.trim() || null;

  const openProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/students/${post.user_id}`);
  };

  const canDelete = currentUserId === post.user_id || isAdmin;

  return (
    <article
      ref={cardRef}
      onMouseMove={(e) => {
        const rect = cardRef.current?.getBoundingClientRect();
        if (!rect) return;
        setSpot({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
      }}
      onMouseLeave={() => setSpot(null)}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-foreground/10 bg-card shadow-[0_1px_0_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.12)]',
        'transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[0_1px_0_rgba(0,0,0,0.04),0_20px_40px_-16px_rgba(0,0,0,0.18)]'
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-2xl transition-opacity duration-300"
        style={{ background: spot ? `radial-gradient(circle at ${spot.x}% ${spot.y}%, hsl(var(--foreground)/0.05) 0%, transparent 60%)` : 'transparent' }}
      />
      {/* ── IMAGE-FIRST LAYOUT (listing has a hero photo) ── */}
      {hasListingImage ? (
        <>
          <div className="relative h-52 overflow-hidden sm:h-64">
            <img
              src={post.image_url!}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 hover:scale-[1.02]"
              style={{ objectPosition: 'center 35%' }}
              loading="lazy"
              decoding="async"
            />
            {/* Cinematic gradient — transparent top, deep bottom */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/85" />

            {/* Budget pill — top left */}
            {budget.emphasis && (
              <div className="absolute left-3 top-3 z-10 rounded-full border border-white/20 bg-black/55 px-3 py-1.5 backdrop-blur-sm">
                <p className="text-[11px] font-semibold text-white">{budget.label}</p>
              </div>
            )}

            {/* Delete button */}
            {canDelete && (
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/55"
                aria-label="Delete post"
              >
                <Trash2 size={16} strokeWidth={2} />
              </button>
            )}

            {/* Identity row overlaid at bottom of image */}
            <div className="absolute bottom-0 left-0 right-0 flex items-end gap-3 px-4 pb-3 sm:px-5">
              <button type="button" onClick={openProfile} className="relative shrink-0 focus:outline-none">
                <div
                  className="rounded-full bg-white/10 p-[3px] backdrop-blur-sm"
                  style={uniColor ? { boxShadow: `0 0 0 2.5px ${uniColor}, 0 0 0 4px rgba(0,0,0,0.25)` } : { boxShadow: '0 0 0 2px rgba(255,255,255,0.35)' }}
                >
                  {avatar ? (
                    <img src={avatar} alt="" className="h-12 w-12 rounded-full object-cover sm:h-[3.25rem] sm:w-[3.25rem]" loading="lazy" decoding="async" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-lg font-bold text-white sm:h-[3.25rem] sm:w-[3.25rem]">
                      {name[0].toUpperCase()}
                    </div>
                  )}
                </div>
                {studentProfile?.is_available && (
                  <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-white/70 bg-emerald-500 shadow-sm" title="Available" />
                )}
              </button>
              <button type="button" onClick={openProfile} className="block pb-0.5 text-left">
                <h2 className="text-base font-semibold leading-tight tracking-tight text-white sm:text-[1.05rem]">{name}</h2>
                <p className="mt-0.5 text-[11px] text-white/65 sm:text-xs">
                  Freelance
                  {studentProfile?.university ? (
                    <><span className="mx-1.5 text-white/30">·</span>{UNI_LABELS[studentProfile.university] ?? studentProfile.university}</>
                  ) : null}
                  <span className="mx-1.5 text-white/30">·</span>
                  {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                </p>
              </button>
            </div>
          </div>

          {/* Content — no duplicate identity row */}
          <div className="px-4 pb-4 pt-4 sm:px-6 sm:pb-5">
            <div className="space-y-3">
              <h3 className="text-base font-semibold leading-snug tracking-tight text-foreground sm:text-lg">{post.title}</h3>
              {post.description ? (
                <p className="text-[14px] leading-relaxed text-muted-foreground whitespace-pre-line line-clamp-5 sm:line-clamp-none sm:text-[15px]">
                  {post.description}
                </p>
              ) : null}
            </div>

            {skills.length > 0 && (
              <div className="mt-4">
                <ul className="flex flex-wrap gap-1">
                  {skills.slice(0, 5).map((skill) => (
                    <li key={`${post.id}-${skill}`} className="rounded border border-foreground/10 bg-background/70 px-2 py-0.5 text-[11px] text-foreground/75">
                      {skill}
                    </li>
                  ))}
                  {skills.length > 5 && (
                    <li className="rounded border border-foreground/10 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                      +{skills.length - 5}
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 border-t border-foreground/10 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3 sm:gap-y-2">
              <button
                type="button"
                onClick={handleLike}
                disabled={likeLoading}
                className={cn('inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors', isLiked ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground hover:text-red-600 dark:hover:text-red-400')}
                aria-label={isLiked ? 'Unlike' : 'Like'}
              >
                <Heart size={18} className={isLiked ? 'fill-current' : ''} strokeWidth={2} />
                {post.likes_count > 0 ? <span className="tabular-nums">{post.likes_count}</span> : null}
              </button>
              {currentUserId !== post.user_id ? (
                <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                  <Button type="button" variant="outline" size="lg" className="h-12 w-full rounded-xl border-foreground/15 text-[15px] font-semibold sm:h-11 sm:w-auto sm:min-w-[10.5rem]" onClick={() => setFreelancerOpen(true)}>
                    <UserRound size={18} strokeWidth={2} />Profile &amp; work
                  </Button>
                  <Button type="button" size="lg" className="h-12 w-full rounded-xl bg-foreground text-background text-[15px] font-semibold shadow-none hover:bg-foreground/90 sm:h-11 sm:w-auto sm:min-w-[11rem]" onClick={openChat}>
                    <MessageCircle size={18} strokeWidth={2} />Message
                  </Button>
                </div>
              ) : (
                <p className="text-center text-[13px] text-muted-foreground sm:text-right">Your listing — how it looks to others</p>
              )}
            </div>
          </div>
        </>
      ) : (
        /* ── GRADIENT LAYOUT (no hero photo) ── */
        <>
          <div className="relative h-[5.75rem] sm:h-32">
            {avatar ? (
              <div className="absolute inset-0 overflow-hidden">
                <img src={avatar} alt="" className="h-full w-full scale-125 object-cover opacity-40 blur-2xl" aria-hidden loading="lazy" decoding="async" />
              </div>
            ) : null}
            <div className="absolute inset-0" style={{ background: bannerBg }} />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-card" />
            {canDelete && (
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/50"
                aria-label="Delete post"
              >
                <Trash2 size={16} strokeWidth={2} />
              </button>
            )}
          </div>

          <div className="relative px-4 pb-4 pt-0 sm:px-6 sm:pb-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
              <div className="flex gap-4 sm:min-w-0 sm:flex-1">
                <button type="button" onClick={openProfile} className="group/avatar shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card rounded-full">
                  <div className="relative -mt-10 sm:-mt-11">
                    <div
                      className={cn('rounded-full bg-card p-1 shadow-md', !uniColor && 'ring-1 ring-foreground/10')}
                      style={uniColor ? { boxShadow: `0 0 0 3px ${uniColor}` } : undefined}
                    >
                      {avatar ? (
                        <img src={avatar} alt="" className="h-[4.5rem] w-[4.5rem] rounded-full object-cover sm:h-24 sm:w-24" loading="lazy" decoding="async" />
                      ) : (
                        <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-muted text-xl font-semibold text-foreground sm:h-24 sm:w-24 sm:text-2xl">
                          {name[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    {studentProfile?.is_available ? (
                      <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-[3px] border-card bg-emerald-500 shadow-sm" title="Available" />
                    ) : null}
                  </div>
                </button>
                <div className="min-w-0 flex-1 pt-1 sm:pb-1 sm:pt-0">
                  <button type="button" onClick={openProfile} className="block w-full text-left">
                    <h2 className="truncate text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl">{name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground sm:text-[13px]">
                      <span className="text-foreground/70">Freelance</span>
                      <span className="mx-1.5 text-foreground/25">·</span>
                      {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                      {studentProfile?.university ? (
                        <><span className="mx-1.5 text-foreground/25">·</span><span className="truncate">{UNI_LABELS[studentProfile.university] ?? studentProfile.university}</span></>
                      ) : null}
                    </p>
                  </button>
                </div>
              </div>
              <div className={cn('shrink-0 rounded-xl border px-4 py-3 sm:max-w-[13rem] sm:text-right', budget.emphasis ? 'border-foreground/12 bg-foreground/[0.03]' : 'border-foreground/8 bg-muted/40')}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Budget</p>
                <p className={cn('mt-1 font-semibold tabular-nums tracking-tight sm:text-lg', budget.emphasis ? 'text-foreground' : 'text-muted-foreground')}>{budget.label}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 border-t border-foreground/10 pt-5">
              <h3 className="text-base font-semibold leading-snug tracking-tight text-foreground sm:text-lg">{post.title}</h3>
              {post.description ? (
                <p className="text-[14px] leading-relaxed text-muted-foreground whitespace-pre-line line-clamp-5 sm:line-clamp-none sm:text-[15px]">{post.description}</p>
              ) : null}
            </div>

            {skills.length > 0 && (
              <div className="mt-4">
                <ul className="flex flex-wrap gap-1">
                  {skills.slice(0, 5).map((skill) => (
                    <li key={`${post.id}-${skill}`} className="rounded border border-foreground/10 bg-background/70 px-2 py-0.5 text-[11px] text-foreground/75">{skill}</li>
                  ))}
                  {skills.length > 5 && (
                    <li className="rounded border border-foreground/10 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">+{skills.length - 5}</li>
                  )}
                </ul>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 border-t border-foreground/10 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3 sm:gap-y-2">
              <button
                type="button"
                onClick={handleLike}
                disabled={likeLoading}
                className={cn('inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors', isLiked ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground hover:text-red-600 dark:hover:text-red-400')}
                aria-label={isLiked ? 'Unlike' : 'Like'}
              >
                <Heart size={18} className={isLiked ? 'fill-current' : ''} strokeWidth={2} />
                {post.likes_count > 0 ? <span className="tabular-nums">{post.likes_count}</span> : null}
              </button>
              {currentUserId !== post.user_id ? (
                <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                  <Button type="button" variant="outline" size="lg" className="h-12 w-full rounded-xl border-foreground/15 text-[15px] font-semibold sm:h-11 sm:w-auto sm:min-w-[10.5rem]" onClick={() => setFreelancerOpen(true)}>
                    <UserRound size={18} strokeWidth={2} />Profile &amp; work
                  </Button>
                  <Button type="button" size="lg" className="h-12 w-full rounded-xl bg-foreground text-background text-[15px] font-semibold shadow-none hover:bg-foreground/90 sm:h-11 sm:w-auto sm:min-w-[11rem]" onClick={openChat}>
                    <MessageCircle size={18} strokeWidth={2} />Message
                  </Button>
                </div>
              ) : (
                <p className="text-center text-[13px] text-muted-foreground sm:text-right">Your listing — how it looks to others</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── SIMILAR FREELANCERS ── */}
      {similarPosts.length > 0 && (
        <div className="border-t border-foreground/8 bg-muted/20 px-4 py-4 sm:px-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Others on this board</p>
          <div className="flex gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {similarPosts.map(({ post: sp, profile: spProfile, studentProfile: spStudent }) => {
              const spName = spProfile?.display_name || 'Freelancer';
              const spAvatar = spProfile?.avatar_url;
              const spUniColor = spStudent?.university ? (UNI_COLORS[spStudent.university] ?? null) : null;
              const spBudget = formatCommunityBudget(sp.rate_min, sp.rate_max, sp.rate_unit, spStudent?.hourly_rate);
              return (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => navigate(`/students/${sp.user_id}`)}
                  className="flex w-[9.5rem] shrink-0 flex-col gap-2.5 rounded-xl border border-foreground/10 bg-card p-3 text-left transition-all hover:border-foreground/20 hover:shadow-sm active:scale-[0.97]"
                >
                  <div
                    className="rounded-full bg-card p-[2.5px] shadow-sm"
                    style={spUniColor ? { boxShadow: `0 0 0 2px ${spUniColor}` } : { boxShadow: '0 0 0 1.5px rgba(0,0,0,0.12)' }}
                  >
                    {spAvatar ? (
                      <img src={spAvatar} alt="" className="h-9 w-9 rounded-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                        {spName[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 w-full">
                    <p className="truncate text-xs font-semibold text-foreground leading-snug">{spName}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{spBudget.label}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── DIALOGS ── */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete listing?</DialogTitle>
            <DialogDescription>This will permanently remove your listing from the Community board. You can always create a new one.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" className="flex-1 rounded-xl" onClick={() => { setDeleteConfirmOpen(false); onDelete(post.id); }}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={freelancerOpen} onOpenChange={setFreelancerOpen}>
        <DialogContent className="max-h-[min(90dvh,36rem)] gap-0 overflow-y-auto p-0 sm:max-w-lg">
          <div className="border-b border-border bg-muted/30 px-6 py-5">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-xl">{name}</DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed">
                Listing: <span className="font-medium text-foreground/90">{post.title}</span>
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-5 px-6 py-5">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Portfolio on VANO</p>
              {portfolioPreview.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {portfolioPreview.map((item) => (
                    <div key={item.id} className="w-[7.5rem] shrink-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                      {item.image_url ? (
                        <img src={item.image_url} alt="" className="h-20 w-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <div className="flex h-20 w-full items-center justify-center bg-muted"><Images size={22} className="text-muted-foreground" /></div>
                      )}
                      <p className="line-clamp-2 p-2 text-[11px] font-medium leading-snug text-foreground">{item.title}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No portfolio pieces uploaded yet — ask them to share samples in chat.</p>
              )}
            </div>
            {(tiktokUrl || workLinks.length > 0) && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Elsewhere online</p>
                <ul className="flex flex-col gap-2">
                  {tiktokUrl && (
                    <li>
                      <a href={tiktokUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-3 text-sm font-medium transition-colors hover:bg-muted/50">
                        <ExternalLink size={16} className="shrink-0 text-primary" />TikTok
                      </a>
                    </li>
                  )}
                  {workLinks.map((link) => (
                    <li key={link.url}>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-3 text-sm transition-colors hover:bg-muted/50">
                        <span className="min-w-0 truncate font-medium">{link.label}</span>
                        <ExternalLink size={16} className="shrink-0 text-muted-foreground" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
              <Button type="button" variant="outline" className="h-11 flex-1 rounded-xl font-semibold" onClick={() => { setFreelancerOpen(false); navigate(`/students/${post.user_id}`); }}>Full profile</Button>
              <Button type="button" className="h-11 flex-1 rounded-xl font-semibold" onClick={() => { setFreelancerOpen(false); openChat(); }}>
                <MessageCircle size={18} strokeWidth={2} />Send message
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
};
