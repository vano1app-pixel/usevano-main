import React from 'react';
import { Calendar } from '@/components/ui/calendar';
import { format, isSameDay, parseISO } from 'date-fns';
import { formatJobScheduleLine } from '@/lib/jobSchedule';

interface Shift {
  id: string;
  title: string;
  shift_date: string;
  shift_start: string | null;
  shift_end: string | null;
  location: string;
  hourly_rate: number;
  payment_type?: string | null;
  fixed_price?: number | null;
}

interface ShiftCalendarProps {
  shifts: Shift[];
}

export const ShiftCalendar: React.FC<ShiftCalendarProps> = ({ shifts }) => {
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(new Date());

  const shiftDates = shifts.map((s) => parseISO(s.shift_date));

  const dayHasShift = (date: Date) => shiftDates.some((d) => isSameDay(d, date));

  const selectedShifts = selectedDate
    ? shifts.filter((s) => isSameDay(parseISO(s.shift_date), selectedDate))
    : [];

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="font-semibold mb-4">Upcoming Gigs</h3>
      <div className="flex flex-col md:flex-row gap-6">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          className="pointer-events-auto"
          modifiers={{ hasShift: (date) => dayHasShift(date) }}
          modifiersClassNames={{ hasShift: 'bg-primary/15 font-bold text-primary' }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-muted-foreground mb-3">
            {selectedDate ? format(selectedDate, 'EEEE, MMM d') : 'Select a date'}
          </p>
          {selectedShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No gigs on this day.</p>
          ) : (
            <div className="space-y-3">
              {selectedShifts.map((shift) => (
                <div key={shift.id} className="border border-border rounded-lg p-3">
                  <p className="font-medium text-sm">{shift.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatJobScheduleLine(shift)} · {shift.location}
                  </p>
                  <p className="text-xs text-primary font-medium mt-1">
                    {shift.payment_type === 'fixed'
                      ? `€${shift.fixed_price ?? 0} total`
                      : `€${shift.hourly_rate}/hr`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
