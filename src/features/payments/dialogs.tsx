import * as React from "react";
import { ConfirmDialog, ConfirmSummary } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCalendarDate } from "@/lib/utils/formatDate";

export interface PaymentSummaryData {
  company: string;
  depot: string;
  payDate: string;
  amount: React.ReactNode;
  source: string;
}

/** Kompakte Zusammenfassung einer Dividende für Bestätigungsdialoge (§11/§13.1). */
function PaymentSummary({ data }: { data: PaymentSummaryData }) {
  return (
    <ConfirmSummary
      items={[
        { label: "Asset", value: data.company },
        { label: "Zahlungsdatum", value: formatCalendarDate(data.payDate) },
        { label: "Depot", value: data.depot },
        { label: "Betrag", value: data.amount },
        { label: "Datenquelle", value: data.source },
      ]}
    />
  );
}

interface StornoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: PaymentSummaryData | null;
  error: string | null;
  isPending: boolean;
  /** Mit dem Stornogrund; leer, wenn keiner angegeben ist. */
  onConfirm: (reason: string) => void;
}

/**
 * Stornodialog (§11): benennt Unternehmen, Zahlungsdatum, Betrag und die Wirkung
 * auf Übersicht und Statistik und weist ausdrücklich darauf hin, dass die
 * Dividende erhalten bleibt und reaktiviert werden kann — bewusst **nicht** als
 * Löschung.
 *
 * Der Grund lebt im Dialog, nicht in der Seite: Sonst zeichnete jeder
 * Tastendruck die ganze Liste darunter neu.
 */
export function StornoDialog({
  open,
  onOpenChange,
  summary,
  error,
  isPending,
  onConfirm,
}: StornoDialogProps) {
  const [reason, setReason] = React.useState("");
  // Jedes Öffnen beginnt leer (Zustand beim Rendern zurücksetzen statt per Effekt).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason("");
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Dividende stornieren?"
      summary={summary && <PaymentSummary data={summary} />}
      description="Die Dividende bleibt erhalten, zählt aber nicht mehr in Übersicht und Statistik und lässt sich später reaktivieren."
      error={error}
      isPending={isPending}
      confirmLabel="Stornieren"
      pendingLabel="Wird storniert …"
      onConfirm={() => {
        onConfirm(reason.trim());
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="storno-reason">Stornogrund (optional)</Label>
        <Input
          id="storno-reason"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </div>
    </ConfirmDialog>
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
 * Datenquelle) und klarer Hinweis auf die dauerhafte Wirkung.
 */
export function DeleteDialog({ summary, ...props }: DeleteDialogProps) {
  return (
    <ConfirmDialog
      {...props}
      title="Dividende dauerhaft löschen?"
      summary={summary && <PaymentSummary data={summary} />}
      description="Die Dividende wird endgültig entfernt und lässt sich in der App nicht wiederherstellen. Übersicht und Statistik rechnen danach neu."
      confirmLabel="Dauerhaft löschen"
      pendingLabel="Wird gelöscht …"
    />
  );
}
