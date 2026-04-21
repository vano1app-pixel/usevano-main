import { cn } from '@/lib/utils';
import {
  ImagePlus,
  Sparkles,
  Tag,
  FileText,
  Share2,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Publish-then-polish: once a freelancer publishes via Quick-start,
// the rest of the profile fields become a set of one-task cards on
// /profile. Each card is a 30-second job with an estimated profile-
// strength bump. Tapping a card opens the wizard pre-navigated to
// the relevant step so the freelancer never lands on a blank
// 4-step form after publishing.
//
// The whole row disappears when every task is done — there's no
// point nagging a freelancer with a fully polished listing to add
// more stuff.

export interface StrengthSlot {
  hasCover: boolean;
  strengthsCount: number;
  skillsCount: number;
  hasBio: boolean;
  hasAnySocial: boolean;
  hasSpecialty: boolean;
}

interface ProfileStrengthCardsProps {
  slots: StrengthSlot;
  /** Jump the wizard to a specific step. Passed straight to the
   *  existing openWizardAtStep helper on Profile.tsx. */
  onJumpToStep: (step: number) => void;
}

interface StrengthTask {
  id: string;
  icon: LucideIcon;
  label: string;
  boost: number;
  timeSec: number;
  targetStep: number;
  done: boolean;
}

export function ProfileStrengthCards({ slots, onJumpToStep }: ProfileStrengthCardsProps) {
  const tasks: StrengthTask[] = [
    {
      id: 'cover',
      icon: ImagePlus,
      label: 'Add a cover photo',
      boost: 15,
      timeSec: 15,
      targetStep: 1,
      done: slots.hasCover,
    },
    {
      id: 'specialty',
      icon: Tag,
      label: 'Pick your specialty',
      boost: 15,
      timeSec: 10,
      targetStep: 3,
      done: slots.hasSpecialty,
    },
    {
      id: 'strengths',
      icon: Sparkles,
      label: 'Pick 3 strengths',
      boost: 15,
      timeSec: 30,
      targetStep: 2,
      done: slots.strengthsCount >= 3,
    },
    {
      id: 'skills',
      icon: Tag,
      label: slots.skillsCount === 0 ? 'Add skills' : 'Add 2 more skills',
      boost: 10,
      timeSec: 30,
      targetStep: 3,
      done: slots.skillsCount >= 3,
    },
    {
      id: 'bio',
      icon: FileText,
      label: 'Write a short bio',
      boost: 10,
      timeSec: 60,
      targetStep: 2,
      done: slots.hasBio,
    },
    {
      id: 'socials',
      icon: Share2,
      label: 'Add a social link',
      boost: 10,
      timeSec: 20,
      targetStep: 2,
      done: slots.hasAnySocial,
    },
  ];

  // Profile-strength percentage — derived by summing the completed
  // task boosts plus a flat "published" floor of 25 so the bar never
  // starts empty. Caps at 100 so the number always reads clean.
  const earnedBoost = tasks.filter((t) => t.done).reduce((acc, t) => acc + t.boost, 0);
  const strengthPct = Math.min(100, 25 + earnedBoost);

  const remaining = tasks.filter((t) => !t.done);
  if (remaining.length === 0) return null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-card to-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Sparkles size={18} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Strengthen your listing
            </p>
            <span
              className="text-[12px] font-bold text-foreground tabular-nums"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {strengthPct}%
            </span>
          </div>
          <h2 className="mt-1 text-lg font-bold text-foreground">
            {remaining.length === 1
              ? 'One last thing'
              : `${remaining.length} quick wins`}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Each of these takes under a minute and makes businesses way more likely to message you.
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
              style={{ width: `${strengthPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {remaining.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onJumpToStep(t.targetStep)}
              className={cn(
                'group flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-all duration-200',
                'hover:-translate-y-[1px] hover:border-primary/40 hover:shadow-sm',
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon size={16} strokeWidth={2.25} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-foreground">{t.label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  +{t.boost}% · ~{t.timeSec < 60 ? `${t.timeSec}s` : `${Math.round(t.timeSec / 60)}m`}
                </p>
              </div>
              <ArrowRight size={14} strokeWidth={2.5} className="shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
          );
        })}
      </div>

      {/* Soft footnote when only 1 task remains — a little payoff that
          this is nearly done, not another chore. */}
      {remaining.length === 1 && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 size={11} strokeWidth={2.5} />
          Almost there — this pushes you to {strengthPct + remaining[0].boost}%.
        </p>
      )}
    </div>
  );
}
