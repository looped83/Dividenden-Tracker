/** Schmaler Fortschrittsbalken des Fortschritt-Bereichs (0–100). */
export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  const width = Math.min(100, Math.max(0, percent));
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
      className="flex h-1 w-full overflow-hidden rounded-full bg-border"
    >
      <span
        className="h-full rounded-full bg-primary"
        style={{ width: `${String(width)}%` }}
      />
    </span>
  );
}
