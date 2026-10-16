import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Leerer Zustand (UX_AND_DESIGN_SYSTEM.md #5): keine Illustration, ein Icon,
 * ein Satz, eine primaere Aktion.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center",
        className,
      )}
    >
      {Icon && <Icon className="size-8 text-muted-foreground" aria-hidden />}
      <p className="text-base font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
