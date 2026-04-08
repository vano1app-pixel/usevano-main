import { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { RequestFeatureModal } from '@/components/RequestFeatureModal';

export function RequestFeatureLink() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-left transition-all duration-200 hover:bg-primary/10 hover:border-primary/30"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Lightbulb size={16} className="text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Missing a category?</p>
            <p className="text-[11px] text-muted-foreground">Request it here</p>
          </div>
        </div>
      </button>
      <RequestFeatureModal open={open} onOpenChange={setOpen} />
    </>
  );
}
