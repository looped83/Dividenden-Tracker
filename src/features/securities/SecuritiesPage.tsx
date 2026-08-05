import * as React from "react";
import { Link } from "react-router";
import {
  Briefcase,
  Pencil,
  RotateCcw,
  Trash2,
  Archive as ArchiveIcon,
} from "lucide-react";
import { useErrorState } from "@/lib/hooks/useErrorState";
import { monthNameDeShort, normalizePayoutMonths } from "@/lib/statistics";
import { SecurityImportButton } from "@/features/securities/SecurityImportDialog";
import { PortfolioImportButton } from "@/features/securities/PortfolioImportDialog";
import { PortfolioSummary } from "@/features/securities/PortfolioSummary";
import { SecurityFormDialog } from "@/features/securities/SecurityFormDialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EntitySelect, type EntityOption } from "@/components/domain/EntitySelect";
import {
  FilterBar,
  FilterField,
  FilterReset,
  FilterSort,
} from "@/components/ui/filter-bar";
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
  useDeleteSecurity,
  useSecurities,
  useSecuritySnapshots,
} from "@/features/securities/hooks";
import {
  DEFAULT_SECURITY_SORT,
  SECURITY_SORT_FIELDS,
  sortSecurities,
  type SecuritySort,
  type SecuritySortField,
} from "@/features/securities/sortSecurities";
import type { Security } from "@/lib/supabase/repositories/securities";

/**
 * Unterbereich **Assets** des Depots: die Verwaltungsliste aller Papiere —
 * Aktien ebenso wie ETFs, Fonds und Anleihen.
 *
 * Kopfzeile, Reiter und die Aktion „Neue Assets" traegt die Huelle
 * (`DepotPage`); hier stehen Kennzahlen des Depotstands, Filter und die Liste
 * selbst.
 */
export function SecuritiesPage() {
  const { data: securities = [], isLoading } = useSecurities();
  const { data: snapshots = [] } = useSecuritySnapshots();
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
  // Basis sind stets alle Assets, damit die Auswahl nicht springt, wenn
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
      {/* Kennzahlen des Depotstands, sofern einer importiert ist. Sie stehen
          bewusst ueber der Liste: Die Liste verwaltet Stammdaten, die Kacheln
          beantworten „wie steht mein Depot" — und dafuer gibt es sonst keinen
          Ort. Als Spalten in der Tabelle waeren es drei Zahlenspalten mehr in
          einer Liste, die auf dem Telefon schon jetzt seitlich scrollt. */}
      <PortfolioSummary snapshots={snapshots} />

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

        <FilterField id="sec-depot" label="Depotkonto">
          <EntitySelect
            id="sec-depot"
            options={depotOptions}
            value={depotFilter}
            onChange={setDepotFilter}
            allLabel="Alle Depotkonten"
          />
        </FilterField>

        {/* Sortierung wie in der Dividendenliste: rechts in der Leiste, vor dem
            Zuruecksetzen. */}
        <FilterSort
          id="sec-sort"
          value={sort.field}
          direction={sort.direction}
          options={SECURITY_SORT_FIELDS}
          onValueChange={(value) => {
            setSort((current) => ({ ...current, field: value as SecuritySortField }));
          }}
          onDirectionChange={(direction) => {
            setSort((current) => ({ ...current, direction }));
          }}
        />

        {/* Zuruecksetzen steht wie im Statistikbereich **in** der Leiste. */}
        {hasActiveFilters && <FilterReset onClick={resetFilters} />}
      </FilterBar>

      {hasActiveFilters && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {formatCountNumber(visible.length)} Assets gefunden.
        </p>
      )}

      {isLoading ? (
        <SkeletonRows rows={6} label="Assets" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Noch kein Asset angelegt"
          description="Lege dein erstes Asset an — Aktie, ETF, Fonds oder Anleihe —, um Dividendeneingänge zu erfassen."
          action={
            <Button
              onClick={() => {
                setDialog({ open: true, security: null });
              }}
            >
              Erstes Asset anlegen
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
              <TableHead>Depotkonto</TableHead>
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
                    to={`/depot/${security.id}`}
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
        <PortfolioImportButton />
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
            <DialogTitle>Asset endgültig löschen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteTarget?.name} wird unwiderruflich entfernt und kann nicht
            wiederhergestellt werden. Das ist nur möglich, solange keine
            Dividendeneingänge mehr auf dieses Asset verweisen.
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
