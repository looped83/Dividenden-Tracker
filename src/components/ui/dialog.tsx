/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-150" />
      <DialogPrimitive.Content
        className={cn(
          // **Eine** Breitenklasse, kein `max-w-sm sm:max-w-lg`: Ein `max-w-*`
          // aus `className` haette die Basisklasse zwar ersetzt, nicht aber die
          // `sm:`-Variante — die gewinnt ab 640px und deckelte jeden breiteren
          // Dialog stillschweigend wieder auf 512px. Genau das traf die
          // Importdialoge, die ausdruecklich `max-w-2xl`/`max-w-3xl` setzen.
          // Mit einer Gruppe greift eine Ueberschreibung auf allen Breiten.
          // Schmale Geraete begrenzt `w-[calc(100%-2rem)]` (16px Rand je Seite).
          //
          // **Mittig auf allen Breiten** (seit 1.14.0). Als Panel von unten
          // (Sheet) rueckte es mit jeder Bildschirmtastatur hoch — beim
          // Oeffnen eines Formulars sprang es sichtbar. Mittig liegen die
          // oberen Felder ueber der Tastatur, und nichts verschiebt sich.
          //
          // **Eine Spalte, die nie breiter wird als das Panel.** Die implizite
          // Spalte eines Grids waechst sonst bis zur Mindestbreite ihres
          // Inhalts: Eine Vorschautabelle mit vier Spalten zog das ganze Panel
          // auf dem Telefon auf ~530px, Text lief rechts aus dem Bild, und man
          // musste seitlich scrollen. Mit `minmax(0,1fr)` bleibt die Breite
          // beim Panel; Tabellen scrollen in ihrem eigenen Rahmen.
          "fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 grid-cols-[minmax(0,1fr)]",
          "max-h-[90dvh] gap-4 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-4 shadow-lg outline-none sm:p-6",
          //
          // **Einblenden mit Verschieben, nicht mit Zoom.** Waehrend einer
          // Skalierung rechnet Safari die klebende Fusszeile falsch: Sie stand
          // bis zu ~30px ueber dem Rand des Panels und sprang erst am Ende der
          // Animation zurueck. Eine Verschiebung bewegt Panel und Fusszeile
          // gemeinsam.
          "duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-2 motion-reduce:animate-none",
          className,
        )}
        {...props}
      >
        {children}
        {/* 44px Tippflaeche: Das Symbol allein war 16px gross. Die Kopfzeile
            haelt dafuer rechts Platz frei (`DialogHeader`). */}
        <DialogPrimitive.Close className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:right-3 sm:top-3">
          <X className="size-4" />
          <span className="sr-only">Schließen</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 pr-8", className)} {...props} />;
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-base font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

/**
 * Aktionen eines Dialogs. Auf dem Telefon bleiben sie am unteren Rand des
 * Panels stehen, waehrend ein langer Inhalt darueber scrollt — die
 * Hauptaktion steht in voller Breite zuoberst in der Reihe
 * (`flex-col-reverse`).
 */
export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        // Der negative Aussenabstand nimmt den unteren Innenabstand des Panels
        // auf, damit die Fusszeile buendig abschliesst. Derselbe Betrag als
        // negativer `bottom`: `sticky` rechnet vom Innenabstand des Panels
        // aus, nicht von seiner Kante — mit `bottom-0` liefe der Inhalt unter
        // der Fusszeile durchs Bild.
        "sticky -bottom-4 -mx-4 -mb-4 border-t border-border bg-card px-4 py-3",
        "sm:static sm:m-0 sm:border-0 sm:p-0",
        className,
      )}
      {...props}
    />
  );
}
