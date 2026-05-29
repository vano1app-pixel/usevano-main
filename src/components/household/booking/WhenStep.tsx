import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StepProps } from './types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const TIME_SLOTS = [
  { id: 'morning',   label: 'Morning',   detail: '8am–12pm' },
  { id: 'afternoon', label: 'Afternoon', detail: '12–5pm'   },
  { id: 'evening',   label: 'Evening',   detail: '5–8pm'    },
] as const;

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatCustomDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IE', { weekday: 'long', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

export const WhenStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const isCustom = !!data.scheduledDate && !['today', 'tomorrow'].includes(data.scheduledDate);
  const canProceed = !!data.scheduledDate && !!data.timeSlot;

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 2);
  minDate.setHours(0, 0, 0, 0);

  const setDate = (date: string, isExpress = false) => {
    onChange({ scheduledDate: date, isExpress });
    setCalendarOpen(false);
  };

  const handleCalendarSelect = (d: Date | undefined) => {
    if (d) {
      setDate(toISODate(d));
      setCalendarOpen(false);
    }
  };

  const selectedCalendarDate = isCustom ? new Date(data.scheduledDate!) : undefined;

  return (
    <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-8">
        When do you need help?
      </h2>

      {/* Date rows */}
      <div className="flex flex-col gap-2.5 mb-7">
        {/* Today — express */}
        <button
          onClick={() => setDate('today', true)}
          className={cn(
            'w-full flex items-center justify-between px-5 min-h-[68px] rounded-2xl text-left',
            'transition-[background-color,transform] duration-150 ease-out-expo active:scale-[0.97]',
            data.scheduledDate === 'today'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-foreground border border-border/40 hover:border-primary/30',
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

        {/* Tomorrow */}
        <button
          onClick={() => setDate('tomorrow')}
          className={cn(
            'w-full min-h-[60px] px-5 rounded-2xl font-semibold text-base text-left',
            'transition-[background-color,transform] duration-150 ease-out-expo active:scale-[0.97]',
            data.scheduledDate === 'tomorrow'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-foreground border border-border/40 hover:border-primary/30',
          )}
        >
          Tomorrow
        </button>

        {/* Custom date — Calendar popover */}
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                'w-full min-h-[60px] px-5 rounded-2xl font-semibold text-base text-left',
                'flex items-center justify-between gap-3',
                'transition-[background-color,transform,border-color] duration-150 ease-out-expo active:scale-[0.97]',
                isCustom
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-foreground border border-border/40 hover:border-primary/30',
              )}
            >
              <span>
                {isCustom ? formatCustomDate(data.scheduledDate!) : 'Choose a date'}
              </span>
              <CalendarIcon
                className={cn('w-4 h-4 flex-shrink-0', isCustom ? 'text-primary-foreground/70' : 'text-muted-foreground')}
              />
            </button>
          </PopoverTrigger>
          <AnimatePresence>
            {calendarOpen && (
              <PopoverContent className="w-auto p-0 shadow-lg" align="start" forceMount>
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                >
                  <Calendar
                    mode="single"
                    selected={selectedCalendarDate}
                    onSelect={handleCalendarSelect}
                    disabled={(d) => d < minDate}
                    initialFocus
                  />
                </motion.div>
              </PopoverContent>
            )}
          </AnimatePresence>
        </Popover>
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
                : 'bg-secondary text-foreground border border-border/40 hover:border-primary/30',
            )}
          >
            <span className="font-semibold text-sm">{slot.label}</span>
            <span className={cn('text-[11px] mt-0.5', data.timeSlot === slot.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
              {slot.detail}
            </span>
          </button>
        ))}
      </div>

      <Button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full rounded-full hover:-translate-y-px hover:shadow-primary-glow transition-[transform,box-shadow] duration-150 active:scale-[0.97]"
        size="lg"
      >
        Continue
      </Button>
    </div>
  );
};
