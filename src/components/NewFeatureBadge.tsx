import { cn } from '@/lib/utils';

/** Small highlight for features new since v1 */
export function NewFeatureBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border border-primary/25 bg-primary/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-primary',
        className,
      )}
    >
      New
    </span>
  );
}
