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
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          // **Eine** Breitenklasse, kein `max-w-sm sm:max-w-lg`: Ein `max-w-*`
          // aus `className` haette die Basisklasse zwar ersetzt, nicht aber die
          // `sm:`-Variante — die gewinnt ab 640px und deckelte jeden breiteren
          // Dialog stillschweigend wieder auf 512px. Genau das traf die
          // Importdialoge, die ausdruecklich `max-w-2xl`/`max-w-3xl` setzen.
          // Mit einer Gruppe greift eine Ueberschreibung auf allen Breiten.
          // Schmale Geraete begrenzt weiterhin `w-[calc(100%-1rem)]`.
          //
          // **Auf dem Telefon ein Panel von unten** (Sheet), darueber mittig.
          // Mittig stand ein Formular bis an den unteren Rand, „Speichern" lag
          // unter dem Falz, und der Daumen musste bis zur Bildschirmmitte
          // greifen. Unten verankert liegen die Aktionen dort, wo der Daumen
          // ist; die Fusszeile bleibt beim Scrollen stehen (`DialogFooter`).
          // `max-w-lg` gilt ohne Praefix: Auf dem Telefon ist das Panel ohnehin
          // schmaler, und eine Ueberschreibung wirkt so weiter auf allen Breiten.
          "fixed left-1/2 z-50 grid w-full max-w-lg -translate-x-1/2",
          "bottom-0 max-h-[92dvh] rounded-t-xl",
          "sm:bottom-auto sm:top-1/2 sm:w-[calc(100%-1rem)] sm:max-h-[90vh] sm:-translate-y-1/2 sm:rounded-lg",
          "gap-4 overflow-y-auto border border-border bg-card p-4 shadow-lg sm:p-6",
          "pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 motion-reduce:animate-none",
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
 * Panels stehen, waehrend der Inhalt darueber scrollt — die Hauptaktion steht
 * in voller Breite zuoberst in der Reihe (`flex-col-reverse`), der Daumen
 * erreicht sie ohne Umgreifen.
 */
export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        // Der negative Aussenabstand nimmt den unteren Innenabstand des Panels
        // auf: Die Fusszeile schliesst buendig ab und traegt den Abstand zum
        // Home-Indicator selbst — sonst stuende er doppelt darunter.
        "sticky bottom-0 -mx-4 border-t border-border bg-card px-4 pt-3",
        "-mb-[max(1rem,env(safe-area-inset-bottom))] pb-[max(1rem,env(safe-area-inset-bottom))]",
        "sm:static sm:m-0 sm:border-0 sm:p-0",
        className,
      )}
      {...props}
    />
  );
}
