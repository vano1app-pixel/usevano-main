import React from 'react';
import { Clapperboard, Globe, Share2, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Muted, non-interactive card used as backdrop in the wizard preview stage.
 * Three variants ship pre-configured so the mock gallery around the user's
 * live card doesn't read as obvious filler. Everything about this component
 * is static — no hooks, no fetches, no navigation — so it's cheap to render
 * several times and fully safe inside a form.
 */
export type GhostVariant = 'videography' | 'websites' | 'social_media' | 'digital_sales';

interface VariantConfig {
  label: string;
  icon: LucideIcon;
  initial: string;
  name: string;
  headline: string;
  skills: string[];
  gradient: string;
  accent: string;
}

const VARIANTS: Record<GhostVariant, VariantConfig> = {
  videography: {
    label: 'Videography',
    icon: Clapperboard,
    initial: 'E',
    name: 'Eoin',
    headline: 'Event reels & short-form video',
    skills: ['Premiere', 'Reels', 'Drone'],
    // Muted emerald wash — evokes cinema but stays quiet next to the live card
    gradient: 'linear-gradient(135deg, hsl(158 55% 55% / 0.55), hsl(180 50% 50% / 0.35))',
    accent: 'text-emerald-600',
  },
  websites: {
    label: 'Websites',
    icon: Globe,
    initial: 'S',
    name: 'Saoirse',
    headline: 'Landing pages that convert',
    skills: ['Next.js', 'Figma', 'Tailwind'],
    gradient: 'linear-gradient(135deg, hsl(221 70% 60% / 0.55), hsl(262 55% 60% / 0.35))',
    accent: 'text-blue-600',
  },
  social_media: {
    label: 'Content creation',
    icon: Share2,
    initial: 'C',
    name: 'Ciara',
    headline: 'UGC & brand content',
    skills: ['TikTok', 'UGC', 'Brand'],
    gradient: 'linear-gradient(135deg, hsl(30 90% 60% / 0.55), hsl(12 80% 60% / 0.35))',
    accent: 'text-amber-600',
  },
  digital_sales: {
    label: 'Digital sales',
    icon: TrendingUp,
    initial: 'D',
    name: 'Darragh',
    headline: 'Outbound & closing',
    skills: ['Apollo', 'Cold calls', 'CRM'],
    gradient: 'linear-gradient(135deg, hsl(142 60% 45% / 0.55), hsl(180 55% 45% / 0.35))',
    accent: 'text-emerald-700',
  },
};

interface GhostStudentCardProps {
  variant: GhostVariant;
  className?: string;
}

export const GhostStudentCard: React.FC<GhostStudentCardProps> = ({ variant, className }) => {
  const v = VARIANTS[variant];
  const Icon = v.icon;

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none select-none overflow-hidden rounded-2xl border border-foreground/6 bg-card opacity-[0.38] saturate-50 blur-[1.5px]',
        className,
      )}
    >
      <div className="relative h-20" style={{ backgroundImage: v.gradient }}>
        <div className="absolute bottom-2 left-3 flex items-center gap-1.5 text-[10px] font-semibold text-white/90">
          <Icon size={10} strokeWidth={2.5} />
          {v.label}
        </div>
      </div>
      <div className="-mt-5 px-3 pb-3">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-full bg-card text-sm font-bold ring-2 ring-card', v.accent)}>
          {v.initial}
        </div>
        <p className="mt-2 text-xs font-semibold text-foreground">{v.name}</p>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{v.headline}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {v.skills.map((s) => (
            <span key={s} className="rounded-md border border-foreground/10 bg-background/60 px-1.5 py-0.5 text-[9px] font-medium text-foreground/70">
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
