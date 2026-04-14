import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnboardingJourneyProps {
  /** Current page (1 = Auth, 2 = ChooseAccountType, 3 = CompleteProfile) */
  currentPage: number;
  className?: string;
}

const STEPS = [
  { label: 'Sign up' },
  { label: 'Choose path' },
  { label: 'Build profile' },
];

/**
 * Compact horizontal step indicator for the signup flow.
 * Shows across Auth -> ChooseAccountType -> CompleteProfile pages.
 */
export const OnboardingJourney: React.FC<OnboardingJourneyProps> = ({
  currentPage,
  className,
}) => {
  return (
    <div className={cn('w-full max-w-sm mx-auto mb-2', className)}>
      <ol className="flex items-center w-full">
        {STEPS.map((step, idx) => {
          const stepNum = idx + 1;
          const isActive = currentPage === stepNum;
          const isComplete = currentPage > stepNum;
          const isLast = idx === STEPS.length - 1;

          return (
            <li
              key={step.label}
              className={cn('flex items-center', !isLast && 'flex-1')}
            >
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full border text-xs font-semibold',
                    isActive && 'bg-primary border-primary text-primary-foreground',
                    isComplete && 'bg-emerald-500 border-emerald-500 text-white',
                    !isActive && !isComplete && 'bg-card border-border text-muted-foreground',
                  )}
                >
                  {isComplete ? <Check className="w-4 h-4" /> : stepNum}
                </div>
                <p
                  className={cn(
                    'mt-1.5 text-[10px] font-medium whitespace-nowrap',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </p>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    'flex-1 h-px mx-2 -mt-5',
                    isComplete ? 'bg-emerald-500' : 'bg-border',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};
