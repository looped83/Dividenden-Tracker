import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, RotateCcw, Trash2, Users, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useDepots } from "@/features/depots/hooks";
import { useSecurities } from "@/features/securities/hooks";
import {
  archivePayment,
  deletePayment,
  unarchivePayment,
  updatePayment,
} from "@/lib/supabase/repositories/payments";
import type { DividendPayment } from "@/lib/supabase/repositories/payments";
import { DUPLICATE_DISMISSALS_KEY, PAYMENTS_KEY } from "@/features/payments/hooks";
import { runBulk, type BulkResult } from "@/features/payments/bulk";

interface Row {
  id: string;
  payment: DividendPayment;
}

type BulkKind = "assign-depot" | "assign-company" | "storno" | "reactivate" | "delete";

interface BulkBarProps {
  selectedRows: Row[];
  totalFiltered: number;
  onSelectAllFiltered: () => void;
  onClear: () => void;
}

/**
 * Massenaktionsleiste (§14): sichtbarer Auswahlmodus mit Anzahl, klarer
 * Unterscheidung zwischen „Seite/alle geladenen" und „alle gefilterten"
 * Datensätzen, Bestätigungsdialog je Aktion und ehrlicher Ergebniszusammenfassung
 * (Teilfehler werden ausgewiesen, nicht verschwiegen). Keine automatische
 * Zusammenführung, keine Vereinheitlichung von Beträgen/Daten.
 */
export function BulkBar({
  selectedRows,
  totalFiltered,
  onSelectAllFiltered,
  onClear,
}: BulkBarProps) {
  const queryClient = useQueryClient();
  const { data: depots = [] } = useDepots();
  const { data: securities = [] } = useSecurities();
  const activeDepots = depots.filter((d) => !d.archived_at);
  const activeSecurities = securities.filter((s) => !s.archived_at);

  const [kind, setKind] = React.useState<BulkKind | null>(null);
  const [targetDepot, setTargetDepot] = React.useState("");
  const [targetCompany, setTargetCompany] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);
  const [result, setResult] = React.useState<BulkResult | null>(null);

  const ids = selectedRows.map((r) => r.id);
  const activeIds = selectedRows.filter((r) => !r.payment.archived_at).map((r) => r.id);
  const cancelledIds = selectedRows.filter((r) => r.payment.archived_at).map((r) => r.id);

  const close = () => {
    if (isRunning) return;
    setKind(null);
    setTargetDepot("");
    setTargetCompany("");
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY });
    void queryClient.invalidateQueries({ queryKey: DUPLICATE_DISMISSALS_KEY });
  };

  const run = async (targetIds: string[], action: (id: string) => Promise<unknown>) => {
    setIsRunning(true);
    try {
      const res = await runBulk(targetIds, action);
      invalidate();
      setResult(res);
      setKind(null);
      if (res.failed.length === 0) onClear();
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <span className="text-sm font-medium" aria-live="polite">
        {selectedRows.length} ausgewählt
      </span>
      {selectedRows.length < totalFiltered && (
        <Button type="button" variant="ghost" size="sm" onClick={onSelectAllFiltered}>
          Alle {totalFiltered} gefilterten auswählen
        </Button>
      )}
      <div className="ml-auto flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setKind("assign-depot");
          }}
        >
          <Wallet /> Depot zuweisen
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setKind("assign-company");
          }}
        >
          <Users /> Unternehmen zuweisen
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setKind("storno");
          }}
        >
          <Ban /> Stornieren
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setKind("reactivate");
          }}
        >
          <RotateCcw /> Reaktivieren
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setKind("delete");
          }}
        >
          <Trash2 /> Dauerhaft löschen
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Auswahl aufheben"
          onClick={onClear}
        >
          <X />
        </Button>
      </div>

      {/* Depot zuweisen */}
      <Dialog
        open={kind === "assign-depot"}
        onOpenChange={(o) => {
          if (!o) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Depot zuweisen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Das gewählte Depot wird {activeIds.length} aktiven Eingängen zugewiesen.
            {cancelledIds.length > 0 &&
              ` ${String(cancelledIds.length)} stornierte Eingänge werden übersprungen.`}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-depot">Depot</Label>
            <Select
              id="bulk-depot"
              value={targetDepot}
              onChange={(e) => {
                setTargetDepot(e.target.value);
              }}
            >
              <option value="">Bitte wählen</option>
              {activeDepots.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.base_currency})
                </option>
              ))}
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Abbrechen
            </Button>
            <Button
              disabled={!targetDepot || isRunning || activeIds.length === 0}
              onClick={() =>
                void run(activeIds, (id) => updatePayment(id, { depot_id: targetDepot }))
              }
            >
              {isRunning ? "Wird zugewiesen …" : "Zuweisen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unternehmen zuweisen */}
      <Dialog
        open={kind === "assign-company"}
        onOpenChange={(o) => {
          if (!o) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unternehmen zuweisen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Das gewählte Unternehmen wird {activeIds.length} aktiven Eingängen zugewiesen.
            {cancelledIds.length > 0 &&
              ` ${String(cancelledIds.length)} stornierte Eingänge werden übersprungen.`}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-company">Unternehmen</Label>
            <Select
              id="bulk-company"
              value={targetCompany}
              onChange={(e) => {
                setTargetCompany(e.target.value);
              }}
            >
              <option value="">Bitte wählen</option>
              {activeSecurities.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.ticker ? ` (${s.ticker})` : ""}
                </option>
              ))}
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Abbrechen
            </Button>
            <Button
              disabled={!targetCompany || isRunning || activeIds.length === 0}
              onClick={() =>
                void run(activeIds, (id) =>
                  updatePayment(id, { security_id: targetCompany }),
                )
              }
            >
              {isRunning ? "Wird zugewiesen …" : "Zuweisen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stornieren */}
      <Dialog
        open={kind === "storno"}
        onOpenChange={(o) => {
          if (!o) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeIds.length} Eingänge stornieren?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Die Eingänge bleiben erhalten, werden aber aus Dashboard und Statistik
            ausgeschlossen und können später reaktiviert werden.
            {cancelledIds.length > 0 &&
              ` ${String(cancelledIds.length)} bereits stornierte Eingänge werden übersprungen.`}
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              disabled={isRunning || activeIds.length === 0}
              onClick={() => void run(activeIds, (id) => archivePayment(id))}
            >
              {isRunning ? "Wird storniert …" : "Stornieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reaktivieren */}
      <Dialog
        open={kind === "reactivate"}
        onOpenChange={(o) => {
          if (!o) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{cancelledIds.length} Eingänge reaktivieren?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Die Eingänge werden wieder in Dashboard und Statistik einbezogen.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Abbrechen
            </Button>
            <Button
              disabled={isRunning || cancelledIds.length === 0}
              onClick={() => void run(cancelledIds, (id) => unarchivePayment(id))}
            >
              {isRunning ? "Wird reaktiviert …" : "Reaktivieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dauerhaft löschen */}
      <Dialog
        open={kind === "delete"}
        onOpenChange={(o) => {
          if (!o) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ids.length} Dividendeneingänge dauerhaft löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Die {ids.length} ausgewählten Dividendeneingänge werden endgültig entfernt und
            können innerhalb der Anwendung nicht wiederhergestellt werden. Dashboard und
            Statistik werden anschließend neu berechnet. Nur die ausdrücklich ausgewählten
            Datensätze werden gelöscht.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              disabled={isRunning}
              onClick={() => void run(ids, (id) => deletePayment(id))}
            >
              {isRunning ? "Wird gelöscht …" : "Dauerhaft löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ergebniszusammenfassung */}
      <Dialog
        open={result !== null}
        onOpenChange={(o) => {
          if (!o) setResult(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ergebnis der Massenaktion</DialogTitle>
          </DialogHeader>
          {result && (
            <div className="space-y-2 text-sm">
              <p>{result.succeeded} Datensätze erfolgreich verarbeitet.</p>
              {result.failed.length > 0 ? (
                <p className="text-negative">
                  {result.failed.length} Datensätze konnten nicht verarbeitet werden.
                </p>
              ) : (
                <p className="text-muted-foreground">Keine Fehler.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                setResult(null);
              }}
            >
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
