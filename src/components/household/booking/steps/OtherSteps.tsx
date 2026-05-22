import React from 'react';
import type { StepProps } from '../types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const EXAMPLES = [
  'Pharmacy run', 'Post office', 'Wait for delivery',
  'Furniture assembly', 'Tech help', 'Collect prescription',
];

export const OtherDescriptionStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const canProceed = !!data.description?.trim();

  return (
    <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-2">
        What do you need?
      </h2>
      <p className="text-muted-foreground text-sm mb-5">Anything not on the list — we'll match you.</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {EXAMPLES.map((t) => (
          <button
            key={t}
            onClick={() => onChange({ description: t })}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-150',
              data.description === t
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground/70 border border-border/40 hover:bg-secondary/70',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <Textarea
        placeholder="Describe what you need…"
        rows={5}
        value={data.description ?? ''}
        onChange={(e) => onChange({ description: e.target.value })}
        className="rounded-2xl resize-none mb-8 text-base"
      />

      <Button onClick={onNext} disabled={!canProceed} className="w-full rounded-full" size="lg">
        Continue
      </Button>
    </div>
  );
};

export const OtherPricingStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const options = [
    { id: 'flat'   as const, label: '€15 flat',   sub: 'Short, fixed tasks under ~45 min' },
    { id: 'hourly' as const, label: 'from €15/hr', sub: 'Longer or open-ended tasks'       },
  ];

  return (
    <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-2">
        How would you like to pay?
      </h2>
      <p className="text-muted-foreground text-sm mb-8">Not sure? Go flat rate for simple errands.</p>

      <div className="flex flex-col gap-3">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => { onChange({ pricingType: opt.id }); onNext(); }}
            className={cn(
              'w-full flex flex-col px-5 min-h-[72px] rounded-2xl text-left justify-center',
              'transition-[background-color,transform] duration-150 ease-out-expo active:scale-[0.97]',
              data.pricingType === opt.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground border border-border/40 hover:bg-secondary/70',
            )}
          >
            <p className="font-bold text-lg">{opt.label}</p>
            <p className={cn('text-xs mt-0.5', data.pricingType === opt.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
              {opt.sub}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
};
