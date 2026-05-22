import React, { useState } from 'react';
import type { StepProps } from '../types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const STORES = ['Dunnes', 'Tesco', 'Aldi', 'Lidl', 'SuperValu', 'Other'];

/* Single tap → auto-advance. No button, no friction. Pure Uber. */
export const ShoppingStoreStep: React.FC<StepProps> = ({ data, onChange, onNext }) => (
  <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
    <h2 className="text-3xl font-bold tracking-tight text-foreground mb-8">
      Which store?
    </h2>

    <div className="flex flex-col gap-2.5">
      {STORES.map((store) => (
        <button
          key={store}
          onClick={() => { onChange({ store }); onNext(); }}
          className={cn(
            'w-full min-h-[60px] px-5 rounded-2xl font-medium text-base text-left',
            'transition-[background-color,transform] duration-150 ease-out-expo active:scale-[0.97]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            data.store === store
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-foreground border border-border/40 hover:bg-secondary/70',
          )}
        >
          {store}
        </button>
      ))}
    </div>
  </div>
);

export const ShoppingListStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const [method, setMethod] = useState<'type' | 'photo' | 'voice'>('type');
  const canProceed = method !== 'type' || !!data.shoppingList?.trim();

  return (
    <div className="px-4 pt-10 pb-28 max-w-sm mx-auto">
      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-2">
        Your shopping list
      </h2>
      <p className="text-muted-foreground text-sm mb-6">Type, snap a photo, or skip.</p>

      <div className="flex gap-2 mb-5">
        {(['type', 'photo', 'voice'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150',
              method === m
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground border border-border/40',
            )}
          >
            {m === 'type' ? 'Type' : m === 'photo' ? 'Photo' : 'Voice'}
          </button>
        ))}
      </div>

      {method === 'type' && (
        <Textarea
          placeholder="Milk, bread, chicken fillets, eggs…"
          rows={6}
          value={data.shoppingList ?? ''}
          onChange={(e) => onChange({ shoppingList: e.target.value })}
          className="rounded-2xl resize-none mb-6 text-base"
          autoFocus
        />
      )}

      {method === 'photo' && (
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-14 cursor-pointer hover:border-primary/40 transition-colors mb-6">
          <span className="text-4xl mb-3" aria-hidden="true">📷</span>
          <span className="text-sm font-medium">Tap to add a photo</span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={() => onChange({ shoppingList: '[photo attached]' })}
          />
        </label>
      )}

      {method === 'voice' && (
        <div className="flex flex-col items-center border-2 border-dashed border-border rounded-2xl py-14 mb-6">
          <span className="text-4xl mb-3" aria-hidden="true">🎤</span>
          <span className="text-sm text-muted-foreground">Voice notes coming soon</span>
        </div>
      )}

      <Button onClick={onNext} disabled={!canProceed} className="w-full rounded-full" size="lg">
        Continue
      </Button>
    </div>
  );
};
