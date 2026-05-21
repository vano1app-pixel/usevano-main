import React from 'react';
import type { StepProps } from '../types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const EXAMPLE_TASKS = [
  'Pharmacy run', 'Post office', 'Wait for a delivery',
  'Furniture assembly', 'Tech help', 'Collect kids from school',
];

export const OtherDescriptionStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const canProceed = !!data.description?.trim();

  const fillExample = (label: string) => {
    onChange({ description: label });
  };

  return (
    <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
      <h2 className="text-xl font-semibold text-foreground mb-1">Tell us what you need</h2>
      <p className="text-muted-foreground text-sm mb-4">Anything not on the list? We'll match you with the right person.</p>

      {/* Example task pills for inspiration */}
      <div className="flex flex-wrap gap-2 mb-4">
        {EXAMPLE_TASKS.map((t) => (
          <button
            key={t}
            onClick={() => fillExample(t)}
            className="px-3 py-1.5 rounded-full bg-secondary text-foreground/70 text-xs font-medium hover:bg-secondary/70 transition-colors"
          >
            {t}
          </button>
        ))}
      </div>

      <Textarea
        placeholder="Describe what you need help with…"
        rows={5}
        value={data.description ?? ''}
        onChange={(e) => onChange({ description: e.target.value })}
        className="rounded-2xl resize-none mb-4"
      />

      <label className="flex items-center gap-3 border border-dashed border-border rounded-2xl px-4 py-3 cursor-pointer hover:border-primary/40 transition-colors mb-8">
        <span className="text-xl">📷</span>
        <span className="text-sm text-muted-foreground">Add a photo (optional)</span>
        <input type="file" accept="image/*" className="sr-only" />
      </label>

      <Button onClick={onNext} disabled={!canProceed} className="w-full rounded-full" size="lg">
        Continue
      </Button>
    </div>
  );
};

export const OtherPricingStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const options = [
    { id: 'flat'   as const, label: '€15 flat',    detail: 'Best for short, fixed tasks (under ~45 min)' },
    { id: 'hourly' as const, label: 'from €15/hr',  detail: 'Best for longer or open-ended tasks' },
  ];

  return (
    <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
      <h2 className="text-xl font-semibold text-foreground mb-1">How would you like to pay?</h2>
      <p className="text-muted-foreground text-sm mb-6">Not sure? Go flat rate for simple errands.</p>

      <div className="space-y-3">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => { onChange({ pricingType: opt.id }); onNext(); }}
            className={cn(
              'w-full flex items-start gap-4 px-5 py-4 rounded-2xl transition-all duration-150 ease-out-expo active:scale-[0.98] text-left',
              data.pricingType === opt.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary hover:bg-secondary/80',
            )}
          >
            <div className="flex-1">
              <p className="font-semibold text-sm">{opt.label}</p>
              <p className={cn('text-xs mt-0.5 leading-relaxed', data.pricingType === opt.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                {opt.detail}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
