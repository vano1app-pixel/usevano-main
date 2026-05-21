import React from 'react';
import { ChevronLeft } from 'lucide-react';

interface BookingProgressProps {
  current: number;
  total: number;
  onBack: () => void;
}

export const BookingProgress: React.FC<BookingProgressProps> = ({ current, total, onBack }) => {
  const pct = Math.round((current / total) * 100);

  return (
    <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border/50">
      {/* Thin sage progress bar */}
      <div className="h-0.5 bg-secondary">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out-expo"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto md:max-w-xl">
        <button
          onClick={onBack}
          className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] -ml-1 px-1"
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Back</span>
        </button>

        <p className="text-xs text-muted-foreground tabular-nums">
          {current} / {total}
        </p>
      </div>
    </div>
  );
};
