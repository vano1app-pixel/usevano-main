import React from 'react';
import { JourneyCharacter, type CharacterPose } from './JourneyCharacter';
import { cn } from '@/lib/utils';

interface OnboardingJourneyProps {
  /** Current page (1 = Auth, 2 = ChooseAccountType, 3 = CompleteProfile) */
  currentPage: number;
  className?: string;
}

const STEPS = [
  { label: 'Sign up', icon: '🚪', narrative: 'A new story begins...' },
  { label: 'Choose path', icon: '🔀', narrative: 'Two paths diverge — which calls to you?' },
  { label: 'Build profile', icon: '⛺', narrative: 'Set up camp and show the world who you are!' },
];

const PAGE_POSES: Record<number, CharacterPose> = {
  1: 'waving',
  2: 'thinking',
  3: 'building',
};

/**
 * Immersive onboarding progress with illustrated character and scene.
 * Shows across Auth -> ChooseAccountType -> CompleteProfile pages.
 */
export const OnboardingJourney: React.FC<OnboardingJourneyProps> = ({
  currentPage,
  className,
}) => {
  const prefersReduced = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const currentNarrative = STEPS[currentPage - 1]?.narrative || '';

  return (
    <div className={cn('w-full max-w-sm mx-auto mb-5', className)}>
      {/* Scene — character + speech bubble with narrative */}
      <div className="relative flex items-end justify-center gap-3 mb-4">
        {/* Character */}
        <div className={cn(
          'shrink-0 transition-transform duration-500',
          !prefersReduced && 'animate-[float_4s_ease-in-out_infinite]',
        )}>
          <JourneyCharacter
            pose={prefersReduced ? 'idle' : PAGE_POSES[currentPage]}
            size={56}
          />
        </div>

        {/* Speech bubble */}
        <div className="relative bg-card border border-border/50 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-md max-w-[220px]">
          {/* Bubble tail */}
          <div className="absolute -left-2 bottom-2 w-3 h-3 bg-card border-l border-b border-border/50 rotate-45" />
          <p className="relative text-[11px] sm:text-xs font-medium text-foreground italic leading-relaxed">
            {currentNarrative}
          </p>
        </div>
      </div>

      {/* Path progress — illustrated road with checkpoints */}
      <div className="relative px-2">
        {/* SVG road background */}
        <svg
          viewBox="0 0 300 24"
          className="w-full h-6"
          preserveAspectRatio="xMidYMid meet"
          fill="none"
        >
          {/* Road */}
          <rect x="20" y="8" width="260" height="8" rx="4" fill="hsl(35 30% 80%)" opacity="0.5" />
          {/* Road dashes */}
          <line x1="30" y1="12" x2="270" y2="12" stroke="white" strokeWidth="1.5" strokeDasharray="8 12" opacity="0.4" />
          {/* Grass tufts */}
          {[15, 55, 95, 135, 175, 215, 255, 285].map((x, i) => (
            <g key={i}>
              <line x1={x} y1={18} x2={x - 2} y2={22} stroke="hsl(142 40% 50%)" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
              <line x1={x + 2} y1={18} x2={x + 4} y2={21} stroke="hsl(142 40% 50%)" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
            </g>
          ))}
        </svg>

        {/* Step markers overlay */}
        <div className="absolute inset-0 flex items-center justify-between px-1">
          {STEPS.map((step, idx) => {
            const stepNum = idx + 1;
            const isActive = currentPage === stepNum;
            const isComplete = currentPage > stepNum;

            return (
              <React.Fragment key={idx}>
                {/* Step marker */}
                <div className="relative flex flex-col items-center z-10">
                  <div className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-500 text-sm',
                    isActive && 'bg-primary border-primary text-primary-foreground scale-110 shadow-lg shadow-primary/30 ring-4 ring-primary/15',
                    isComplete && 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/25',
                    !isActive && !isComplete && 'bg-card border-border text-muted-foreground shadow-sm',
                  )}>
                    {isComplete ? '✓' : step.icon}
                    {/* Pulse on active */}
                    {isActive && !prefersReduced && (
                      <span className="absolute inset-0 rounded-full border-2 border-primary animate-pulse-ring" />
                    )}
                  </div>
                  <p className={cn(
                    'mt-1.5 text-[9px] font-medium transition-colors duration-300 whitespace-nowrap',
                    isActive ? 'text-foreground font-bold' : isComplete ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground/50',
                  )}>
                    {step.label}
                  </p>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
