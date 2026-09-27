import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Aufklappbarer Zusatz unter einem Inhalt — nativ (`<details>`), also ohne
 * Zustand, Skript und zusaetzliches Rendern; Tastatur und Screenreader kennen
 * das Element.
 *
 * 44px Tippflaeche: Als blosse Textzeile war der Schalter 20px hoch. Der
 * negative Rand haelt die Kachel dabei so hoch wie zuvor
 * (UX_AND_DESIGN_SYSTEM.md §1). Das eigene Zeichen ersetzt das des Browsers,
 * das eine Flex-Zusammenfassung nicht mehr zeigt.
 */
export function Disclosure({
  summary,
  contentClassName,
  children,
}: {
  summary: React.ReactNode;
  /** Abstand und Satz des aufgeklappten Inhalts. */
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group text-sm">
      <summary className="-my-3 flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
          aria-hidden
        />
        {summary}
      </summary>
      <div className={cn("mt-3", contentClassName)}>{children}</div>
    </details>
  );
}
