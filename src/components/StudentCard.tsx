import React, { useState, useEffect } from 'react';
import { TagBadge } from './TagBadge';
import { Heart, MapPin, ArrowRight, ShieldCheck, Star, MessageSquareQuote, Trash2, Zap, Instagram, Linkedin, Globe, Music2 } from 'lucide-react';
import { QuoteModal } from './QuoteModal';
import { HireNowModal } from './HireNowModal';
import { formatTypicalBudget } from '@/lib/freelancerProfile';
import { freelancerGradient, NOISE_BG_IMAGE } from '@/lib/categoryGradient';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { getUniversityStyle } from '@/lib/universities';
import { ModBadge } from './ModBadge';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { TopStudentInfo } from '@/hooks/useTopStudents';

interface StudentProfile {
  id: string;
  user_id: string;
  bio: string;
  skills: string[];
  hourly_rate: number;
  is_available: boolean;
  avatar_url: string;
  banner_url?: string | null;
  service_area?: string | null;
  typical_budget_min?: number | null;
  typical_budget_max?: number | null;
  university?: string | null;
  student_verified?: boolean | null;
  tiktok_url?: string | null;
  instagram_url?: string | null;
  linkedin_url?: string | null;
  website_url?: string | null;
}

interface StudentCardProps {
  student: StudentProfile;
  displayName?: string;
  isFavourite?: boolean;
  onToggleFavourite?: (studentUserId: string) => void;
  showFavourite?: boolean;
  topInfo?: TopStudentInfo;
  /** Example profile — no navigation to /students/:id */
  demoExample?: boolean;
  /** Category label shown on the banner (e.g. "Website Design") */
  category?: string;
  /** Pre-computed average rating (e.g. "4.8") */
  avgRating?: string | null;
  /** Number of reviews */
  reviewCount?: number;
  /** Override avatar from profiles table (single source of truth) */
  profileAvatarUrl?: string | null;
  /** If true, shows admin-only remove button */
  viewerIsAdmin?: boolean;
  /** Called after admin removes the listing so parent can update state */
  onRemoved?: (userId: string) => void;
}

const MEDAL_STYLES = [
  'bg-yellow-100 text-yellow-700 border-yellow-300',
  'bg-gray-100 text-gray-600 border-gray-300',
  'bg-amber-50 text-amber-700 border-amber-300',
];
const MEDAL_LABELS = ['🥇 #1', '🥈 #2', '🥉 #3'];

/** University brand colors and short labels – delegates to shared lib */
function getUniStyle(university: string | null | undefined): { color: string; abbr: string } | null {
  return getUniversityStyle(university);
}

// Banner gradient is now category-aware (videography = warm reds, websites =
// cool blues, sales = greens, social = purples). See `freelancerGradient` in
// src/lib/categoryGradient.ts. Plus a subtle SVG noise overlay so flat colour
// fields don't look like a default Tailwind class.

export const StudentCard: React.FC<StudentCardProps> = ({
  student,
  displayName,
  isFavourite,
  onToggleFavourite,
  showFavourite = false,
  topInfo,
  demoExample,
  category,
  avgRating,
  reviewCount,
  profileAvatarUrl,
  viewerIsAdmin,
  onRemoved,
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const isAdmin = useIsAdmin(student.user_id);
  const resolvedAvatar = profileAvatarUrl || student.avatar_url;
  const budgetLabel = formatTypicalBudget(student.typical_budget_min, student.typical_budget_max);
  const area = student.service_area?.trim();
  const uniStyle = getUniStyle(student.university);
  const clickable = !demoExample;

  // Hire-flow modal state (shared QuoteModal + HireNowModal)
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [hireOpen, setHireOpen] = useState(false);
  // Current viewer id — used to hide hire buttons on your own card
  const [viewerId, setViewerId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setViewerId(session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!cancelled) setViewerId(s?.user?.id ?? null);
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);
  const isOwnCard = !!viewerId && viewerId === student.user_id;

  // Admin remove listing state
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleRemoveListing = async () => {
    setRemoving(true);
    const { error } = await supabase
      .from('student_profiles')
      .update({ community_board_status: null } as any)
      .eq('user_id', student.user_id);
    setRemoving(false);
    setRemoveConfirmOpen(false);
    if (error) {
      toast({ title: 'Failed to remove listing', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Listing removed', description: `${displayName || 'Freelancer'} can re-list later.` });
      onRemoved?.(student.user_id);
    }
  };

  // Top 3 skills for banner keyword line
  const bannerSkills = (student.skills || []).slice(0, 3);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-foreground/6 bg-card shadow-tinted transition-all duration-300 ease-out-quint',
        clickable && 'cursor-pointer hover:-translate-y-[3px] hover:border-primary/20 hover:shadow-tinted-lg active:scale-[0.98] group',
        !clickable && 'cursor-default',
      )}
      onClick={clickable ? () => navigate(`/students/${student.user_id}`) : undefined}
    >
      {/* Hover glow ring */}
      {clickable && (
        <div className="pointer-events-none absolute -inset-[1px] rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100 z-10"
          style={{
            background: 'linear-gradient(135deg, hsl(221 83% 53% / 0.15), hsl(142 76% 36% / 0.1), hsl(221 83% 53% / 0.15))',
            mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            maskComposite: 'exclude',
            WebkitMaskComposite: 'xor',
            padding: '2px',
          }}
        />
      )}
      {/* Banner */}
      <div className="relative h-40 w-full overflow-hidden sm:h-48 md:h-56">
        {student.banner_url ? (
          <img
            src={student.banner_url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-700 ease-out-quint group-hover:scale-[1.03]"
            loading="lazy"
            decoding="async"
            // If the banner CDN 404s or the URL is stale, swap for the
            // per-freelancer gradient so the card never renders with a blank
            // white banner.
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement;
              el.style.display = 'none';
              const parent = el.parentElement;
              if (parent && !parent.dataset.bannerFallback) {
                parent.dataset.bannerFallback = '1';
                parent.style.background = freelancerGradient(student.user_id, { skills: student.skills });
              }
            }}
          />
        ) : (
          <div
            className="relative h-full w-full transition-transform duration-700 ease-out-quint group-hover:scale-[1.03]"
            style={{ background: freelancerGradient(student.user_id, { skills: student.skills }) }}
          >
            {/* Subtle noise overlay so flat gradients feel tactile, not generic. */}
            <div
              className="pointer-events-none absolute inset-0 mix-blend-overlay opacity-60"
              style={{ backgroundImage: NOISE_BG_IMAGE }}
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/55" />

        {/* Top-left: skill keywords line */}
        {bannerSkills.length > 0 && (
          <div className="absolute left-3 top-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/80">
              {bannerSkills.join(' · ')}
            </p>
          </div>
        )}

        {/* Top-right: verified + medal + demo badge + favourite */}
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          {demoExample && (
            <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-black/30 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-white/80 backdrop-blur-sm">
              Example
            </span>
          )}
          {topInfo && (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm ${MEDAL_STYLES[topInfo.rank]}`}>
              {MEDAL_LABELS[topInfo.rank]}
            </span>
          )}
          {showFavourite && onToggleFavourite && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleFavourite(student.user_id); }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm transition-all duration-150 hover:bg-black/50 active:scale-90"
              title={isFavourite ? 'Remove favourite' : 'Save'}
            >
              <Heart size={13} className={isFavourite ? 'fill-white text-white' : 'text-white'} />
            </button>
          )}
          {viewerIsAdmin && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setRemoveConfirmOpen(true); }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600/70 backdrop-blur-sm transition-all duration-150 hover:bg-red-600 active:scale-90"
              title="Remove listing"
            >
              <Trash2 size={13} className="text-white" />
            </button>
          )}
        </div>

        {/* Bottom-left: verified badge + category */}
        <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5">
          {student.student_verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[9px] font-semibold text-white/90 backdrop-blur-sm">
              <ShieldCheck size={9} className="text-emerald-400" />
              Verified
            </span>
          )}
          {category && (
            <span className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
              {category}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        {/* Avatar row — overlaps banner */}
        <div className="flex items-end justify-between -mt-9 mb-3">
          <div className="flex flex-col items-center gap-0.5">
            <div
              className="relative rounded-full shadow-md"
              style={uniStyle ? {
                padding: '3px',
                background: uniStyle.color,
                borderRadius: '9999px',
              } : {
                padding: '3px',
                background: 'hsl(var(--border))',
                borderRadius: '9999px',
              }}
            >
              {resolvedAvatar ? (
                <img
                  src={resolvedAvatar}
                  alt={displayName || 'Freelancer'}
                  className="h-16 w-16 rounded-full border-2 border-card object-cover sm:h-20 sm:w-20"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-card bg-primary/10 text-xl font-bold text-primary sm:h-20 sm:w-20 sm:text-2xl">
                  {(displayName || 'S')[0].toUpperCase()}
                </div>
              )}
              {student.is_available && (
                <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500 shadow-sm" />
              )}
            </div>
            {uniStyle && (
              <span
                className="mt-1 text-[9px] font-bold uppercase tracking-widest"
                style={{ color: uniStyle.color }}
              >
                {uniStyle.abbr}
              </span>
            )}
          </div>

          {/* Right: available + admin */}
          <div className="flex flex-wrap items-center gap-1 pb-1">
            {isAdmin && <ModBadge size="sm" />}
            {student.is_available && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                Available
              </span>
            )}
          </div>
        </div>

        {/* Name */}
        <h3 className="truncate text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl">
          {displayName || 'Freelancer'}
        </h3>

        {/* Rating row — shown if we have reviews */}
        {avgRating && (
          <div className="mt-1 flex items-center gap-1">
            <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" />
            <span className="text-[12px] font-semibold text-amber-700 dark:text-amber-400">{avgRating}</span>
            {reviewCount != null && reviewCount > 0 && (
              <span className="text-[11px] text-muted-foreground">· {reviewCount} review{reviewCount !== 1 ? 's' : ''}</span>
            )}
          </div>
        )}

        {/* Location + rate row */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {area && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin size={11} className="shrink-0 text-primary/70" />
              {area}
            </span>
          )}
          {student.hourly_rate > 0 && (
            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              from €{student.hourly_rate}/hr
            </span>
          )}
          {budgetLabel && (
            <span className="text-xs font-medium text-foreground/60">{budgetLabel} projects</span>
          )}
        </div>

        {/* Bio */}
        {student.bio && (
          <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
            {student.bio}
          </p>
        )}

        {/* Skills */}
        {student.skills?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {student.skills.slice(0, 4).map((skill) => (
              <TagBadge key={skill} tag={skill} />
            ))}
          </div>
        )}

        {/* Social signals — pure visual indicators (the whole card already
            navigates to the profile page, so don't fight the click target with
            link-outs here). Only renders when at least one is present. */}
        {(student.instagram_url || student.tiktok_url || student.linkedin_url || student.website_url) && (
          <div className="mt-2.5 flex items-center gap-2 text-muted-foreground">
            {student.instagram_url && <Instagram size={14} className="shrink-0 transition-colors group-hover:text-foreground" aria-label="Instagram" />}
            {student.tiktok_url && <Music2 size={14} className="shrink-0 transition-colors group-hover:text-foreground" aria-label="TikTok" />}
            {student.linkedin_url && <Linkedin size={14} className="shrink-0 transition-colors group-hover:text-foreground" aria-label="LinkedIn" />}
            {student.website_url && <Globe size={14} className="shrink-0 transition-colors group-hover:text-foreground" aria-label="Website" />}
          </div>
        )}

        {/* CTA — two rows so both conversion paths are visible without leaving the card */}
        {clickable && (
          <div className="mt-4 pt-3 border-t border-foreground/5 space-y-2">
            {/* Row 1: Message (primary) + Hire now (secondary pill) — hidden on your own card.
                Two equally-weighted buttons created choice paralysis. Message is the
                lower-friction first action; Hire-now is reserved for users who already know. */}
            {!isOwnCard && (
              <div className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setQuoteOpen(true); }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-[12px] font-bold text-primary-foreground shadow-md transition-all duration-200 hover:shadow-lg hover:brightness-110 active:scale-[0.97]"
                >
                  <MessageSquareQuote size={13} strokeWidth={2.5} />
                  Message
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setHireOpen(true); }}
                  title="Send an instant hire request with a 2hr lock"
                  className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[12px] font-semibold text-amber-700 dark:text-amber-300 transition-all duration-200 hover:bg-amber-500/15 active:scale-[0.97]"
                >
                  <Zap size={12} strokeWidth={2.5} />
                  Hire now
                </button>
              </div>
            )}
            {/* Row 2: View profile (always available) */}
            <span className={cn(
              'w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 text-[11px] font-semibold transition-all duration-300 ease-out-quint',
              isOwnCard
                ? 'bg-primary/8 py-2.5 text-primary group-hover:bg-primary group-hover:text-primary-foreground'
                : 'bg-primary/5 py-2 text-primary/80 group-hover:bg-primary/10 group-hover:text-primary',
            )}>
              {isOwnCard ? 'View your profile' : 'View profile'} <ArrowRight size={11} strokeWidth={2.5} className="transition-transform duration-300 ease-out-quint group-hover:translate-x-0.5" />
            </span>
          </div>
        )}
      </div>

      {/* Shared hire-flow modals */}
      <div onClick={(e) => e.stopPropagation()}>
        <QuoteModal
          open={quoteOpen}
          onOpenChange={setQuoteOpen}
          freelancerId={student.user_id}
          freelancerName={displayName || 'this freelancer'}
          category={category}
        />
        <HireNowModal
          open={hireOpen}
          onOpenChange={setHireOpen}
          freelancerId={student.user_id}
          freelancerName={displayName || 'this freelancer'}
          category={category}
        />
      </div>

      {/* Admin remove listing confirm dialog */}
      {viewerIsAdmin && (
        <Dialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
          <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>Remove listing?</DialogTitle>
              <DialogDescription>
                This removes {displayName || 'this freelancer'} from the talent board. They can re-list later through the wizard.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setRemoveConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="flex-1 rounded-xl"
                disabled={removing}
                onClick={handleRemoveListing}
              >
                {removing ? 'Removing…' : 'Remove'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
