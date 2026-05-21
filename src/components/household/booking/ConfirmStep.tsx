import React, { useState } from 'react';
import type { StepProps, BookingData } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<string, string> = {
  shopping:  '🛒 Shopping run',
  'dog-walk': '🐕 Dog walk',
  garden:    '🌿 Garden work',
  moving:    '📦 Moving help',
  cleaning:  '🧹 Cleaning',
  other:     '✨ General help',
};

function formatDate(date: string): string {
  if (date === 'today') return 'Today';
  if (date === 'tomorrow') return 'Tomorrow';
  try {
    return new Date(date).toLocaleDateString('en-IE', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  } catch {
    return date;
  }
}

function formatSlot(slot: string): string {
  const map: Record<string, string> = {
    morning: 'Morning (8am–12pm)',
    afternoon: 'Afternoon (12pm–5pm)',
    evening: 'Evening (5pm–8pm)',
  };
  return map[slot] ?? slot;
}

/* Computes a human-readable price estimate from the collected booking data. */
function getPriceEstimate(data: BookingData): string {
  switch (data.category) {
    case 'shopping':
      return data.isExpress ? '€25 (express)' : '€12 flat';
    case 'dog-walk': {
      const base = data.walkDuration === '30min' ? 10 : 15;
      const count = data.dogCount ?? 1;
      return `€${base * count}`;
    }
    case 'garden': {
      const prices: Record<string, string> = { '1hr': '€18', '2hr': '€36', 'half-day': '€65' };
      return data.gardenDuration ? prices[data.gardenDuration] : '€18+';
    }
    case 'moving': {
      const helpers = data.helperCount ?? 1;
      return `€18/hr × ${helpers} helper${helpers > 1 ? 's' : ''}`;
    }
    case 'cleaning': {
      const hrs: Record<string, number> = { '1hr': 1, '2hr': 2, '3hr': 3 };
      const h = data.cleaningDuration ? (hrs[data.cleaningDuration] ?? 1) : 1;
      return `€${h * 16}`;
    }
    case 'other':
      return data.pricingType === 'flat' ? '€15 flat' : 'from €15/hr';
    default:
      return 'To be confirmed';
  }
}

export const ConfirmStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const [touched, setTouched] = useState({ name: false, address: false, phone: false });
  const [booking, setBooking] = useState(false);

  const errors = {
    name:    !data.customerName?.trim(),
    address: !data.customerAddress?.trim(),
    phone:   !data.customerPhone?.trim(),
  };

  const hasErrors = errors.name || errors.address || errors.phone;

  const handleBook = () => {
    setTouched({ name: true, address: true, phone: true });
    if (hasErrors) return;
    setBooking(true);
    // Phase 4 will wire Stripe capture here; for now proceed immediately
    setTimeout(onNext, 400);
  };

  return (
    <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
      <h2 className="text-xl font-semibold text-foreground mb-1">Confirm your booking</h2>
      <p className="text-muted-foreground text-sm mb-6">Just a few details and you're done.</p>

      {/* Booking summary card */}
      <div className="bg-secondary/40 rounded-2xl p-4 mb-6 space-y-2">
        <p className="font-semibold text-foreground text-sm">
          {CATEGORY_LABELS[data.category] ?? data.category}
        </p>
        {data.scheduledDate && (
          <p className="text-sm text-muted-foreground">
            📅 {formatDate(data.scheduledDate)}
            {data.timeSlot ? ` · ${formatSlot(data.timeSlot)}` : ''}
          </p>
        )}
        {data.store && (
          <p className="text-sm text-muted-foreground">🏪 {data.store}</p>
        )}
        {data.dogCount && (
          <p className="text-sm text-muted-foreground">
            🐕 {data.dogCount} dog{data.dogCount > 1 ? 's' : ''} · {data.walkDuration}
          </p>
        )}
        {data.gardenTasks && data.gardenTasks.length > 0 && (
          <p className="text-sm text-muted-foreground">🌿 {data.gardenTasks.join(', ')}</p>
        )}
        {data.helperCount && (
          <p className="text-sm text-muted-foreground">
            👥 {data.helperCount} helper{data.helperCount > 1 ? 's' : ''}
          </p>
        )}
        <div className="pt-2 border-t border-border/40 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Estimated cost</span>
          <span className="font-semibold text-foreground text-sm">{getPriceEstimate(data)}</span>
        </div>
      </div>

      {/* Customer details */}
      <p className="text-sm font-semibold text-foreground mb-3">Your details</p>
      <div className="space-y-3 mb-6">
        <div>
          <Label htmlFor="cust-name" className="text-xs text-muted-foreground mb-1.5 block">
            Full name
          </Label>
          <Input
            id="cust-name"
            placeholder="Your name"
            value={data.customerName ?? ''}
            onChange={(e) => onChange({ customerName: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            className={cn(
              'rounded-xl',
              touched.name && errors.name ? 'border-destructive focus-visible:ring-destructive' : '',
            )}
          />
          {touched.name && errors.name && (
            <p className="text-destructive text-xs mt-1">Required</p>
          )}
        </div>

        <div>
          <Label htmlFor="cust-addr" className="text-xs text-muted-foreground mb-1.5 block">
            Address in Galway
          </Label>
          <Input
            id="cust-addr"
            placeholder="Your full address"
            value={data.customerAddress ?? ''}
            onChange={(e) => onChange({ customerAddress: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, address: true }))}
            className={cn(
              'rounded-xl',
              touched.address && errors.address ? 'border-destructive focus-visible:ring-destructive' : '',
            )}
          />
          {touched.address && errors.address && (
            <p className="text-destructive text-xs mt-1">Required</p>
          )}
        </div>

        <div>
          <Label htmlFor="cust-phone" className="text-xs text-muted-foreground mb-1.5 block">
            Phone number
          </Label>
          <Input
            id="cust-phone"
            type="tel"
            placeholder="+353 87 ..."
            value={data.customerPhone ?? ''}
            onChange={(e) => onChange({ customerPhone: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
            className={cn(
              'rounded-xl',
              touched.phone && errors.phone ? 'border-destructive focus-visible:ring-destructive' : '',
            )}
          />
          {touched.phone && errors.phone && (
            <p className="text-destructive text-xs mt-1">Required</p>
          )}
        </div>
      </div>

      {/* Stripe card shell — actual integration in Phase 4 */}
      <p className="text-sm font-semibold text-foreground mb-3">Payment</p>
      <div className="border border-border rounded-2xl p-4 mb-3 space-y-3 bg-background">
        <p className="text-xs text-muted-foreground font-medium">💳 Card details</p>
        <div className="border border-border/60 rounded-xl px-3 py-2.5 text-sm text-muted-foreground/40 bg-secondary/30 select-none">
          Card number · · · ·  · · · ·  · · · ·  · · · ·
        </div>
        <div className="flex gap-3">
          <div className="flex-1 border border-border/60 rounded-xl px-3 py-2.5 text-sm text-muted-foreground/40 bg-secondary/30 select-none">
            MM / YY
          </div>
          <div className="w-20 border border-border/60 rounded-xl px-3 py-2.5 text-sm text-muted-foreground/40 bg-secondary/30 select-none">
            CVC
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center mb-8">
        🔒 Only charged when the job is done. Cancel anytime.
      </p>

      <Button
        onClick={handleBook}
        disabled={booking}
        className="w-full rounded-full shadow-primary-glow"
        size="lg"
      >
        {booking ? 'Booking…' : 'Book now'}
      </Button>
    </div>
  );
};
