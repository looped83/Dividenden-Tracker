import { cn } from "@/lib/utils/cn";

/**
 * Haken eines erreichten Ziels. Mit `draw` zeichnet er sich einmal
 * (`.draw-check` in index.css), sonst steht er still.
 */
export function GoalCheck({ draw, className }: { draw: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn(
        "inline-block size-3.5 text-positive",
        draw && "draw-check",
        className,
      )}
    >
      <path d="M20 6 9 17l-5-5" pathLength={1} />
    </svg>
  );
}
