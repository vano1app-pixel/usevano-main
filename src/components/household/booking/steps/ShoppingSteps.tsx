import React, { useState } from 'react';
import type { StepProps } from '../types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const STORES = ['Dunnes', 'Tesco', 'Aldi', 'Lidl', 'SuperValu', 'Other'];

/* Store selector — single tap auto-advances to next step */
export const ShoppingStoreStep: React.FC<StepProps> = ({ data, onChange, onNext }) => (
  <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
    <h2 className="text-xl font-semibold text-foreground mb-1">Which store?</h2>
    <p className="text-muted-foreground text-sm mb-6">We'll head there to pick up your order.</p>

    <div className="grid grid-cols-2 gap-3">
      {STORES.map((store) => (
        <button
          key={store}
          onClick={() => { onChange({ store }); onNext(); }}
          className={cn(
            'min-h-[52px] px-4 py-3 rounded-2xl font-medium text-sm text-left transition-all duration-150 ease-out-expo active:scale-[0.97]',
            data.store === store
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
          )}
        >
          {store}
        </button>
      ))}
    </div>
  </div>
);

/* Shopping list — type it out; photo / voice note are UI shells (Phase 4) */
export const ShoppingListStep: React.FC<StepProps> = ({ data, onChange, onNext }) => {
  const [method, setMethod] = useState<'type' | 'photo' | 'voice'>('type');
  const canProceed = method === 'type' ? !!data.shoppingList?.trim() : true;

  return (
    <div className="px-4 pt-8 pb-28 max-w-lg mx-auto md:max-w-xl">
      <h2 className="text-xl font-semibold text-foreground mb-1">Your shopping list</h2>
      <p className="text-muted-foreground text-sm mb-6">Tell us what you need — your helper will do the rest.</p>

      {/* Method selector */}
      <div className="flex gap-2 mb-5">
        {(['type', 'photo', 'voice'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ease-out-expo capitalize',
              method === m
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            )}
          >
            {m === 'type' ? '✏️ Type it' : m === 'photo' ? '📷 Photo' : '🎤 Voice'}
          </button>
        ))}
      </div>

      {method === 'type' && (
        <Textarea
          placeholder="e.g. 2 litres of milk, sliced bread, 6 eggs, chicken fillets…"
          rows={5}
          value={data.shoppingList ?? ''}
          onChange={(e) => onChange({ shoppingList: e.target.value })}
          className="rounded-2xl resize-none mb-6"
        />
      )}

      {method === 'photo' && (
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-10 cursor-pointer hover:border-primary/50 transition-colors mb-6">
          <span className="text-3xl mb-2">📷</span>
          <span className="text-sm text-muted-foreground">Tap to add a photo of your list</span>
          <input type="file" accept="image/*" className="sr-only" onChange={() => onChange({ shoppingList: '[photo attached]' })} />
        </label>
      )}

      {method === 'voice' && (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl py-10 mb-6">
          <span className="text-3xl mb-2">🎤</span>
          <span className="text-sm text-muted-foreground">Voice notes coming soon</span>
          <span className="text-xs text-muted-foreground/60 mt-1">Use "Type it" for now</span>
        </div>
      )}

      <Button onClick={onNext} disabled={!canProceed} className="w-full rounded-full" size="lg">
        Continue
      </Button>
    </div>
  );
};
