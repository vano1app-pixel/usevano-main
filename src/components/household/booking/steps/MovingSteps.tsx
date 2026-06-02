import React from 'react';
import type { StepProps } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export const MovingHelpersStep: React.FC<StepProps> = ({ data, onChange, onNext }) => (
  <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
    <h2 className="text-3xl font-bold tracking-tight text-foreground mb-2">
      How many helpers?
    </h2>
    <p className="text-muted-foreground text-sm mb-8">Each is €18/hr. More = faster.</p>

    <div className="grid grid-cols-2 gap-3">
      {([1, 2, 3, 4] as const).map((n) => (
        <button
          key={n}
          onClick={() => { onChange({ helperCount: n }); onNext(); }}
          className={cn(
            'min-h-[80px] rounded-2xl flex flex-col items-center justify-center gap-1',
            'transition-[background-color,transform] duration-150 ease-out-expo active:scale-[0.95]',
            data.helperCount === n
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-foreground border border-border/40',
          )}
        >
          <span className="font-bold text-3xl tabular-nums">{n}</span>
          <span className="text-xs opacity-70">helper{n > 1 ? 's' : ''}</span>
        </button>
      ))}
    </div>
  </div>
);

export const MovingAddressStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const canProceed = !!data.fromAddress?.trim() && !!data.toAddress?.trim();

  return (
    <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-8">
        From and to?
      </h2>

      <div className="flex flex-col gap-4 mb-8">
        <div>
          <Label htmlFor="from-addr" className="text-xs text-muted-foreground mb-1.5 block font-medium">
            Moving from
          </Label>
          <Input
            id="from-addr"
            placeholder="Current address"
            value={data.fromAddress ?? ''}
            onChange={(e) => onChange({ fromAddress: e.target.value })}
            className="rounded-xl text-base h-12"
          />
        </div>
        <div>
          <Label htmlFor="to-addr" className="text-xs text-muted-foreground mb-1.5 block font-medium">
            Moving to
          </Label>
          <Input
            id="to-addr"
            placeholder="New address"
            value={data.toAddress ?? ''}
            onChange={(e) => onChange({ toAddress: e.target.value })}
            className="rounded-xl text-base h-12"
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
  <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
    <h2 className="text-3xl font-bold tracking-tight text-foreground mb-2">
      What's being moved?
    </h2>
    <p className="text-muted-foreground text-sm mb-6">Sofas, boxes, stairs? Optional but helpful.</p>

    <Textarea
      placeholder="e.g. 2 sofas, boxes, no elevator — 2nd floor…"
      rows={5}
      value={data.movingDescription ?? ''}
      onChange={(e) => onChange({ movingDescription: e.target.value })}
      className="rounded-2xl resize-none mb-4 text-base"
    />

    <div className="flex items-center gap-3 border border-dashed border-border rounded-2xl px-4 py-3 mb-8">
      <span className="text-xl" aria-hidden="true">📷</span>
      <span className="text-sm text-muted-foreground">You can send photos via WhatsApp once matched</span>
    </div>

    <Button onClick={onNext} className="w-full rounded-full" size="lg">
      {data.movingDescription?.trim() ? 'Continue' : 'Skip'}
    </Button>
  </div>
);

export const MovingDurationStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const options = [
    { id: '1hr' as const, label: '1 hour',   price: '€18/helper', sub: 'Studio or single room'  },
    { id: '2hr' as const, label: '2 hours',  price: '€36/helper', sub: '1–2 bedroom flat'       },
    { id: '3hr' as const, label: '3 hours',  price: '€54/helper', sub: '2–3 bedroom house'      },
    { id: '4hr' as const, label: '4+ hours', price: '€72/helper', sub: 'Large house or office'  },
  ] as const;

  return (
    <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-2">
        How long do you need them?
      </h2>
      <p className="text-muted-foreground text-sm mb-8">You can extend on the day.</p>

      <div className="flex flex-col gap-3">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => { onChange({ movingDuration: opt.id }); onNext(); }}
            className={cn(
              'w-full flex items-center justify-between px-5 min-h-[68px] rounded-2xl text-left',
              'transition-[background-color,transform] duration-150 ease-out-expo active:scale-[0.97]',
              data.movingDuration === opt.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground border border-border/40 hover:bg-secondary/70',
            )}
          >
            <div>
              <p className="font-semibold text-base">{opt.label}</p>
              <p className={cn('text-xs mt-0.5', data.movingDuration === opt.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                {opt.sub}
              </p>
            </div>
            <span className="font-semibold text-sm tabular-nums ml-3 shrink-0">{opt.price}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
