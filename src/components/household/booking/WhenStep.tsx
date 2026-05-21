import React, { useState } from 'react';
import type { StepProps } from './types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TIME_SLOTS = [
  { id: 'morning',   label: 'Morning',   detail: '8am – 12pm' },
  { id: 'afternoon', label: 'Afternoon', detail: '12pm – 5pm' },
  { id: 'evening',   label: 'Evening',   detail: '5pm – 8pm'  },
] as const;

const twoDaysFromNow = new Date(Date.now() + 86_400_000 * 2).toISOString().split('T')[0];

export const WhenStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const [showPicker, setShowPicker] = useState(false);

  const setDate = (date: string, isExpress = false) => {
    onChange({ scheduledDate: date, isExpress });
    setShowPicker(false);
  };

  const isCustomDate =
    !!data.scheduledDate && !['today', 'tomorrow'].includes(data.scheduledDate);

  const canProceed = !!data.scheduledDate && !!data.timeSlot;

  return (
    <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
      <h2 className="text-xl font-semibold text-foreground mb-1">When do you need help?</h2>
      <p className="text-muted-foreground text-sm mb-6">Pick a day and time that suits you.</p>

      {/* Date options */}
      <div className="space-y-2.5 mb-7">
        <button
          onClick={() => setDate('today', true)}
          className={cn(
            'w-full flex items-center justify-between px-4 py-4 rounded-2xl transition-all duration-150 ease-out-expo active:scale-[0.98] text-left',
            data.scheduledDate === 'today'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary hover:bg-secondary/80',
          )}
        >
          <div>
            <p className="font-medium text-sm">Today</p>
            <p className={cn('text-xs mt-0.5', data.scheduledDate === 'today' ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
              Dispatch within 1–2 hours
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] shrink-0',
              data.scheduledDate === 'today'
                ? 'border-white/30 text-primary-foreground/90 bg-white/10'
                : 'border-express-orange/30 text-express-orange bg-transparent',
            )}
          >
            Express · €25/hr
          </Badge>
        </button>

        <button
          onClick={() => setDate('tomorrow', false)}
          className={cn(
            'w-full flex items-center px-4 py-4 rounded-2xl transition-all duration-150 ease-out-expo active:scale-[0.98] text-left font-medium text-sm',
            data.scheduledDate === 'tomorrow'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary hover:bg-secondary/80',
          )}
        >
          Tomorrow
        </button>

        <button
          onClick={() => setShowPicker(!showPicker)}
          className={cn(
            'w-full flex items-center px-4 py-4 rounded-2xl transition-all duration-150 ease-out-expo active:scale-[0.98] text-left font-medium text-sm',
            isCustomDate
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary hover:bg-secondary/80',
          )}
        >
          {isCustomDate
            ? new Date(data.scheduledDate!).toLocaleDateString('en-IE', {
                weekday: 'long', month: 'long', day: 'numeric',
              })
            : 'Choose a date…'}
        </button>

        {showPicker && (
          <input
            type="date"
            min={twoDaysFromNow}
            className="w-full border border-border rounded-2xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            onChange={(e) => { if (e.target.value) setDate(e.target.value, false); }}
          />
        )}
      </div>

      {/* Time slot */}
      <p className="text-sm font-semibold text-foreground mb-3">What time?</p>
      <div className="grid grid-cols-3 gap-3 mb-8">
        {TIME_SLOTS.map((slot) => (
          <button
            key={slot.id}
            onClick={() => onChange({ timeSlot: slot.id })}
            className={cn(
              'flex flex-col items-center py-3.5 px-2 rounded-2xl text-center transition-all duration-150 ease-out-expo active:scale-[0.97]',
              data.timeSlot === slot.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary hover:bg-secondary/80',
            )}
          >
            <span className="font-medium text-sm">{slot.label}</span>
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
