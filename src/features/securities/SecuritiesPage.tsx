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
import { MD_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { monthNameDeShort, normalizePayoutMonths } from "@/lib/statistics";
import { SecurityImportButton } from "@/features/securities/SecurityImportDialog";
import { PortfolioImportButton } from "@/features/securities/PortfolioImportDialog";
import { PortfolioSummary } from "@/features/securities/PortfolioSummary";
import { SecurityFormDialog } from "@/features/securities/SecurityFormDialog";
import { AmountText } from "@/components/money/AmountText";
import { formatPercent, type DecimalInstance } from "@/lib/money";
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
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
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
  buildAssetRows,
  hasPositions,
  type AssetRow,
} from "@/features/securities/assetRows";
import { latestAsOf } from "@/features/securities/snapshots";
import {
  DEFAULT_SECURITY_SORT,
  defaultDirectionFor,
  securitySortOptions,
  sortAssetRows,
  type SecuritySort,
  type SecuritySortField,
} from "@/features/securities/sortSecurities";
import type { Security } from "@/lib/supabase/repositories/securities";

/**
 * Unterbereich **Assets** des Depots: die Uebersicht aller Papiere — Aktien
 * ebenso wie ETFs, Fonds und Anleihen.
 *
 * Kopfzeile, Reiter und die Aktion „Neue Assets" traegt die Huelle
 * (`DepotPage`); hier stehen Kennzahlen des Depotstands, Filter und die Liste
 * selbst.
 *
 * **Die Liste zeigt, was eine Position ausmacht, nicht was sie heisst.** Sie
 * fuehrte lange nur Stammdaten (Ticker, ISIN, Land, Status) — Felder, die beim
 * Wiederfinden helfen, aber keine einzige Frage an ein Depot beantworten.
 * Sobald ein Depotstand importiert ist, stehen deshalb Wert, erwartete
 * Jahresausschuettung und Gewinn in der Zeile; Ticker und ISIN ruecken unter
 * den Namen, wo sie zur Identifikation weiterhin genuegen. Ohne importierten
 * Stand entfallen diese Spalten ganz, statt eine Wand aus Gedankenstrichen zu
 * zeigen (wie in der Unternehmensstatistik).
 *
 * Alles Weitere — Stueckzahl, Kurs, Einstand, Rhythmus, Verlauf und die
 * Zahlungshistorie — steht eine Ebene tiefer auf der Detailseite, die der Name
 * oeffnet. Die Zeilenaktionen rechts bleiben unveraendert: bearbeiten,
 * archivieren und (nur archiviert) endgueltig loeschen.
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

  // Karten statt Tabelle auf dem Telefon — dasselbe Muster wie in der
  // Dividendenliste. Sieben Spalten hinter einem seitlichen Bildlauf sind auf
  // 390px keine Uebersicht, sondern ein Versteck.
  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);

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

  // Stammdaten, Depotkonto und die Position aus dem juengsten Depotstand in
  // einer Zeile. Bewusst **ein** Aufbau fuer Tabelle und Karten: Beide zeigen
  // dieselben Zahlen, und zwei Ableitungen liefen frueher oder spaeter
  // auseinander.
  const rows = React.useMemo(
    () =>
      buildAssetRows(
        securities,
        snapshots,
        (depotId) => depotById.get(depotId)?.name ?? null,
      ),
    [securities, snapshots, depotById],
  );

  const withPositions = React.useMemo(() => hasPositions(rows), [rows]);
  const asOf = React.useMemo(() => latestAsOf(snapshots), [snapshots]);
  const sortOptions = React.useMemo(
    () => securitySortOptions(withPositions),
    [withPositions],
  );

  // Eine Sortierung nach Wert ergibt ohne Depotstand keine Reihenfolge. Faellt
  // der Stand weg (geloescht in den Einstellungen), greift wieder die Vorgabe,
  // statt die Liste unsortiert stehen zu lassen.
  const effectiveSort = React.useMemo<SecuritySort>(
    () =>
      sortOptions.some((option) => option.value === sort.field)
        ? sort
        : DEFAULT_SECURITY_SORT,
    [sortOptions, sort],
  );

  const visible = React.useMemo(() => {
    const filtered = rows.filter(({ security }) => {
      if (!showArchived && security.archived_at) return false;
      if (sectorFilter && security.sector !== sectorFilter) return false;
      if (currencyFilter && security.currency !== currencyFilter) return false;
      if (depotFilter && security.default_depot_id !== depotFilter) return false;
      return true;
    });
    return sortAssetRows(filtered, effectiveSort);
  }, [rows, showArchived, sectorFilter, currencyFilter, depotFilter, effectiveSort]);

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

  // Die Zeilenaktionen sind fuer Tabelle und Karte dieselben — ein Aufbau, ein
  // Verhalten (bearbeiten, archivieren/reaktivieren, endgueltig loeschen).
  const actionsFor = (security: Security) => (
    <AssetActions
      security={security}
      onEdit={() => {
        setDialog({ open: true, security });
      }}
      onArchive={() =>
        void archiveSecurity.mutateAsync({
          id: security.id,
          archived: Boolean(security.archived_at),
        })
      }
      onDelete={() => {
        clearError();
        setDeleteTarget(security);
      }}
    />
  );

  // Wo der Platz knapp wird, treten Spalten zurueck — nach ihrer Bedeutung fuer
  // ein Depot. Mit Positionen tragen Wert, erwartete Ausschuettung und Gewinn
  // die Zeile; Ausschuettungsplan und Depotkonto kommen dazu, sobald Breite
  // dafuer da ist. Ohne Positionen sind genau sie (mit der Branche) der Inhalt
  // und stehen entsprechend frueher.
  const payoutClass = withPositions ? "hidden xl:table-cell" : undefined;
  const depotClass = withPositions ? "hidden xl:table-cell" : "hidden lg:table-cell";

  return (
    <div className="space-y-6">
      {/* Kennzahlen des Depotstands, sofern einer importiert ist. Sie stehen
          bewusst ueber der Liste: Die Kacheln beantworten „wie steht mein Depot
          insgesamt", die Liste „woraus besteht es". */}
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
            Zuruecksetzen. Mit importiertem Depotstand stehen die Zahlen des
            Bestands zur Wahl — Wert, Ausschuettung, Rendite, Gewinn. */}
        <FilterSort
          id="sec-sort"
          value={effectiveSort.field}
          direction={effectiveSort.direction}
          options={sortOptions}
          onValueChange={(value) => {
            const field = value as SecuritySortField;
            // Ein frisch gewaehltes Zahlenfeld beginnt absteigend: Die Frage an
            // „Nach Wert" ist „was ist meine groesste Position", nicht „meine
            // kleinste".
            setSort({ field, direction: defaultDirectionFor(field) });
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
      ) : isWide ? (
        <Table>
          {/* Der Stichtag gehoert zu jeder Positionszahl der Tabelle; sichtbar
              traegt ihn die Kachel darueber. */}
          <caption className="sr-only">
            {withPositions && asOf
              ? `Assets mit Position zum Depotstand vom ${formatCalendarDate(asOf)}`
              : "Assets"}
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              {withPositions && (
                <>
                  <TableHead className="whitespace-nowrap text-right">Wert</TableHead>
                  <TableHead className="whitespace-nowrap text-right">
                    Erwartet p. a.
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-right">Gewinn</TableHead>
                </>
              )}
              {/* Ohne Positionen traegt die Branche die Zeile mit: Sie sagt,
                  wie breit das Depot streut — die Frage, die ohne Depotstand
                  ueberhaupt beantwortbar ist. */}
              {!withPositions && (
                <TableHead className="hidden lg:table-cell">Branche</TableHead>
              )}
              <TableHead className={payoutClass}>Ausschüttung</TableHead>
              <TableHead className={depotClass}>Depotkonto</TableHead>
              <TableHead className="text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => {
              const { security, position } = row;
              return (
                <TableRow key={security.id}>
                  <TableCell>
                    <AssetName row={row} />
                  </TableCell>
                  {withPositions && (
                    <>
                      <TableCell className="text-right">
                        <Metric
                          value={
                            position?.marketValue ? (
                              <AmountText
                                amount={position.marketValue}
                                className="font-medium"
                              />
                            ) : null
                          }
                          detail={percentDetail(position?.allocationPercent, 1, "Anteil")}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Metric
                          value={
                            position?.annualDividend ? (
                              <AmountText amount={position.annualDividend} />
                            ) : null
                          }
                          detail={percentDetail(position?.dividendYield, 2, "Rendite")}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Metric
                          value={
                            position?.gain ? (
                              <AmountText amount={position.gain} showSign />
                            ) : null
                          }
                          detail={percentDetail(position?.gainPercent, 1)}
                        />
                      </TableCell>
                    </>
                  )}
                  {!withPositions && (
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {security.sector ?? "—"}
                    </TableCell>
                  )}
                  <TableCell className={cn("text-muted-foreground", payoutClass)}>
                    {payoutLabel(security)}
                  </TableCell>
                  <TableCell className={cn("text-muted-foreground", depotClass)}>
                    {row.depotName ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">{actionsFor(security)}</div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => (
            <AssetCard
              key={row.security.id}
              row={row}
              actions={actionsFor(row.security)}
            />
          ))}
        </ul>
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

/**
 * Ausschuettungsmonate als Kurzform („Mär, Jun, Sep, Dez").
 *
 * Zwoelf Kuerzel sind keine Auskunft, sondern eine Zeile Rauschen — ein
 * monatlicher Zahler heisst hier deshalb „monatlich".
 */
function payoutLabel(security: Security): string {
  const months = normalizePayoutMonths(security.payout_months);
  if (months.length === 0) return "—";
  if (months.length === 12) return "monatlich";
  return months.map((month) => monthNameDeShort(month)).join(", ");
}

/** Ticker und ISIN als eine Zeile — die Identitaet des Papiers, klein gesetzt. */
function identityLabel(security: Security): string | null {
  const parts = [security.ticker, security.isin].filter((part): part is string =>
    Boolean(part?.trim()),
  );
  return parts.length === 0 ? null : parts.join(" · ");
}

/**
 * Prozentangabe unter einem Betrag; `null`, wenn die Quelle keine liefert —
 * dann bleibt die Zeile leer statt eine 0 zu behaupten.
 */
function percentDetail(
  value: DecimalInstance | null | undefined,
  digits: number,
  suffix?: string,
): string | null {
  if (value === null || value === undefined) return null;
  const formatted = formatPercent(value, digits);
  return suffix ? `${formatted} ${suffix}` : formatted;
}

/**
 * Der Name fuehrt zur Detailseite — sie beantwortet die Frage nach Verlauf und
 * Zahlungen dieser Position, die die Uebersicht bewusst nicht stellt. Darunter
 * Ticker und ISIN: zum Wiedererkennen genuegen sie klein, eine eigene Spalte
 * brauchen sie nicht.
 */
function AssetName({ row }: { row: AssetRow }) {
  const { security } = row;
  const identity = identityLabel(security);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-2">
        <Link
          to={`/depot/${security.id}`}
          className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {security.name}
        </Link>
        {/* Nur der Sonderfall traegt ein Etikett. „Aktiv" stand zuvor an fast
            jeder Zeile und sagte damit nichts. */}
        {security.archived_at && (
          <Badge variant="neutral" className="shrink-0">
            Archiviert
          </Badge>
        )}
      </span>
      {identity && (
        <span className="truncate text-xs text-muted-foreground">{identity}</span>
      )}
    </div>
  );
}

/** Eine Zahl mit ihrer Erlaeuterung darunter (Anteil, Rendite, Gewinnquote). */
function Metric({ value, detail }: { value: React.ReactNode; detail?: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-col items-end">
      {value}
      {detail && (
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {detail}
        </span>
      )}
    </span>
  );
}

/**
 * Ein Asset auf dem Telefon. Dieselben Zahlen wie in der Tabelle, in der
 * Reihenfolge, in der sie gelesen werden: Was ist es, was ist es wert, was
 * bringt es — und was kann ich damit tun.
 */
function AssetCard({ row, actions }: { row: AssetRow; actions: React.ReactNode }) {
  const { security, position } = row;
  const payout = payoutLabel(security);
  const meta = [row.depotName, payout === "—" ? null : payout]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <AssetName row={row} />
        {position?.marketValue && (
          <span className="flex shrink-0 flex-col items-end">
            <AmountText amount={position.marketValue} className="text-lg font-semibold" />
            {position.allocationPercent && (
              <span className="text-xs text-muted-foreground">
                {formatPercent(position.allocationPercent, 1)} Anteil
              </span>
            )}
          </span>
        )}
      </div>

      {position && (
        <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Erwartet p. a.</dt>
            <dd className="mt-0.5">
              {position.annualDividend ? (
                <span className="flex flex-wrap items-baseline gap-1.5">
                  <AmountText amount={position.annualDividend} />
                  {position.dividendYield && (
                    <span className="text-xs text-muted-foreground">
                      {formatPercent(position.dividendYield, 2)}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Gewinn</dt>
            <dd className="mt-0.5">
              {position.gain ? (
                <span className="flex flex-wrap items-baseline gap-1.5">
                  <AmountText amount={position.gain} showSign />
                  {position.gainPercent && (
                    <span className="text-xs text-muted-foreground">
                      {formatPercent(position.gainPercent, 1)}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </dd>
          </div>
        </dl>
      )}

      {/* Die negativen Raender holen die Luft zurueck, die in den 44px-Touch-
          zielen ohnehin steckt — dasselbe Raster wie in der Dividendenliste. */}
      <div className="mt-2 flex items-center justify-between gap-2">
        {/* Nur, wenn es etwas zu sagen gibt — ein einzelner Gedankenstrich
            unter einer Karte ist eine Zeile ohne Inhalt. */}
        {meta && (
          <span className="min-w-0 truncate text-xs text-muted-foreground">{meta}</span>
        )}
        <div className="-my-2 -mr-2 ml-auto flex shrink-0 items-center gap-1">
          {actions}
        </div>
      </div>
    </li>
  );
}

/**
 * Zeilenaktionen: bearbeiten, archivieren bzw. reaktivieren und — nur bei
 * archivierten Assets — endgueltig loeschen. Unveraendert gegenueber der
 * frueheren Liste und in Tabelle wie Karte dieselben.
 */
function AssetActions({
  security,
  onEdit,
  onArchive,
  onDelete,
}: {
  security: Security;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`${security.name} bearbeiten`}
        onClick={onEdit}
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
        onClick={onArchive}
      >
        {security.archived_at ? <RotateCcw /> : <ArchiveIcon />}
      </Button>
      {security.archived_at && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${security.name} endgültig löschen`}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      )}
    </>
  );
}
