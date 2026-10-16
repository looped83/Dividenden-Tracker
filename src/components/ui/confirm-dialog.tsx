import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Bestätigung einer folgenreichen Aktion (Löschen, Stornieren) — **ein** Aufbau
 * für alle Bereiche: Titel als Frage, was betroffen ist, was passiert, Fehler,
 * dann „Abbrechen" und die benannte Aktion (nie ein generisches „OK").
 * Vorher gab es drei Kopien, die auseinanderliefen (einer fehlte „Abbrechen").
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  summary,
  description,
  children,
  error,
  isPending,
  confirmLabel,
  pendingLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Was betroffen ist, meist eine {@link ConfirmSummary}. */
  summary?: ReactNode;
  /** Was passiert — ein Satz zur Wirkung. */
  description: ReactNode;
  /** Zusätzliche Eingaben, etwa ein Grund. */
  children?: ReactNode;
  error: string | null;
  isPending: boolean;
  confirmLabel: string;
  pendingLabel: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {summary}
        <p className="text-sm text-muted-foreground">{description}</p>
        {children}
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Abbrechen
          </Button>
          <Button variant="destructive" disabled={isPending} onClick={onConfirm}>
            {isPending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Beschriftung links, Wert rechts — die betroffenen Daten auf gedämpfter Fläche. */
export function ConfirmSummary({
  items,
}: {
  items: readonly { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-muted p-3 text-sm">
      {items.map((item, index) => (
        <div key={item.label} className="contents">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className={index === 0 ? "text-right font-medium" : "text-right"}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
