import React, { useState } from 'react';
import type { StepProps } from '../types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const GARDEN_TASKS = ['Mow lawn', 'Trim hedges', 'Weeding', 'Planting', 'Remove waste', 'Other'];

export const GardenTasksStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const [selected, setSelected] = useState<string[]>(data.gardenTasks ?? []);

  const toggle = (task: string) =>
    setSelected((prev) =>
      prev.includes(task) ? prev.filter((t) => t !== task) : [...prev, task],
    );

  return (
    <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-2">
        What needs doing?
      </h2>
      <p className="text-muted-foreground text-sm mb-6">Pick as many as you need.</p>

      <div className="flex flex-col gap-2.5 mb-8">
        {GARDEN_TASKS.map((task) => (
          <button
            key={task}
            onClick={() => toggle(task)}
            className={cn(
              'w-full min-h-[52px] px-5 rounded-2xl font-medium text-base text-left flex items-center gap-3',
              'transition-[background-color,transform] duration-150 ease-out-expo active:scale-[0.97]',
              selected.includes(task)
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground border border-border/40',
            )}
          >
            {selected.includes(task) && (
              <span className="w-4 h-4 rounded-full bg-primary-foreground/20 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold leading-none">✓</span>
              </span>
            )}
            {task}
          </button>
        ))}
      </div>

      <Button
        onClick={() => { onChange({ gardenTasks: selected }); onNext(); }}
        disabled={selected.length === 0}
        className="w-full rounded-full"
        size="lg"
      >
        Continue
      </Button>
    </div>
  );
};

export const GardenPhotoStep: React.FC<StepProps> = ({ onNext }) => (
  <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
    <h2 className="text-3xl font-bold tracking-tight text-foreground mb-2">
      Got a photo?
    </h2>
    <p className="text-muted-foreground text-sm mb-8">
      Helps your helper prepare. You can send one over WhatsApp once matched — completely optional.
    </p>

    <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-16 mb-8">
      <span className="text-4xl mb-3" aria-hidden="true">📷</span>
      <span className="text-sm text-muted-foreground">Send via WhatsApp once your helper is confirmed</span>
    </div>

    <Button onClick={onNext} className="w-full rounded-full" size="lg">
      Continue
    </Button>
  </div>
);

export const GardenDurationStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const options = [
    { id: '1hr'      as const, label: '1 hour',    price: '€18',  sub: 'Light tidying'         },
    { id: '2hr'      as const, label: '2 hours',   price: '€36',  sub: 'Thorough session'      },
    { id: 'half-day' as const, label: 'Half day',  price: '€72',  sub: 'Full garden overhaul'  },
  ];

  return (
    <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-8">
        How long?
      </h2>

      <div className="flex flex-col gap-3">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => { onChange({ gardenDuration: opt.id }); onNext(); }}
            className={cn(
              'w-full flex items-center justify-between px-5 min-h-[72px] rounded-2xl text-left',
              'transition-[background-color,transform] duration-150 ease-out-expo active:scale-[0.97]',
              data.gardenDuration === opt.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground border border-border/40 hover:bg-secondary/70',
            )}
          >
            <div>
              <p className="font-semibold text-base">{opt.label}</p>
              <p className={cn('text-xs mt-0.5', data.gardenDuration === opt.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
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
