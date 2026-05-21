import React, { useState } from 'react';
import type { StepProps } from '../types';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

const CLEANING_TASKS = [
  'Kitchen', 'Bathrooms', 'Hoovering', 'Mopping floors',
  'Windows', 'Oven', 'Fridge', 'General tidying',
];

export const CleaningTasksStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const [selected, setSelected] = useState<string[]>(data.cleaningTasks ?? []);

  const toggle = (task: string) => {
    setSelected((prev) =>
      prev.includes(task) ? prev.filter((t) => t !== task) : [...prev, task],
    );
  };

  const handleNext = () => {
    onChange({ cleaningTasks: selected });
    onNext();
  };

  return (
    <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
      <h2 className="text-xl font-semibold text-foreground mb-1">What needs cleaning?</h2>
      <p className="text-muted-foreground text-sm mb-4">Select all that apply.</p>

      {/* Duo safety notice — indoor tasks always use two students */}
      <div className="flex items-start gap-3 bg-sage-light rounded-2xl px-4 py-3 mb-5">
        <Shield className="w-4 h-4 text-sage mt-0.5 flex-shrink-0" aria-hidden="true" />
        <p className="text-xs text-foreground/70 leading-relaxed">
          <span className="font-medium text-foreground">Duo system:</span> We always send two students for indoor cleaning — for your safety and theirs.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        {CLEANING_TASKS.map((task) => (
          <button
            key={task}
            onClick={() => toggle(task)}
            className={cn(
              'min-h-[52px] px-4 py-3 rounded-2xl font-medium text-sm text-left transition-all duration-150 ease-out-expo active:scale-[0.97] flex items-center gap-2',
              selected.includes(task)
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            )}
          >
            {selected.includes(task) && <span className="text-base leading-none">✓</span>}
            {task}
          </button>
        ))}
      </div>

      <Button onClick={handleNext} disabled={selected.length === 0} className="w-full rounded-full" size="lg">
        Continue
      </Button>
    </div>
  );
};

export const CleaningDurationStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const options = [
    { id: '1hr' as const, label: '1 hour',  price: '€16', detail: 'Quick freshen-up' },
    { id: '2hr' as const, label: '2 hours', price: '€32', detail: 'Full clean of main rooms' },
    { id: '3hr' as const, label: '3 hours', price: '€48', detail: 'Deep clean throughout' },
  ];

  return (
    <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
      <h2 className="text-xl font-semibold text-foreground mb-1">How long do you need?</h2>
      <p className="text-muted-foreground text-sm mb-6">Remember — two students means twice the speed.</p>

      <div className="space-y-3">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => { onChange({ cleaningDuration: opt.id }); onNext(); }}
            className={cn(
              'w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all duration-150 ease-out-expo active:scale-[0.98] text-left',
              data.cleaningDuration === opt.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary hover:bg-secondary/80',
            )}
          >
            <div>
              <p className="font-semibold text-sm">{opt.label}</p>
              <p className={cn('text-xs mt-0.5', data.cleaningDuration === opt.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
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
