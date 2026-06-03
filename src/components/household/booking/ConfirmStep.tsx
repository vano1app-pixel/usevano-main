import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StepProps, BookingData } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Loader2, Lock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { SUPPORTED_CITIES } from '@/lib/cities';

const errorAnim = {
  initial: { opacity: 0, y: -4, height: 0 },
  animate: { opacity: 1, y: 0, height: 'auto' },
  exit:    { opacity: 0, height: 0 },
  transition: { duration: 0.15 },
};

const CATEGORY_LABELS: Record<string, string> = {
  shopping:  'Shopping run',
  'dog-walk': 'Dog walk',
  garden:    'Garden work',
  moving:    'Moving help',
  cleaning:  'Cleaning',
  other:     'General help',
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
    morning: '8am–12pm',
    afternoon: '12pm–5pm',
    evening: '5pm–8pm',
  };
  return map[slot] ?? slot;
}

function getPriceEstimate(data: BookingData): string {
  switch (data.category) {
    case 'shopping':
      return data.isExpress ? '€25 (express)' : '€15 flat';
    case 'dog-walk': {
      const base = data.walkDuration === '30min' ? 15 : 20;
      const count = data.dogCount ?? 1;
      return `€${base * count}${count > 1 ? ` (${count} dogs)` : ''}`;
    }
    case 'garden': {
      const prices: Record<string, string> = { '1hr': '€18', '2hr': '€36', 'half-day': '€72' };
      return data.gardenDuration ? prices[data.gardenDuration] : '€18+';
    }
    case 'moving': {
      const durationPrices: Record<string, number> = { '1hr': 18, '2hr': 36, '3hr': 54, '4hr': 72 };
      const perHelper = data.movingDuration ? (durationPrices[data.movingDuration] ?? 36) : 36;
      const helpers = data.helperCount ?? 1;
      return `€${perHelper * helpers}${helpers > 1 ? ` (${helpers} helpers)` : ''}`;
    }
    case 'cleaning': {
      const hrs: Record<string, number> = { '1hr': 1, '2hr': 2, '3hr': 3 };
      const h = data.cleaningDuration ? (hrs[data.cleaningDuration] ?? 1) : 1;
      return `€${h * 16}`;
    }
    case 'other':
      return data.pricingType === 'hourly' ? '€25' : '€15 flat';
    default:
      return 'To be confirmed';
  }
}

export const ConfirmStep: React.FC<StepProps> = ({ data, onChange }) => {
  const { toast } = useToast();
  const [touched, setTouched] = useState({ name: false, address: false, phone: false, city: false });
  const [loading, setLoading] = useState(false);

  const errors = {
    name:    !data.customerName?.trim(),
    address: !data.customerAddress?.trim(),
    phone:   !data.customerPhone?.trim(),
    city:    !data.customerCity?.trim(),
  };
  const hasErrors = errors.name || errors.address || errors.phone || errors.city;

  const handleBook = async () => {
    setTouched({ name: true, address: true, phone: true, city: true });
    if (hasErrors) return;

    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('create-household-booking', {
        body: {
          category: data.category,
          scheduled_date: data.scheduledDate,
          time_slot: data.timeSlot,
          is_express: data.isExpress ?? false,
          city: data.customerCity,
          booking_data: {
            store: data.store,
            shoppingList: data.shoppingList,
            dogCount: data.dogCount,
            walkDuration: data.walkDuration,
            gardenTasks: data.gardenTasks,
            gardenDuration: data.gardenDuration,
            helperCount: data.helperCount,
            movingDuration: data.movingDuration,
            fromAddress: data.fromAddress,
            toAddress: data.toAddress,
            movingDescription: data.movingDescription,
            cleaningTasks: data.cleaningTasks,
            cleaningDuration: data.cleaningDuration,
            pricingType: data.pricingType,
            description: data.description,
          },
          customer_name: data.customerName,
          customer_address: data.customerAddress,
          customer_phone: data.customerPhone,
        },
      });

      if (error || !result?.checkout_url) {
        throw error ?? new Error('No checkout URL returned');
      }

      // Redirect to Stripe Checkout — Stripe returns to /track/:id after payment
      window.location.href = result.checkout_url as string;
    } catch (err: unknown) {
      toast({
        title: 'Could not start booking',
        description: getUserFriendlyError(err),
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  return (
    <div className="px-4 pt-8 pb-28 max-w-sm mx-auto">
      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-1">Confirm booking</h2>
      <p className="text-muted-foreground text-sm mb-6">Secure card payment. Price confirmed upfront — no surprises.</p>

      {/* Booking summary */}
      <div className="bg-secondary/40 border border-border/40 rounded-2xl p-4 mb-6">
        <p className="font-semibold text-foreground text-sm mb-2">
          {CATEGORY_LABELS[data.category] ?? data.category}
        </p>
        {data.scheduledDate && (
          <p className="text-sm text-muted-foreground">
            {formatDate(data.scheduledDate)}
            {data.timeSlot ? ` · ${formatSlot(data.timeSlot)}` : ''}
          </p>
        )}
        <div className="pt-3 mt-2 border-t border-border/40 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Estimated cost</span>
          <span className="font-bold text-foreground">{getPriceEstimate(data)}</span>
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
              'rounded-xl h-11',
              touched.name && errors.name ? 'border-destructive focus-visible:ring-destructive' : '',
            )}
          />
          <AnimatePresence>
            {touched.name && errors.name && (
              <motion.p {...errorAnim} className="text-destructive text-xs mt-1">Required</motion.p>
            )}
          </AnimatePresence>
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
              'rounded-xl h-11',
              touched.phone && errors.phone ? 'border-destructive focus-visible:ring-destructive' : '',
            )}
          />
          <AnimatePresence>
            {touched.phone && errors.phone && (
              <motion.p {...errorAnim} className="text-destructive text-xs mt-1">Required</motion.p>
            )}
          </AnimatePresence>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">City</Label>
          <Select
            value={data.customerCity ?? ''}
            onValueChange={(v) => onChange({ customerCity: v })}
            onOpenChange={(open) => { if (!open) setTouched((t) => ({ ...t, city: true })); }}
          >
            <SelectTrigger
              className={cn(
                'rounded-xl h-11',
                touched.city && errors.city ? 'border-destructive focus:ring-destructive' : '',
              )}
            >
              <SelectValue placeholder="Select your city" />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CITIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AnimatePresence>
            {touched.city && errors.city && (
              <motion.p {...errorAnim} className="text-destructive text-xs mt-1">Required</motion.p>
            )}
          </AnimatePresence>
        </div>

        <div>
          <Label htmlFor="cust-addr" className="text-xs text-muted-foreground mb-1.5 block">
            Address
          </Label>
          <Input
            id="cust-addr"
            placeholder="Your full address"
            value={data.customerAddress ?? ''}
            onChange={(e) => onChange({ customerAddress: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, address: true }))}
            className={cn(
              'rounded-xl h-11',
              touched.address && errors.address ? 'border-destructive focus-visible:ring-destructive' : '',
            )}
          />
          <AnimatePresence>
            {touched.address && errors.address && (
              <motion.p {...errorAnim} className="text-destructive text-xs mt-1">Required</motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Payment trust note */}
      <div className="flex items-center gap-2 bg-sage-light border border-sage/20 rounded-xl px-4 py-3 mb-6">
        <Lock size={14} className="text-sage flex-shrink-0" />
        <p className="text-xs text-foreground/70 leading-relaxed">
          Payment is taken <strong>securely at checkout</strong>. Price is agreed upfront.
          Cancel before a helper accepts for a full refund.
        </p>
      </div>

      <Button
        onClick={() => void handleBook()}
        disabled={loading}
        className="w-full rounded-full h-14 text-base font-semibold shadow-primary-glow hover:-translate-y-px hover:shadow-[0_8px_24px_hsl(var(--primary)/0.35)] transition-[transform,box-shadow] duration-150"
        size="lg"
      >
        {loading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Opening secure checkout…
          </>
        ) : (
          <>
            Pay and book
            <ChevronRight size={18} className="ml-1" />
          </>
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground mt-3">
        Powered by Stripe · 256-bit encryption
      </p>
    </div>
  );
};
