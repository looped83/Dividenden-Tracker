import type { ReactNode } from "react";

/**
 * Eine Zeile „Beschriftung — Wert" einer Detailseite, mit Trennlinie darunter.
 * Gemeinsam fuer Dividende (Storno) und Asset (Position, Stammdaten),
 * damit beide Seiten dieselbe Zeilenhoehe und Schrift tragen.
 */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-3 text-[0.9375rem] last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
