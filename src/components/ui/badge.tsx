import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit",
  {
    variants: {
      variant: {
        neutral: "border-transparent bg-muted text-muted-foreground",
        // Hervorgehoben, aber nicht blau: Ein Etikett beschreibt einen Zustand,
        // es ist keine Aktion (UX_AND_DESIGN_SYSTEM.md §1, seit 1.9.0).
        primary: "border-transparent bg-accent text-foreground",
        positive: "border-transparent bg-positive/10 text-positive",
        negative: "border-transparent bg-negative/10 text-negative",
        warning: "border-transparent bg-warning/10 text-warning-strong",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
