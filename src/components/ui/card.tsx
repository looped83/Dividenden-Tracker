import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Karte (UX_AND_DESIGN_SYSTEM.md §1).
 *
 * **Innenabstand:** 16px auf dem iPhone, 24px ab `sm` — dieselbe Stufe wie die
 * Seitenraender der Seite (`px-4 sm:px-6`) und wie die Rasterabstaende
 * (`gap-3 sm:gap-4`). Fest 24px liess auf einem 390px-Bildschirm 48px Rand je
 * Karte: „Verizon Communications Inc" kuerzte in der Liste der letzten
 * Eingaenge auf „Verizon Communications I…", und in den zweispaltigen
 * Kennzahlkacheln ging ein Viertel der Kachelbreite fuer Rand drauf.
 *
 * **Kopf zu Inhalt:** 12px unter `sm`, 20px darueber. Der Abstand stand bisher
 * an 19 Aufrufstellen als `pb-5` und fehlte an sieben anderen — dieselbe Karte
 * sah damit je nach Datei anders aus. Er gehoert hierher, nicht in die Seiten.
 *
 * Wer den Innenabstand ueberschreibt, muss die `sm:`-Stufe mitsetzen
 * (`p-0 sm:p-0`): `tailwind-merge` ersetzt nur Klassen derselben Variante.
 */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 p-4 pb-3 sm:p-6 sm:pb-5", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn("text-base font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-4 pt-0 sm:p-6 sm:pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center p-4 pt-0 sm:p-6 sm:pt-0", className)}
      {...props}
    />
  );
}
