import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Kopfzeile eines Hauptbereichs. Die Mindesthoehe entspricht der Hoehe eines
 * Bedienelements (44px): Damit liegt die Ueberschrift auf jeder Seite auf
 * derselben Grundlinie — unabhaengig davon, ob rechts daneben eine Aktion
 * steht. Ohne sie sprang die Ueberschrift beim Seitenwechsel, weil Seiten mit
 * Aktion eine hoehere Kopfzeile hatten als Seiten ohne.
 *
 * Eine Quelle statt einer kopierten Zeile je Seite (UX_AND_DESIGN_SYSTEM.md #4).
 */
export function PageHeader({
  title,
  actions,
  className,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2", className)}>
      <h1 className="flex min-h-11 items-center text-xl font-semibold tracking-tight">
        {title}
      </h1>
      {actions !== undefined && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
