import React, { useState } from 'react';
import type { StepProps } from '../types';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

const CLEANING_TASKS = [
  'Kitchen', 'Bathrooms', 'Hoovering', 'Mopping',
  'Windows', 'Oven', 'Fridge', 'General tidying',
];

export const CleaningTasksStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const [selected, setSelected] = useState<string[]>(data.cleaningTasks ?? []);

  const toggle = (task: string) =>
    setSelected((prev) =>
      prev.includes(task) ? prev.filter((t) => t !== task) : [...prev, task],
    );

  return (
    <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-2">
        What needs cleaning?
      </h2>
      <p className="text-muted-foreground text-sm mb-5">Pick everything that applies.</p>

      {/* Duo safety note — inline, not a modal */}
      <div className="flex items-start gap-3 bg-sage-light rounded-xl px-4 py-3 mb-5">
        <Shield className="w-4 h-4 text-sage mt-0.5 flex-shrink-0" />
        <p className="text-xs text-foreground/70 leading-relaxed">
          <span className="font-semibold text-foreground">Duo system:</span> We always send two students for indoor jobs.
        </p>
      </div>

      <div className="flex flex-col gap-2 mb-8">
        {CLEANING_TASKS.map((task) => (
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
              <span className="w-4 h-4 rounded-full bg-primary-foreground/20 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">
                ✓
              </span>
            )}
            {task}
          </button>
        ))}
      </div>

      <Button
        onClick={() => { onChange({ cleaningTasks: selected }); onNext(); }}
        disabled={selected.length === 0}
        className="w-full rounded-full"
        size="lg"
      >
        Continue
      </Button>
    </div>
  );
};

export const CleaningDurationStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const options = [
    { id: '1hr' as const, label: '1 hour',  price: '€16', sub: 'Quick freshen-up'       },
    { id: '2hr' as const, label: '2 hours', price: '€32', sub: 'Full clean of main rooms' },
    { id: '3hr' as const, label: '3 hours', price: '€48', sub: 'Deep clean throughout'   },
  ];

  return (
    <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-2">
        How long?
      </h2>
      <p className="text-muted-foreground text-sm mb-8">Two students means twice the speed.</p>

      <div className="flex flex-col gap-3">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => { onChange({ cleaningDuration: opt.id }); onNext(); }}
            className={cn(
              'w-full flex items-center justify-between px-5 min-h-[72px] rounded-2xl text-left',
              'transition-[background-color,transform] duration-150 ease-out-expo active:scale-[0.97]',
              data.cleaningDuration === opt.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground border border-border/40 hover:bg-secondary/70',
            )}
          >
            <div>
              <p className="font-semibold text-base">{opt.label}</p>
              <p className={cn('text-xs mt-0.5', data.cleaningDuration === opt.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
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
