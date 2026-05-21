import React, { useState } from 'react';
import type { StepProps } from './types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TIME_SLOTS = [
  { id: 'morning',   label: 'Morning',   detail: '8am–12pm' },
  { id: 'afternoon', label: 'Afternoon', detail: '12–5pm'   },
  { id: 'evening',   label: 'Evening',   detail: '5–8pm'    },
] as const;

const minCustomDate = new Date(Date.now() + 86_400_000 * 2).toISOString().split('T')[0];

export const WhenStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const [showPicker, setShowPicker] = useState(false);
  const isCustom = !!data.scheduledDate && !['today', 'tomorrow'].includes(data.scheduledDate);
  const canProceed = !!data.scheduledDate && !!data.timeSlot;

  const setDate = (date: string, isExpress = false) => {
    onChange({ scheduledDate: date, isExpress });
    setShowPicker(false);
  };

  return (
    <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-8">
        When do you need help?
      </h2>

      {/* Date rows */}
      <div className="flex flex-col gap-2.5 mb-7">
        <button
          onClick={() => setDate('today', true)}
          className={cn(
            'w-full flex items-center justify-between px-5 min-h-[68px] rounded-2xl text-left',
            'transition-[background-color,transform] duration-150 ease-out-expo active:scale-[0.97]',
            data.scheduledDate === 'today'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-foreground border border-border/40',
          )}
        >
          <div>
            <p className="font-semibold text-base">Today</p>
            <p className={cn('text-xs mt-0.5', data.scheduledDate === 'today' ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
              Within 1–2 hours
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] font-semibold shrink-0 ml-3',
              data.scheduledDate === 'today'
                ? 'border-white/30 text-white bg-white/10'
                : 'border-express-orange/30 text-express-orange',
            )}
          >
            Express
          </Badge>
        </button>

        <button
          onClick={() => setDate('tomorrow')}
          className={cn(
            'w-full min-h-[60px] px-5 rounded-2xl font-semibold text-base text-left',
            'transition-[background-color,transform] duration-150 ease-out-expo active:scale-[0.97]',
            data.scheduledDate === 'tomorrow'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-foreground border border-border/40',
          )}
        >
          Tomorrow
        </button>

        <button
          onClick={() => setShowPicker(!showPicker)}
          className={cn(
            'w-full min-h-[60px] px-5 rounded-2xl font-semibold text-base text-left',
            'transition-[background-color,transform] duration-150 ease-out-expo active:scale-[0.97]',
            isCustom
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-foreground border border-border/40',
          )}
        >
          {isCustom
            ? new Date(data.scheduledDate!).toLocaleDateString('en-IE', { weekday: 'long', month: 'long', day: 'numeric' })
            : 'Choose a date'}
        </button>

        {showPicker && (
          <input
            type="date"
            min={minCustomDate}
            className="w-full h-12 border border-border rounded-2xl px-4 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            onChange={(e) => { if (e.target.value) setDate(e.target.value); }}
          />
        )}
      </div>

      {/* Time slots */}
      <p className="text-sm font-semibold text-foreground mb-3">What time?</p>
      <div className="grid grid-cols-3 gap-2.5 mb-8">
        {TIME_SLOTS.map((slot) => (
          <button
            key={slot.id}
            onClick={() => onChange({ timeSlot: slot.id })}
            className={cn(
              'flex flex-col items-center py-4 rounded-2xl text-center',
              'transition-[background-color,transform] duration-150 ease-out-expo active:scale-[0.97]',
              data.timeSlot === slot.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground border border-border/40',
            )}
          >
            <span className="font-semibold text-sm">{slot.label}</span>
            <span className={cn('text-[11px] mt-0.5', data.timeSlot === slot.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
              {slot.detail}
            </span>
          </button>
        ))}
      </div>

      <Button onClick={onNext} disabled={!canProceed} className="w-full rounded-full" size="lg">
        Continue
      </Button>
    </div>
  );
};
