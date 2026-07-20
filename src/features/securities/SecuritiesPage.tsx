import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Building2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Archive as ArchiveIcon,
} from "lucide-react";
import { emptyToNull } from "@/lib/utils/emptyToNull";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { cn } from "@/lib/utils/cn";
import { monthNameDeShort, normalizePayoutMonths } from "@/lib/statistics";
import { SecurityImportButton } from "@/features/securities/SecurityImportDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useDepots } from "@/features/depots/hooks";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useArchiveSecurity,
  useCreateSecurity,
  useDeleteSecurity,
  useSecurities,
  useUpdateSecurity,
} from "@/features/securities/hooks";
import {
  securityFormSchema,
  type SecurityFormValues,
} from "@/features/securities/schemas";
import { deriveDataQuality } from "@/features/securities/dataQuality";
import type { Security } from "@/lib/supabase/repositories/securities";
import type { DataQuality } from "@/lib/supabase/database.types";

const DATA_QUALITY_LABELS: Record<
  DataQuality,
  { label: string; variant: "positive" | "warning" | "negative" }
> = {
  ok: { label: "OK", variant: "positive" },
  incomplete: { label: "Unvollständig", variant: "warning" },
  needs_review: { label: "Prüfen", variant: "negative" },
};

function SecurityFormDialog({
  security,
  open,
  onOpenChange,
}: {
  security: Security | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createSecurity = useCreateSecurity();
  const updateSecurity = useUpdateSecurity();
  const { data: depots = [] } = useDepots();
  const activeDepots = depots.filter((depot) => !depot.archived_at);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  // Ausschuettungsmonate ausserhalb des Zod-Formulars als einfache Auswahl.
  // Wechselt das bearbeitete Unternehmen, wird die Auswahl waehrend des Renderns
  // zurueckgesetzt (React-Muster fuer aus Props abgeleiteten Zustand).
  const [payoutMonths, setPayoutMonths] = React.useState<number[]>(
    security?.payout_months ?? [],
  );
  const [payoutSource, setPayoutSource] = React.useState(security);
  if (payoutSource !== security) {
    setPayoutSource(security);
    setPayoutMonths(security?.payout_months ?? []);
  }
  const togglePayoutMonth = (month: number) => {
    setPayoutMonths((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month],
    );
  };
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SecurityFormValues>({
    resolver: zodResolver(securityFormSchema),
    values: {
      name: security?.name ?? "",
      ticker: security?.ticker ?? "",
      isin: security?.isin ?? "",
      wkn: security?.wkn ?? "",
      country: security?.country ?? "",
      sector: security?.sector ?? "",
      currency: security?.currency ?? "",
      note: security?.note ?? "",
      defaultDepotId: security?.default_depot_id ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    const input = {
      name: values.name,
      ticker: emptyToNull(values.ticker),
      isin: emptyToNull(values.isin),
      wkn: emptyToNull(values.wkn),
      country: emptyToNull(values.country),
      sector: emptyToNull(values.sector),
      currency: emptyToNull(values.currency),
      note: emptyToNull(values.note),
      default_depot_id: emptyToNull(values.defaultDepotId),
      payout_months: normalizePayoutMonths(payoutMonths),
      // Datenqualitaet spiegelt beim Speichern die Vollstaendigkeit der
      // Stammdaten wider (z. B. ergaenzte ISIN bei einem importierten,
      // archivierten Unternehmen -> „OK"). „needs_review" aus dem Import bleibt
      // nur bestehen, solange die Felder unvollstaendig sind.
      data_quality: deriveDataQuality({
        ticker: emptyToNull(values.ticker),
        isin: emptyToNull(values.isin),
        wkn: emptyToNull(values.wkn),
        country: emptyToNull(values.country),
        sector: emptyToNull(values.sector),
        currency: emptyToNull(values.currency),
      }),
    };
    try {
      if (security) {
        await updateSecurity.mutateAsync({ id: security.id, input });
      } else {
        await createSecurity.mutateAsync(input);
      }
      reset();
      onOpenChange(false);
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Speichern fehlgeschlagen."));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {security ? "Unternehmen bearbeiten" : "Neues Unternehmen"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="security-name">Name</Label>
            <Input id="security-name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-negative">{errors.name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="security-ticker">Ticker</Label>
              <Input id="security-ticker" {...register("ticker")} />
              {errors.ticker && (
                <p className="text-sm text-negative">{errors.ticker.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="security-isin">ISIN</Label>
              <Input id="security-isin" {...register("isin")} />
              {errors.isin && (
                <p className="text-sm text-negative">{errors.isin.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="security-wkn">WKN</Label>
              <Input id="security-wkn" {...register("wkn")} />
              {errors.wkn && (
                <p className="text-sm text-negative">{errors.wkn.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="security-country">Land</Label>
              <Input id="security-country" {...register("country")} />
              {errors.country && (
                <p className="text-sm text-negative">{errors.country.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="security-currency">Währung</Label>
              <Input id="security-currency" {...register("currency")} />
              {errors.currency && (
                <p className="text-sm text-negative">{errors.currency.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="security-sector">Branche</Label>
            <Input id="security-sector" {...register("sector")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="security-default-depot">Standard-Depot</Label>
            <Select id="security-default-depot" {...register("defaultDepotId")}>
              <option value="">Kein Standard-Depot</option>
              {activeDepots.map((depot) => (
                <option key={depot.id} value={depot.id}>
                  {depot.name}
                </option>
              ))}
            </Select>
            <p className="text-sm text-muted-foreground">
              Wird beim Anlegen eines Dividendeneingangs vorausgewählt, kann dort aber
              jederzeit geändert werden.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Ausschüttungsmonate (optional)</Label>
            <div
              className="grid grid-cols-6 gap-1.5"
              role="group"
              aria-label="Ausschüttungsmonate"
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
                const active = payoutMonths.includes(month);
                return (
                  <button
                    key={month}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      togglePayoutMonth(month);
                    }}
                    className={cn(
                      "h-9 rounded-md border text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "border-input bg-background hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {monthNameDeShort(month)}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground">
              Zahlungen werden in Auswertungen dem nächstgelegenen geplanten Monat
              zugeordnet (auch über den Jahreswechsel). Leer = tatsächliches
              Zahlungsdatum.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="security-note">Notiz</Label>
            <Textarea id="security-note" {...register("note")} />
          </div>
          {submitError && (
            <p role="alert" className="text-sm text-negative">
              {submitError}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {security ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SecuritiesPage() {
  const { data: securities = [], isLoading } = useSecurities();
  const { data: depots = [] } = useDepots();
  const depotById = new Map(depots.map((depot) => [depot.id, depot]));
  const archiveSecurity = useArchiveSecurity();
  const deleteSecurity = useDeleteSecurity();
  const [showArchived, setShowArchived] = React.useState(false);
  const [dialog, setDialog] = React.useState<{
    open: boolean;
    security: Security | null;
  }>({
    open: false,
    security: null,
  });
  const [deleteTarget, setDeleteTarget] = React.useState<Security | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const visible = securities.filter((s) => showArchived || !s.archived_at);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deleteSecurity.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(getErrorMessage(error, "Löschen fehlgeschlagen."));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Unternehmen</h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => {
                setShowArchived(event.target.checked);
              }}
              className="size-4"
            />
            Archivierte anzeigen
          </label>
          <SecurityImportButton />
          <Button
            onClick={() => {
              setDialog({ open: true, security: null });
            }}
          >
            <Plus /> Neues Unternehmen
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Wird geladen …</p>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Noch kein Unternehmen angelegt"
          description="Lege dein erstes Wertpapier an, um Dividendeneingänge zu erfassen."
          action={
            <Button
              onClick={() => {
                setDialog({ open: true, security: null });
              }}
            >
              Erstes Unternehmen anlegen
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Ticker</TableHead>
              <TableHead>ISIN</TableHead>
              <TableHead>Land</TableHead>
              <TableHead>Standard-Depot</TableHead>
              <TableHead>Ausschüttung</TableHead>
              <TableHead>Datenqualität</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((security) => {
              const quality = DATA_QUALITY_LABELS[security.data_quality];
              return (
                <TableRow key={security.id}>
                  <TableCell className="font-medium">{security.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {security.ticker ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {security.isin ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {security.country ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {security.default_depot_id
                      ? (depotById.get(security.default_depot_id)?.name ?? "—")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {normalizePayoutMonths(security.payout_months).length === 0
                      ? "—"
                      : normalizePayoutMonths(security.payout_months)
                          .map((month) => monthNameDeShort(month))
                          .join(", ")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={quality.variant}>{quality.label}</Badge>
                  </TableCell>
                  <TableCell>
                    {security.archived_at ? (
                      <Badge variant="neutral">Archiviert</Badge>
                    ) : (
                      <Badge variant="positive">Aktiv</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${security.name} bearbeiten`}
                        onClick={() => {
                          setDialog({ open: true, security });
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={
                          security.archived_at
                            ? `${security.name} reaktivieren`
                            : `${security.name} archivieren`
                        }
                        onClick={() =>
                          void archiveSecurity.mutateAsync({
                            id: security.id,
                            archived: Boolean(security.archived_at),
                          })
                        }
                      >
                        {security.archived_at ? <RotateCcw /> : <ArchiveIcon />}
                      </Button>
                      {security.archived_at && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`${security.name} endgültig löschen`}
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(security);
                          }}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <SecurityFormDialog
        security={dialog.security}
        open={dialog.open}
        onOpenChange={(open) => {
          setDialog((current) => ({ ...current, open }));
        }}
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unternehmen endgültig löschen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteTarget?.name} wird unwiderruflich entfernt und kann nicht
            wiederhergestellt werden. Das ist nur möglich, solange keine
            Dividendeneingänge mehr auf dieses Unternehmen verweisen.
          </p>
          {deleteError && (
            <p role="alert" className="text-sm text-negative">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={deleteSecurity.isPending}
              onClick={() => void handleDelete()}
            >
              {deleteSecurity.isPending ? "Wird gelöscht …" : "Endgültig löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
