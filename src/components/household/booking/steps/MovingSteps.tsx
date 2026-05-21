import React from 'react';
import type { StepProps } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export const MovingHelpersStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const options = [1, 2, 3, 4] as const;

  return (
    <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
      <h2 className="text-xl font-semibold text-foreground mb-1">How many helpers?</h2>
      <p className="text-muted-foreground text-sm mb-6">More helpers = faster move. Each is €18/hr.</p>

      <div className="grid grid-cols-2 gap-3">
        {options.map((n) => (
          <button
            key={n}
            onClick={() => { onChange({ helperCount: n }); onNext(); }}
            className={cn(
              'min-h-[72px] rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-150 ease-out-expo active:scale-[0.97]',
              data.helperCount === n
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground hover:bg-secondary/80',
            )}
          >
            <span className="font-bold text-2xl">{n}</span>
            <span className={cn('text-xs', data.helperCount === n ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
              helper{n > 1 ? 's' : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export const MovingAddressStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const canProceed = !!data.fromAddress?.trim() && !!data.toAddress?.trim();

  return (
    <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
      <h2 className="text-xl font-semibold text-foreground mb-1">Where from and to?</h2>
      <p className="text-muted-foreground text-sm mb-6">Both addresses in Galway, please.</p>

      <div className="space-y-4 mb-8">
        <div>
          <Label htmlFor="from-addr" className="text-xs text-muted-foreground mb-1.5 block">
            Moving from
          </Label>
          <Input
            id="from-addr"
            placeholder="Current address"
            value={data.fromAddress ?? ''}
            onChange={(e) => onChange({ fromAddress: e.target.value })}
            className="rounded-xl"
          />
        </div>
        <div>
          <Label htmlFor="to-addr" className="text-xs text-muted-foreground mb-1.5 block">
            Moving to
          </Label>
          <Input
            id="to-addr"
            placeholder="New address"
            value={data.toAddress ?? ''}
            onChange={(e) => onChange({ toAddress: e.target.value })}
            className="rounded-xl"
          />
        </div>
      </div>

      <Button onClick={onNext} disabled={!canProceed} className="w-full rounded-full" size="lg">
        Continue
      </Button>
    </div>
  );
};

export const MovingDescriptionStep: React.FC<StepProps> = ({ data, onChange, onNext }) => (
  <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
    <h2 className="text-xl font-semibold text-foreground mb-1">What's being moved?</h2>
    <p className="text-muted-foreground text-sm mb-6">Any big items, stairs, or access notes help us prepare.</p>

    <Textarea
      placeholder="e.g. 2 sofas, boxes, no elevator — 2nd floor. Gate on right side."
      rows={5}
      value={data.movingDescription ?? ''}
      onChange={(e) => onChange({ movingDescription: e.target.value })}
      className="rounded-2xl resize-none mb-5"
    />

    <label className="flex items-center gap-3 border border-dashed border-border rounded-2xl px-4 py-3 cursor-pointer hover:border-primary/40 transition-colors mb-8">
      <span className="text-xl">📷</span>
      <span className="text-sm text-muted-foreground">Add a photo (optional)</span>
      <input type="file" accept="image/*" className="sr-only" />
    </label>

    <Button onClick={onNext} className="w-full rounded-full" size="lg">
      {data.movingDescription?.trim() ? 'Continue' : 'Skip & continue'}
    </Button>
  </div>
);

export const MovingDurationStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const options = [
    { id: '1hr' as const, label: '1 hour',   price: '€18/helper', detail: 'Studio or single room' },
    { id: '2hr' as const, label: '2 hours',  price: '€36/helper', detail: '1–2 bedroom flat'       },
    { id: '3hr' as const, label: '3 hours',  price: '€54/helper', detail: '2–3 bedroom house'      },
    { id: '4hr' as const, label: '4+ hours', price: '€72/helper', detail: 'Large house or office'  },
  ] as const;

  return (
    <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
      <h2 className="text-xl font-semibold text-foreground mb-1">How long do you need them?</h2>
      <p className="text-muted-foreground text-sm mb-6">Priced per helper. You can extend on the day.</p>

      <div className="space-y-2.5">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => { onChange({ movingDuration: opt.id }); onNext(); }}
            className={cn(
              'w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all duration-150 ease-out-expo active:scale-[0.98] text-left',
              data.movingDuration === opt.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary hover:bg-secondary/80',
            )}
          >
            <div>
              <p className="font-semibold text-sm">{opt.label}</p>
              <p className={cn('text-xs mt-0.5', data.movingDuration === opt.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                {opt.detail}
              </p>
            </div>
            <span className="font-semibold text-sm tabular-nums shrink-0 ml-2">{opt.price}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
