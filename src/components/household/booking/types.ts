import type React from 'react';

export interface BookingData {
  category: string;

  // Shopping
  store?: string;
  shoppingList?: string;

  // Dog walk
  dogCount?: number;
  walkDuration?: '30min' | '1hr';
  dogNotes?: string;

  // Garden
  gardenTasks?: string[];
  gardenDuration?: '1hr' | '2hr' | 'half-day';

  // Moving
  helperCount?: number;
  fromAddress?: string;
  toAddress?: string;
  movingDescription?: string;
  movingDuration?: '1hr' | '2hr' | '3hr' | '4hr';

  // Cleaning
  cleaningTasks?: string[];
  cleaningDuration?: '1hr' | '2hr' | '3hr';

  // Other
  description?: string;
  pricingType?: 'flat' | 'hourly';

  // When (shared)
  scheduledDate?: string; // 'today' | 'tomorrow' | ISO date string
  timeSlot?: 'morning' | 'afternoon' | 'evening';
  isExpress?: boolean;

  // Confirm (shared)
  customerName?: string;
  customerAddress?: string;
  customerPhone?: string;
  customerCity?: string;
  customerLat?: number;
  customerLng?: number;
}

export interface StepProps {
  data: BookingData;
  onChange: (updates: Partial<BookingData>) => void;
  onNext: () => void;
  onBack: () => void;
}
