import React, { useMemo, useState } from 'react';
import { Heart, MessageCircle, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { formatCommunityBudget } from '@/lib/communityBudget';
import { cn } from '@/lib/utils';

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
}

function bannerGradient(userId: string): string {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  const hubs = [
    [22, 45], // warm rust
    [200, 48], // deep teal
    [268, 42], // plum
    [152, 38], // forest
    [32, 44], // ochre
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
}: CommunityPostCardProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [likeLoading, setLikeLoading] = useState(false);
  const avatar = profile?.avatar_url;
  const name = profile?.display_name || 'Freelancer';
  const skills = (studentProfile?.skills || []).filter(Boolean).slice(0, 10);

  const budget = formatCommunityBudget(
    post.rate_min,
    post.rate_max,
    post.rate_unit,
    studentProfile?.hourly_rate
  );

  const bannerBg = useMemo(() => bannerGradient(post.user_id), [post.user_id]);
  const hasListingImage = !!post.image_url;

  const handleLike = async () => {
    if (!currentUserId) {
      navigate('/auth');
      return;
    }
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

  const openChat = async () => {
    if (!currentUserId) {
      navigate('/auth');
      return;
    }
    if (currentUserId === post.user_id) return;
    if (currentUserType === 'student' && profile?.user_type === 'business') {
      toast({ title: 'Not allowed', description: 'Message businesses through their gig listings.', variant: 'destructive' });
      return;
    }

    const snippet = post.title.length > 72 ? `${post.title.slice(0, 72)}…` : post.title;
    const draft = `Hi! I saw your listing on Community — "${snippet}". I'd like to chat.`;
    navigate(`/messages?with=${post.user_id}&draft=${encodeURIComponent(draft)}`);
  };

  const openProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/students/${post.user_id}`);
  };

  const canDelete = currentUserId === post.user_id || isAdmin;

  return (
    <article
      className={cn(
        'overflow-hidden rounded-2xl border border-foreground/10 bg-card shadow-[0_1px_0_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.12)]',
        'transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[0_1px_0_rgba(0,0,0,0.04),0_20px_40px_-16px_rgba(0,0,0,0.18)]'
      )}
    >
      {/* Banner */}
      <div className="relative h-[5.75rem] sm:h-32">
        {hasListingImage ? (
          <>
            <img
              src={post.image_url!}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: 'center 35%' }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/10 to-card" />
          </>
        ) : (
          <>
            {avatar ? (
              <div className="absolute inset-0 overflow-hidden">
                <img
                  src={avatar}
                  alt=""
                  className="h-full w-full scale-125 object-cover opacity-40 blur-2xl"
                  aria-hidden
                />
              </div>
            ) : null}
            <div className="absolute inset-0" style={{ background: bannerBg }} />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-card" />
          </>
        )}

        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(post.id)}
            className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/50"
            aria-label="Delete post"
          >
            <Trash2 size={16} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Avatar overlap + identity */}
      <div className="relative px-4 pb-4 pt-0 sm:px-6 sm:pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="flex gap-4 sm:min-w-0 sm:flex-1">
            <button
              type="button"
              onClick={openProfile}
              className="group/avatar shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card rounded-full"
            >
              <div className="relative -mt-10 sm:-mt-11">
                <div className="rounded-full bg-card p-1 shadow-md ring-1 ring-foreground/10">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt=""
                      className="h-[4.5rem] w-[4.5rem] rounded-full object-cover sm:h-24 sm:w-24"
                    />
                  ) : (
                    <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-muted text-xl font-semibold text-foreground sm:h-24 sm:w-24 sm:text-2xl">
                      {name[0].toUpperCase()}
                    </div>
                  )}
                </div>
                {studentProfile?.is_available ? (
                  <span
                    className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-[3px] border-card bg-emerald-500 shadow-sm"
                    title="Available"
                  />
                ) : null}
              </div>
            </button>

            <div className="min-w-0 flex-1 pt-1 sm:pb-1 sm:pt-0">
              <button type="button" onClick={openProfile} className="block w-full text-left">
                <h2 className="truncate text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl">
                  {name}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground sm:text-[13px]">
                  <span className="text-foreground/70">Freelance</span>
                  <span className="mx-1.5 text-foreground/25">·</span>
                  {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                  {studentProfile?.university ? (
                    <>
                      <span className="mx-1.5 text-foreground/25">·</span>
                      <span className="truncate">{studentProfile.university}</span>
                    </>
                  ) : null}
                </p>
              </button>
            </div>
          </div>

          {/* Budget block — Foxpop-adjacent: clear money signal */}
          <div
            className={cn(
              'shrink-0 rounded-xl border px-4 py-3 sm:max-w-[13rem] sm:text-right',
              budget.emphasis
                ? 'border-foreground/12 bg-foreground/[0.03]'
                : 'border-foreground/8 bg-muted/40'
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Budget</p>
            <p
              className={cn(
                'mt-1 font-semibold tabular-nums tracking-tight sm:text-lg',
                budget.emphasis ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {budget.label}
            </p>
          </div>
        </div>

        {/* Listing copy */}
        <div className="mt-5 space-y-3 border-t border-foreground/10 pt-5">
          <h3 className="text-base font-semibold leading-snug tracking-tight text-foreground sm:text-lg">{post.title}</h3>
          {post.description ? (
            <p className="text-[14px] leading-relaxed text-muted-foreground whitespace-pre-line line-clamp-5 sm:line-clamp-none sm:text-[15px]">
              {post.description}
            </p>
          ) : null}
        </div>

        {/* Skills */}
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Skills</p>
          {skills.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <li
                  key={`${post.id}-${skill}`}
                  className="rounded-md border border-foreground/10 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-foreground/85 sm:text-xs"
                >
                  {skill}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] italic text-muted-foreground/90">Skills not listed on profile yet</p>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-col gap-3 border-t border-foreground/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleLike}
            disabled={likeLoading}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors',
              isLiked ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground hover:text-red-600 dark:hover:text-red-400'
            )}
            aria-label={isLiked ? 'Unlike' : 'Like'}
          >
            <Heart size={18} className={isLiked ? 'fill-current' : ''} strokeWidth={2} />
            {post.likes_count > 0 ? <span className="tabular-nums">{post.likes_count}</span> : null}
          </button>

          {currentUserId !== post.user_id ? (
            <Button
              type="button"
              size="lg"
              className="h-12 w-full rounded-xl bg-foreground text-background text-[15px] font-semibold shadow-none hover:bg-foreground/90 sm:h-11 sm:w-auto sm:min-w-[11rem]"
              onClick={openChat}
            >
              <MessageCircle size={18} strokeWidth={2} />
              Message
            </Button>
          ) : (
            <p className="text-center text-[13px] text-muted-foreground sm:text-right">Your listing — how it looks to others</p>
          )}
        </div>
      </div>
    </article>
  );
};
