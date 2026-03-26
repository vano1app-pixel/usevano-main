import { useState } from 'react';
import { cn } from '@/lib/utils';
import { RequestFeatureModal } from '@/components/RequestFeatureModal';

type RequestFeatureLinkProps = {
  className?: string;
};

export function RequestFeatureLink({ className }: RequestFeatureLinkProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline',
          className,
        )}
      >
        Request a feature
      </button>
      <RequestFeatureModal open={open} onOpenChange={setOpen} />
    </>
  );
}
