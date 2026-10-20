import type * as React from "react";

/** Satzbausteine der Rueckblick-Karten: Kennzeile, grosse Zahl, Einordnung, Rangliste. */

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold text-primary">{children}</p>;
}

export function Hero({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={
        "mt-3 break-words text-[clamp(2.75rem,13vw,4.5rem)] font-bold leading-[1.02] tracking-[-0.04em] tabular-amount " +
        (className ?? "")
      }
    >
      {children}
    </p>
  );
}

export function Lead({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 text-lg leading-snug text-muted-foreground sm:text-xl">
      {children}
    </p>
  );
}

export function RankedList({
  rows,
  start,
}: {
  rows: readonly { key: string; name: string; value: string; caption?: string }[];
  start: number;
}) {
  return (
    <ol className="mt-6 divide-y divide-border border-y border-border">
      {rows.map((row, position) => (
        <li key={row.key} className="flex items-center gap-3 py-2.5">
          <span className="w-4 shrink-0 text-sm font-semibold text-muted-foreground tabular-amount">
            {start + position}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
          <span className="shrink-0 text-right tabular-amount">
            <span className="block font-semibold">{row.value}</span>
            {row.caption && (
              <span className="block text-sm text-muted-foreground">{row.caption}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
