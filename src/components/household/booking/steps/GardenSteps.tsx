import React, { useState } from 'react';
import type { StepProps } from '../types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const GARDEN_TASKS = ['Mow lawn', 'Trim hedges', 'Weeding', 'Planting', 'Remove waste', 'Other'];

export const GardenTasksStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const [selected, setSelected] = useState<string[]>(data.gardenTasks ?? []);

  const toggle = (task: string) => {
    setSelected((prev) =>
      prev.includes(task) ? prev.filter((t) => t !== task) : [...prev, task],
    );
  };

  const handleNext = () => {
    onChange({ gardenTasks: selected });
    onNext();
  };

  return (
    <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
      <h2 className="text-xl font-semibold text-foreground mb-1">What needs doing?</h2>
      <p className="text-muted-foreground text-sm mb-6">Select everything that applies — you can pick multiple.</p>

      <div className="grid grid-cols-2 gap-3 mb-8">
        {GARDEN_TASKS.map((task) => (
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

/* Optional photo of the garden — file input shell only for now */
export const GardenPhotoStep: React.FC<StepProps> = ({ onNext }) => (
  <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
    <h2 className="text-xl font-semibold text-foreground mb-1">Add a photo</h2>
    <p className="text-muted-foreground text-sm mb-6">Optional — helps your helper prepare. You can skip this.</p>

    <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-14 cursor-pointer hover:border-primary/40 transition-colors mb-8 group">
      <span className="text-4xl mb-3 group-hover:scale-110 transition-transform duration-150">🌿</span>
      <span className="text-sm font-medium text-foreground">Tap to add a garden photo</span>
      <span className="text-xs text-muted-foreground mt-1">JPG, PNG · up to 10MB</span>
      <input type="file" accept="image/*" className="sr-only" />
    </label>

    <Button onClick={onNext} className="w-full rounded-full" size="lg" variant="outline">
      Skip & continue
    </Button>
  </div>
);

export const GardenDurationStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const options = [
    { id: '1hr'      as const, label: '1 hour',       price: '€18',  detail: 'Light tidying' },
    { id: '2hr'      as const, label: '2 hours',      price: '€36',  detail: 'A thorough session' },
    { id: 'half-day' as const, label: 'Half day',     price: '€65',  detail: 'Full garden overhaul' },
  ];

  return (
    <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
      <h2 className="text-xl font-semibold text-foreground mb-1">How long do you need?</h2>
      <p className="text-muted-foreground text-sm mb-6">Your helper will work through your list in the time you choose.</p>

      <div className="space-y-3">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => { onChange({ gardenDuration: opt.id }); onNext(); }}
            className={cn(
              'w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all duration-150 ease-out-expo active:scale-[0.98] text-left',
              data.gardenDuration === opt.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary hover:bg-secondary/80',
            )}
          >
            <div>
              <p className="font-semibold text-sm">{opt.label}</p>
              <p className={cn('text-xs mt-0.5', data.gardenDuration === opt.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
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
