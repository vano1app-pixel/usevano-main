import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface BookingProgressProps {
  current: number;
  total: number;
  onBack: () => void;
}

/* Thin progress bar + minimal back button. The bar does the progress
   communication; no need for "Step X of Y" text alongside it. */
export const BookingProgress: React.FC<BookingProgressProps> = ({ current, total, onBack }) => {
  const pct = Math.round((current / total) * 100);

  return (
    <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm">
      {/* Progress bar — sage green filling left to right */}
      <div className="h-[2px] bg-border">
        <div
          className="h-full bg-primary transition-[width] duration-400 ease-out-expo"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between px-4 h-12 max-w-lg mx-auto md:max-w-xl">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-8 h-8 -ml-1 rounded-full text-foreground/60 hover:text-foreground hover:bg-secondary transition-colors duration-150"
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <p className="text-xs text-muted-foreground tabular-nums font-medium">
          {current} / {total}
        </p>
      </div>
    </div>
  );
};
