import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "./paymentDisplay";

export interface PaymentSummaryData {
  company: string;
  depot: string;
  payDate: string;
  amount: React.ReactNode;
  source: string;
}

/** Kompakte Zusammenfassung eines Eingangs für Bestätigungsdialoge (§11/§13.1). */
function PaymentSummary({ data }: { data: PaymentSummaryData }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-muted/50 p-3 text-sm">
      <dt className="text-muted-foreground">Unternehmen</dt>
      <dd className="text-right font-medium">{data.company}</dd>
      <dt className="text-muted-foreground">Zahlungsdatum</dt>
      <dd className="text-right">{formatDate(data.payDate)}</dd>
      <dt className="text-muted-foreground">Depot</dt>
      <dd className="text-right">{data.depot}</dd>
      <dt className="text-muted-foreground">Betrag</dt>
      <dd className="text-right">{data.amount}</dd>
      <dt className="text-muted-foreground">Datenquelle</dt>
      <dd className="text-right">{data.source}</dd>
    </dl>
  );
}

interface StornoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: PaymentSummaryData | null;
  reason: string;
  onReasonChange: (value: string) => void;
  error: string | null;
  isPending: boolean;
  onConfirm: () => void;
}

/**
 * Stornodialog (§11): benennt Unternehmen, Zahlungsdatum, Betrag und die Wirkung
 * auf Dashboard/Statistik und weist ausdrücklich darauf hin, dass der Eingang
 * erhalten bleibt und reaktiviert werden kann — bewusst **nicht** als Löschung.
 */
export function StornoDialog({
  open,
  onOpenChange,
  summary,
  reason,
  onReasonChange,
  error,
  isPending,
  onConfirm,
}: StornoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dividendeneingang stornieren?</DialogTitle>
        </DialogHeader>
        {summary && <PaymentSummary data={summary} />}
        <p className="text-sm text-muted-foreground">
          Der Dividendeneingang bleibt erhalten, wird aber aus den Standardauswertungen
          (Dashboard und Statistik) ausgeschlossen und kann später wieder reaktiviert
          werden.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="storno-reason">Stornogrund (optional)</Label>
          <Input
            id="storno-reason"
            value={reason}
            onChange={(event) => {
              onReasonChange(event.target.value);
            }}
          />
        </div>
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
            {isPending ? "Wird storniert …" : "Stornieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: PaymentSummaryData | null;
  error: string | null;
  isPending: boolean;
  onConfirm: () => void;
}

/**
 * Dialog für die dauerhafte Löschung (§13.1): eigene, eindeutige Überschrift,
 * vollständige Identifikationsdaten (Unternehmen, Datum, Depot, Betrag,
 * Datenquelle) und klarer Hinweis auf die dauerhafte Wirkung. Die bestätigende
 * Schaltfläche heißt „Dauerhaft löschen" — kein generisches „OK".
 */
export function DeleteDialog({
  open,
  onOpenChange,
  summary,
  error,
  isPending,
  onConfirm,
}: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dividendeneingang dauerhaft löschen?</DialogTitle>
        </DialogHeader>
        {summary && <PaymentSummary data={summary} />}
        <p className="text-sm text-muted-foreground">
          Dieser Dividendeneingang wird endgültig entfernt und kann innerhalb der
          Anwendung nicht wiederhergestellt werden. Dashboard und Statistik werden
          anschließend neu berechnet.
        </p>
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
            {isPending ? "Wird gelöscht …" : "Dauerhaft löschen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
