import React, { useState, useEffect, useRef } from 'react';
import { TagBadge } from './TagBadge';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { VANO_PAY_VISIBLE } from '@/lib/featureFlags';
import { Heart, MapPin, ArrowRight, ShieldCheck, Star, MessageSquareQuote, Trash2, Zap, Instagram, Linkedin, Globe, Music2, Banknote, Clock, TrendingUp, Sparkles } from 'lucide-react';
import { QuoteModal } from './QuoteModal';
import { HireNowModal } from './HireNowModal';
import { formatTypicalBudget } from '@/lib/freelancerProfile';
import { freelancerGradient, NOISE_BG_IMAGE } from '@/lib/categoryGradient';
import { formatLocation } from '@/lib/irelandCounties';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { getUniversityStyle } from '@/lib/universities';
import { findSpecialtyLabel } from '@/lib/categorySpecialties';
import { findStrength } from '@/lib/freelancerTags';
import { useReplySeconds, formatReplyTime } from '@/hooks/useReplySeconds';
import { useFreelancerSalesStats, formatSalesStats } from '@/hooks/useFreelancerSalesStats';
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
  /** Legacy free-text location, used as fallback if structured county is empty. */
  service_area?: string | null;
  /** Ireland-wide county (one of the 26 ROI counties). */
  county?: string | null;
  /** Freelancer accepts work outside their county. */
  remote_ok?: boolean | null;
  typical_budget_min?: number | null;
  typical_budget_max?: number | null;
  university?: string | null;
  student_verified?: boolean | null;
  /** Category-specific specialty slug (e.g. "weddings" for videography).
   *  Rendered as an accent pill alongside the category on the banner so
   *  hirers get the "what kind" signal without opening the profile. */
  specialty?: string | null;
  /** Up to 3 strength slugs (see STRENGTH_OPTIONS) — rendered as icon
   *  chips in the card body, above the bio. The whole point of pushing
   *  the wizard to click-only answers is making the card more visual,
   *  so these chips are the payoff for freelancers who bother to tap
   *  them on Step 2. */
  strengths?: string[] | null;
  /** True when the freelancer has finished Stripe Connect onboarding
   *  and is ready to accept Vano Pay. Surfaced as a trust chip on the
   *  card so hirers can pick someone they can pay safely in one tap. */
  stripe_payouts_enabled?: boolean | null;
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
  // Web design is overwhelmingly priced per-project, not per-hour. When a
  // website freelancer has a project range set, lead the banner price tag
  // with that range — matches their actual billing model and gives the
  // hirer a useful number to scan.
  const projectFirst = category === 'Website Design' && !!budgetLabel;
  // Prefer structured county/remote_ok; fall back to legacy service_area
  // for rows that haven't been migrated yet. Returns null when neither
  // is set, which hides the location chip entirely rather than showing
  // a stale placeholder.
  const area = formatLocation({ county: student.county, remote_ok: student.remote_ok }) ?? (student.service_area?.trim() || undefined);
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

  // Quick-preview state — desktop hover (400ms delay so a passing mouse
  // doesn't fire it) + mobile long-press (500ms) open a popover with
  // the full bio and all skills. A normal tap/click still navigates;
  // after a long-press we suppress the immediate click via
  // wasLongPressRef so the user doesn't get yanked off the list on
  // their first interaction.
  //
  // BOUNCING-BUG FIX (2026-04-23):
  // Using Popover for a hover-preview is a known antipattern — Popover has
  // no hover-bridge logic. When the popover opens, its portaled content
  // can sit between the cursor and the card or flip onto the card itself
  // via collision detection. The card's onPointerLeave then fires
  // ("cursor left the card to enter the popover"), which immediately set
  // previewOpen=false. The popover unmounts, the cursor is back on the
  // card → onPointerEnter → 400ms timer → open again. The whole talent
  // page (and any other surface that renders StudentCards) appeared to
  // "bounce" from the user's perspective.
  //
  // Fix: defer the close on card-leave (200ms grace), and cancel the
  // pending close when the cursor enters the popover content. Mirrors
  // Radix HoverCard's bridge but without rewriting the whole control.
  const [previewOpen, setPreviewOpen] = useState(false);
  const hoverOpenTimerRef = useRef<number | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const wasLongPressRef = useRef(false);
  // Initial touch coords so we can cancel the long-press when the user
  // is actually scrolling the feed, not holding down on a card.
  const pointerDownCoordRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    return () => {
      if (hoverOpenTimerRef.current) window.clearTimeout(hoverOpenTimerRef.current);
      if (hoverCloseTimerRef.current) window.clearTimeout(hoverCloseTimerRef.current);
      if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const cancelHoverTimer = () => {
    if (hoverOpenTimerRef.current) {
      window.clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
  };
  const cancelCloseTimer = () => {
    if (hoverCloseTimerRef.current) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  };
  const cancelLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePointerEnter = (e: React.PointerEvent) => {
    if (!clickable) return;
    if (e.pointerType !== 'mouse') return;
    cancelHoverTimer();
    cancelCloseTimer();
    hoverOpenTimerRef.current = window.setTimeout(() => setPreviewOpen(true), 400);
  };
  const handlePointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    cancelHoverTimer();
    cancelCloseTimer();
    // Schedule close instead of firing immediately. The popover content's
    // own onPointerEnter cancels this timer if the cursor crossed onto
    // the popover (the bridge), so the preview stays up while the user
    // reads it. Without this delay, hover toggles ad infinitum the
    // moment Radix flips the popover onto the card via collision.
    hoverCloseTimerRef.current = window.setTimeout(() => setPreviewOpen(false), 180);
  };
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!clickable) return;
    if (e.pointerType === 'mouse') return;
    wasLongPressRef.current = false;
    pointerDownCoordRef.current = { x: e.clientX, y: e.clientY };
    cancelLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      wasLongPressRef.current = true;
      setPreviewOpen(true);
    }, 500);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    // Scroll detection — if the user has moved their finger more than
    // 10px since touchdown we assume they're scrolling the feed, not
    // trying to long-press a card, and cancel the pending timer.
    if (e.pointerType === 'mouse') return;
    const start = pointerDownCoordRef.current;
    if (!start) return;
    const dx = Math.abs(e.clientX - start.x);
    const dy = Math.abs(e.clientY - start.y);
    if (dx > 10 || dy > 10) {
      cancelLongPressTimer();
      pointerDownCoordRef.current = null;
    }
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    cancelLongPressTimer();
    pointerDownCoordRef.current = null;
  };
  const handleCardClick = () => {
    if (!clickable) return;
    // Suppress the navigation click that follows a long-press. Reset
    // the flag so a subsequent normal tap still navigates.
    if (wasLongPressRef.current) {
      wasLongPressRef.current = false;
      return;
    }
    navigate(`/students/${student.user_id}`);
  };

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
  // Median reply time across the freelancer's last 50 messages.
  // Renders as a trust chip on the banner when the RPC returns a
  // real number (>= 5 reply pairs). Null otherwise — the chip just
  // doesn't render, which is strictly better than showing a fake
  // "Replies fast" badge for a freelancer who's never replied.
  const replySeconds = useReplySeconds(student.user_id);
  const replyLabel = formatReplyTime(replySeconds);
  // Aggregate sales track record — only relevant for digital-sales
  // freelancers; the hook silently returns (0, 0) for everyone
  // else and the formatter returns null on zero so the chip just
  // doesn't render for non-sales (or brand-new sales) freelancers.
  const salesStats = useFreelancerSalesStats(student.user_id);
  const salesLabel = formatSalesStats(salesStats);

  return (
    <Popover open={previewOpen} onOpenChange={setPreviewOpen}>
      <PopoverAnchor asChild>
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-foreground/6 bg-card shadow-tinted transition-all duration-300 ease-out-quint',
        clickable && 'cursor-pointer hover:-translate-y-[3px] hover:border-primary/20 hover:shadow-tinted-lg active:scale-[0.98] group',
        !clickable && 'cursor-default',
      )}
      onClick={handleCardClick}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={cancelLongPressTimer}
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

        {/* Top-left stack: skill keywords + trust chips. Chips are
            mutually exclusive by precedence — sales stats wins when
            there's real track record (digital-sales with closed wins),
            otherwise reply-time wins when we have the reply-pair
            samples, otherwise "New on Vano" for genuinely new listings
            so a cold banner never reads as abandoned. Every chip is
            data-driven — no user-chosen claims — so a listing can't
            fake any of these signals. */}
        {(() => {
          const chip = salesLabel
            ? { kind: 'sales' as const, label: salesLabel }
            : replyLabel
            ? { kind: 'reply' as const, label: replyLabel }
            : replySeconds === null
            ? { kind: 'new' as const, label: 'New on Vano' }
            : null;
          if (bannerSkills.length === 0 && !chip) return null;
          return (
            <div className="absolute left-3 top-3 flex max-w-[calc(100%-8rem)] flex-col items-start gap-1.5">
              {bannerSkills.length > 0 && (
                <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/95 [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]">
                  {bannerSkills.join(' · ')}
                </p>
              )}
              {chip && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm backdrop-blur-sm',
                    chip.kind === 'sales' && 'bg-primary/85',
                    chip.kind === 'reply' && 'bg-emerald-500/85',
                    chip.kind === 'new'   && 'bg-sky-500/85',
                  )}
                >
                  {chip.kind === 'sales' && <TrendingUp size={10} strokeWidth={2.5} />}
                  {chip.kind === 'reply' && <Clock size={10} strokeWidth={2.5} />}
                  {chip.kind === 'new'   && <Sparkles size={10} strokeWidth={2.5} />}
                  {chip.label}
                </span>
              )}
            </div>
          );
        })()}

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
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm transition-all duration-150 hover:bg-black/50 active:scale-90"
              title={isFavourite ? 'Remove favourite' : 'Save'}
            >
              <Heart size={15} className={isFavourite ? 'fill-white text-white' : 'text-white'} />
            </button>
          )}
          {viewerIsAdmin && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setRemoveConfirmOpen(true); }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600/70 backdrop-blur-sm transition-all duration-150 hover:bg-red-600 active:scale-90"
              title="Remove listing"
            >
              <Trash2 size={15} className="text-white" />
            </button>
          )}
        </div>

        {/* Bottom-left: verified + category + location. Location moved onto
            the banner so it's readable while scrolling the feed — previously
            it was buried in a muted row below the avatar. */}
        <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5 max-w-[calc(100%-7rem)]">
          {student.student_verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[9px] font-semibold text-white/90 backdrop-blur-sm">
              <ShieldCheck size={9} className="text-emerald-400" />
              Verified
            </span>
          )}
          {VANO_PAY_VISIBLE && student.stripe_payouts_enabled && (
            <span
              title="Pay this freelancer through Vano — secure card checkout, money in their bank in 1–2 days."
              className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[9px] font-semibold text-white/90 backdrop-blur-sm"
            >
              <Banknote size={9} className="text-sky-300" />
              Vano Pay
            </span>
          )}
          {category && (
            <span className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
              {category}
            </span>
          )}
          {(() => {
            // Specialty pill — one accent-coloured step down from the
            // category to signal "same bucket, finer grain" (e.g.
            // Videography → Weddings). Only renders when the slug
            // resolves to a known label so deleted options fail quiet.
            const specialtyName = findSpecialtyLabel(student.specialty);
            if (!specialtyName) return null;
            return (
              <span className="rounded-full bg-primary/80 px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-sm backdrop-blur-sm">
                {specialtyName}
              </span>
            );
          })()}
          {area && (
            <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
              <MapPin size={9} className="shrink-0 text-white/80" />
              <span className="truncate max-w-[120px]">{area}</span>
            </span>
          )}
        </div>

        {/* Bottom-right: price tag. Intentionally high-contrast so a business
            scrolling the feed can scan rates without opening profiles. Hourly
            wins over typical-budget when both exist (more common mental
            model); render nothing if neither is set. */}
        {(student.hourly_rate > 0 || budgetLabel) && (
          <div className="absolute bottom-2.5 right-3">
            <span className="inline-flex items-baseline gap-1 rounded-lg bg-white/95 px-2.5 py-1 shadow-md backdrop-blur-sm">
              {projectFirst || !(student.hourly_rate > 0) ? (
                <>
                  <span className="text-[13px] sm:text-sm font-bold text-emerald-600">{budgetLabel}</span>
                  <span className="text-[10px] font-semibold text-muted-foreground/80">/project</span>
                </>
              ) : (
                <>
                  <span className="text-[13px] sm:text-sm font-bold text-emerald-600">€{student.hourly_rate}</span>
                  <span className="text-[10px] font-semibold text-muted-foreground/80">/hr</span>
                </>
              )}
            </span>
          </div>
        )}
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

          {/* Right: admin badge only. "Available" used to render here as a
              pill but the avatar already carries a green pulsing dot for the
              same signal — two copies read as a bug, so the pill is dropped
              to let the body's name + rating row breathe. */}
          <div className="flex flex-wrap items-center gap-1 pb-1">
            {isAdmin && <ModBadge size="sm" />}
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

        {/* Typical-project budget — kept in the body as secondary context
            because the banner's price tag prefers hourly. When hourly and
            budget are both set, this row disambiguates (e.g. "€25/hr" on the
            banner + "Typical project · €100–250" here). Rendered nothing when
            there's no budget or when the banner already shows it. */}
        {budgetLabel && student.hourly_rate > 0 && (
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {projectFirst ? 'Hourly' : 'Typical project'}
            </span>
            <span className="text-sm font-semibold text-foreground/80">
              {projectFirst ? `€${student.hourly_rate}/hr` : budgetLabel}
            </span>
          </div>
        )}

        {/* Strength chips — visual payoff for freelancers who picked
            them in the wizard. Icons + compact pills scan instantly
            as "what's this person like to work with": fast turnaround,
            own gear, etc. Rendered above the bio so they grab the eye
            before the text does. Up to 3, and we silently drop any
            slug that doesn't resolve (deleted / renamed options). */}
        {(() => {
          const rows = (student.strengths ?? [])
            .map((slug) => findStrength(slug))
            .filter((s): s is NonNullable<ReturnType<typeof findStrength>> => !!s)
            .slice(0, 3);
          if (rows.length === 0) return null;
          return (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {rows.map((s) => {
                const Icon = s.icon;
                return (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/8 px-2 py-0.5 text-[11px] font-semibold text-primary"
                  >
                    <Icon size={11} strokeWidth={2.5} />
                    {s.label}
                  </span>
                );
              })}
            </div>
          );
        })()}

        {/* Bio */}
        {student.bio && (
          <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
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

        {/* CTA — Message leads as the primary conversion path; Hire-now
            collapses to a compact icon button so the row stops fighting
            itself with two equally-weighted full-width buttons. "View
            profile" is the implicit card click, surfaced as a subtle
            footer on hover rather than a third button competing for
            attention. */}
        {clickable && (
          <div className="mt-4 pt-3 border-t border-foreground/5">
            {!isOwnCard ? (
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
                  title="Hire now — instant 2-hour lock"
                  aria-label="Hire now"
                  className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700 shadow-sm transition-all duration-200 hover:bg-amber-500/20 active:scale-[0.94] dark:text-amber-300"
                >
                  <Zap size={14} strokeWidth={2.75} />
                </button>
              </div>
            ) : (
              <span className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary/8 px-3 py-2.5 text-[11px] font-semibold text-primary transition-all duration-300 ease-out-quint group-hover:bg-primary group-hover:text-primary-foreground">
                View your profile <ArrowRight size={11} strokeWidth={2.5} className="transition-transform duration-300 ease-out-quint group-hover:translate-x-0.5" />
              </span>
            )}
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
      </PopoverAnchor>

      {/* Quick-preview popover — appears on desktop hover (400ms) or
           mobile long-press (500ms). Portal-rendered so it escapes the
           card's overflow-hidden. Click inside shouldn't navigate
           (stopPropagation on the wrapper prevents the card's click
           handler from firing when a tap lands on the preview). */}
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        // Keep the card's own hover-focus chain intact when the popover
        // is open — the trigger (PopoverAnchor) isn't a focusable
        // element, so Radix's default focus-trap would jump to the
        // close button on mount. `onOpenAutoFocus` preventDefault keeps
        // focus where the user left it.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[calc(100vw-2rem)] max-w-sm p-4"
        onClick={(e) => e.stopPropagation()}
        // Hover-bridge: cursor entering the popover cancels the pending
        // close so the user can read it / click "View full profile"
        // without the preview vanishing under their cursor. Leaving the
        // popover starts a short close timer so it tidies up on its own.
        onPointerEnter={cancelCloseTimer}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse') return;
          cancelCloseTimer();
          hoverCloseTimerRef.current = window.setTimeout(() => setPreviewOpen(false), 180);
        }}
      >
        <div className="flex items-start gap-3">
          {resolvedAvatar ? (
            <img
              src={resolvedAvatar}
              alt={displayName || 'Freelancer'}
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {(displayName || 'S')[0].toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {displayName || 'Freelancer'}
            </p>
            {category && (
              <p className="text-[11px] font-medium text-muted-foreground">{category}</p>
            )}
          </div>
        </div>

        {student.bio && (
          <p className="mt-3 text-[12.5px] leading-relaxed text-foreground/85">
            {student.bio}
          </p>
        )}

        {student.skills?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {student.skills.map((skill) => (
              <TagBadge key={skill} tag={skill} />
            ))}
          </div>
        )}

        {clickable && (
          <button
            type="button"
            onClick={() => {
              setPreviewOpen(false);
              navigate(`/students/${student.user_id}`);
            }}
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 active:scale-[0.98]"
          >
            View full profile <ArrowRight size={12} strokeWidth={2.5} />
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
};
