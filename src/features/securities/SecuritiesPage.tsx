import * as React from "react";
import { Link } from "react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
  Archive as ArchiveIcon,
} from "lucide-react";
import { emptyToNull } from "@/lib/utils/emptyToNull";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useErrorState } from "@/lib/hooks/useErrorState";
import { cn } from "@/lib/utils/cn";
import { monthNameDeShort, normalizePayoutMonths } from "@/lib/statistics";
import { SecurityImportButton } from "@/features/securities/SecurityImportDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EntitySelect, type EntityOption } from "@/components/domain/EntitySelect";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCountNumber } from "@/lib/utils/formatNumber";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
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
import {
  DEFAULT_SECURITY_SORT,
  SECURITY_SORT_FIELDS,
  sortSecurities,
  type SecuritySort,
  type SecuritySortField,
} from "@/features/securities/sortSecurities";
import type { Security } from "@/lib/supabase/repositories/securities";

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
          {/* Kennungen in einer Zeile, darunter die Einordnung. */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-3">
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
            <div className="space-y-1.5">
              <Label htmlFor="security-wkn">WKN</Label>
              <Input id="security-wkn" {...register("wkn")} />
              {errors.wkn && (
                <p className="text-sm text-negative">{errors.wkn.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="security-sector">Branche</Label>
              <Input id="security-sector" {...register("sector")} />
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
          {/* Halbe Breite: ein Depotname braucht nicht die ganze Zeile. */}
          <div className="space-y-1.5 sm:w-1/2 sm:pr-2">
            <Label htmlFor="security-default-depot">Depot</Label>
            <Select id="security-default-depot" {...register("defaultDepotId")}>
              <option value="">Kein Depot</option>
              {activeDepots.map((depot) => (
                <option key={depot.id} value={depot.id}>
                  {depot.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ausschüttungsmonate (optional)</Label>
            <div
              className="grid grid-cols-3 gap-1.5 sm:grid-cols-6"
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
  const depotById = React.useMemo(
    () => new Map(depots.map((depot) => [depot.id, depot])),
    [depots],
  );
  const archiveSecurity = useArchiveSecurity();
  const deleteSecurity = useDeleteSecurity();
  const { error: deleteError, showError, clearError } = useErrorState();
  const [showArchived, setShowArchived] = React.useState(false);
  const [sectorFilter, setSectorFilter] = React.useState("");
  const [currencyFilter, setCurrencyFilter] = React.useState("");
  const [depotFilter, setDepotFilter] = React.useState("");
  const [sort, setSort] = React.useState<SecuritySort>(DEFAULT_SECURITY_SORT);
  const [dialog, setDialog] = React.useState<{
    open: boolean;
    security: Security | null;
  }>({
    open: false,
    security: null,
  });
  const [deleteTarget, setDeleteTarget] = React.useState<Security | null>(null);

  // Auswahlwerte aus dem Bestand ableiten: nur was vorkommt, ist waehlbar.
  // Basis sind stets alle Unternehmen, damit die Auswahl nicht springt, wenn
  // "Archivierte anzeigen" umgeschaltet wird.
  const depotOptions = React.useMemo<EntityOption[]>(
    () => depots.map((d) => ({ id: d.id, name: d.name, archived: !!d.archived_at })),
    [depots],
  );

  const options = React.useMemo(() => {
    const uniqueSorted = (values: (string | null)[]) =>
      [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) =>
        a.localeCompare(b, "de"),
      );
    return {
      sectors: uniqueSorted(securities.map((s) => s.sector)),
      currencies: uniqueSorted(securities.map((s) => s.currency)),
    };
  }, [securities]);

  const visible = React.useMemo(() => {
    const filtered = securities.filter((s) => {
      if (!showArchived && s.archived_at) return false;
      if (sectorFilter && s.sector !== sectorFilter) return false;
      if (currencyFilter && s.currency !== currencyFilter) return false;
      if (depotFilter && s.default_depot_id !== depotFilter) return false;
      return true;
    });
    // Sortiert wird nach dem **Namen** des Standard-Depots, nicht nach seiner
    // Kennung — die sagt niemandem etwas.
    return sortSecurities(filtered, sort, (security) =>
      security.default_depot_id
        ? (depotById.get(security.default_depot_id)?.name ?? null)
        : null,
    );
  }, [
    securities,
    showArchived,
    sectorFilter,
    currencyFilter,
    depotFilter,
    sort,
    depotById,
  ]);

  const activeFilterCount = [sectorFilter, currencyFilter, depotFilter].filter(
    (value) => value !== "",
  ).length;
  const hasActiveFilters = activeFilterCount > 0;

  const resetFilters = () => {
    setSectorFilter("");
    setCurrencyFilter("");
    setDepotFilter("");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    clearError();
    try {
      await deleteSecurity.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      showError(error, "Löschen fehlgeschlagen.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unternehmen"
        actions={
          <Button
            onClick={() => {
              setDialog({ open: true, security: null });
            }}
          >
            <Plus /> Neues Unternehmen
          </Button>
        }
      />

      {/* Filterleiste in derselben Optik wie Dividenden und Statistik. Die
          Auswahlwerte stammen aus dem Bestand — leere Listen entfallen. */}
      <FilterBar activeCount={activeFilterCount}>
        <FilterField id="sec-sector" label="Branche">
          <Select
            id="sec-sector"
            value={sectorFilter}
            onChange={(event) => {
              setSectorFilter(event.target.value);
            }}
          >
            <option value="">Alle Branchen</option>
            {options.sectors.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </Select>
        </FilterField>

        <FilterField id="sec-currency" label="Währung">
          <Select
            id="sec-currency"
            value={currencyFilter}
            onChange={(event) => {
              setCurrencyFilter(event.target.value);
            }}
          >
            <option value="">Alle Währungen</option>
            {options.currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </FilterField>

        <FilterField id="sec-depot" label="Depot">
          <EntitySelect
            id="sec-depot"
            options={depotOptions}
            value={depotFilter}
            onChange={setDepotFilter}
            allLabel="Alle Depots"
          />
        </FilterField>

        {/* Sortierung wie in der Dividendenliste: rechts in der Leiste, mit
            dem Richtungsschalter daneben. Etwas breiter als die uebrigen
            Felder, weil es beides traegt. */}
        <FilterField id="sec-sort" label="Sortierung" className="sm:basis-52">
          <div className="flex gap-2">
            <Select
              id="sec-sort"
              value={sort.field}
              onChange={(event) => {
                setSort((current) => ({
                  ...current,
                  field: event.target.value as SecuritySortField,
                }));
              }}
            >
              {SECURITY_SORT_FIELDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label={
                sort.direction === "asc"
                  ? "Aufsteigend sortiert — zu absteigend wechseln"
                  : "Absteigend sortiert — zu aufsteigend wechseln"
              }
              onClick={() => {
                setSort((current) => ({
                  ...current,
                  direction: current.direction === "asc" ? "desc" : "asc",
                }));
              }}
            >
              {sort.direction === "asc" ? <ArrowUp /> : <ArrowDown />}
            </Button>
          </div>
        </FilterField>

        {/* Zuruecksetzen steht wie im Statistikbereich **in** der Leiste. */}
        {hasActiveFilters && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11"
            onClick={resetFilters}
          >
            <X /> Filter zurücksetzen
          </Button>
        )}
      </FilterBar>

      {hasActiveFilters && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {formatCountNumber(visible.length)} Unternehmen gefunden.
        </p>
      )}

      {isLoading ? (
        <SkeletonRows rows={6} label="Unternehmen" />
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
              <TableHead>Depot</TableHead>
              <TableHead>Ausschüttung</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((security) => (
              <TableRow key={security.id}>
                <TableCell className="font-medium">
                  {/* Der Name fuehrt zur Detailseite — sie beantwortet die
                        Frage nach der Entwicklung dieser Position, die diese
                        Verwaltungsliste bewusst nicht stellt. */}
                  <Link
                    to={`/unternehmen/${security.id}`}
                    className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {security.name}
                  </Link>
                </TableCell>
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
                          clearError();
                          setDeleteTarget(security);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Seltener gebrauchte Nebenaktionen am Seitenende: die Liste selbst
          soll den oberen Bereich bestimmen. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
        <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={showArchived}
            onChange={(event) => {
              setShowArchived(event.target.checked);
            }}
          />
          Archivierte anzeigen
        </label>
        <SecurityImportButton />
      </div>

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
          if (!open) {
            setDeleteTarget(null);
            clearError();
          }
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
