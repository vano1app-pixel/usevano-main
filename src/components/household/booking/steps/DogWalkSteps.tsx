import React from 'react';
import type { StepProps } from '../types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export const DogCountStep: React.FC<StepProps> = ({ data, onChange, onNext }) => (
  <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
    <h2 className="text-3xl font-bold tracking-tight text-foreground mb-8">
      How many dogs?
    </h2>

    <div className="grid grid-cols-3 gap-3">
      {([1, 2, 3] as const).map((n) => (
        <button
          key={n}
          onClick={() => { onChange({ dogCount: n }); onNext(); }}
          className={cn(
            'min-h-[80px] rounded-2xl flex flex-col items-center justify-center gap-1',
            'transition-[background-color,transform] duration-150 ease-out-expo active:scale-[0.95]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            data.dogCount === n
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-foreground border border-border/40 hover:bg-secondary/70',
          )}
        >
          <span className="font-bold text-3xl tabular-nums">{n}</span>
          <span className="text-xs opacity-70">dog{n > 1 ? 's' : ''}</span>
        </button>
      ))}
    </div>
  </div>
);

export const DogDurationStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const options = [
    { id: '30min' as const, label: '30 minutes', price: '€15', sub: 'Quick walk around the block' },
    { id: '1hr'   as const, label: '1 hour',     price: '€20', sub: 'A proper run and play'      },
  ];

  return (
    <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-2">
        How long?
      </h2>
      {(data.dogCount ?? 1) > 1 && (
        <p className="text-muted-foreground text-sm mb-6">
          Price shown is per dog × {data.dogCount} dogs.
        </p>
      )}
      {(data.dogCount ?? 1) === 1 && <div className="mb-8" />}

      <div className="flex flex-col gap-3">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => { onChange({ walkDuration: opt.id }); onNext(); }}
            className={cn(
              'w-full flex items-center justify-between px-5 min-h-[72px] rounded-2xl text-left',
              'transition-[background-color,transform] duration-150 ease-out-expo active:scale-[0.97]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              data.walkDuration === opt.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground border border-border/40 hover:bg-secondary/70',
            )}
          >
            <div>
              <p className="font-semibold text-base">{opt.label}</p>
              <p className={cn('text-xs mt-0.5', data.walkDuration === opt.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                {opt.sub}
              </p>
            </div>
            <span className="font-bold text-xl tabular-nums ml-4">{opt.price}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export const DogNotesStep: React.FC<StepProps> = ({ data, onChange, onNext }) => (
  <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
    <h2 className="text-3xl font-bold tracking-tight text-foreground mb-2">
      Anything we should know?
    </h2>
    <p className="text-muted-foreground text-sm mb-6">Dog's name, any quirks, gate code. Optional.</p>

    <Textarea
      placeholder="e.g. Biscuit is friendly but nervous around other dogs…"
      rows={5}
      value={data.dogNotes ?? ''}
      onChange={(e) => onChange({ dogNotes: e.target.value })}
      className="rounded-2xl resize-none mb-8 text-base"
    />

    <Button onClick={onNext} className="w-full rounded-full" size="lg">
      {data.dogNotes?.trim() ? 'Continue' : 'Skip'}
    </Button>
  </div>
);
