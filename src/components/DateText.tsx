import * as React from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Datum mit vorangestelltem Kalendersymbol — ueberall dort, wo ein Datum ohne
 * eigene Beschriftung fuer sich steht (Kartenliste, Detailkopf, Dublettenver-
 * gleich). In Tabellen mit Spaltenkopf und in beschrifteten Feldern bleibt es
 * aus: Dort sagt die Beschriftung bereits, was die Zahl bedeutet.
 *
 * Das Symbol waechst mit der Schriftgroesse (`1em`) und sitzt einen Pixel
 * hoeher: Mittig ausgerichtet stuende es optisch zu tief, weil die Mitte der
 * Ziffern ueber der Mitte der Zeile liegt (der Raum fuer Unterlaengen zaehlt
 * mit). Rein dekorativ, deshalb `aria-hidden` — das Datum steht als Text
 * daneben.
 *
 * Formatiert wird bewusst nicht hier: Zahlungsdaten und Zeitstempel haben
 * eigene Formatierer (`formatDate`, `formatIsoDate`, `formatDateTime`).
 */
export function DateText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <Calendar className="size-[1em] shrink-0 -translate-y-px" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}
