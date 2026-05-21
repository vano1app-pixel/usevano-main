import React from 'react';
import type { StepProps } from '../types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export const DogCountStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const options = [1, 2, 3] as const;

  return (
    <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
      <h2 className="text-xl font-semibold text-foreground mb-1">How many dogs?</h2>
      <p className="text-muted-foreground text-sm mb-6">Your helper will bring enough leads.</p>

      <div className="grid grid-cols-3 gap-3">
        {options.map((n) => (
          <button
            key={n}
            onClick={() => { onChange({ dogCount: n }); onNext(); }}
            className={cn(
              'min-h-[72px] rounded-2xl font-semibold text-2xl transition-all duration-150 ease-out-expo active:scale-[0.97]',
              data.dogCount === n
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground hover:bg-secondary/80',
            )}
          >
            {n}{n === 3 ? '+' : ''}
          </button>
        ))}
      </div>
    </div>
  );
};

export const DogDurationStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const options = [
    { id: '30min' as const, label: '30 minutes', price: '€10', detail: 'Quick loop around the block' },
    { id: '1hr'   as const, label: '1 hour',     price: '€15', detail: 'A proper run and play' },
  ];

  return (
    <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
      <h2 className="text-xl font-semibold text-foreground mb-1">How long?</h2>
      <p className="text-muted-foreground text-sm mb-6">Pick what suits your pup.</p>

      <div className="space-y-3">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => { onChange({ walkDuration: opt.id }); onNext(); }}
            className={cn(
              'w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all duration-150 ease-out-expo active:scale-[0.98] text-left',
              data.walkDuration === opt.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary hover:bg-secondary/80',
            )}
          >
            <div>
              <p className="font-semibold text-sm">{opt.label}</p>
              <p className={cn('text-xs mt-0.5', data.walkDuration === opt.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                {opt.detail}
              </p>
            </div>
            <span className="font-bold text-lg tabular-nums">{opt.price}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export const DogNotesStep: React.FC<StepProps> = ({ data, onChange, onNext }) => (
  <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
    <h2 className="text-xl font-semibold text-foreground mb-1">Anything we should know?</h2>
    <p className="text-muted-foreground text-sm mb-6">Dog's name, any quirks, gate codes — whatever helps.</p>

    <Textarea
      placeholder="e.g. Biscuit is friendly but nervous around other dogs. Gate code is 1234."
      rows={5}
      value={data.dogNotes ?? ''}
      onChange={(e) => onChange({ dogNotes: e.target.value })}
      className="rounded-2xl resize-none mb-8"
    />

    <Button onClick={onNext} className="w-full rounded-full" size="lg">
      {data.dogNotes?.trim() ? 'Continue' : 'Skip & continue'}
    </Button>
  </div>
);
