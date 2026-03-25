import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary/90 text-primary-foreground backdrop-blur-md border border-primary/20 shadow-[0_4px_16px_hsl(var(--glass-shadow))] hover:bg-primary hover:shadow-[0_6px_24px_hsl(var(--glass-shadow))]",
        destructive: "bg-destructive/85 text-destructive-foreground backdrop-blur-md border border-destructive/20 shadow-[0_4px_16px_rgba(239,68,68,0.15)] hover:bg-destructive/95",
        outline: "bg-[hsl(var(--glass-bg))] backdrop-blur-lg border border-[hsl(var(--glass-border))] hover:bg-accent/60 hover:text-accent-foreground shadow-sm",
        secondary: "bg-secondary/50 text-secondary-foreground backdrop-blur-md border border-secondary/30 hover:bg-secondary/70 shadow-sm",
        ghost: "hover:bg-accent/40 hover:text-accent-foreground backdrop-blur-sm",
        link: "text-primary underline-offset-4 hover:underline",
        glass: "bg-[hsl(var(--glass-bg))] backdrop-blur-xl border border-[hsl(var(--glass-border))] text-foreground shadow-[0_4px_16px_hsl(var(--glass-shadow))] hover:shadow-[0_8px_32px_hsl(var(--glass-shadow))] hover:bg-[hsl(var(--glass-bg))]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-xl px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
